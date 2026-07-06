/**
 * 我的审批 API — 返回当前用户需要审批的工单
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  // 根据用户角色确定审批范围
  const roles = session.roles;
  const isAdmin = roles.includes("admin");
  const isL2 = roles.includes("level2_approver");
  const isL1 = roles.includes("level1_approver");

  // 构建审批范围的工单状态
  let statusConditions: string[] = [];
  if (isAdmin || isL2) statusConditions.push("pending", "level1", "level2");
  else if (isL1) statusConditions.push("pending", "level1");
  else {
    // 普通用户没有审批任务
    return NextResponse.json({ items: [], total: 0, page, pageSize, totalPages: 0 });
  }

  // 排除自己提交的工单
  let sql = `SELECT t.*, s.external_code as wb_code, s.receiver_name, s.store_name
             FROM exception_tickets t
             LEFT JOIN waybill_snapshots s ON t.waybill_snapshot_id = s.id
             WHERE t.status IN (${statusConditions.map((_, i) => `$${i + 1}`).join(",")})
             AND t.reporter != $${statusConditions.length + 1}`;
  const params: any[] = [...statusConditions, session.username];
  let idx = statusConditions.length + 1;

  if (status) {
    idx++; sql += ` AND t.status = $${idx}`; params.push(status);
  }

  // 计数
  const countResult = await query(
    sql.replace(/t\.\*.*?FROM/, "COUNT(*) as total FROM").replace(/LEFT JOIN.*?ON.*?AND/, "LEFT JOIN waybill_snapshots s ON t.waybill_snapshot_id = s.id WHERE"),
    params
  );
  const total = parseInt(countResult[0]?.total || "0");

  idx++; sql += ` ORDER BY t.created_at DESC LIMIT $${idx}`; params.push(pageSize);
  idx++; sql += ` OFFSET $${idx}`; params.push((page - 1) * pageSize);

  const rows = await query(sql, params);
  const items = rows.map(mapTicket);

  return NextResponse.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}

function mapTicket(r: any) {
  return {
    id: r.id,
    external_code: r.wb_code || r.external_code,
    exception_type: r.exception_type,
    source: r.source,
    severity: r.severity,
    description: r.description,
    amount: parseFloat(r.amount || "0"),
    reporter: r.reporter,
    status: r.status,
    retry_count: r.retry_count,
    max_retry: r.max_retry,
    receiver_name: r.receiver_name,
    store_name: r.store_name,
    created_at: r.created_at,
    updated_at: r.updated_at,
    due_at: r.due_at,
    overdue: r.due_at ? new Date() > new Date(r.due_at) : false,
  };
}
