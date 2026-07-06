# 考点 9：反思题

> 运单全流程管理系统 V3 — 架构反思与设计取舍

---

## 1. 如果题目直接给出了精确的审批金额阈值和超时时长，你的架构设计会有什么不同？

如果题目明确给出精确数值，**规则引擎层可以大幅简化**：

| 对比维度 | 当前设计（灵活规则引擎） | 如果数值固定 |
|----------|------------------------|-------------|
| 审批分级 | 数据库表 `approval_level_rules` 存储 JSONB 规则，运行时动态查询匹配 | 直接硬编码 `if (amount > 500)` 分支 |
| 超时逻辑 | `timeout_rules` 表按 `target_status` 查，支持运行时改 | 常量定义 `TIMEOUT_PENDING=60*60*1000` 即可 |
| 规则管理 API | `GET/POST /api/rules` 支持 CRUD | 不需要 `/api/rules` 接口，减少约 100 行代码 |
| 品控规则 | 7 条 JSONB 规则 + 操作符引擎 `evaluateQcResult()` | 直接写 7 个 if 条件，省掉整个规则引擎解析器 |

**核心变化**：
- 删掉 `qc_rules`、`approval_level_rules`、`timeout_rules` 三张表，约减少 3 张表 + 6 个索引
- `evaluateQcResult()` 从通用规则引擎变成硬编码函数，代码量减少约 60%
- `/api/rules` 路由可以移除，部署更轻量
- **但丧失了运行时调整规则的能力**——产品经理改一个阈值就要重新部署

**为什么当前选了灵活方案**：题目说"如果允许的话，你会向产品经理提出的问题清单"，暗示这些值没有最终确定，所以我选择了"可配置优先"的架构。这是一种**对模糊需求的前瞻性防御**。

---

## 2. "审批状态变更"与"库存/赔付联动"之间的一致性，最大的风险点在哪里？如果不用数据库事务，你会怎么处理？

### 最大风险点

**审批通过（状态变更为 executing）和库存回滚/赔付生成之间的原子性断裂。**

当前代码在 `handleExecution()` 中：
```
1. UPDATE tickets SET status = 'executing'
2. INSERT INTO inventory_logs ... (库存回滚)
3. INSERT INTO compensation_records ... (赔付记录)
4. UPDATE scan_records SET status = 'released'
```

如果步骤 2 成功但步骤 3 失败，就会产生"已审批通过但赔付没生成"的脏数据。更严重的是步骤 1 成功、步骤 2/3/4 失败——工单已标记为 executing，实际联动操作都没执行。

### 不用数据库事务的处理方案

**方案 A：补偿式 Saga 模式**

```
每一步成功后记录 "执行日志"（operation_log 表）：
  op_id | ticket_id | step | status    | payload
  1     | TKT_001   | 1    | done      | {status: "executing"}
  2     | TKT_001   | 2    | done      | {inventory: -5}
  3     | TKT_001   | 3    | failed    | {error: "..."}

定时任务扫描 status=failed 的记录，执行补偿操作：
- 如果步骤 2 成功但步骤 3 失败 → 重试步骤 3（赔付写入幂等）
- 如果步骤 1 成功但步骤 2 失败 → 将工单回退到 pending + 记录异常
```

**方案 B：最终一致性 + 异步队列**

```
1. 审批通过 → 只改 ticket.status = 'executing'
2. 写入一个 "待执行任务" 到 pending_tasks 表
3. 后台 worker 轮询 pending_tasks，逐条执行联动操作
4. 每个联动操作独立幂等（用 ticket_id + operation_type 做唯一键）
5. 全部完成后标记 ticket.status = 'done'
```

**方案 C：事件溯源（Event Sourcing）**

```
不存当前状态，只存事件流：
  event_id | ticket_id | event_type           | data
  1        | TKT_001   | ticket_created       | {...}
  2        | TKT_001   | level1_approved      | {approver: "..."}
  3        | TKT_001   | execution_triggered  | {operator: "..."}
  4        | TKT_001   | inventory_adjusted   | {qty: -5}
  5        | TKT_001   | compensation_created  | {amount: 1200}

当前状态 = 事件流回放（fold/reduce）
任何步骤失败都只是少了一条事件，不会产生不一致的"当前状态"
```

**我倾向于方案 A（补偿式 Saga）**，因为：
- 不需要引入消息队列基础设施（方案 B）
- 不需要重构整个数据模型（方案 C）
- 只需要加一张 `operation_log` 表 + 一个定时补偿任务
- 与现有架构最兼容

---

## 3. 面对一句话级别的模糊需求，你倾向于"先问清楚再动手"还是"先做出一个版本再迭代"？为什么？

**我倾向于"先做出一个版本再迭代"**，但有一个关键前提。

### 我的做法：MVP 快速原型 + 假设文档

1. **第一时间做出可运行的最小版本**（1-2 天）
2. **同步产出一份假设文档**（如 `ASSUMPTIONS.md`），把所有不确定的点列清楚
3. **把 MVP 丢给产品经理看**，附上假设文档，让对方对着实际界面给反馈

### 为什么不是"先问清楚"？

- 这道题本身就模拟了真实场景——**没有产品经理可问**
- 很多时候产品经理自己也没想清楚，看到一个能跑的版本才能激发真正的需求
- 从零开始提问容易陷入"鸡生蛋蛋生鸡"——你不知道该问什么，直到你开始写代码

### 为什么不是"无脑先做"？

- 纯闷头写出来的东西可能方向全错，浪费更多时间
- 假设文档起到"对齐预期"的作用——"我假设了 X，如果你觉得不对，现在告诉我"

### 这道题的实际体现

我在这道题里的做法正是：**先做出完整 V3（含状态机、API、前端），同时产出 ASSUMPTIONS.md 覆盖 9 项留白规则 + 11 个产品经理问题**。如果真有产品经理，他看了假设文档就能快速指出哪些假设不对，我改假设文档比改代码快得多。

---

## 4. 如果产品经理要求新增第六种异常类型"客户投诉服务态度"，改动范围与成本

### 需要改动的地方

| 位置 | 改动内容 | 改动量 |
|------|----------|--------|
| `types.ts` — `ExceptionType` 联合类型 | 新增 `'complaint_service'` | **1 行** |
| `state-machine.ts` — `getNextTicketStatus()` | 无需改动（状态流转与异常类型无关） | 0 行 |
| `tickets/route.ts` — `handleExecution()` | 新增 `case 'complaint_service'` 分支，不涉及库存/赔付，仅记录日志 | **约 5 行** |
| `seed.ts` — 种子数据 | 可选：添加一条示例工单 | 可选 |
| 前端表单 — 异常类型下拉框 | 加一个选项 | **1 行** |
| `ASSUMPTIONS.md` | 补充说明 | 几行 |

### 改动成本评估：**极低，约 10 行代码**

原因是：
- 异常类型用的是 TypeScript 联合类型（`type ExceptionType = 'lost' | 'damaged' | ...`），新增一个值即可
- 状态机流转不依赖异常类型，走标准审批流程
- `handleExecution()` 的 switch-case 结构天然支持扩展——新类型只需要一个空分支或日志分支
- 不涉及库存联动、不涉及赔付计算、不涉及品控规则

**这正是当前架构的优势**：异常类型是"数据"而非"控制流"，新增类型不会冲击核心逻辑。

---

## 5. 工单量从 200 条增长到 20 万条，最先撑不住的环节及处理方案

### 最先撑不住的环节排序

**第一名：工单列表查询 `GET /api/tickets`**

原因：
- 当前 `SELECT * FROM exception_tickets ORDER BY created_at DESC LIMIT ? OFFSET ?` 在 20 万行数据中，OFFSET 10000 时要扫描并丢弃 1 万行
- 每行关联了 `items` 字段（JSON 数组），数据传输量大
- Vercel Serverless Function 有 10 秒超时限制，大 OFFSET 查询必然超时

**第二名：定时同步任务全表扫描**

原因：
- `syncWaybillsFromV2()` 如果每次同步都拉全量运单数据，20 万条运单的 HTTP 响应体可能几百 MB，Vercel Function 内存直接爆

**第三名：接口同步积压**

原因：
- `sync_logs` 表按时间倒序查最近 20 条没问题，但如果 V2 响应慢（10 秒超时 × 2 次重试），排队请求会堆积

### 处理方案

**解决列表查询（第一名）**：
```
1. 游标分页替代 OFFSET：
   SELECT * FROM exception_tickets 
   WHERE created_at < ? ORDER BY created_at DESC LIMIT 20
   （利用 created_at 索引，O(log n) 而非 O(n)）

2. 给常用筛选字段建索引：
   CREATE INDEX idx_tickets_status ON exception_tickets(status);
   CREATE INDEX idx_tickets_reporter ON exception_tickets(reporter);
   CREATE INDEX idx_tickets_type ON exception_tickets(exception_type);

3. 前端强制加筛选条件，不允许无条件全表查询
```

**解决同步全表扫描（第二名）**：
```
1. 增量同步：V2 提供 ?since=timestamp 参数，只返回变更的运单
2. 分页拉取：每次拉 500 条，多次调用，避免单次响应过大
3. 异步化：同步任务改为后台 job，不阻塞 HTTP 响应
```

**解决接口积压（第三名）**：
```
1. 对 sync_logs 加 request_id 索引，支持去重
2. V2 调用加熔断器：连续失败 N 次后暂时跳过，等冷却期再试
3. 监控告警：sync_logs 中 failed 比例超过阈值时报警
```

---

## 6. V2 接口兼容性：新增接口不破坏现有调用方 & int→decimal 兼容

### 如何在 V2 新增对外接口时不破坏现有调用方

我实际就是这么做的——V3 需要的三个接口（health、verify-sku、sync），V2 原本都没有。我的做法：

**1. 纯增量，不动存量**
```
V2 原有接口        → 完全不动
V2 新增 /api/health     → 新增文件，不影响任何旧路由
V2 新增 /api/waybills/verify-sku → 新增文件
V2 新增 /api/waybills/sync → 新增文件
```
Next.js 的文件路由天然支持——新增 `route.ts` 就是新路由，不改旧文件就不会破坏旧调用方。

**2. 向后兼容的响应格式**
```
所有新接口返回统一结构：
{ "success": true, "data": {...}, "error": null }

如果 V2 旧接口格式不同，新接口不强制统一，各自保持原有格式
```

**3. 版本化意识**
```
如果未来 V2 有破坏性变更，应该：
- 新增 /api/v2/xxx 而非修改 /api/xxx
- 旧接口保留并标记 deprecated，给调用方迁移窗口期
```

### 如果 V2 的运单金额字段从 int 改成 decimal，V3 侧如何处理

**影响分析**：
- V3 的 `waybill_snapshots` 表里 `total_amount` 目前可能是整数存储
- `handleExecution()` 中计算赔付金额会用到
- 前端展示金额的格式化逻辑

**处理方案（适配器模式）**：

```
// V3 侧 v2-client.ts 中加一层转换
function normalizeWaybill(v2Data: any): WaybillSnapshot {
  return {
    ...v2Data,
    total_amount: typeof v2Data.total_amount === 'string' 
      ? parseFloat(v2Data.total_amount)  // decimal 可能以字符串传输
      : Number(v2Data.total_amount),     // int 直接转
    // 内部统一用 number 存储，精度由前端控制
  };
}
```

**兼容策略**：
1. V3 内部统一用 `number` 类型存储金额（JavaScript 的 number 是双精度浮点，能安全表示 15 位有效数字，运单金额足够）
2. 在 V2 client 层做一次 normalize，隔离 V2 的数据格式变化
3. 展示时统一 `toFixed(2)` 格式化
4. 数据库字段类型改为 `DECIMAL(12,2)` 或 `DOUBLE PRECISION`

**改动成本**：约 10 行代码（normalize 函数 + 类型调整），风险极低，因为金额在 V3 中仅用于展示和赔付计算，不参与核心状态机逻辑。

---

## 总结

| 反思点 | 核心认知 |
|--------|----------|
| 规则可配 vs 硬编码 | 模糊需求下"可配置"是正确的前瞻性设计，但代价是代码复杂度 |
| 事务 vs Saga | 不用事务不是世界末日，补偿式 Saga 在 Serverless 环境下更实用 |
| 先做 vs 先问 | 先做 MVP + 假设文档，是"没有产品经理可问"场景下的最优解 |
| 扩展性 | 联合类型 + switch-case 架构对新异常类型零成本扩展 |
| 规模化 | 20 万条数据的瓶颈在列表查询，游标分页是性价比最高的优化 |
| 接口兼容 | 增量新增、适配器隔离、内部统一类型——三层防御 |
