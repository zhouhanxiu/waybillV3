/**
 * 同步监控 API — 接口状态和同步日志
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { checkV2Health } from "@/lib/v2-client";

export async function GET(req: NextRequest) {
  // V2 健康检查（不依赖 DB）
  const v2Healthy = await checkV2Health();

  // DB 相关数据（无 DB 时使用空值降级）
  let lastSyncAt: string | null = null;
  let stats24h = { total: 0, success: 0, failed: 0, success_rate: "N/A" };
  let recentLogs: any[] = [];

  try {
    const lastSync = await query(
      "SELECT * FROM sync_logs WHERE success = true ORDER BY created_at DESC LIMIT 1"
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
      "SELECT * FROM sync_logs ORDER BY created_at DESC LIMIT 20"
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
  } catch {
    // DB 不可用，使用默认空值
  }

  return NextResponse.json({
    v2_healthy: v2Healthy,
    last_sync_at: lastSyncAt,
    stats_24h: stats24h,
    recent_logs: recentLogs,
  });
}
