/**
 * 数据种子脚本 — 初始化默认规则和模拟用户
 */
import { query, initDb } from "@/lib/db";
import { uid } from "@/lib/utils";

export async function seedDefaults() {
  await initDb();

  // ──── 默认用户 ────────────────────────────────────────────────────
  const defaultUsers = [
    { name: "admin", roles: ["admin"] },
    { name: "qc_supervisor", roles: ["qc_supervisor"] },
    { name: "approver_level1_01", roles: ["level1_approver"] },
    { name: "approver_level2_01", roles: ["level2_approver"] },
    { name: "reporter_01", roles: ["reporter"] },
    { name: "operator_01", roles: ["operator"] },
  ];

  for (const u of defaultUsers) {
    const existing = await query("SELECT id FROM users WHERE name = $1", [u.name]);
    if (existing.length === 0) {
      await query(
        "INSERT INTO users (id, name, roles) VALUES ($1, $2, $3)",
        [uid("user"), u.name, JSON.stringify(u.roles)]
      );
    }
  }

  // ──── 审批分级规则 ───────────────────────────────────────────────
  const approvalRules = [
    { level: 1, min_amount: 0, max_amount: 500, desc: "500元以下仅需一级审批" },
    { level: 2, min_amount: 500, max_amount: null, desc: "500元及以上需二级审批" },
  ];

  for (const rule of approvalRules) {
    const existing = await query(
      "SELECT id FROM approval_level_rules WHERE level = $1 AND min_amount = $2",
      [rule.level, rule.min_amount]
    );
    if (existing.length === 0) {
      await query(
        `INSERT INTO approval_level_rules (id, level, min_amount, max_amount, exception_types, enabled)
         VALUES ($1,$2,$3,$4,$5,true)`,
        [uid("apprule"), rule.level, rule.min_amount, rule.max_amount, JSON.stringify([])]
      );
    }
  }

  // ──── 超时规则 ───────────────────────────────────────────────────
  const timeoutRules = [
    { scope: "ticket_pending", timeout_minutes: 60, action: "escalate", desc: "待审批超时60分钟自动升级" },
    { scope: "ticket_level1", timeout_minutes: 120, action: "escalate", desc: "一级审批超时120分钟升级" },
    { scope: "ticket_level2", timeout_minutes: 240, action: "reject", desc: "二级审批超时240分钟自动驳回" },
    { scope: "qc_hold", timeout_minutes: 30, action: "auto_escalate_to_level2", desc: "品控暂扣超时30分钟强制升级" },
  ];

  for (const rule of timeoutRules) {
    const existing = await query(
      "SELECT id FROM timeout_rules WHERE scope = $1", [rule.scope]
    );
    if (existing.length === 0) {
      await query(
        `INSERT INTO timeout_rules (id, scope, timeout_minutes, action, enabled)
         VALUES ($1,$2,$3,$4,true)`,
        [uid("trule"), rule.scope, rule.timeout_minutes, rule.action]
      );
    }
  }

  // ──── 品控规则 ───────────────────────────────────────────────────
  const qcRules = [
    {
      name: "数量差异 > 10%",
      subtype: "qty_mismatch",
      condition: [{ field: "qty_diff_pct", operator: "gt", value: 10 }],
      severity: "medium",
      level: 1,
    },
    {
      name: "数量差异 > 30%",
      subtype: "qty_mismatch",
      condition: [{ field: "qty_diff_pct", operator: "gt", value: 30 }],
      severity: "high",
      level: 2,
    },
    {
      name: "破损等级 >= 2",
      subtype: "appearance",
      condition: [{ field: "damage_level", operator: "gte", value: 2 }],
      severity: "medium",
      level: 1,
    },
    {
      name: "破损等级 >= 4",
      subtype: "appearance",
      condition: [{ field: "damage_level", operator: "gte", value: 4 }],
      severity: "critical",
      level: 2,
    },
    {
      name: "规格不符",
      subtype: "spec_mismatch",
      condition: [{ field: "spec_deviation", operator: "eq", value: 1 }],
      severity: "medium",
      level: 1,
    },
    {
      name: "标签错误",
      subtype: "label_error",
      condition: [{ field: "label_valid", operator: "eq", value: 0 }],
      severity: "high",
      level: 2,
    },
    {
      name: "批次异常",
      subtype: "batch_error",
      condition: [{ field: "batch_valid", operator: "eq", value: 0 }],
      severity: "critical",
      level: 2,
    },
  ];

  for (const rule of qcRules) {
    const existing = await query(
      "SELECT id FROM qc_rules WHERE name = $1", [rule.name]
    );
    if (existing.length === 0) {
      await query(
        `INSERT INTO qc_rules (id, name, exception_subtype, condition, severity, auto_create_ticket, approval_level, enabled)
         VALUES ($1,$2,$3,$4,$5,true,$6,true)`,
        [uid("qcrule"), rule.name, rule.subtype, JSON.stringify(rule.condition), rule.severity, rule.level]
      );
    }
  }

  return { message: "默认数据初始化完成" };
}
