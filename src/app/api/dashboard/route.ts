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
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    const [result] = await query(`
      SELECT
        (SELECT COUNT(*) FROM exception_tickets) AS total_tickets,
        (SELECT COUNT(*) FROM exception_tickets WHERE status NOT IN ('done','closed')) AS pending_tickets,
        (SELECT COUNT(*) FROM exception_tickets WHERE due_at IS NOT NULL AND due_at < NOW() AND status NOT IN ('done','closed')) AS overdue_tickets,
        (SELECT COUNT(*) FROM scan_records WHERE created_at >= $1) AS today_scans,
        (SELECT COUNT(*) FROM exception_tickets WHERE source = 'scan_auto' AND status NOT IN ('done','closed')) AS qc_hold_count,
        (SELECT COUNT(*) FROM exception_tickets WHERE status IN ('done','closed') AND updated_at >= $1) AS completed_today
    `, [todayIso]);

    return NextResponse.json({
      total_tickets: parseInt(result.total_tickets || "0"),
      pending_tickets: parseInt(result.pending_tickets || "0"),
      overdue_tickets: parseInt(result.overdue_tickets || "0"),
      today_scans: parseInt(result.today_scans || "0"),
      qc_hold_count: parseInt(result.qc_hold_count || "0"),
      completed_today: parseInt(result.completed_today || "0"),
    });
  } catch (err: any) {
    if (process.env.NODE_ENV === "development" || isMockMode()) {
      return NextResponse.json({
        total_tickets: 11,
        pending_tickets: 7,
        overdue_tickets: 2,
        today_scans: 4,
        qc_hold_count: 3,
        completed_today: 2,
      });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
