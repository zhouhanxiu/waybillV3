/**
 * 审批记录查询 API
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ticketId = params.id;
    const rows = await query<any[]>(
      "SELECT * FROM approval_records WHERE ticket_id = $1 ORDER BY created_at ASC",
      [ticketId]
    );

    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        ticket_id: r.ticket_id,
        approver: r.approver,
        level: r.level,
        action: r.action,
        opinion: r.opinion,
        ai_suggestion: r.ai_suggestion,
        created_at: r.created_at,
      }))
    );
  } catch (err: any) {
    // Demo 模式：无真实数据库时返回空数组
    if (process.env.NODE_ENV === "development" || isMockMode()) {
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function isMockMode() {
  const url = process.env.DATABASE_URL || "";
  return !url || url.includes("localhost") || url.includes("mock");
}
