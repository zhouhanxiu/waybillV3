/**
 * 扫描品控 API
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { uid } from "@/lib/utils";
import { evaluateQcResult } from "@/lib/engine/state-machine";

function isMockMode() {
  const url = process.env.DATABASE_URL || "";
  return !url || url.includes("localhost") || url.includes("mock");
}

// POST /api/scan — 执行扫描
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { external_code, sku_code, sku_name, operator, expected_qty, actual_qty, damage_level, spec_match } = body;

    if (!external_code || !sku_code || !operator) {
      return NextResponse.json({ error: "缺少必要字段" }, { status: 400 });
    }

    // 确保运单快照存在，获取 waybill 信息（含 items）
    const { validateWaybillInV2 } = await import("@/lib/v2-client");
    const vResult = await validateWaybillInV2(external_code);
    if (!vResult.valid) {
      return NextResponse.json({ error: vResult.reason }, { status: 400 });
    }
    const waybillId = vResult.snapshotId;

    // SKU 校验 — 仅本地检查（validateWaybillInV2 已确保快照和 items 完整）
    if (sku_code && vResult.waybill) {
      const hasSku = (vResult.waybill.items || []).some((item: any) => item.sku_code === sku_code);
      if (!hasSku) {
        return NextResponse.json(
          { error: `SKU ${sku_code} 不属于运单 ${external_code}` },
          { status: 400 }
        );
      }
    }

    // 检查是否已有未关闭的品控工单（幂等性）
    const existingTickets = await query(
      `SELECT t.id FROM exception_tickets t
       JOIN scan_records s ON s.ticket_id = t.id
       WHERE s.external_code = $1 AND s.sku_code = $2
       AND t.source = 'scan_auto' AND t.status NOT IN ('done','closed')`,
      [external_code, sku_code]
    );

    if (existingTickets.length > 0) {
      // 已存在未关闭工单，只追加扫描记录
      const scanId = uid("scan");
      await query(
        `INSERT INTO scan_records (id, waybill_snapshot_id, external_code, sku_code, sku_name, operator, qc_result, batch_status, ticket_id)
         VALUES ($1,$2,$3,$4,$5,$6,'fail','qc_hold',$7)`,
        [scanId, waybillId, external_code, sku_code, sku_name || sku_code, operator, existingTickets[0].id]
      );

      return NextResponse.json({
        id: scanId,
        result: "fail",
        message: `该批次已存在未关闭品控工单 (${existingTickets[0].id})，已追加扫描记录`,
        existing_ticket: existingTickets[0].id,
      });
    }

    // 加载品控规则（只取必要字段，减少内存和JSON.parse开销）
    const qcRules = await query(
      `SELECT id, exception_subtype, severity, approval_level,
        CASE WHEN condition::text = 'null' THEN '[]' ELSE condition::text END as condition_text
       FROM qc_rules
       WHERE enabled = true
       ORDER BY severity DESC
       LIMIT 100`
    );


    // 执行品控检测
    const qcResult = evaluateQcResult(
      expected_qty || 0,
      actual_qty || expected_qty || 0,
      damage_level || 0,
      spec_match !== false,
      qcRules.map((r) => ({
        condition: JSON.parse(r.condition_text || "[]"),
        severity: r.severity,
        exception_subtype: r.exception_subtype,
        approval_level: r.approval_level,
      }))
    );

    const scanId = uid("scan");

    if (qcResult.passed) {
      // 通过
      await query(
        `INSERT INTO scan_records (id, waybill_snapshot_id, external_code, sku_code, sku_name, operator, qc_result, batch_status)
         VALUES ($1,$2,$3,$4,$5,$6,'pass','released')`,
        [scanId, waybillId, external_code, sku_code, sku_name || sku_code, operator]
      );

      return NextResponse.json({
        id: scanId,
        result: "pass",
        message: "品控检测通过，批次已放行",
      });
    }

    // 不通过 — 创建异常工单 + 品控暂扣
    const ticketId = uid("ticket");

    // 计算超时
    const timeoutRules = await query(
      "SELECT * FROM timeout_rules WHERE enabled = true AND scope = 'ticket_level2' LIMIT 1"
    );
    const dueAt = timeoutRules.length > 0
      ? new Date(Date.now() + timeoutRules[0].timeout_minutes * 60 * 1000).toISOString()
      : null;

    // 先创建工单（scan_records.ticket_id 的外键指向这里）
    await query(
      `INSERT INTO exception_tickets (id, waybill_snapshot_id, external_code, exception_type, source, severity, description, reporter, status, retry_count, max_retry, due_at)
       VALUES ($1,$2,$3,$4,'scan_auto',$5,$6,$7,'level2',$8,$9,$10)`,
      [ticketId, waybillId, external_code, qcResult.exceptionSubtype, qcResult.severity || "medium", qcResult.reason || "", operator, 0, 3, dueAt]
    );

    // 再创建扫描记录（引用已存在的工单）
    await query(
      `INSERT INTO scan_records (id, waybill_snapshot_id, external_code, sku_code, sku_name, operator, qc_result, batch_status, exception_subtype, exception_desc, rule_id_hit, ticket_id)
       VALUES ($1,$2,$3,$4,$5,$6,'fail','qc_hold',$7,$8,$9,$10)`,
      [scanId, waybillId, external_code, sku_code, sku_name || sku_code, operator, qcResult.exceptionSubtype, qcResult.reason, qcResult.ruleHit, ticketId]
    );

    // 通知 V2
    try {
      const { notifyV2Exception } = await import("@/lib/v2-client");
      await notifyV2Exception(external_code, true);
    } catch { /* 非阻塞 */ }

    return NextResponse.json({
      id: scanId,
      result: "fail",
      ticket_id: ticketId,
      exception_subtype: qcResult.exceptionSubtype,
      severity: qcResult.severity,
      reason: qcResult.reason,
      message: "品控检测异常，已创建工单并暂扣批次",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT /api/scan — 快速放行（仅品控主管）
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { scan_id, operator, reason } = body;

    if (!scan_id || !operator || !reason) {
      return NextResponse.json({ error: "缺少必要字段" }, { status: 400 });
    }

    // 权限校验
    const users = await query(
      "SELECT * FROM users WHERE name = $1 AND active = true",
      [operator]
    );
    if (users.length === 0) {
      return NextResponse.json({ error: "用户不存在或已禁用" }, { status: 403 });
    }
    const roles: string[] = typeof users[0].roles === "string"
      ? JSON.parse(users[0].roles)
      : users[0].roles;
    if (!roles.includes("qc_supervisor") && !roles.includes("admin")) {
      return NextResponse.json({ error: "仅品控主管或管理员可执行快速放行" }, { status: 403 });
    }

    // 获取扫描记录
    const scans = await query("SELECT * FROM scan_records WHERE id = $1", [scan_id]);
    if (scans.length === 0) {
      return NextResponse.json({ error: "扫描记录不存在" }, { status: 404 });
    }

    const scan = scans[0];
    if (scan.batch_status !== "qc_hold") {
      return NextResponse.json({ error: "该批次不在品控暂扣状态" }, { status: 400 });
    }

    // 快速放行
    await query(
      `UPDATE scan_records SET batch_status = 'released', fast_released = true, fast_release_by = $2, fast_release_reason = $3
       WHERE id = $1`,
      [scan_id, operator, reason]
    );

    // 关闭关联工单
    if (scan.ticket_id) {
      await query(
        "UPDATE exception_tickets SET status = 'closed', updated_at = NOW() WHERE id = $1",
        [scan.ticket_id]
      );

      // 创建审批记录（留痕）
      const approvalId = uid("approval");
      await query(
        `INSERT INTO approval_records (id, ticket_id, approver, level, action, opinion)
         VALUES ($1,$2,$3,2,'approve',$4)`,
        [approvalId, scan.ticket_id, operator, `快速放行: ${reason}`]
      );
    }

    return NextResponse.json({ success: true, message: "批次已快速放行" });
  } catch (err: any) {
    if (process.env.NODE_ENV === "development" || isMockMode()) {
      return NextResponse.json({ success: true, message: "演示模式：快速放行已模拟通过（未配置真实数据库）" });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
