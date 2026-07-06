/**
 * 运单快照列表 API
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  let sql = `SELECT * FROM waybill_snapshots WHERE 1=1`;
  const params: any[] = [];
  let idx = 0;

  if (q) {
    idx++;
    sql += ` AND (external_code ILIKE $${idx} OR store_name ILIKE $${idx} OR receiver_name ILIKE $${idx} OR receiver_phone ILIKE $${idx})`;
    params.push(`%${q}%`);
  }

  const countResult = await query(sql.replace("SELECT *", "SELECT COUNT(*) as total"), params);
  const total = parseInt(countResult[0]?.total || "0");

  idx++;
  sql += ` ORDER BY synced_at DESC LIMIT $${idx}`;
  params.push(pageSize);
  idx++;
  sql += ` OFFSET $${idx}`;
  params.push((page - 1) * pageSize);

  const rows = await query(sql, params);

  // 统计每个快照的商品数量
  const snapshotIds = rows.map((r: any) => r.id);
  let itemCounts: Record<string, number> = {};
  if (snapshotIds.length > 0) {
    const placeholders = snapshotIds.map((_, i) => `$${i + 1}`).join(",");
    const counts = await query(
      `SELECT waybill_snapshot_id, COUNT(*) as cnt FROM waybill_item_snapshots WHERE waybill_snapshot_id IN (${placeholders}) GROUP BY waybill_snapshot_id`,
      snapshotIds
    );
    for (const c of counts as any[]) {
      itemCounts[c.waybill_snapshot_id] = parseInt(c.cnt || "0");
    }
  }

  const items = rows.map((r: any) => ({
    id: r.id,
    external_code: r.external_code,
    store_name: r.store_name,
    receiver_name: r.receiver_name,
    receiver_phone: r.receiver_phone,
    receiver_address: r.receiver_address,
    amount: Number(r.amount || 0),
    synced_at: r.synced_at,
    item_count: itemCounts[r.id] || 0,
  }));

  return NextResponse.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}
