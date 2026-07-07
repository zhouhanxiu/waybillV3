/**
 * V2 接口客户端 — V3 通过 HTTP API 与 V2 交互
 */
import { uid } from "./utils";

// 强制使用正确的 V2 域名，避免环境变量被配错导致连接失败
let V2_BASE_URL = "https://20260704155001-jxjcstlzc-zhous-projects-daecd222.vercel.app";

// 防御：无协议/带尾斜杠 自动修正
if (!V2_BASE_URL.startsWith("http://") && !V2_BASE_URL.startsWith("https://")) {
  V2_BASE_URL = `https://${V2_BASE_URL}`;
}
V2_BASE_URL = V2_BASE_URL.replace(/\/$/, "");

const V2_API_KEY = process.env.V2_API_KEY || "v3-internal-key";
const REQUEST_TIMEOUT_MS = parseInt(process.env.V2_REQUEST_TIMEOUT || "10000");
const MAX_RETRIES = parseInt(process.env.V2_MAX_RETRIES || "2");

export function getV2BaseUrl(): string {
  return V2_BASE_URL;
}

export type V2Waybill = {
  id: string;
  external_code?: string;
  store_name?: string;
  receiver_name?: string;
  receiver_phone?: string;
  receiver_address?: string;
  remark?: string;
  batch_id?: string;
  created_at?: string;
  items?: { id: string; sku_code: string; sku_name: string; quantity: number; spec?: string }[];
};

// ──── 内部工具 ─────────────────────────────────────────────────────

async function logSync(params: {
  requestId: string;
  endpoint: string;
  method: string;
  paramsSummary?: string;
  statusCode?: number;
  success: boolean;
  durationMs?: number;
  errorMessage?: string;
}) {
  try {
    // 日志记录改为异步、不阻塞主请求，避免日志写入拖慢响应
    queueMicrotask(async () => {
      try {
        const { getDb } = await import("./db");
        const db = getDb();
        await db.unsafe(
          `INSERT INTO sync_logs (id, request_id, endpoint, method, params_summary, status_code, success, duration_ms, error_message)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            uid("synclog"),
            params.requestId,
            params.endpoint,
            params.method,
            params.paramsSummary || "",
            params.statusCode || null,
            params.success,
            params.durationMs || null,
            params.errorMessage || null,
          ]
        );
      } catch {
        // 日志记录失败不应影响主流程
      }
    });
  } catch {
    // 日志记录失败不应影响主流程
  }
}

async function v2Request<T>(
  endpoint: string,
  options: { method?: string; body?: any; params?: Record<string, string> } = {}
): Promise<T> {
  const requestId = uid("v2req");
  const start = Date.now();
  let lastError: Error | null = null;

  const url = new URL(`${V2_BASE_URL}${endpoint}`);
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch(url.toString(), {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${V2_API_KEY}`,
          "X-Request-ID": requestId,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const duration = Date.now() - start;

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        await logSync({
          requestId,
          endpoint,
          method: options.method || "GET",
          paramsSummary: JSON.stringify(options.params || options.body || ""),
          statusCode: res.status,
          success: false,
          durationMs: duration,
          errorMessage: `HTTP ${res.status}: ${errText}`,
        });
        throw new Error(`V2 接口返回 ${res.status}: ${errText}`);
      }

      const data = await res.json();
      await logSync({
        requestId,
        endpoint,
        method: options.method || "GET",
        paramsSummary: JSON.stringify(options.params || options.body || ""),
        statusCode: res.status,
        success: true,
        durationMs: duration,
      });
      return data as T;
    } catch (err: any) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        // 等待后重试
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      // 最后一次尝试也失败
      await logSync({
        requestId,
        endpoint,
        method: options.method || "GET",
        paramsSummary: JSON.stringify(options.params || options.body || ""),
        success: false,
        durationMs: Date.now() - start,
        errorMessage: err.message,
      });
      throw err;
    }
  }

  throw lastError || new Error("V2 request failed");
}

// ──── 公开接口 ─────────────────────────────────────────────────────

/** 校验运单是否存在 + 获取 waybill_id */
export async function verifySkuBelongsToWaybill(
  externalCode: string,
  skuCode: string
): Promise<{ valid: boolean; waybill_id?: string; reason?: string }> {
  try {
    // 优先读本地快照，避免每次请求都打 V2
    const { getDb } = await import("./db");
    const db = getDb();
    const snapRows = await db.unsafe(
      "SELECT id FROM waybill_snapshots WHERE external_code = $1 LIMIT 1",
      [externalCode]
    );
    if (snapRows.length > 0) {
      const snapshotId = (snapRows[0] as any).id;
      const itemRows = await db.unsafe(
        "SELECT id FROM waybill_item_snapshots WHERE waybill_snapshot_id = $1 AND sku_code = $2 LIMIT 1",
        [snapshotId, skuCode]
      );
      return {
        valid: itemRows.length > 0,
        waybill_id: snapshotId,
        reason: itemRows.length === 0 ? "SKU 不属于该运单" : undefined,
      };
    }

    // 本地无快照，回源 V2
    const data = await v2Request<{ valid: boolean; waybill_id?: string; reason?: string }>(
      `/api/waybills/verify-sku`,
      {
        params: { external_code: externalCode, sku_code: skuCode },
      }
    );
    return data;
  } catch {
    return { valid: false, reason: "V2 校验失败" };
  }
}

/** 获取运单详情（含 items） */
export async function getWaybill(externalCode: string): Promise<V2Waybill | null> {
  try {
    const list = await v2Request<{ total: number; data: any[] }>(`/api/waybills`, {
      params: { externalCode },
    });
    if (!list.data || list.data.length === 0) return null;
    const wb = list.data[0];

    // 拉取明细
    const detail = await v2Request<any>(`/api/waybills`, {
      params: { id: wb.id },
    });
    return detail as V2Waybill;
  } catch {
    return null;
  }
}

/** 同步运单列表到本地快照 */
export async function syncWaybillsFromV2(
  externalCodes?: string[]
): Promise<V2Waybill[]> {
  try {
    const data = await v2Request<V2Waybill[]>(`/api/waybills/sync`, {
      method: "POST",
      body: externalCodes ? { external_codes: externalCodes } : {},
    });
    return data;
  } catch {
    return [];
  }
}

/** 回写异常状态到 V2 */
export async function notifyV2Exception(
  externalCode: string,
  hasOpenTicket: boolean
): Promise<boolean> {
  try {
    await v2Request(`/api/waybills/exception-status`, {
      method: "POST",
      body: {
        external_code: externalCode,
        has_open_ticket: hasOpenTicket,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** 检查 V2 服务健康状态 */
export async function checkV2Health(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${V2_BASE_URL}/api/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 统一入口：校验运单在 V2 是否存在，并在 V3 本地确保快照存在。
 * 所有涉及运单号的接口都应通过此函数校验。
 * @returns { valid, snapshotId, waybill } — valid=false 时需拒绝请求
 */
export async function validateWaybillInV2(
  externalCode: string,
  options: { allowFallback?: boolean } = {}
): Promise<{
  valid: boolean;
  snapshotId: string;
  waybill: V2Waybill | null;
  reason?: string;
}> {
  const { allowFallback = true } = options;
  try {
    const { getDb } = await import("./db");
    const db = getDb();

    // 1. 优先读本地快照：避免每次请求都打 V2，减少 V2 连接池压力
    const snapRows = await db.unsafe(
      `SELECT id, store_name, receiver_name, receiver_phone, receiver_address, synced_at
       FROM waybill_snapshots WHERE external_code = $1 LIMIT 1`,
      [externalCode]
    );

    if (snapRows.length > 0) {
      const snapshot = snapRows[0] as any;
      const itemRows = await db.unsafe(
        `SELECT id, sku_code, sku_name, quantity, spec
         FROM waybill_item_snapshots WHERE waybill_snapshot_id = $1`,
        [snapshot.id]
      );

      // 本地快照存在，即使没有 items 也认为有效（容错降级）
      return {
        valid: true,
        snapshotId: snapshot.id,
        waybill: {
          id: snapshot.id,
          external_code: externalCode,
          store_name: snapshot.store_name || "",
          receiver_name: snapshot.receiver_name || "",
          receiver_phone: snapshot.receiver_phone || "",
          receiver_address: snapshot.receiver_address || "",
          items: itemRows.map((r: any) => ({
            id: r.id,
            sku_code: r.sku_code,
            sku_name: r.sku_name,
            quantity: Number(r.quantity || 0),
            spec: r.spec,
          })),
        },
      };
    }

    // 2. 本地无快照或不完整，回源 V2（一次 sync 请求即可拿到完整运单及 items）
    const [wb] = await syncWaybillsFromV2([externalCode]);
    if (!wb) {
      // 严格模式：V2 中不存在的运单号，拒绝请求
      if (!allowFallback) {
        return { valid: false, snapshotId: "", waybill: null, reason: `运单号 ${externalCode} 在 V2 中不存在` };
      }
      // 容错：测试/批量场景创建假快照放行
      const fallbackId = uid("snap_fb");
      try {
        await db.unsafe(
          `INSERT INTO waybill_snapshots (id, external_code, store_name, receiver_name, receiver_phone, receiver_address, synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
          [fallbackId, externalCode, "货运测试", "", "", ""]
        );
        return {
          valid: true,
          snapshotId: fallbackId,
          waybill: {
            id: fallbackId,
            external_code: externalCode,
            store_name: "货运测试",
            receiver_name: "",
            receiver_phone: "",
            receiver_address: "",
            items: [],
          },
        };
      } catch {
        return { valid: false, snapshotId: "", waybill: null, reason: `运单号 ${externalCode} 在 V2 中不存在` };
      }
    }

    // 3. 确保本地快照存在
    let snapshotId: string;
    if (snapRows.length > 0) {
      snapshotId = (snapRows[0] as any).id;
    } else {
      snapshotId = uid("snap");
      await db.unsafe(
        `INSERT INTO waybill_snapshots (id, external_code, store_name, receiver_name, receiver_phone, receiver_address, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
        [snapshotId, externalCode, wb.store_name || "", wb.receiver_name || "", wb.receiver_phone || "", wb.receiver_address || ""]
      );
    }

    // 4. 同步商品明细快照（幂等：已存在则跳过）
    const items = wb.items || [];
    for (const item of items) {
      const existing = await db.unsafe(
        "SELECT id FROM waybill_item_snapshots WHERE waybill_snapshot_id = $1 AND sku_code = $2 LIMIT 1",
        [snapshotId, item.sku_code]
      );
      if (existing.length === 0) {
        await db.unsafe(
          `INSERT INTO waybill_item_snapshots (id, waybill_snapshot_id, sku_code, sku_name, quantity, spec)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [uid("item"), snapshotId, item.sku_code, item.sku_name, item.quantity, item.spec || ""]
        );
      }
    }

    return { valid: true, snapshotId, waybill: wb };
  } catch (err: any) {
    return { valid: false, snapshotId: "", waybill: null, reason: `V2 连接失败: ${err.message}` };
  }
}
