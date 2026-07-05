import postgres from "postgres";

let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!sql) {
    sql = postgres(url, {
      prepare: false,
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

export async function query<T = any>(sqlText: string, params?: any[]) {
  const db = getDb();
  return (await db.unsafe(sqlText, params)) as T[];
}

export async function initDb() {
  const statements = [
    // 运单本地快照
    `CREATE TABLE IF NOT EXISTS waybill_snapshots (
      id TEXT PRIMARY KEY,
      external_code TEXT NOT NULL,
      store_name TEXT,
      receiver_name TEXT,
      receiver_phone TEXT,
      receiver_address TEXT,
      amount NUMERIC DEFAULT 0,
      v2_status TEXT,
      synced_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    // 运单品项快照
    `CREATE TABLE IF NOT EXISTS waybill_item_snapshots (
      id TEXT PRIMARY KEY,
      waybill_snapshot_id TEXT NOT NULL REFERENCES waybill_snapshots(id),
      sku_code TEXT NOT NULL,
      sku_name TEXT NOT NULL,
      quantity NUMERIC NOT NULL DEFAULT 0,
      spec TEXT
    )`,
    // 接口同步日志
    `CREATE TABLE IF NOT EXISTS sync_logs (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'GET',
      params_summary TEXT,
      status_code INTEGER,
      success BOOLEAN NOT NULL DEFAULT false,
      duration_ms INTEGER,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    // 异常工单
    `CREATE TABLE IF NOT EXISTS exception_tickets (
      id TEXT PRIMARY KEY,
      waybill_snapshot_id TEXT NOT NULL REFERENCES waybill_snapshots(id),
      external_code TEXT NOT NULL,
      exception_type TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      severity TEXT NOT NULL DEFAULT 'medium',
      description TEXT,
      amount NUMERIC DEFAULT 0,
      reporter TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retry INTEGER NOT NULL DEFAULT 3,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      due_at TIMESTAMP
    )`,
    // 审批记录
    `CREATE TABLE IF NOT EXISTS approval_records (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES exception_tickets(id),
      approver TEXT NOT NULL,
      level INTEGER NOT NULL,
      action TEXT NOT NULL,
      opinion TEXT,
      ai_suggestion TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    // 赔付记录
    `CREATE TABLE IF NOT EXISTS compensation_records (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES exception_tickets(id),
      approval_id TEXT NOT NULL REFERENCES approval_records(id),
      direction TEXT NOT NULL,
      amount NUMERIC NOT NULL DEFAULT 0,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    // 库存日志
    `CREATE TABLE IF NOT EXISTS inventory_logs (
      id TEXT PRIMARY KEY,
      sku_code TEXT NOT NULL,
      change_qty NUMERIC NOT NULL,
      reason TEXT,
      ticket_id TEXT REFERENCES exception_tickets(id),
      approval_id TEXT REFERENCES approval_records(id),
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    // 扫描记录
    `CREATE TABLE IF NOT EXISTS scan_records (
      id TEXT PRIMARY KEY,
      waybill_snapshot_id TEXT NOT NULL REFERENCES waybill_snapshots(id),
      external_code TEXT NOT NULL,
      sku_code TEXT NOT NULL,
      sku_name TEXT NOT NULL,
      operator TEXT NOT NULL,
      qc_result TEXT NOT NULL DEFAULT 'pass',
      batch_status TEXT NOT NULL DEFAULT 'scanned',
      exception_subtype TEXT,
      exception_desc TEXT,
      rule_id_hit TEXT,
      ticket_id TEXT REFERENCES exception_tickets(id),
      fast_released BOOLEAN DEFAULT false,
      fast_release_by TEXT,
      fast_release_reason TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    // 品控规则
    `CREATE TABLE IF NOT EXISTS qc_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      exception_subtype TEXT NOT NULL,
      condition JSONB NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      auto_create_ticket BOOLEAN NOT NULL DEFAULT true,
      approval_level INTEGER NOT NULL DEFAULT 1,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    // 审批分级规则
    `CREATE TABLE IF NOT EXISTS approval_level_rules (
      id TEXT PRIMARY KEY,
      level INTEGER NOT NULL,
      min_amount NUMERIC,
      max_amount NUMERIC,
      exception_types JSONB,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    // 超时规则
    `CREATE TABLE IF NOT EXISTS timeout_rules (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      timeout_minutes INTEGER NOT NULL,
      action TEXT NOT NULL DEFAULT 'escalate',
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    // 用户表（简化版）
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      roles JSONB NOT NULL DEFAULT '[]',
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    // 索引
    `CREATE INDEX IF NOT EXISTS idx_tickets_status ON exception_tickets(status)`,
    `CREATE INDEX IF NOT EXISTS idx_tickets_reporter ON exception_tickets(reporter)`,
    `CREATE INDEX IF NOT EXISTS idx_approvals_ticket ON approval_records(ticket_id)`,
    `CREATE INDEX IF NOT EXISTS idx_scan_ticket ON scan_records(ticket_id)`,
    `CREATE INDEX IF NOT EXISTS idx_scan_batch_status ON scan_records(batch_status)`,
    `CREATE INDEX IF NOT EXISTS idx_sync_logs_req ON sync_logs(request_id)`,
  ];

  for (const sqlText of statements) {
    await query(sqlText);
  }
}
