// ──── 运单本地快照 ─────────────────────────────────────────────────
export type WaybillSnapshot = {
  id: string;
  external_code: string;
  store_name?: string;
  receiver_name?: string;
  receiver_phone?: string;
  receiver_address?: string;
  amount?: number;
  status?: string;
  synced_at: string;
  items?: WaybillItemSnapshot[];
};

export type WaybillItemSnapshot = {
  id: string;
  waybill_id: string;
  sku_code: string;
  sku_name: string;
  quantity: number;
  spec?: string;
};

// ──── 接口同步日志 ──────────────────────────────────────────────────
export type SyncLog = {
  id: string;
  request_id: string;
  endpoint: string;
  method: string;
  params_summary?: string;
  status_code?: number;
  success: boolean;
  duration_ms?: number;
  error_message?: string;
  created_at: string;
};

// ──── 异常工单 ─────────────────────────────────────────────────────
export type ExceptionType =
  // 物流类
  | "lost"         // 丢件
  | "damaged"      // 破损
  | "rejected"     // 客户拒收
  | "timeout"      // 超时未签收
  | "wrong_address";// 地址错误
  // 品控类
export type QcExceptionType =
  | "qty_mismatch" // 数量不符
  | "appearance"   // 外观破损
  | "spec_mismatch"// 规格不符
  | "label_error"  // 标签错误
  | "batch_error"; // 批次异常

export type ExceptionSource = "manual" | "scan_auto";

export type TicketStatus =
  | "pending"        // 待审批
  | "level1"         // 一级审批中
  | "level2"         // 二级审批中
  | "executing"      // 执行中
  | "done"           // 已完成
  | "closed";        // 已关闭

export type ExceptionTicket = {
  id: string;
  waybill_snapshot_id: string;
  external_code: string;
  exception_type: string;
  source: ExceptionSource;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  amount?: number;
  reporter: string;
  status: TicketStatus;
  retry_count: number;
  max_retry: number;
  created_at: string;
  updated_at: string;
  due_at?: string; // 超时截止时间
};

// ──── 审批记录 ─────────────────────────────────────────────────────
export type ApprovalAction = "approve" | "reject";

export type ApprovalRecord = {
  id: string;
  ticket_id: string;
  approver: string;
  level: 1 | 2;
  action: ApprovalAction;
  opinion?: string;
  ai_suggestion?: string;
  created_at: string;
};

// ──── 赔付记录 ─────────────────────────────────────────────────────
export type CompensationDirection = "to_customer" | "from_supplier";

export type CompensationRecord = {
  id: string;
  ticket_id: string;
  approval_id: string;
  direction: CompensationDirection;
  amount: number;
  reason: string;
  status: "pending" | "processing" | "done";
  created_at: string;
};

// ──── 库存记录 ─────────────────────────────────────────────────────
export type InventoryLog = {
  id: string;
  sku_code: string;
  change_qty: number; // 正=入库，负=出库
  reason: string;
  ticket_id?: string;
  approval_id?: string;
  created_at: string;
};

// ──── 扫描记录 & 批次状态 ─────────────────────────────────────────
export type ScanBatchStatus =
  | "scanned"       // 扫描录入
  | "qc_hold"       // 品控暂扣
  | "released"      // 已放行
  | "returned"      // 已退回
  | "degraded";     // 降级处理

export type ScanRecord = {
  id: string;
  waybill_snapshot_id: string;
  external_code: string;
  sku_code: string;
  sku_name: string;
  operator: string;
  qc_result: "pass" | "fail";
  batch_status: ScanBatchStatus;
  exception_subtype?: string;
  exception_desc?: string;
  rule_id_hit?: string;
  ticket_id?: string;
  fast_released?: boolean;
  fast_release_by?: string;
  fast_release_reason?: string;
  created_at: string;
};

// ──── 品控规则 ─────────────────────────────────────────────────────
export type QcRule = {
  id: string;
  name: string;
  exception_subtype: QcExceptionType;
  condition: {
    field: "qty_diff_pct" | "damage_level" | "spec_deviation" | "label_valid" | "batch_valid";
    operator: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
    value: number | string;
  }[];
  severity: "low" | "medium" | "high" | "critical";
  auto_create_ticket: boolean;
  approval_level: 1 | 2;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

// ──── 审批分级规则 ─────────────────────────────────────────────────
export type ApprovalLevelRule = {
  id: string;
  level: 1 | 2;
  min_amount?: number;
  max_amount?: number;
  exception_types?: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

// ──── 超时规则 ─────────────────────────────────────────────────────
export type TimeoutRule = {
  id: string;
  scope: "ticket_pending" | "ticket_level1" | "ticket_level2" | "qc_hold";
  timeout_minutes: number;
  action: "escalate" | "reject" | "auto_escalate_to_level2";
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

// ──── 用户角色 ─────────────────────────────────────────────────────
export type UserRole = "admin" | "qc_supervisor" | "level1_approver" | "level2_approver" | "reporter" | "operator";

export type User = {
  id: string;
  name: string;
  roles: UserRole[];
  active: boolean;
  created_at: string;
};
