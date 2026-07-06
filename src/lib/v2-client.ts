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

/** 校验运单是否存在 + 获取运单详情 */
export async function getWaybill(externalCode: string): Promise<V2Waybill | null> {
  try {
    const data = await v2Request<any[]>(`/api/batches`, {
      params: { search: externalCode },
    });
    // V2 的 batches API 目前按 ID 查询，我们需要一个专门的接口
    // 这里使用 V2 接口的通用查询方式
    return null; // 占位，实际取决于 V2 暴露的具体接口
  } catch {
    return null;
  }
}

/** 校验 SKU 是否归属于指定运单 */
export async function verifySkuBelongsToWaybill(
  externalCode: string,
  skuCode: string
): Promise<boolean> {
  try {
    const data = await v2Request<{ valid: boolean }>(`/api/waybills/verify-sku`, {
      params: { external_code: externalCode, sku_code: skuCode },
    });
    return data.valid;
  } catch {
    return false;
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
