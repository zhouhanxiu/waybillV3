/**
 * 工作台看板统计 API
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

function isMockMode() {
  const url = process.env.DATABASE_URL || "";
  return !url || url.includes("localhost") || url.includes("mock");
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    // 总工单
    const totalResult = await query("SELECT COUNT(*) as total FROM exception_tickets");
    const total_tickets = parseInt(totalResult[0]?.total || "0");

    // 待处理：pending / level1 / level2 / executing
    const pendingResult = await query(
      "SELECT COUNT(*) as total FROM exception_tickets WHERE status NOT IN ('done','closed')"
    );
    const pending_tickets = parseInt(pendingResult[0]?.total || "0");

    // 已超时：有 due_at 且小于当前时间，且未终态
    const overdueResult = await query(
      "SELECT COUNT(*) as total FROM exception_tickets WHERE due_at IS NOT NULL AND due_at < NOW() AND status NOT IN ('done','closed')"
    );
    const overdue_tickets = parseInt(overdueResult[0]?.total || "0");

    // 今日扫描
    const todayScanResult = await query(
      "SELECT COUNT(*) as total FROM scan_records WHERE created_at >= $1",
      [todayIso]
    );
    const today_scans = parseInt(todayScanResult[0]?.total || "0");

    // 品控暂扣
    const qcHoldResult = await query(
      "SELECT COUNT(*) as total FROM scan_records WHERE batch_status = 'qc_hold'"
    );
    const qc_hold_count = parseInt(qcHoldResult[0]?.total || "0");

    // 今日完成：今日内状态变为 done/closed 的工单
    const completedResult = await query(
      "SELECT COUNT(*) as total FROM exception_tickets WHERE status IN ('done','closed') AND updated_at >= $1",
      [todayIso]
    );
    const completed_today = parseInt(completedResult[0]?.total || "0");

    return NextResponse.json({
      total_tickets,
      pending_tickets,
      overdue_tickets,
      today_scans,
      qc_hold_count,
      completed_today,
    });
  } catch (err: any) {
    if (process.env.NODE_ENV === "development" || isMockMode()) {
      return NextResponse.json({
        total_tickets: 0,
        pending_tickets: 0,
        overdue_tickets: 0,
        today_scans: 0,
        qc_hold_count: 0,
        completed_today: 0,
      });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
