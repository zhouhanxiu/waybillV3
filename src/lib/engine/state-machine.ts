/**
 * 状态机引擎 — 管理工单状态转换 + 扫描批次状态转换
 */
import { TicketStatus, ScanBatchStatus, ExceptionTicket } from "../types";

// ──── 工单状态机 ────────────────────────────────────────────────────

const TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  pending: ["level1", "level2", "closed"],       // 待审批 → 一级审批 / 直接二级审批 / 关闭
  level1: ["level2", "executing", "pending", "closed"],  // 一级审批中 → 二级 / 通过→执行 / 拒绝→待审批 / 关闭
  level2: ["executing", "pending", "closed"],    // 二级审批中 → 通过→执行 / 拒绝→待审批 / 关闭
  executing: ["done", "closed"],                  // 执行中 → 完成 / 关闭
  done: [],                                       // 终态
  closed: [],                                     // 终态
};

/** 验证状态转换是否合法 */
export function canTransitionTicket(from: TicketStatus, to: TicketStatus): boolean {
  return TICKET_TRANSITIONS[from]?.includes(to) ?? false;
}

/** 获取下一状态 */
export function getNextTicketStatus(
  current: TicketStatus,
  action: "approve" | "reject" | "escalate" | "timeout" | "execute_done",
  currentLevel?: 1 | 2,
  needsLevel2?: boolean
): { next: TicketStatus; valid: boolean; reason?: string } {
  switch (current) {
    case "pending":
      if (action === "escalate" || action === "timeout") {
        return { next: "level2", valid: true };
      }
      if (needsLevel2) {
        return { next: "level2", valid: true };
      }
      return { next: "level1", valid: true };

    case "level1":
      if (action === "approve") {
        return { next: "executing", valid: true };
      }
      if (action === "reject") {
        return { next: "pending", valid: true };
      }
      if (action === "escalate" || action === "timeout") {
        return { next: "level2", valid: true };
      }
      return { next: current, valid: false, reason: "未知操作" };

    case "level2":
      if (action === "approve") {
        return { next: "executing", valid: true };
      }
      if (action === "reject") {
        return { next: "pending", valid: true };
      }
      if (action === "timeout") {
        return { next: "pending", valid: true };
      }
      return { next: current, valid: false, reason: "未知操作" };

    case "executing":
      if (action === "execute_done") {
        return { next: "done", valid: true };
      }
      return { next: current, valid: false, reason: "执行中，只能完成" };

    case "done":
    case "closed":
      return { next: current, valid: false, reason: "已终态，不可变更" };

    default:
      return { next: current, valid: false, reason: "未知状态" };
  }
}

/** 检查是否超时 */
export function isTicketOverdue(ticket: ExceptionTicket): boolean {
  if (!ticket.due_at) return false;
  return new Date() > new Date(ticket.due_at);
}

/** 计算超时截止时间 */
export function calcDueAt(timeoutMinutes: number): Date {
  return new Date(Date.now() + timeoutMinutes * 60 * 1000);
}

// ──── 扫描批次状态机 ──────────────────────────────────────────────

const SCAN_TRANSITIONS: Record<ScanBatchStatus, ScanBatchStatus[]> = {
  scanned: ["qc_hold", "released"],      // 扫描录入 → 品控暂扣 / 正常放行
  qc_hold: ["released", "returned", "degraded"], // 品控暂扣 → 放行 / 退回 / 降级
  released: [],                           // 终态
  returned: [],                           // 终态
  degraded: [],                           // 终态
};

export function canTransitionScan(from: ScanBatchStatus, to: ScanBatchStatus): boolean {
  return SCAN_TRANSITIONS[from]?.includes(to) ?? false;
}

/** 品控判定 */
export function evaluateQcResult(
  expectedQty: number,
  actualQty: number,
  damageLevel: number,
  specMatch: boolean,
  rules: { condition: any[]; severity: string; exception_subtype: string; approval_level: number }[]
): {
  passed: boolean;
  exceptionSubtype?: string;
  severity?: string;
  approvalLevel?: number;
  ruleHit?: string;
  reason?: string;
} {
  for (const rule of rules) {
    let match = true;
    for (const cond of rule.condition) {
      const { field, operator, value } = cond;
      if (field === "qty_diff_pct") {
        const diffPct = expectedQty > 0 ? Math.abs(actualQty - expectedQty) / expectedQty * 100 : 0;
        match = match && compareOp(diffPct, operator, Number(value));
      } else if (field === "damage_level") {
        match = match && compareOp(damageLevel, operator, Number(value));
      } else if (field === "spec_deviation") {
        match = match && compareOp(specMatch ? 0 : 1, operator, Number(value));
      } else if (field === "label_valid") {
        match = match && compareOp(Number(value), operator, 0);
      } else if (field === "batch_valid") {
        match = match && compareOp(Number(value), operator, 0);
      }
      if (!match) break;
    }

    if (match) {
      return {
        passed: false,
        exceptionSubtype: rule.exception_subtype,
        severity: rule.severity,
        approvalLevel: rule.approval_level as 1 | 2,
        ruleHit: rule.exception_subtype,
        reason: `命中规则: ${rule.exception_subtype}, 严重度: ${rule.severity}`,
      };
    }
  }

  return { passed: true };
}

function compareOp(a: number, op: string, b: number): boolean {
  switch (op) {
    case "gt": return a > b;
    case "gte": return a >= b;
    case "lt": return a < b;
    case "lte": return a <= b;
    case "eq": return a === b;
    case "neq": return a !== b;
    default: return false;
  }
}
