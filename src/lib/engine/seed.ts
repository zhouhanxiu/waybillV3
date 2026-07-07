/**
 * 数据种子脚本 — 初始化默认规则和模拟用户
 * 优化：并行 SELECT + 并行 INSERT，减少冷启动延迟
 */
import { dbRaw } from "@/lib/db";
import { uid } from "@/lib/utils";
import { hashPassword } from "@/lib/auth";

export async function seedDefaults() {
  // 注意：调用方需先执行 initDb() 确保表已创建

  // ──── 第一步：并行检查所有现有记录（1 轮往返） ──────────────────
  const [existingUsers, existingApprovalRules, existingTimeoutRules, existingQcRules, existingFlows] =
    await Promise.all([
      dbRaw("SELECT name FROM users"),
      dbRaw("SELECT level, min_amount FROM approval_level_rules"),
      dbRaw("SELECT scope FROM timeout_rules"),
      dbRaw("SELECT name FROM qc_rules"),
      dbRaw("SELECT name FROM approval_flow_configs"),
    ]);

  const userNames = new Set((existingUsers as any[]).map((r: any) => r.name));
  const approvalRuleKeys = new Set((existingApprovalRules as any[]).map((r: any) => `${r.level}_${r.min_amount}`));
  const timeoutScopes = new Set((existingTimeoutRules as any[]).map((r: any) => r.scope));
  const qcNames = new Set((existingQcRules as any[]).map((r: any) => r.name));
  const flowNames = new Set((existingFlows as any[]).map((r: any) => r.name));

  // ──── 第二步：并行插入所有缺失记录（1 轮往返） ──────────────────
  const inserts: Promise<any>[] = [];

  // 默认用户
  const defaultUsers = [
    { name: "admin", password: "admin", roles: ["admin"] },
    { name: "qc_supervisor", password: "123456", roles: ["qc_supervisor"] },
    { name: "approver_level1_01", password: "123456", roles: ["level1_approver"] },
    { name: "approver_level1_02", password: "123456", roles: ["level1_approver"] },
    { name: "approver_level2_01", password: "123456", roles: ["level2_approver"] },
    { name: "reporter_01", password: "123456", roles: ["reporter"] },
    { name: "operator_01", password: "123456", roles: ["operator"] },
    { name: "test_reporter_01", password: "123456", roles: ["reporter"] },
    { name: "test_reporter_02", password: "123456", roles: ["reporter"] },
    { name: "test_reporter_03", password: "123456", roles: ["reporter"] },
  ];

  for (const u of defaultUsers) {
    if (!userNames.has(u.name)) {
      inserts.push(
        hashPassword(u.password).then(pwHash =>
          dbRaw(
            "INSERT INTO users (id, name, password_hash, display_name, roles) VALUES ($1, $2, $3, $4, $5)",
            [uid("user"), u.name, pwHash, u.name, JSON.stringify(u.roles)]
          )
        )
      );
    }
  }

  // 审批分级规则
  const approvalRules = [
    { level: 1, min_amount: 0, max_amount: 500 },
    { level: 2, min_amount: 500, max_amount: null },
  ];
  for (const rule of approvalRules) {
    const key = `${rule.level}_${rule.min_amount}`;
    if (!approvalRuleKeys.has(key)) {
      inserts.push(
        dbRaw(
          "INSERT INTO approval_level_rules (id, level, min_amount, max_amount, exception_types, enabled) VALUES ($1,$2,$3,$4,$5,true)",
          [uid("apprule"), rule.level, rule.min_amount, rule.max_amount, JSON.stringify([])]
        )
      );
    }
  }

  // 超时规则
  const timeoutRules = [
    { scope: "ticket_pending", timeout_minutes: 60, action: "escalate" },
    { scope: "ticket_level1", timeout_minutes: 120, action: "escalate" },
    { scope: "ticket_level2", timeout_minutes: 240, action: "reject" },
    { scope: "qc_hold", timeout_minutes: 30, action: "auto_escalate_to_level2" },
  ];
  for (const rule of timeoutRules) {
    if (!timeoutScopes.has(rule.scope)) {
      inserts.push(
        dbRaw(
          "INSERT INTO timeout_rules (id, scope, timeout_minutes, action, enabled) VALUES ($1,$2,$3,$4,true)",
          [uid("trule"), rule.scope, rule.timeout_minutes, rule.action]
        )
      );
    }
  }

  // 品控规则
  const qcRules = [
    { name: "数量差异 > 10%", subtype: "qty_mismatch", condition: [{ field: "qty_diff_pct", operator: "gt", value: 10 }], severity: "medium", level: 1 },
    { name: "数量差异 > 30%", subtype: "qty_mismatch", condition: [{ field: "qty_diff_pct", operator: "gt", value: 30 }], severity: "high", level: 2 },
    { name: "破损等级 >= 2", subtype: "appearance", condition: [{ field: "damage_level", operator: "gte", value: 2 }], severity: "medium", level: 1 },
    { name: "破损等级 >= 4", subtype: "appearance", condition: [{ field: "damage_level", operator: "gte", value: 4 }], severity: "critical", level: 2 },
    { name: "规格不符", subtype: "spec_mismatch", condition: [{ field: "spec_deviation", operator: "eq", value: 1 }], severity: "medium", level: 1 },
    { name: "标签错误", subtype: "label_error", condition: [{ field: "label_valid", operator: "eq", value: 0 }], severity: "high", level: 2 },
    { name: "批次异常", subtype: "batch_error", condition: [{ field: "batch_valid", operator: "eq", value: 0 }], severity: "critical", level: 2 },
  ];
  for (const rule of qcRules) {
    if (!qcNames.has(rule.name)) {
      inserts.push(
        dbRaw(
          "INSERT INTO qc_rules (id, name, exception_subtype, condition, severity, auto_create_ticket, approval_level, enabled) VALUES ($1,$2,$3,$4,$5,true,$6,true)",
          [uid("qcrule"), rule.name, rule.subtype, JSON.stringify(rule.condition), rule.severity, rule.level]
        )
      );
    }
  }

  // 审批流配置
  const defaultFlows = [
    { name: "标准审批流", steps: [{ role: "level1_approver", order: 1, label: "一级审批" }, { role: "level2_approver", order: 2, label: "二级审批" }] },
  ];
  for (const flow of defaultFlows) {
    if (!flowNames.has(flow.name)) {
      inserts.push(
        dbRaw(
          "INSERT INTO approval_flow_configs (id, name, steps, enabled) VALUES ($1, $2, $3, true)",
          [uid("flow"), flow.name, JSON.stringify(flow.steps)]
        )
      );
    }
  }

  // 并行执行所有插入
  if (inserts.length > 0) {
    await Promise.all(inserts);
  }

  return { message: "默认数据初始化完成" };
}
