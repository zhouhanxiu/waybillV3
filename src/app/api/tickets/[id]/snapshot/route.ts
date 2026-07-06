/**
 * 获取工单关联的运单快照（含品项明细）
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 获取工单
    const tickets = await query(
      "SELECT waybill_snapshot_id FROM exception_tickets WHERE id = $1",
      [id]
    );
    if (tickets.length === 0) {
      return NextResponse.json({ error: "工单不存在" }, { status: 404 });
    }

    const snapshotId = (tickets[0] as any).waybill_snapshot_id;

    // 获取快照
    const snapshots = await query(
      "SELECT * FROM waybill_snapshots WHERE id = $1",
      [snapshotId]
    );
    if (snapshots.length === 0) {
      return NextResponse.json({ snapshot: null });
    }

    const snap = snapshots[0] as any;

    // 获取品项明细
    const items = await query(
      "SELECT * FROM waybill_item_snapshots WHERE waybill_snapshot_id = $1",
      [snapshotId]
    );

    return NextResponse.json({
      snapshot: {
        ...snap,
        items: items.map((it: any) => ({
          sku_code: it.sku_code,
          sku_name: it.sku_name,
          quantity: Number(it.quantity),
          spec: it.spec,
        })),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
