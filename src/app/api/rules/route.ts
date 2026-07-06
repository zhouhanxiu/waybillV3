/**
 * 品控规则 & 审批分级规则 & 超时规则 CRUD API
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { uid } from "@/lib/utils";

// GET /api/rules?type=qc|approval|timeout — 获取规则
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "qc";

    let table = "";
    if (type === "qc") table = "qc_rules";
    else if (type === "approval") table = "approval_level_rules";
    else if (type === "timeout") table = "timeout_rules";
    else return NextResponse.json({ error: "未知规则类型" }, { status: 400 });

    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 1000);
    const rows = await query(`SELECT id, name, exception_subtype, condition, severity, auto_create_ticket, approval_level, enabled, created_at FROM ${table} ORDER BY created_at DESC LIMIT $1`, [limit]);


    return NextResponse.json(rows.map((r) => ({
      ...r,
      condition: r.condition ? (typeof r.condition === "string" ? JSON.parse(r.condition) : r.condition) : undefined,
      exception_types: r.exception_types ? (typeof r.exception_types === "string" ? JSON.parse(r.exception_types) : r.exception_types) : undefined,
    })));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/rules — 创建/更新规则
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, ...ruleData } = body;

    if (!type) {
      return NextResponse.json({ error: "缺少规则类型" }, { status: 400 });
    }

    const id = ruleData.id || uid("rule");

    if (type === "qc") {
      await query(
        `INSERT INTO qc_rules (id, name, exception_subtype, condition, severity, auto_create_ticket, approval_level, enabled, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           exception_subtype = EXCLUDED.exception_subtype,
           condition = EXCLUDED.condition,
           severity = EXCLUDED.severity,
           auto_create_ticket = EXCLUDED.auto_create_ticket,
           approval_level = EXCLUDED.approval_level,
           enabled = EXCLUDED.enabled,
           updated_at = NOW()`,
        [id, ruleData.name, ruleData.exception_subtype, JSON.stringify(ruleData.condition || []),
         ruleData.severity || "medium", ruleData.auto_create_ticket !== false, ruleData.approval_level || 1, ruleData.enabled !== false]
      );
    } else if (type === "approval") {
      await query(
        `INSERT INTO approval_level_rules (id, level, min_amount, max_amount, exception_types, enabled, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (id) DO UPDATE SET
           level = EXCLUDED.level,
           min_amount = EXCLUDED.min_amount,
           max_amount = EXCLUDED.max_amount,
           exception_types = EXCLUDED.exception_types,
           enabled = EXCLUDED.enabled,
           updated_at = NOW()`,
        [id, ruleData.level, ruleData.min_amount || null, ruleData.max_amount || null,
         ruleData.exception_types ? JSON.stringify(ruleData.exception_types) : null, ruleData.enabled !== false]
      );
    } else if (type === "timeout") {
      await query(
        `INSERT INTO timeout_rules (id, scope, timeout_minutes, action, enabled, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (id) DO UPDATE SET
           scope = EXCLUDED.scope,
           timeout_minutes = EXCLUDED.timeout_minutes,
           action = EXCLUDED.action,
           enabled = EXCLUDED.enabled,
           updated_at = NOW()`,
        [id, ruleData.scope, ruleData.timeout_minutes, ruleData.action || "escalate", ruleData.enabled !== false]
      );
    }

    return NextResponse.json({ id, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
