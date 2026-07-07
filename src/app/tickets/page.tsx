"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ClipboardList,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

type Ticket = {
  id: string;
  external_code: string;
  exception_type: string;
  source: string;
  severity: string;
  description: string;
  amount: number;
  reporter: string;
  status: string;
  retry_count: number;
  max_retry: number;
  created_at: string;
  updated_at: string;
  due_at: string | null;
  overdue: boolean;
};

type ApprovalRecord = {
  id: string;
  approver: string;
  level: number;
  action: string;
  opinion: string;
  created_at: string;
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "待审批", color: "bg-gray-100 text-gray-600" },
  level1: { label: "一级审批中", color: "bg-blue-50 text-blue-600" },
  level2: { label: "二级审批中", color: "bg-purple-50 text-purple-600" },
  executing: { label: "执行中", color: "bg-jingtian-soft text-jingtian-dark" },
  done: { label: "已完成", color: "bg-green-50 text-green-600" },
  closed: { label: "已关闭", color: "bg-gray-100 text-gray-400" },
};

const TYPE_MAP: Record<string, string> = {
  lost: "丢件",
  damaged: "破损",
  rejected: "客户拒收",
  timeout: "超时未签收",
  wrong_address: "地址错误",
  qty_mismatch: "数量不符",
  appearance: "外观破损",
  spec_mismatch: "规格不符",
  label_error: "标签错误",
  batch_error: "批次异常",
};

const SEVERITY_MAP: Record<string, { label: string; color: string }> = {
  low: { label: "低", color: "bg-green-50 text-green-600" },
  medium: { label: "中", color: "bg-yellow-50 text-yellow-600" },
  high: { label: "高", color: "bg-orange-50 text-orange-600" },
  critical: { label: "严重", color: "bg-red-50 text-red-600" },
};

export default function TicketsPage() {
  return (
    <Suspense fallback={<TicketsLoading />}>
      <TicketsPageInner />
    </Suspense>
  );
}

function TicketsLoading() {
  return (
    <SidebarLayout>
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="text-center py-20 text-ink-faint">加载中...</div>
      </div>
    </SidebarLayout>
  );
}

function TicketsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialStatus = searchParams.get("status") || "";
  const initialOverdue = searchParams.get("overdue") === "true";
  const initialType = searchParams.get("type") || "";
  const initialSource = searchParams.get("source") || "";
  const initialUpdatedFrom = searchParams.get("updated_from") || "";
  const initialUpdatedTo = searchParams.get("updated_to") || "";

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    status: initialOverdue ? "overdue" : initialStatus,
    type: initialType,
    overdue: initialOverdue,
    source: initialSource,
    updatedFrom: initialUpdatedFrom,
    updatedTo: initialUpdatedTo,
  });
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ ticket: Ticket; approvals: ApprovalRecord[] } | null>(null);
  const [approvalForm, setApprovalForm] = useState({ approver: "", action: "approve", opinion: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const pageSize = 20;

  const loadTickets = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (filter.status && filter.status !== "overdue") params.set("status", filter.status);
      if (filter.type) params.set("type", filter.type);
      if (filter.source) params.set("source", filter.source);
      if (filter.updatedFrom) params.set("updated_from", filter.updatedFrom);
      if (filter.updatedTo) params.set("updated_to", filter.updatedTo);
      if (filter.status === "overdue" || filter.overdue) params.set("overdue", "true");

      const res = await fetch(`/api/tickets?${params}`, { signal });
      const data = await res.json();
      setTickets(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        // ignore aborted requests
      }
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  // 筛选变化时同步 URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (filter.status && filter.status !== "overdue") params.set("status", filter.status);
    if (filter.status === "overdue" || filter.overdue) params.set("overdue", "true");
    if (filter.type) params.set("type", filter.type);
    if (filter.source) params.set("source", filter.source);
    if (filter.updatedFrom) params.set("updated_from", filter.updatedFrom);
    if (filter.updatedTo) params.set("updated_to", filter.updatedTo);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filter, router, pathname]);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    loadTickets(ctrl.signal);
  }, [loadTickets]);

  const viewDetail = async (ticketId: string) => {
    setSelectedTicket(ticketId);
    try {
      const [ticketRes, approvalRes] = await Promise.all([
        fetch(`/api/tickets?id=${ticketId}`),
        fetch(`/api/tickets/${ticketId}/approvals`),
      ]);
      const ticket = await ticketRes.json();
      const approvals = approvalRes.ok ? await approvalRes.json() : [];
      setDetail({ ticket, approvals });
    } catch {
      // ignore
    }
  };

  const handleApprove = async () => {
    if (!selectedTicket || !approvalForm.approver) {
      setError("请填写审批人");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/tickets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedTicket,
          action: approvalForm.action,
          approver: approvalForm.approver,
          opinion: approvalForm.opinion,
          level: detail?.ticket.status === "level2" ? 2 : 1,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "操作失败");
      } else {
        setApprovalForm({ approver: "", action: "approve", opinion: "" });
        viewDetail(selectedTicket);
        loadTickets();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidebarLayout>
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-ink">工单列表</h2>
          <p className="text-sm text-ink-faint mt-1">共 {total} 条工单</p>
        </div>
        <button
          onClick={() => loadTickets()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-line text-sm text-ink-soft hover:bg-bg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {/* 筛选栏 */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          value={filter.status}
          onChange={(e) => { setFilter((f) => ({ ...f, status: e.target.value, overdue: e.target.value === "overdue" })); setPage(1); }}
          className="px-4 py-2 rounded-xl border border-line bg-card text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jingtian/20"
        >
          <option value="">全部状态</option>
          <option value="pending,level1,level2,executing">待处理</option>
          <option value="done,closed">已完成</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
          <option value="overdue">已超时</option>
        </select>

        <select
          value={filter.type}
          onChange={(e) => { setFilter((f) => ({ ...f, type: e.target.value })); setPage(1); }}
          className="px-4 py-2 rounded-xl border border-line bg-card text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jingtian/20"
        >
          <option value="">全部类型</option>
          {Object.entries(TYPE_MAP).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select
          value={filter.source}
          onChange={(e) => { setFilter((f) => ({ ...f, source: e.target.value })); setPage(1); }}
          className="px-4 py-2 rounded-xl border border-line bg-card text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jingtian/20"
        >
          <option value="">全部来源</option>
          <option value="manual">手工上报</option>
          <option value="scan_auto">扫描触发</option>
        </select>
      </div>

      {/* 表格 */}
      <div className="bg-card rounded-2xl border border-line shadow-sm overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg sticky top-0 z-10">
              <tr className="border-b border-line">
                <th className="text-left px-4 py-3 font-semibold text-ink-soft">工单 ID</th>
                <th className="text-left px-4 py-3 font-semibold text-ink-soft">运单号</th>
                <th className="text-left px-4 py-3 font-semibold text-ink-soft">异常类型</th>
                <th className="text-left px-4 py-3 font-semibold text-ink-soft">来源</th>
                <th className="text-left px-4 py-3 font-semibold text-ink-soft">严重度</th>
                <th className="text-right px-4 py-3 font-semibold text-ink-soft">金额</th>
                <th className="text-left px-4 py-3 font-semibold text-ink-soft">上报人</th>
                <th className="text-left px-4 py-3 font-semibold text-ink-soft">状态</th>
                <th className="text-left px-4 py-3 font-semibold text-ink-soft">创建时间</th>
                <th className="text-center px-4 py-3 font-semibold text-ink-soft">操作</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const status = STATUS_MAP[t.status] || { label: t.status, color: "" };
                const severity = SEVERITY_MAP[t.severity] || { label: t.severity, color: "" };
                return (
                  <tr
                    key={t.id}
                    className={`border-b border-line-soft hover:bg-jingtian-soft/30 transition-colors ${
                      t.overdue ? "bg-danger-bg/30" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-ink-soft">{t.id.slice(0, 12)}...</td>
                    <td className="px-4 py-3 font-medium text-ink">{t.external_code}</td>
                    <td className="px-4 py-3">{TYPE_MAP[t.exception_type] || t.exception_type}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                        t.source === "scan_auto" ? "bg-info-bg text-info" : "bg-gray-100 text-gray-600"
                      }`}>
                        {t.source === "scan_auto" ? "扫描触发" : "手工上报"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${severity.color}`}>
                        {severity.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">¥{t.amount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-ink-soft">{t.reporter}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${status.color}`}>
                          {status.label}
                        </span>
                        {t.overdue && (
                          <Clock className="w-3.5 h-3.5 text-danger" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-soft text-xs">
                      {new Date(t.created_at).toLocaleString("zh-CN")}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => viewDetail(t.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-jingtian hover:bg-jingtian-soft transition-colors"
                      >
                        查看详情
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {tickets.length === 0 && !loading && (
          <div className="py-16 text-center text-ink-faint">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>暂无工单数据</p>
          </div>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg border border-line hover:bg-bg disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-ink-soft px-3">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-lg border border-line hover:bg-bg disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 工单详情弹窗 */}
      {detail && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="p-6 border-b border-line sticky top-0 bg-card z-10">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-ink text-lg">
                  工单详情
                  <span className="ml-2 text-sm font-normal text-ink-faint font-mono">{detail.ticket.id}</span>
                </h3>
                <button
                  onClick={() => { setDetail(null); setSelectedTicket(null); }}
                  className="p-1.5 rounded-lg hover:bg-bg text-ink-faint transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-ink-faint">运单号</label>
                  <p className="font-medium text-ink">{detail.ticket.external_code}</p>
                </div>
                <div>
                  <label className="text-xs text-ink-faint">异常类型</label>
                  <p className="font-medium text-ink">{TYPE_MAP[detail.ticket.exception_type]}</p>
                </div>
                <div>
                  <label className="text-xs text-ink-faint">上报人</label>
                  <p className="font-medium text-ink">{detail.ticket.reporter}</p>
                </div>
                <div>
                  <label className="text-xs text-ink-faint">金额</label>
                  <p className="font-medium text-ink">¥{detail.ticket.amount.toFixed(2)}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-ink-faint">描述</label>
                  <p className="text-ink-soft text-sm">{detail.ticket.description || "无"}</p>
                </div>
                <div>
                  <label className="text-xs text-ink-faint">状态</label>
                  <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${STATUS_MAP[detail.ticket.status]?.color}`}>
                    {STATUS_MAP[detail.ticket.status]?.label}
                  </span>
                </div>
                <div>
                  <label className="text-xs text-ink-faint">重试次数</label>
                  <p className="font-medium text-ink">{detail.ticket.retry_count} / {detail.ticket.max_retry}</p>
                </div>
              </div>

              {/* 审批历史 */}
              <div>
                <h4 className="font-semibold text-ink mb-3">审批历史</h4>
                {detail.approvals.length === 0 ? (
                  <p className="text-sm text-ink-faint">暂无审批记录</p>
                ) : (
                  <div className="space-y-2">
                    {detail.approvals.map((a) => (
                      <div key={a.id} className="p-3 rounded-xl bg-bg border border-line-soft flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {a.approver}
                            <span className="ml-2 text-xs text-ink-faint">
                              {a.level === 1 ? "一级审批" : "二级审批"}
                            </span>
                          </p>
                          {a.opinion && <p className="text-xs text-ink-soft mt-0.5">{a.opinion}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                            a.action === "approve" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                          }`}>
                            {a.action === "approve" ? "通过" : "拒绝"}
                          </span>
                          <span className="text-xs text-ink-faint">
                            {new Date(a.created_at).toLocaleString("zh-CN")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 审批操作区 */}
              {["level1", "level2", "pending"].includes(detail.ticket.status) && (
                <div className="p-4 rounded-xl bg-jingtian-soft/30 border border-jingtian/20">
                  <h4 className="font-semibold text-ink mb-3">审批操作</h4>
                  {error && (
                    <div className="mb-3 p-3 rounded-lg bg-danger-bg text-danger text-sm">{error}</div>
                  )}
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-ink-faint block mb-1">审批人</label>
                      <input
                        type="text"
                        value={approvalForm.approver}
                        onChange={(e) => setApprovalForm((f) => ({ ...f, approver: e.target.value }))}
                        placeholder="输入审批人姓名"
                        className="w-full px-4 py-2 rounded-xl border border-line bg-white text-sm focus:outline-none focus:ring-2 focus:ring-jingtian/20"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-ink-faint block mb-1">审批意见</label>
                      <textarea
                        value={approvalForm.opinion}
                        onChange={(e) => setApprovalForm((f) => ({ ...f, opinion: e.target.value }))}
                        placeholder="输入审批意见"
                        rows={2}
                        className="w-full px-4 py-2 rounded-xl border border-line bg-white text-sm focus:outline-none focus:ring-2 focus:ring-jingtian/20 resize-none"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setApprovalForm((f) => ({ ...f, action: "approve" }))}
                        disabled={submitting}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                          approvalForm.action === "approve"
                            ? "bg-jingtian text-white"
                            : "border border-line text-ink-soft hover:bg-bg"
                        }`}
                      >
                        通过
                      </button>
                      <button
                        onClick={() => setApprovalForm((f) => ({ ...f, action: "reject" }))}
                        disabled={submitting}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                          approvalForm.action === "reject"
                            ? "bg-danger text-white"
                            : "border border-line text-ink-soft hover:bg-bg"
                        }`}
                      >
                        拒绝
                      </button>
                    </div>
                    <button
                      onClick={handleApprove}
                      disabled={submitting || !approvalForm.approver}
                      className="w-full py-2.5 rounded-xl bg-ink text-white text-sm font-medium hover:bg-ink-soft transition-colors disabled:opacity-50"
                    >
                      {submitting ? "提交中..." : "确认提交"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </SidebarLayout>
  );
}
