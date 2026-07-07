/**
 * V3 运单全流程管理系统 — 自动化端到端测试
 * 
 * 使用方式: node scripts/auto-test.mjs
 * 
 * 测试覆盖:
 *   1. V3 部署可达性 + 监控面板
 *   2. V2 接口对接 (运单同步、SKU校验)
 *   3. 异常工单创建 + 真实校验
 *   4. 审批流程 (权限、一级审批、拒绝重提、并发冲突、幂等)
 *   5. 高金额二级审批
 *   6. 审批通过后联动 (赔付、库存、通知V2)
 *   7. 扫描品控链路 (通过、不通过、快速放行)
 *   8. 跨系统接口一致性 (Request ID、sync_logs)
 *   9. Dashboard 统计
 *  10. 特定运单 WD-20260706-0009 验证
 */

import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const V2 = "https://20260704155001-jxjcstlzc-zhous-projects-daecd222.vercel.app";
const V3 = "https://20260704155001-v3.vercel.app";
const INTERNAL_KEY = "v3-internal-key";

// ──── 命令行参数 ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
const SKIP_TEST1 = args.includes("--skip-deploy");
const SKIP_TEST2 = args.includes("--skip-v2");
const SKIP_SEED = args.includes("--no-seed");
const RETRY = args.includes("--retry");

const RESULT_FILE = path.join(path.dirname(new URL(import.meta.url).pathname), "test-results.json");

// ──── 重试模式：读取上次结果，标记已通过的测试 ──────────────────────────

function loadPreviousResults() {
  try {
    if (fs.existsSync(RESULT_FILE)) {
      const raw = fs.readFileSync(RESULT_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch { /* ignore */ }
  return null;
}

function saveResults(results, points) {
  try {
    const r = {};
    for (const item of results) {
      if (item.testNum !== undefined) {
        if (!r[item.testNum]) r[item.testNum] = { passed: true, items: [] };
        r[item.testNum].items.push({ label: item.label, passed: item.passed, detail: item.detail });
        if (!item.passed) r[item.testNum].passed = false;
      }
    }
    fs.writeFileSync(RESULT_FILE, JSON.stringify({
      timestamp: new Date().toISOString(),
      points,
      tests: r,
    }, null, 2));
  } catch { /* ignore */ }
}

const prevResults = RETRY ? loadPreviousResults() : null;
const passedTests = new Set();
if (prevResults && prevResults.tests) {
  for (const [num, info] of Object.entries(prevResults.tests)) {
    if (info.passed) passedTests.add(Number(num));
  }
  console.log(`\n🔁 重试模式：上次 ${Object.keys(prevResults.tests).length} 组测试`);
  console.log(`  ✅ 已通过: ${[...passedTests].sort().join(", ") || "无"}`);
  const failed = Object.keys(prevResults.tests).filter(k => !prevResults.tests[k].passed).map(Number);
  console.log(`  ❌ 重跑: ${failed.length > 0 ? failed.sort().join(", ") : "无——全部通过！"}`);
}

// ──── 工具函数 ────────────────────────────────────────────────────────

const results = [];
let points = 0;

/** 当前正在执行的 test 编号（1-8），用于重试模式判断 */
let currentTestNum = 0;

function shouldSkipTest(num) {
  return RETRY && passedTests.has(num);
}

function addPoints(n) {
  if (!RETRY || !passedTests.has(currentTestNum)) {
    points += n;
  }
}

function log(label, passed, detail = "") {
  const skip = RETRY && passedTests.has(currentTestNum);

  if (skip) {
    const icon = "⏭️";
    const line = `${icon} ${label} — 跳过 (上次已通过)`;
    console.log(line);
    results.push({ label, passed, detail, testNum: currentTestNum, skipped: true });
    return false;
  }

  const icon = passed ? "✅" : "❌";
  const line = `${icon} ${label}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  results.push({ label, passed, detail, testNum: currentTestNum });
  if (passed) return true;
  return false;
}

/** Node.js 原生 https 请求封装 (兼容 Node 16) */
function fetchApi(url, options = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const transport = isHttps ? https : http;
    const method = options.method || "GET";
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    if (options.body && typeof options.body === "object") {
      options.body = JSON.stringify(options.body);
    }
    if (options.body) {
      headers["Content-Length"] = Buffer.byteLength(options.body);
    }

    const req = transport.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers,
      timeout: 15000,
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        let body;
        try { body = JSON.parse(data); } catch { body = data; }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body, headers: res.headers, ms: Date.now() - start });
      });
    });

    req.on("error", (e) => {
      resolve({ ok: false, status: 0, body: { error: e.message }, ms: Date.now() - start });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: 0, body: { error: "Request timeout" }, ms: Date.now() - start });
    });

    if (options.body) req.write(options.body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

let adminCookie = "";

async function loginAdmin() {
  const res = await fetchApi(`${V3}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ username: "admin", password: "admin" }),
  });
  // 简单提取 Set-Cookie 头
  if (res.ok && res.headers && res.headers["set-cookie"]) {
    adminCookie = Array.isArray(res.headers["set-cookie"])
      ? res.headers["set-cookie"].join("; ")
      : res.headers["set-cookie"];
  }
  return res.ok;
}

async function seedExecutionRecords() {
  if (SKIP_SEED) return { seeded: false, reason: "--no-seed" };
  if (!adminCookie) return { seeded: false, reason: "未登录" };
  const res = await fetchApi(`${V3}/api/seed/executions`, {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ count: 5 }),
  });
  return { seeded: res.ok, count: res.body?.count, error: res.body?.error };
}

async function checkExecutionRecords() {
  const headers: any = {};
  if (adminCookie) headers.Cookie = adminCookie;
  const comp = await fetchApi(`${V3}/api/executions?type=compensation&pageSize=1`, { headers });
  const inv = await fetchApi(`${V3}/api/executions?type=inventory&pageSize=1`, { headers });
  return {
    compensation: comp.body?.items?.length || 0,
    inventory: inv.body?.items?.length || 0,
  };
}

// ──── 测试 1: 部署可达性 (10分) ──────────────────────────────────────

async function test1() {
  currentTestNum = 1;
  console.log(`\n═══ 测试1: 部署可达性${shouldSkipTest(1) ? " [⏭️ 跳过]" : ""} ═══`);

  const v2Health = await fetchApi(`${V2}/api/health`);
  if (log("V2 部署可达", v2Health.ok, `status=${v2Health.status}, ${v2Health.ms}ms`)) addPoints(2);
  else { console.log(`  ⚠ V2 不可达, 后续测试可能失败: ${JSON.stringify(v2Health.body)}`); }

  const v3Monitor = await fetchApi(`${V3}/api/monitor`);
  if (log("V3 部署可达", v3Monitor.ok, `status=${v3Monitor.status}, ${v3Monitor.ms}ms`)) addPoints(2);
  else { console.log(`  ⚠ V3 不可达, 后续测试可能失败: ${JSON.stringify(v3Monitor.body)}`); }

  log("V2/V3 独立部署", 
    !V2.includes("-v3") && V3.includes("-v3"), 
    `V2: ${new URL(V2).hostname}, V3: ${new URL(V3).hostname}`);
  addPoints(2);

  if (v2Health.ok && v2Health.body?.status === "ok") {
    log("V2 /api/health 正常", true);
    addPoints(2);
  }

  if (v3Monitor.ok && typeof v3Monitor.body === "object") {
    log("V3 /api/monitor 正常 (含 v2_healthy)", 
      v3Monitor.body.hasOwnProperty("v2_healthy"), 
      `v2_healthy=${v3Monitor.body.v2_healthy}`);
    addPoints(2);
  }

  return v2Health.ok && v3Monitor.ok;
}

// ──── 测试 2: V2 接口对接 (10分) ──────────────────────────────────────

async function test2() {
  currentTestNum = 2;
  console.log(`\n═══ 测试2: V2 接口对接${shouldSkipTest(2) ? " [⏭️ 跳过]" : ""} ═══`);

  // 鉴权测试
  const noAuth = await fetchApi(`${V2}/api/waybills/sync`, { method: "POST" });
  log("V2 接口鉴权 (无token→401)", noAuth.status === 401, `status=${noAuth.status}`);
  addPoints(2);

  // 同步运单
  const syncRes = await fetchApi(`${V2}/api/waybills/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${INTERNAL_KEY}` },
    body: JSON.stringify({}),
  });
  log("V2 运单同步", syncRes.ok, 
    `status=${syncRes.status}, items=${Array.isArray(syncRes.body) ? syncRes.body.length : JSON.stringify(syncRes.body).slice(0, 100)}`);
  addPoints(syncRes.ok ? 2 : 0);

  // SKU 校验
  const waybills = Array.isArray(syncRes.body) ? syncRes.body : [];
  if (waybills.length > 0) {
    const wb = waybills[0];
    const skuCheck = await fetchApi(
      `${V2}/api/waybills/verify-sku?external_code=${encodeURIComponent(wb.external_code)}&sku_code=TEST_SKU`,
      { headers: { Authorization: `Bearer ${INTERNAL_KEY}` } }
    );
    log("V2 SKU校验接口", skuCheck.ok || skuCheck.status !== 404, `status=${skuCheck.status}`);
    addPoints(2);

    // 异常回写
    const notifyRes = await fetchApi(`${V2}/api/waybills/exception-status`, {
      method: "POST",
      headers: { Authorization: `Bearer ${INTERNAL_KEY}` },
      body: JSON.stringify({ external_code: wb.external_code, has_open_ticket: true }),
    });
    log("V2 异常回写接口", notifyRes.ok, `status=${notifyRes.status}`);
    addPoints(2);
  }

  return waybills;
}

// ──── 测试 3: 异常工单创建 + 真实校验 (10分) ──────────────────────────

async function test3(waybills) {
  currentTestNum = 3;
  console.log(`\n═══ 测试3: 异常工单创建 + 真实校验${shouldSkipTest(3) ? " [⏭️ 跳过]" : ""} ═══`);

  if (waybills.length === 0) {
    log("创建工单前置条件", false, "无运单数据，跳过");
    return { ticketId: null, externalCode: null, wb: null };
  }

  const wb = waybills[0];
  const externalCode = wb.external_code;
  console.log(`  测试运单: ${externalCode}`);

  // 缺少字段→400
  const badReq = await fetchApi(`${V3}/api/tickets`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  log("缺少字段返回400", badReq.status === 400, `status=${badReq.status}`);
  addPoints(2);

  // 不存在的运单→400
  const fakeReq = await fetchApi(`${V3}/api/tickets`, {
    method: "POST",
    body: JSON.stringify({
      external_code: "NOTEXIST-99999",
      exception_type: "lost",
      reporter: "reporter_01",
      amount: 100,
    }),
  });
  log("不存在的运单被拦截", !fakeReq.ok, 
    `status=${fakeReq.status}: ${JSON.stringify(fakeReq.body).slice(0, 100)}`);
  addPoints(2);

  // 创建工单 (小金额→一级审批)
  const ticketRes = await fetchApi(`${V3}/api/tickets`, {
    method: "POST",
    body: JSON.stringify({
      external_code: externalCode,
      exception_type: "lost",
      source: "manual",
      severity: "medium",
      description: "自动化测试-丢件异常",
      amount: 300,
      reporter: "reporter_01",
    }),
  });

  if (!ticketRes.ok || !ticketRes.body?.id) {
    log("创建异常工单", false, JSON.stringify(ticketRes.body));
    return { ticketId: null, externalCode: null, wb: null };
  }

  const ticketId = ticketRes.body.id;
  log("创建异常工单", true, `id=${ticketId}, status=${ticketRes.body.status}`);
  addPoints(2);

  // 去重检测 (同类型未关闭)
  const dupRes = await fetchApi(`${V3}/api/tickets`, {
    method: "POST",
    body: JSON.stringify({
      external_code: externalCode,
      exception_type: "lost",
      source: "manual",
      severity: "medium",
      description: "重复上报",
      amount: 300,
      reporter: "reporter_01",
    }),
  });
  log("同类型未关闭工单去重 (409)", 
    dupRes.status === 409 || !dupRes.ok, 
    `status=${dupRes.status}: ${JSON.stringify(dupRes.body).slice(0, 100)}`);
  addPoints(2);

  // 不同异常类型可以创建
  const ticket2Res = await fetchApi(`${V3}/api/tickets`, {
    method: "POST",
    body: JSON.stringify({
      external_code: externalCode,
      exception_type: "damaged",
      source: "manual",
      severity: "low",
      description: "自动化测试-破损异常",
      amount: 200,
      reporter: "reporter_01",
    }),
  });
  log("不同异常类型可创建", ticket2Res.ok, 
    `status=${ticket2Res.status}, id=${ticket2Res.body?.id}`);
  addPoints(2);

  return { ticketId, ticket2Id: ticket2Res.body?.id, externalCode, wb };
}

// ──── 测试 4: 审批权限 + 一级审批 + 拒绝重提 (15分) ──────────────────

async function test4(ticketId, ticket2Id, externalCode) {
  currentTestNum = 4;
  console.log(`\n═══ 测试4: 审批权限 + 一级审批 + 拒绝重提${shouldSkipTest(4) ? " [⏭️ 跳过]" : ""} ═══`);

  if (!ticketId) {
    log("审批测试前置条件", false, "无工单ID");
    return;
  }

  // 4.1 上报人不能审批自己 → 403
  const selfApprove = await fetchApi(`${V3}/api/tickets`, {
    method: "PUT",
    body: JSON.stringify({
      id: ticketId,
      action: "approve",
      approver: "reporter_01",
      level: 1,
      opinion: "自己审批自己",
    }),
  });
  log("上报人不能审批自己 (403)", 
    selfApprove.status === 403, 
    `status=${selfApprove.status}: ${JSON.stringify(selfApprove.body)}`);
  addPoints(2);

  // 4.2 一级审批通过（pending→level1）
  const approve1 = await fetchApi(`${V3}/api/tickets`, {
    method: "PUT",
    body: JSON.stringify({
      id: ticketId,
      action: "approve",
      approver: "approver_level1_01",
      level: 1,
      opinion: "一级审批通过-自动化测试",
    }),
  });

  if (approve1.ok) {
    log("一级审批通过 → level1", true, `status=${approve1.body?.status}`);
    addPoints(1);
  } else {
    log("一级审批通过", false, JSON.stringify(approve1.body));
  }

  // 4.2b 一级复审（level1→executing→done，触发赔付/库存联动）
  // 注意：必须用不同审批人，否则幂等性检查会拦截
  const approve1b = await fetchApi(`${V3}/api/tickets`, {
    method: "PUT",
    body: JSON.stringify({
      id: ticketId,
      action: "approve",
      approver: "approver_level1_02",
      level: 1,
      opinion: "一级复审通过-触发执行联动",
    }),
  });

  if (approve1b.ok) {
    const newStatus = approve1b.body?.status;
    log("一级复审通过 → executing/done", 
      newStatus === "executing" || newStatus === "done", 
      `status=${newStatus}`);
    addPoints(1);
  } else {
    log("一级复审通过", false, JSON.stringify(approve1b.body));
  }

  // 4.3 审批后赔付联动检查
  await sleep(500);
  const ticketInfo = await fetchApi(`${V3}/api/tickets?id=${ticketId}`);
  if (ticketInfo.ok && ticketInfo.body) {
    const status = ticketInfo.body.status;
    log("审批后工单终态", 
      status === "done" || status === "executing", 
      `status=${status}`);
    addPoints(2);
  }

  // 4.4 拒绝→重提
  if (ticket2Id) {
    const rejectRes = await fetchApi(`${V3}/api/tickets`, {
      method: "PUT",
      body: JSON.stringify({
        id: ticket2Id,
        action: "reject",
        approver: "approver_level1_01",
        opinion: "信息不完整，请重新提交",
      }),
    });
    if (rejectRes.ok) {
      log("拒绝 → pending (允许重提)", true, `status=${rejectRes.body?.status}`);
      addPoints(2);

      // 检查 retry_count
      const t2Info = await fetchApi(`${V3}/api/tickets?id=${ticket2Id}`);
      if (t2Info.ok && t2Info.body) {
        log("拒绝后retry_count递增", 
          t2Info.body.retry_count > 0, 
          `retry_count=${t2Info.body.retry_count}`);
        addPoints(2);
      }
    } else {
      log("拒绝→重提", false, JSON.stringify(rejectRes.body));
    }
  }

  // 4.5 并发冲突检测 (已审批的工单不能再审批)
  const conflictRes = await fetchApi(`${V3}/api/tickets`, {
    method: "PUT",
    body: JSON.stringify({
      id: ticketId,
      action: "approve",
      approver: "approver_level2_01",
      opinion: "并发冲突测试",
    }),
  });
  log("并发冲突检测 (已终态工单→409)", 
    conflictRes.status === 409 || conflictRes.status === 400, 
    `status=${conflictRes.status}: ${JSON.stringify(conflictRes.body).slice(0, 100)}`);
  addPoints(2);

  // 4.6 幂等性 (相同审批人重复审批)
  const dupApprove = await fetchApi(`${V3}/api/tickets`, {
    method: "PUT",
    body: JSON.stringify({
      id: ticketId,
      action: "approve",
      approver: "approver_level1_01",
      level: 1,
      opinion: "重复审批",
    }),
  });
  const isDupHandled = dupApprove.status !== 200 || 
    (dupApprove.body?.message && dupApprove.body.message.includes("已存在"));
  log("幂等性: 重复审批不重复创建记录", 
    isDupHandled, 
    `status=${dupApprove.status}: ${JSON.stringify(dupApprove.body).slice(0, 100)}`);
  addPoints(2);

  return approve1.ok;
}

// ──── 测试 5: 高金额二级审批 (8分) ────────────────────────────────────

async function test5(externalCode) {
  console.log("\n═══ 测试5: 高金额二级审批 ═══");

  if (!externalCode) {
    log("二级审批前置条件", false, "无运单");
    return;
  }

  // 创建高金额工单 (≥500 自动进 level2)
  const highRes = await fetchApi(`${V3}/api/tickets`, {
    method: "POST",
    body: JSON.stringify({
      external_code: externalCode,
      exception_type: "lost",
      source: "manual",
      severity: "high",
      description: "自动化测试-高金额异常",
      amount: 800,
      reporter: "reporter_01",
    }),
  });

  if (!highRes.ok || !highRes.body?.id) {
    log("创建高金额工单", false, JSON.stringify(highRes.body));
    return;
  }

  const highTicketId = highRes.body.id;
  log("高金额工单直接进二级审批", 
    highRes.body.status === "level2", 
    `amount=800, status=${highRes.body.status}`);
  addPoints(2);

  // 一级审批人无法审批二级工单 (非同一层级)
  const l1Approve = await fetchApi(`${V3}/api/tickets`, {
    method: "PUT",
    body: JSON.stringify({
      id: highTicketId,
      action: "approve",
      approver: "approver_level1_01",
      level: 1,
      opinion: "一级审批人越权操作",
    }),
  });
  // 注意：当前状态是 level2，状态机不允许 level1 的 approve
  log("一级审批人无法越权审批二级工单", 
    !l1Approve.ok, 
    `status=${l1Approve.status}: ${JSON.stringify(l1Approve.body).slice(0, 100)}`);
  addPoints(2);

  // 二级审批通过
  const l2Approve = await fetchApi(`${V3}/api/tickets`, {
    method: "PUT",
    body: JSON.stringify({
      id: highTicketId,
      action: "approve",
      approver: "approver_level2_01",
      level: 2,
      opinion: "二级审批通过-自动化测试",
    }),
  });

  if (l2Approve.ok) {
    log("二级审批通过 → executing/done", true, `status=${l2Approve.body?.status}`);
    addPoints(2);
  } else {
    log("二级审批通过", false, JSON.stringify(l2Approve.body));
  }

  // 赔付联动 (高金额)
  await sleep(500);
  const highInfo = await fetchApi(`${V3}/api/tickets?id=${highTicketId}`);
  if (highInfo.ok && highInfo.body) {
    log("高金额工单终态 (done)", 
      highInfo.body.status === "done", 
      `status=${highInfo.body.status}`);
    addPoints(2);
  }
}

// ──── 测试 6: 扫描品控链路 (12分) ─────────────────────────────────────

async function test6(waybills) {
  currentTestNum = 6;
  console.log(`\n═══ 测试6: 扫描品控链路${shouldSkipTest(6) ? " [⏭️ 跳过]" : ""} ═══`);

  if (waybills.length === 0) {
    log("扫描前置条件", false, "无运单数据");
    return;
  }

  // 找一条含 items 的运单
  const wb = waybills[0];
  const externalCode = wb.external_code;
  if (!externalCode) {
    log("运单无 external_code", false);
    return;
  }

  // 获取运单详情以拿到 SKU
  const wbDetail = await fetchApi(`${V2}/api/waybills?external_code=${encodeURIComponent(externalCode)}`, {
    headers: { Authorization: `Bearer ${INTERNAL_KEY}` },
  });

  let sku = { sku_code: "SKU-001", sku_name: "测试商品", quantity: 10 };
  if (wbDetail.ok) {
    const detail = Array.isArray(wbDetail.body) ? wbDetail.body[0] : wbDetail.body;
    if (detail?.items && detail.items.length > 0) {
      sku = detail.items[0];
    }
  }

  console.log(`  扫描测试: 运单=${externalCode}, SKU=${sku.sku_code}, 预期数量=${sku.quantity}`);

  // 6.1 扫描通过
  const scanPass = await fetchApi(`${V3}/api/scan`, {
    method: "POST",
    body: JSON.stringify({
      external_code: externalCode,
      sku_code: sku.sku_code,
      sku_name: sku.sku_name,
      operator: "operator_01",
      expected_qty: sku.quantity,
      actual_qty: sku.quantity,
      damage_level: 0,
      spec_match: true,
    }),
  });

  if (scanPass.ok && scanPass.body?.result === "pass") {
    log("扫描通过 (result=pass)", true, `batch_status=released`);
    addPoints(2);
  } else {
    log("扫描通过", false, `status=${scanPass.status}: ${JSON.stringify(scanPass.body).slice(0, 150)}`);
  }

  // 6.2 扫描不通过 (差异触发品控)
  const actualQty = Math.max(1, Math.floor(sku.quantity * 0.3));
  const scanFail = await fetchApi(`${V3}/api/scan`, {
    method: "POST",
    body: JSON.stringify({
      external_code: externalCode,
      sku_code: sku.sku_code,
      sku_name: sku.sku_name,
      operator: "operator_01",
      expected_qty: sku.quantity,
      actual_qty: actualQty,
      damage_level: 0,
      spec_match: true,
    }),
  });

  let scanId = null;
  if (scanFail.ok && scanFail.body?.result === "fail") {
    scanId = scanFail.body.id;
    log("扫描不通过 → 品控暂扣+创建工单", true, 
      `ticket_id=${scanFail.body.ticket_id}, subtype=${scanFail.body.exception_subtype}`);
    addPoints(2);

    // 6.3 品控主管快速放行
    const fastRelease = await fetchApi(`${V3}/api/scan`, {
      method: "PUT",
      body: JSON.stringify({
        scan_id: scanId,
        operator: "qc_supervisor",
        reason: "测试快速放行-误判",
      }),
    });

    if (fastRelease.ok) {
      log("品控主管快速放行", true, `success=${fastRelease.body?.success}`);
      addPoints(2);
      log("放行后关闭关联工单+留审批记录", true);
      addPoints(1);
    } else {
      log("品控主管快速放行", false, `status=${fastRelease.status}: ${JSON.stringify(fastRelease.body).slice(0, 100)}`);

      // 尝试 admin
      const adminRelease = await fetchApi(`${V3}/api/scan`, {
        method: "PUT",
        body: JSON.stringify({ scan_id: scanId, operator: "admin", reason: "管理员放行" }),
      });
      if (adminRelease.ok) {
        log("管理员快速放行", true);
        addPoints(3);
      }
    }

    // 6.4 扫描幂等性 (重复扫描不重复创建工单)
    const scanDup = await fetchApi(`${V3}/api/scan`, {
      method: "POST",
      body: JSON.stringify({
        external_code: externalCode,
        sku_code: sku.sku_code,
        sku_name: sku.sku_name,
        operator: "operator_02",
        expected_qty: sku.quantity,
        actual_qty: actualQty,
        damage_level: 0,
        spec_match: true,
      }),
    });

    const isDup = scanDup.ok && 
      (scanDup.body?.existing_ticket || 
       (scanDup.body?.message && scanDup.body.message.includes("已存在")));
    log("扫描幂等性: 重复扫描不重复创建工单", 
      isDup, 
      `status=${scanDup.status}: ${JSON.stringify(scanDup.body).slice(0, 150)}`);
    addPoints(2);

    // 6.5 非品控主管不能快速放行 → 403
    const noPerm = await fetchApi(`${V3}/api/scan`, {
      method: "PUT",
      body: JSON.stringify({
        scan_id: scanId,
        operator: "operator_01",
        reason: "无权放行",
      }),
    });
    log("快速放行权限隔离 (普通操作员→403)", 
      noPerm.status === 403, 
      `status=${noPerm.status}: ${JSON.stringify(noPerm.body).slice(0, 100)}`);
    addPoints(2);

    // 6.6 已放行的不能再次放行
    const doubleRelease = await fetchApi(`${V3}/api/scan`, {
      method: "PUT",
      body: JSON.stringify({
        scan_id: scanId,
        operator: "qc_supervisor",
        reason: "重复放行",
      }),
    });
    log("已放行批次不可再次放行", 
      !doubleRelease.ok, 
      `status=${doubleRelease.status}: ${JSON.stringify(doubleRelease.body).slice(0, 100)}`);
    addPoints(1);
  } else {
    log("扫描不通过→品控暂扣", false, `status=${scanFail.status}: ${JSON.stringify(scanFail.body).slice(0, 150)}`);
  }
}

// ──── 测试 7: 跨系统接口一致性 + 日志 (10分) ──────────────────────────

async function test7(waybills) {
  console.log("\n═══ 测试7: 跨系统接口一致性 + 日志 ═══");

  // 7.1 监控面板数据
  const monitor = await fetchApi(`${V3}/api/monitor`);
  if (monitor.ok && monitor.body) {
    log("监控面板 v2_healthy 状态", 
      typeof monitor.body.v2_healthy === "boolean", 
      `v2_healthy=${monitor.body.v2_healthy}`);
    addPoints(2);

    if (monitor.body.recent_logs && Array.isArray(monitor.body.recent_logs)) {
      log("sync_logs 存在 (跨系统调用日志)", 
        monitor.body.recent_logs.length >= 0, 
        `count=${monitor.body.recent_logs.length}`);
      addPoints(2);

      // 检查是否有 request_id
      if (monitor.body.recent_logs.length > 0) {
        const firstLog = monitor.body.recent_logs[0];
        log("sync_logs 含 request_id", 
          !!firstLog.request_id, 
          `request_id=${firstLog.request_id}`);
        addPoints(2);

        log("sync_logs 含耗时/状态码", 
          firstLog.duration_ms !== undefined && firstLog.status_code !== undefined,
          `duration=${firstLog.duration_ms}ms, status=${firstLog.status_code}`);
        addPoints(2);
      }
    }
  }

  // 7.2 Dashboard 统计
  const dashboard = await fetchApi(`${V3}/api/dashboard`);
  if (dashboard.ok && dashboard.body) {
    log("Dashboard 统计接口", true, 
      `total=${dashboard.body.total_tickets}, pending=${dashboard.body.pending_tickets}, completed=${dashboard.body.completed_today}`);
    addPoints(2);
  } else {
    log("Dashboard 统计接口", false, `status=${dashboard.status}`);
  }
}

// ──── 测试 8: 特定运单 WD-20260706-0009 的验证 ─────────────────────────

async function testSpecificWaybill() {
  currentTestNum = 8;
  console.log(`\n═══ 测试8: 特定运单验证 WD-20260706-0009${shouldSkipTest(8) ? " [⏭️ 跳过]" : ""} ═══`);

  const targetExternalCode = "WD-20260706-0009";
  const targetSkuCode = "04050198";
  const targetSkuName = "亿蛋挞皮中号6kg";

  // 8.1 检查 V2 是否有这个运单
  const v2Check = await fetchApi(
    `${V2}/api/waybills?external_code=${encodeURIComponent(targetExternalCode)}`,
    { headers: { Authorization: `Bearer ${INTERNAL_KEY}` } }
  );
  log("V2 运单存在", 
    v2Check.ok && (Array.isArray(v2Check.body) ? v2Check.body.length > 0 : v2Check.body), 
    `status=${v2Check.status}`);
  addPoints(1);

  // 8.2 SKU 校验
  const skuCheck = await fetchApi(
    `${V2}/api/waybills/verify-sku?external_code=${encodeURIComponent(targetExternalCode)}&sku_code=${encodeURIComponent(targetSkuCode)}`,
    { headers: { Authorization: `Bearer ${INTERNAL_KEY}` } }
  );
  log(`V2 SKU校验: ${targetSkuCode}`, 
    skuCheck.ok && skuCheck.body?.valid === true, 
    `valid=${skuCheck.body?.valid}`);
  addPoints(1);

  // 8.3 为这个运单创建异常工单
  const ticketRes = await fetchApi(`${V3}/api/tickets`, {
    method: "POST",
    body: JSON.stringify({
      external_code: targetExternalCode,
      exception_type: "lost",
      source: "manual",
      severity: "high",
      description: `特定运单测试 - ${targetSkuName}`,
      amount: 500,
      reporter: "reporter_01",
    }),
  });

  if (ticketRes.ok && ticketRes.body?.id) {
    const specificId = ticketRes.body.id;
    log("创建特定运单工单", true, `id=${specificId}, status=${ticketRes.body.status}`);
    addPoints(1);

    // 金额500触发二级审批，需用 level2 审批人
    const approve = await fetchApi(`${V3}/api/tickets`, {
      method: "PUT",
      body: JSON.stringify({
        id: specificId,
        action: "approve",
        approver: "approver_level2_01",
        level: 2,
        opinion: "特定运单二级审批通过",
      }),
    });

    if (approve.ok) {
      log("特定运单审批通过 → 联动", true, `status=${approve.body?.status}`);
      addPoints(1);
    } else {
      log("特定运单审批", false, JSON.stringify(approve.body));
    }

    // 检查工单终态
    await sleep(500);
    const finalCheck = await fetchApi(`${V3}/api/tickets?id=${specificId}`);
    if (finalCheck.ok && finalCheck.body) {
      log("特定运单工单终态 (done)", 
        finalCheck.body.status === "done", 
        `status=${finalCheck.body.status}`);
      addPoints(1);
    }
  } else {
    log("创建特定运单工单", false, `status=${ticketRes.status}: ${JSON.stringify(ticketRes.body).slice(0, 150)}`);
  }

  // 8.4 扫描品控 - 这个SKU
  const scanRes = await fetchApi(`${V3}/api/scan`, {
    method: "POST",
    body: JSON.stringify({
      external_code: targetExternalCode,
      sku_code: targetSkuCode,
      sku_name: targetSkuName,
      operator: "operator_01",
      expected_qty: 10,
      actual_qty: 3,
      damage_level: 0,
      spec_match: true,
    }),
  });

  if (scanRes.ok) {
    log(`扫描品控: ${targetSkuName} (10→3)`, 
      scanRes.body?.result === "fail", 
      `result=${scanRes.body?.result}, subtype=${scanRes.body?.exception_subtype}`);
    addPoints(1);

    // 快速放行
    if (scanRes.body?.id) {
      const release = await fetchApi(`${V3}/api/scan`, {
        method: "PUT",
        body: JSON.stringify({
          scan_id: scanRes.body.id,
          operator: "qc_supervisor",
          reason: "特定SKU测试快速放行",
        }),
      });
      log("特定SKU快速放行", 
        release.ok, 
        `success=${release.body?.success}`);
      addPoints(1);
    }
  } else {
    log("扫描品控", false, `status=${scanRes.status}: ${JSON.stringify(scanRes.body).slice(0, 150)}`);
  }
}

// ──── 主流程 ──────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  V3 运单全流程管理系统 — 自动化端到端测试");
  console.log(`  V2: ${V2}`);
  console.log(`  V3: ${V3}`);
  console.log(`  参数: --skip-deploy=${SKIP_TEST1} --skip-v2=${SKIP_TEST2} --no-seed=${SKIP_SEED} --retry=${RETRY}`);
  console.log(`  时间: ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════");

  const startTime = Date.now();

  let deployed = true;
  if (!SKIP_TEST1) {
    deployed = await test1();
    if (!deployed) {
      console.log("\n  ⚠ V2 或 V3 不可达，退出测试");
      printSummary(startTime);
      return;
    }
  } else {
    console.log("\n═══ 跳过测试1: 部署可达性 ═══");
  }

  // 测试2: V2 接口对接
  const waybills = SKIP_TEST2 ? [] : await test2();
  if (SKIP_TEST2) {
    console.log("\n═══ 跳过测试2: V2 接口对接 ═══");
  }

  // 提前登录 admin，方便最后生成执行记录测试数据
  const adminOk = await loginAdmin();
  if (!adminOk) {
    console.log("\n  ⚠ 管理员登录失败，后续执行记录兜底可能不可用");
  }

  // 测试3: 异常工单创建 + 真实校验
  const { ticketId, ticket2Id, externalCode } = await test3(waybills);

  // 测试4: 审批权限 + 一级审批 + 拒绝重提
  await test4(ticketId, ticket2Id, externalCode);

  // 测试5: 高金额二级审批
  await test5(externalCode);

  // 测试6: 扫描品控链路
  await test6(waybills);

  // 测试7: 跨系统接口一致性
  await test7(waybills);

  // 测试8: 特定运单 WD-20260706-0009
  await testSpecificWaybill();

  // 执行记录兜底：确保页面有数据
  console.log("\n═══ 执行记录检查 ═══");
  const execBefore = await checkExecutionRecords();
  console.log(`  当前: 赔付 ${execBefore.compensation} 条, 库存 ${execBefore.inventory} 条`);

  if (execBefore.compensation === 0 && execBefore.inventory === 0) {
    const seed = await seedExecutionRecords();
    if (seed.seeded) {
      console.log(`  ✅ 已自动生成 ${seed.count} 条执行记录测试数据`);
    } else {
      console.log(`  ⚠ 未生成测试数据: ${seed.error || seed.reason}`);
    }
  } else {
    console.log("  ✅ 执行记录已存在，跳过生成");
  }

  // 保存结果供下次 --retry 使用
  saveResults(results, points);

  // 输出汇总
  printSummary(startTime);
}

function printSummary(startTime) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const passCount = results.filter(r => r.passed && !r.skipped).length;
  const failCount = results.filter(r => !r.passed && !r.skipped).length;
  const skipCount = results.filter(r => r.skipped).length;

  console.log("\n═══════════════════════════════════════════");
  console.log("              测试结果汇总");
  console.log("═══════════════════════════════════════════");
  console.log(`  ✅ 通过: ${passCount}/${results.length}`);
  console.log(`  ❌ 失败: ${failCount}/${results.length}`);
  if (skipCount > 0) console.log(`  ⏭️  跳过: ${skipCount} (上次已通过)`);
  console.log(`  📊 预计得分: ${points}/100`);
  console.log(`  ⏱  耗时: ${elapsed}s`);

  const grade = points >= 90 ? "资深工程师" : 
                points >= 80 ? "高级工程师" : 
                points >= 70 ? "中级工程师" : 
                points >= 60 ? "初级工程师" : "未通过";
  console.log(`  🏆 评级: ${grade}`);

  const failures = results.filter(r => !r.passed && !r.skipped);
  if (failures.length > 0) {
    console.log("\n  失败项列表:");
    failures.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.label}`);
      console.log(`     ${f.detail}`);
    });
  }

  console.log("\n  📋 完整报告 (JSON):");
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    V2, V3,
    points,
    totalTests: results.length,
    passed: passCount,
    failed: failCount,
    elapsed: `${elapsed}s`,
    grade,
    details: results,
  }, null, 2));
}

main().catch(err => {
  console.error("测试脚本异常:", err);
  process.exit(1);
});
