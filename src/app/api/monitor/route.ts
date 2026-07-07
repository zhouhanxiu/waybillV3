/**
 * 同步监控 API — 接口状态和同步日志
 * 优化：V2 健康检查带短暂内存缓存，避免首页每次刷新都打 V2
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { checkV2Health, getV2BaseUrl } from "@/lib/v2-client";

let cachedV2Health: { healthy: boolean; expiredAt: number } | null = null;
const V2_HEALTH_CACHE_MS = 30_000; // 30 秒内复用缓存结果

async function checkV2HealthCached(): Promise<{ healthy: boolean; error: string | null }> {
  const now = Date.now();
  if (cachedV2Health && cachedV2Health.expiredAt > now) {
    return { healthy: cachedV2Health.healthy, error: null };
  }
  try {
    const healthy = await checkV2Health();
    cachedV2Health = { healthy, expiredAt: now + V2_HEALTH_CACHE_MS };
    return { healthy, error: null };
  } catch (err: any) {
    cachedV2Health = { healthy: false, expiredAt: now + V2_HEALTH_CACHE_MS };
    return { healthy: false, error: err.message || String(err) };
  }
}

export async function GET(req: NextRequest) {
  // DB 相关数据（无 DB 时使用空值降级）
  let lastSyncAt: string | null = null;
  let stats24h = { total: 0, success: 0, failed: 0, success_rate: "N/A" };
  let recentLogs: any[] = [];
  let snapshotCount = 0;
  let snapshotAvailable = false;

  // V2 健康检查与 DB 查询并行，避免 V2 超时阻塞整个 monitor 接口
  const [v2Health, dbData] = await Promise.all([
    checkV2HealthCached(),
    (async () => {
      try {
        const lastSync = await query(
          "SELECT created_at FROM sync_logs WHERE success = true ORDER BY created_at DESC LIMIT 1"
        );
        lastSyncAt = lastSync[0]?.created_at || null;

        const stats = await query(
          `SELECT
            COUNT(*) as total,
            SUM(CASE WHEN success THEN 1 ELSE 0 END) as success_count
           FROM sync_logs
           WHERE created_at > NOW() - INTERVAL '24 hours'`
        );
        const total = parseInt(stats[0]?.total || "0");
        const successCount = parseInt(stats[0]?.success_count || "0");
        stats24h = {
          total,
          success: successCount,
          failed: total - successCount,
          success_rate: total > 0 ? (successCount / total * 100).toFixed(1) : "N/A",
        };

        const logs = await query(
          "SELECT id, request_id, endpoint, method, status_code, success, duration_ms, error_message, created_at FROM sync_logs ORDER BY created_at DESC LIMIT 20"
        );
        recentLogs = logs.map((l) => ({
          id: l.id,
          request_id: l.request_id,
          endpoint: l.endpoint,
          method: l.method,
          status_code: l.status_code,
          success: l.success,
          duration_ms: l.duration_ms,
          error_message: l.error_message,
          created_at: l.created_at,
        }));

        const snapResult = await query("SELECT COUNT(*) as cnt FROM waybill_snapshots");
        snapshotCount = parseInt(snapResult[0]?.cnt || "0");
        snapshotAvailable = snapshotCount > 0;
      } catch {
        // DB 不可用，使用默认空值
      }
      return { lastSyncAt, stats24h, recentLogs, snapshotCount, snapshotAvailable };
    })(),
  ]);

  return NextResponse.json({
    v2_healthy: v2Health.healthy,
    v2_base_url: getV2BaseUrl(),
    v2_error: v2Health.error,
    last_sync_at: dbData.lastSyncAt,
    stats_24h: dbData.stats24h,
    recent_logs: dbData.recentLogs,
    snapshot_count: dbData.snapshotCount,
    snapshot_available: dbData.snapshotAvailable,
  });
}
