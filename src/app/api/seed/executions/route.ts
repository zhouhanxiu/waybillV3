/**
 * 生成执行记录测试数据
 *
 * POST /api/seed/executions
 *  body: { count?: number }
 * 会创建若干条已审批通过的工单及对应的赔付/库存记录，用于演示执行记录页面。
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { uid } from "@/lib/utils";
import { requireRole } from "@/lib/auth";
import { validateWaybillInV2 } from "@/lib/v2-client";

const EXCEPTION_TYPES = ["lost", "damaged", "rejected", "wrong_address"];
const SEVERITIES = ["low", "medium", "high", "critical"];

function sample<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomAmount(): number {
  return Math.floor(Math.random() * 20 + 1) * 50; // 50 ~ 1000
}

export async function POST(req: NextRequest) {
  try {
    await requireRole("admin");

    const body = await req.json().catch(() => ({}));
    const count = Math.min(Math.max(parseInt(body.count) || 5, 1), 20);

    // 1. 准备审批人
    const approvers = (await query(
      "SELECT name FROM users WHERE active = true AND (roles::text LIKE '%level1_approver%' OR roles::text LIKE '%level2_approver%' OR roles::text LIKE '%admin%') LIMIT 5"
    )) as any[];
    const approverNames = approvers.length > 0 ? approvers.map((a) => a.name) : ["approver_level1_01", "approver_level2_01"];

    // 2. 创建运单快照，如果还没有的话使用 V2 或 fallback
    const externalCode = `WD-${Date.now()}`;
    let snapshotId: string;
    const vResult = await validateWaybillInV2(externalCode);
    if (vResult.valid && vResult.snapshotId) {
      snapshotId = vResult.snapshotId;
    } else {
      // V2 可能不存在，本地创建一个占位快照
      snapshotId = uid("snap");
      await query(
        `INSERT INTO waybill_snapshots (id, external_code, store_name, receiver_name, receiver_phone, receiver_address, amount, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [snapshotId, externalCode, "测试门店", "测试收件人", "13800000000", "测试地址", 0]
      );
    }

    const createdIds: string[] = [];

    for (let i = 0; i < count; i++) {
      const ticketId = uid("ticket");
      const exceptionType = sample(EXCEPTION_TYPES);
      const severity = sample(SEVERITIES);
      const amount = randomAmount();
      const reporter = "admin";
      const status = "done";

      // 创建已完成的工单
      await query(
        `INSERT INTO exception_tickets (id, waybill_snapshot_id, external_code, exception_type, source, severity, description, amount, reporter, status, retry_count, max_retry, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'manual', $5, $6, $7, $8, $9, 0, 3, NOW(), NOW())`,
        [ticketId, snapshotId, `${externalCode}-${i}`, exceptionType, severity, `测试数据: ${exceptionType}`, amount, reporter, status]
      );

      // 创建审批记录
      const approvalId = uid("approval");
      const approver = sample(approverNames);
      await query(
        `INSERT INTO approval_records (id, ticket_id, approver, level, action, opinion, created_at)
         VALUES ($1, $2, $3, 1, 'approve', '测试审批通过', NOW())`,
        [approvalId, ticketId, approver]
      );

      // 创建赔付记录
      await query(
        `INSERT INTO compensation_records (id, ticket_id, approval_id, direction, amount, reason, status, created_at)
         VALUES ($1, $2, $3, 'to_customer', $4, $5, 'pending', NOW())`,
        [uid("comp"), ticketId, approvalId, amount, `${exceptionType} 赔付`]
      );

      // 创建库存记录
      if (exceptionType === "lost" || exceptionType === "damaged" || exceptionType === "wrong_address") {
        await query(
          `INSERT INTO inventory_logs (id, sku_code, change_qty, reason, ticket_id, approval_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [uid("inv"), `SKU${1000 + i}`, exceptionType === "wrong_address" ? -1 : -Math.floor(Math.random() * 5 + 1), `${exceptionType} 库存调整`, ticketId, approvalId]
        );
      }

      createdIds.push(ticketId);
    }

    return NextResponse.json({ ok: true, count: createdIds.length, ticket_ids: createdIds });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "仅管理员可生成测试数据" }, { status: 403 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
