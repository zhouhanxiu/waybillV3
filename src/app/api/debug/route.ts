import { NextRequest, NextResponse } from "next/server";
import { getV2BaseUrl } from "@/lib/v2-client";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  // 批量清理遗留工单
  if (action === "cleanup_tickets") {
    try {
      const staleTickets = await query(
        `SELECT id FROM exception_tickets WHERE status NOT IN ('done','closed')`
      );
      for (const t of staleTickets as any[]) {
        try {
          await query("DELETE FROM scan_records WHERE ticket_id = $1", [t.id]);
        } catch { /* ignore */ }
        try {
          await query("DELETE FROM approval_records WHERE ticket_id = $1", [t.id]);
        } catch { /* ignore */ }
      }
      // Delete all non-done/closed tickets and their orphaned related records
      await query(`DELETE FROM compensation_records WHERE ticket_id IN (SELECT id FROM exception_tickets WHERE status NOT IN ('done','closed'))`);
      await query(`DELETE FROM inventory_logs WHERE ticket_id IN (SELECT id FROM exception_tickets WHERE status NOT IN ('done','closed'))`);
      await query(`DELETE FROM exception_tickets WHERE status NOT IN ('done','closed')`);
      return NextResponse.json({ ok: true, cleaned: (staleTickets as any[]).length });
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 200 });
    }
  }

  return NextResponse.json({
    v2_base_url: getV2BaseUrl(),
    env_v2_api_base_url: process.env.V2_API_BASE_URL || null,
    node_env: process.env.NODE_ENV || null,
  });
}
