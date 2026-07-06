/**
 * 运单商品明细 API
 *
 * GET /api/waybills/items?external_code=xxx&sku_code=yyy
 *  优先从本地快照读取，本地不存在时调用 V2 同步到本地后返回。
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateWaybillInV2 } from "@/lib/v2-client";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const externalCode = searchParams.get("external_code");
    const skuCode = searchParams.get("sku_code");

    if (!externalCode) {
      return NextResponse.json({ error: "缺少 external_code" }, { status: 400 });
    }

    // 确保本地快照存在（会从 V2 拉取）
    const vResult = await validateWaybillInV2(externalCode);
    if (!vResult.valid) {
      return NextResponse.json({ error: vResult.reason }, { status: 400 });
    }

    const snapshotId = vResult.snapshotId;

    let sql = "SELECT * FROM waybill_item_snapshots WHERE waybill_snapshot_id = $1";
    const params: any[] = [snapshotId];

    if (skuCode) {
      sql += " AND sku_code = $2";
      params.push(skuCode);
    }

    const rows = await query(sql, params);

    return NextResponse.json({
      external_code: externalCode,
      snapshot_id: snapshotId,
      items: rows.map((r: any) => ({
        id: r.id,
        sku_code: r.sku_code,
        sku_name: r.sku_name,
        quantity: Number(r.quantity || 0),
        spec: r.spec,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
