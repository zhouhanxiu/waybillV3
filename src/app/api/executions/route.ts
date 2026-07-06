/**
 * 执行记录 API — 赔付记录 + 库存变更
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "compensation"; // compensation | inventory
  const status = searchParams.get("status");
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  if (type === "compensation") {
    let sql = `SELECT c.*, t.external_code, t.exception_type, t.reporter
               FROM compensation_records c
               LEFT JOIN exception_tickets t ON c.ticket_id = t.id
               WHERE 1=1`;
    const params: any[] = [];
    let idx = 0;
    if (status) { idx++; sql += ` AND c.status = $${idx}`; params.push(status); }

    const countResult = await query(sql.replace("SELECT c.*", "SELECT COUNT(*) as total"), params);
    const total = parseInt(countResult[0]?.total || "0");

    idx++; sql += ` ORDER BY c.created_at DESC LIMIT $${idx}`; params.push(pageSize);
    idx++; sql += ` OFFSET $${idx}`; params.push((page - 1) * pageSize);

    const rows = await query(sql, params);
    const items = rows.map(mapCompensation);

    return NextResponse.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  }

  if (type === "inventory") {
    let sql = `SELECT * FROM inventory_logs WHERE 1=1`;
    const params: any[] = [];
    let idx = 0;

    const countResult = await query("SELECT COUNT(*) as total FROM inventory_logs");
    const total = parseInt(countResult[0]?.total || "0");

    idx++; sql += ` ORDER BY created_at DESC LIMIT $${idx}`; params.push(pageSize);
    idx++; sql += ` OFFSET $${idx}`; params.push((page - 1) * pageSize);

    const rows = await query(sql, params);
    const items = rows.map(mapInventory);

    return NextResponse.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  }

  return NextResponse.json({ error: "未知类型" }, { status: 400 });
}

function mapCompensation(r: any) {
  return {
    id: r.id,
    ticket_id: r.ticket_id,
    external_code: r.external_code,
    exception_type: r.exception_type,
    reporter: r.reporter,
    direction: r.direction,
    amount: parseFloat(r.amount || "0"),
    reason: r.reason,
    status: r.status,
    created_at: r.created_at,
  };
}

function mapInventory(r: any) {
  return {
    id: r.id,
    sku_code: r.sku_code,
    change_qty: parseFloat(r.change_qty || "0"),
    reason: r.reason,
    ticket_id: r.ticket_id,
    created_at: r.created_at,
  };
}
