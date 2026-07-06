/**
 * 异常工单 CRUD API
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { uid } from "@/lib/utils";
import { canTransitionTicket, getNextTicketStatus, isTicketOverdue, calcDueAt } from "@/lib/engine/state-machine";

// GET /api/tickets — 获取工单列表
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const status = searchParams.get("status");
    const reporter = searchParams.get("reporter");
    const type = searchParams.get("type");
    const source = searchParams.get("source");
    const overdue = searchParams.get("overdue");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");

    if (id) {
      const rows = await query("SELECT * FROM exception_tickets WHERE id = $1", [id]);
      if (rows.length === 0) {
        return NextResponse.json({ error: "工单不存在" }, { status: 404 });
      }
      return NextResponse.json(mapTicket(rows[0]));
    }

    let sql = "SELECT * FROM exception_tickets WHERE 1=1";
    const params: any[] = [];
    let paramIdx = 0;

    // 支持逗号分隔多状态
    const statusList = status ? status.split(",").map(s => s.trim()).filter(Boolean) : [];
    if (statusList.length > 0) {
      const placeholders = statusList.map(() => { paramIdx++; return `$${paramIdx}`; }).join(", ");
      sql += ` AND status IN (${placeholders})`;
      params.push(...statusList);
    }
    if (reporter) {
      paramIdx++;
      sql += ` AND reporter = $${paramIdx}`;
      params.push(reporter);
    }
    if (type) {
      paramIdx++;
      sql += ` AND exception_type = $${paramIdx}`;
      params.push(type);
    }
    if (source) {
      paramIdx++;
      sql += ` AND source = $${paramIdx}`;
      params.push(source);
    }

    if (overdue === "true") {
      paramIdx++;
      sql += ` AND due_at IS NOT NULL AND due_at < NOW() AND status NOT IN ('done','closed')`;
    }

    // 分页
    const countResult = await query(sql.replace("SELECT *", "SELECT COUNT(*) as total"), params);
    const total = parseInt(countResult[0]?.total || "0");

    paramIdx++;
    sql += ` ORDER BY created_at DESC LIMIT $${paramIdx}`;
    params.push(pageSize);
    paramIdx++;
    sql += ` OFFSET $${paramIdx}`;
    params.push((page - 1) * pageSize);

    const rows = await query(sql, params);

    return NextResponse.json({
      items: rows.map(mapTicket),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err: any) {
    // Demo 模式：无真实数据库时返回模拟数据
    if (process.env.NODE_ENV === "development" || isMockMode()) {
      const mockItems = getMockTickets();
      const items = id
        ? mockItems.filter(t => t.id === id)
        : mockItems;
      // 筛选
      let filtered = [...items];
      const { searchParams } = new URL(req.url);
      const status = searchParams.get("status");
      const source = searchParams.get("source");
      const type = searchParams.get("type");
      const overdue = searchParams.get("overdue");
      if (status) {
        const statusList = status.split(",").map(s => s.trim());
        filtered = filtered.filter(t => statusList.includes(t.status));
      }
      if (source) filtered = filtered.filter(t => t.source === source);
      if (type) filtered = filtered.filter(t => t.exception_type === type);
      if (overdue === "true") {
        filtered = filtered.filter(t => t.overdue && !["done", "closed"].includes(t.status));
      }
      if (id && filtered.length === 1) return NextResponse.json(filtered[0]);
      return NextResponse.json({
        items: filtered,
        total: filtered.length,
        page: 1,
        pageSize: filtered.length,
        totalPages: 1,
      });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function isMockMode() {
  const url = process.env.DATABASE_URL || "";
  return !url || url.includes("localhost") || url.includes("mock");
}

// POST /api/tickets — 创建工单
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { waybill_snapshot_id, external_code, exception_type, source, severity, description, amount, reporter } = body;

    if (!external_code || !exception_type || !reporter) {
      return NextResponse.json({ error: "缺少必要字段" }, { status: 400 });
    }

    // 统一校验：运单在 V2 是否存在 + 确保本地快照
    const { validateWaybillInV2 } = await import("@/lib/v2-client");
    const vResult = await validateWaybillInV2(external_code);
    if (!vResult.valid) {
      return NextResponse.json({ error: vResult.reason }, { status: 400 });
    }
    const snapshotId = vResult.snapshotId;

    // 检查同类型未关闭工单
    const existing = await query(
      `SELECT id FROM exception_tickets
       WHERE external_code = $1 AND exception_type = $2 AND status NOT IN ('done','closed')`,
      [external_code, exception_type]
    );
    if (existing.length > 0) {
      return NextResponse.json(
        { error: `该运单已存在同类型未关闭工单 (${existing[0].id})，请勿重复上报` },
        { status: 409 }
      );
    }

    const id = uid("ticket");
    const maxRetry = 3;

    // 判断是否需要二级审批（根据金额阈值规则）
    let initialStatus = "pending";
    let approvalLevel = 1;

    if (amount && amount > 0) {
      const rules = await query(
        "SELECT * FROM approval_level_rules WHERE enabled = true AND level = 2 AND min_amount IS NOT NULL ORDER BY min_amount ASC"
      );
      for (const rule of rules) {
        if (amount >= (rule.min_amount || 0) && (!rule.max_amount || amount <= rule.max_amount)) {
          initialStatus = "level2";
          approvalLevel = 2;
          break;
        }
      }
    }

    // 品控来源的工单默认进二级审批
    if (source === "scan_auto") {
      initialStatus = "level2";
      approvalLevel = 2;
    }

    // 计算超时时间
    const timeoutRules = await query(
      "SELECT * FROM timeout_rules WHERE enabled = true AND scope = $1 LIMIT 1",
      [initialStatus === "level2" ? "ticket_level2" : "ticket_pending"]
    );
    const dueAt = timeoutRules.length > 0
      ? new Date(Date.now() + timeoutRules[0].timeout_minutes * 60 * 1000).toISOString()
      : null;

    await query(
      `INSERT INTO exception_tickets (id, waybill_snapshot_id, external_code, exception_type, source, severity, description, amount, reporter, status, retry_count, max_retry, due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, snapshotId, external_code, exception_type, source || "manual", severity || "medium", description || "", amount || 0, reporter, initialStatus, 0, maxRetry, dueAt]
    );

    // 如果品控工单，回写 V2
    if (source === "scan_auto") {
      try {
        const { notifyV2Exception } = await import("@/lib/v2-client");
        await notifyV2Exception(external_code, true);
      } catch { /* 非阻塞 */ }
    }

    return NextResponse.json({ id, status: initialStatus, due_at: dueAt });
  } catch (err: any) {
    if (process.env.NODE_ENV === "development" || isMockMode()) {
      const id = uid("ticket");
      return NextResponse.json({ id, status: "pending", message: "演示模式：异常工单已模拟创建（未配置真实数据库）" });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT /api/tickets — 审批操作
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action, approver, opinion, level } = body;

    if (!id || !action || !approver) {
      return NextResponse.json({ error: "缺少必要字段" }, { status: 400 });
    }

    // 获取工单
    const tickets = await query("SELECT * FROM exception_tickets WHERE id = $1", [id]);
    if (tickets.length === 0) {
      return NextResponse.json({ error: "工单不存在" }, { status: 404 });
    }

    const ticket = tickets[0];

    // 权限校验：上报人不能审批自己的工单
    if (ticket.reporter === approver) {
      return NextResponse.json({ error: "不能审批自己提交的工单" }, { status: 403 });
    }

    // 权限校验：审批人角色匹配当前审批层级
    if (action === "approve" || action === "reject") {
      const userRows = await query(
        "SELECT * FROM users WHERE name = $1 AND active = true",
        [approver]
      );
      if (userRows.length === 0) {
        return NextResponse.json({ error: "审批人不存在或已禁用" }, { status: 403 });
      }
      const roles: string[] = typeof userRows[0].roles === "string"
        ? JSON.parse(userRows[0].roles)
        : (userRows[0].roles || []);

      const hasApproverRole = roles.includes("level1_approver") || roles.includes("level2_approver") || roles.includes("admin");
      if (!hasApproverRole) {
        return NextResponse.json({ error: "无审批权限，需要审批人角色" }, { status: 403 });
      }

      // L2 工单只能由 L2 审批人或 admin 审批
      if (ticket.status === "level2") {
        if (!roles.includes("level2_approver") && !roles.includes("admin")) {
          return NextResponse.json(
            { error: `当前工单为二级审批，需要二级审批人或管理员权限` },
            { status: 403 }
          );
        }
      }
    }

    // 并发冲突检测：乐观锁（基于状态）
    if (action === "approve" || action === "reject") {
      if (!["pending", "level1", "level2"].includes(ticket.status)) {
        return NextResponse.json(
          { error: `该工单已被处理，当前状态: ${ticket.status}，请刷新` },
          { status: 409 }
        );
      }
    }

    // 超时检查
    if (isTicketOverdue({ ...ticket, due_at: ticket.due_at })) {
      // 超时自动升级
      await query(
        "UPDATE exception_tickets SET status = 'level2', due_at = $2, updated_at = NOW() WHERE id = $1",
        [id, calcDueAt(60 * 24).toISOString()]
      );
      return NextResponse.json({ error: "工单已超时，已自动升级到二级审批" }, { status: 409 });
    }

    const currentStatus = ticket.status as string;
    const nextResult = getNextTicketStatus(
      currentStatus as any,
      action === "approve" ? "approve" : action === "reject" ? "reject" : "timeout",
      level as any
    );

    if (!nextResult.valid) {
      return NextResponse.json({ error: nextResult.reason || "状态转换不合法" }, { status: 400 });
    }

    // 幂等性检查：如果已有相同审批记录，不重复创建
    const existingApproval = await query(
      "SELECT id FROM approval_records WHERE ticket_id = $1 AND approver = $2 AND level = $3 AND action = $4",
      [id, approver, level || 1, action]
    );
    if (existingApproval.length > 0) {
      return NextResponse.json({ message: "审批记录已存在，跳过重复提交", existing: existingApproval[0].id });
    }

    // 创建审批记录
    const approvalId = uid("approval");
    await query(
      `INSERT INTO approval_records (id, ticket_id, approver, level, action, opinion)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [approvalId, id, approver, level || 1, action, opinion || ""]
    );

    // 更新工单状态
    let newStatus = nextResult.next;
    let newDueAt = ticket.due_at;

    if (action === "reject") {
      const newRetryCount = ticket.retry_count + 1;
      if (newRetryCount >= ticket.max_retry) {
        newStatus = "closed";
      } else {
        newStatus = "pending";
        // 重设超时
        const timeoutRules = await query(
          "SELECT * FROM timeout_rules WHERE enabled = true AND scope = 'ticket_pending' LIMIT 1"
        );
        newDueAt = timeoutRules.length > 0
          ? new Date(Date.now() + timeoutRules[0].timeout_minutes * 60 * 1000).toISOString()
          : null;
      }
      await query(
        "UPDATE exception_tickets SET status = $2, retry_count = $3, due_at = $4, updated_at = NOW() WHERE id = $1",
        [id, newStatus, newRetryCount, newDueAt]
      );
    } else if (action === "approve" && newStatus === "executing") {
      // 进入执行中状态
      await query(
        "UPDATE exception_tickets SET status = 'executing', updated_at = NOW() WHERE id = $1",
        [id]
      );

      // 执行联动
      await handleExecution(id, ticket, approvalId);
    } else {
      // 其他状态转换（如升级）
      if (newStatus === "level2") {
        const timeoutRules = await query(
          "SELECT * FROM timeout_rules WHERE enabled = true AND scope = 'ticket_level2' LIMIT 1"
        );
        newDueAt = timeoutRules.length > 0
          ? new Date(Date.now() + timeoutRules[0].timeout_minutes * 60 * 1000).toISOString()
          : null;
      }
      await query(
        "UPDATE exception_tickets SET status = $2, due_at = $3, updated_at = NOW() WHERE id = $1",
        [id, newStatus, newDueAt]
      );
    }

    return NextResponse.json({
      id,
      status: newStatus,
      approvalId,
      due_at: newDueAt,
    });
  } catch (err: any) {
    if (process.env.NODE_ENV === "development" || isMockMode()) {
        return NextResponse.json({ id: "demo", status: "done", message: "演示模式：审批已模拟通过（未配置真实数据库）" });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ──── 执行联动 ─────────────────────────────────────────────────────

async function handleExecution(ticketId: string, ticket: any, approvalId: string) {
  const exceptionType = ticket.exception_type;
  const amount = parseFloat(ticket.amount) || 0;

  // 物流异常 → 赔付客户
  if (["lost", "damaged", "rejected"].includes(exceptionType)) {
    await query(
      `INSERT INTO compensation_records (id, ticket_id, approval_id, direction, amount, reason, status)
       VALUES ($1,$2,$3,'to_customer',$4,$5,'pending')`,
      [uid("comp"), ticketId, approvalId, amount, `${exceptionType} 赔付`]
    );

    // 丢件/破损 → 回滚库存
    if (exceptionType === "lost" || exceptionType === "damaged") {
      await query(
        `INSERT INTO inventory_logs (id, sku_code, change_qty, reason, ticket_id, approval_id)
         VALUES ($1,'UNKNOWN',0,'需要回滚原运单库存', $2, $3)`,
        [uid("inv"), ticketId, approvalId]
      );
    }
  }

  // 地址错误 → 重新发货（扣减库存）
  if (exceptionType === "wrong_address") {
    await query(
      `INSERT INTO inventory_logs (id, sku_code, change_qty, reason, ticket_id, approval_id)
       VALUES ($1,'UNKNOWN',-1,'重新发货扣减库存', $2, $3)`,
      [uid("inv"), ticketId, approvalId]
    );
  }

  // 品控异常 → 向供应商追偿
  if (ticket.source === "scan_auto") {
    await query(
      `INSERT INTO compensation_records (id, ticket_id, approval_id, direction, amount, reason, status)
       VALUES ($1,$2,$3,'from_supplier',$4,$5,'pending')`,
      [uid("comp"), ticketId, approvalId, amount, `品控异常追偿: ${exceptionType}`]
    );

    // 解锁扫描批次
    await query(
      "UPDATE scan_records SET batch_status = 'released' WHERE ticket_id = $1 AND batch_status = 'qc_hold'",
      [ticketId]
    );
  }

  // 标记完成
  await query(
    "UPDATE exception_tickets SET status = 'done', updated_at = NOW() WHERE id = $1",
    [ticketId]
  );

  // 通知 V2 异常已处理
  try {
    const { notifyV2Exception } = await import("@/lib/v2-client");
    await notifyV2Exception(ticket.external_code, false);
  } catch { /* 非阻塞 */ }
}

// ──── 辅助函数 ─────────────────────────────────────────────────────

function mapTicket(row: any) {
  return {
    id: row.id,
    waybill_snapshot_id: row.waybill_snapshot_id,
    external_code: row.external_code,
    exception_type: row.exception_type,
    source: row.source,
    severity: row.severity,
    description: row.description,
    amount: parseFloat(row.amount || "0"),
    reporter: row.reporter,
    status: row.status,
    retry_count: row.retry_count,
    max_retry: row.max_retry,
    created_at: row.created_at,
    updated_at: row.updated_at,
    due_at: row.due_at,
    overdue: row.due_at ? new Date() > new Date(row.due_at) : false,
  };
}

// ──── Mock 测试数据 ────────────────────────────────────────────────
function getMockTickets() {
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  return [
    { id: "ticket_001", waybill_snapshot_id: "snap_001", external_code: "EXP001", exception_type: "lost", source: "manual", severity: "high", description: "客户反馈包裹未收到，物流轨迹中断", amount: 1200, reporter: "operator_lisa", status: "level2", retry_count: 0, max_retry: 3, created_at: twoDaysAgo, updated_at: twoDaysAgo, due_at: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(), overdue: true },
    { id: "ticket_002", waybill_snapshot_id: "snap_002", external_code: "EXP002", exception_type: "damaged", source: "manual", severity: "medium", description: "外包装破损，内件疑似受潮", amount: 80, reporter: "operator_mike", status: "pending", retry_count: 0, max_retry: 3, created_at: twoHoursAgo, updated_at: twoHoursAgo, due_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), overdue: false },
    { id: "ticket_003", waybill_snapshot_id: "snap_003", external_code: "EXP003", exception_type: "qty_mismatch", source: "scan_auto", severity: "low", description: "扫描复核发现少件 3 个", amount: 45, reporter: "operator_jim", status: "level2", retry_count: 0, max_retry: 3, created_at: twoDaysAgo, updated_at: twoDaysAgo, due_at: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(), overdue: true },
    { id: "ticket_004", waybill_snapshot_id: "snap_004", external_code: "EXP004", exception_type: "wrong_address", source: "manual", severity: "medium", description: "客户地址变更，需重新配送", amount: 300, reporter: "operator_lisa", status: "level1", retry_count: 0, max_retry: 3, created_at: twoHoursAgo, updated_at: twoHoursAgo, due_at: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(), overdue: false },
    { id: "ticket_005", waybill_snapshot_id: "snap_005", external_code: "EXP005", exception_type: "appearance", source: "scan_auto", severity: "high", description: "玻璃制品破损，无法二次销售", amount: 600, reporter: "operator_mike", status: "level2", retry_count: 0, max_retry: 3, created_at: twoDaysAgo, updated_at: twoDaysAgo, due_at: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(), overdue: true },
    { id: "ticket_006", waybill_snapshot_id: "snap_006", external_code: "EXP006", exception_type: "lost", source: "manual", severity: "medium", description: "分拨中心丢件", amount: 150, reporter: "operator_jim", status: "level1", retry_count: 0, max_retry: 3, created_at: twoHoursAgo, updated_at: twoHoursAgo, due_at: new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(), overdue: false },
    { id: "ticket_007", waybill_snapshot_id: "snap_007", external_code: "EXP007", exception_type: "qty_mismatch", source: "scan_auto", severity: "low", description: "整箱短少 1 件", amount: 60, reporter: "operator_lisa", status: "pending", retry_count: 0, max_retry: 3, created_at: twoHoursAgo, updated_at: twoHoursAgo, due_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), overdue: false },
    { id: "ticket_008", waybill_snapshot_id: "snap_008", external_code: "EXP008", exception_type: "damaged", source: "manual", severity: "high", description: "超时未处理：易碎品破损", amount: 800, reporter: "operator_mike", status: "level2", retry_count: 0, max_retry: 3, created_at: twoDaysAgo, updated_at: twoDaysAgo, due_at: new Date(now.getTime() - 18 * 60 * 60 * 1000).toISOString(), overdue: true },
    { id: "ticket_009", waybill_snapshot_id: "snap_009", external_code: "EXP009", exception_type: "lost", source: "manual", severity: "critical", description: "超时未处理：高价值包裹丢失", amount: 1500, reporter: "operator_jim", status: "level2", retry_count: 0, max_retry: 3, created_at: twoDaysAgo, updated_at: twoDaysAgo, due_at: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), overdue: true },
    { id: "ticket_010", waybill_snapshot_id: "snap_010", external_code: "EXP010", exception_type: "qty_mismatch", source: "manual", severity: "low", description: "已补货完成", amount: 50, reporter: "operator_lisa", status: "done", retry_count: 0, max_retry: 3, created_at: today, updated_at: today, due_at: null, overdue: false },
    { id: "ticket_011", waybill_snapshot_id: "snap_011", external_code: "EXP011", exception_type: "wrong_address", source: "manual", severity: "medium", description: "已重新发货完成", amount: 200, reporter: "operator_mike", status: "closed", retry_count: 0, max_retry: 3, created_at: today, updated_at: today, due_at: null, overdue: false },
  ];
}
