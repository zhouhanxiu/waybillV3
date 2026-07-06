"use client";

import { useState, useEffect } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { Check, X, Eye, Clock, AlertTriangle, UserCheck } from "lucide-react";
import { formatDate } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  lost: "丢件", damaged: "破损", rejected: "拒收", timeout: "超时未签收", wrong_address: "地址错误",
  qty_mismatch: "数量不符", appearance: "外观破损", spec_mismatch: "规格不符", label_error: "标签错误", batch_error: "批次异常",
};
const STATUS_LABELS: Record<string, string> = { pending: "待审批", level1: "一级审批中", level2: "二级审批中", executing: "执行中", done: "已完成", closed: "已关闭" };
const STATUS_COLORS: Record<string, string> = { pending: "bg-warn-bg text-warn", level1: "bg-info-bg text-info", level2: "bg-info-bg text-info", executing: "bg-jingtian-soft text-jingtian", done: "bg-success/10 text-success", closed: "bg-line-soft text-ink-faint" };
const SEVERITY_COLORS: Record<string, string> = { low: "text-ink-faint", medium: "text-warn", high: "text-danger", critical: "text-danger font-bold" };

export default function MyApprovalsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [opinion, setOpinion] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentUser, setCurrentUser] = useState<{name:string}|null>(null);

  const load = async () => {
    setLoading(true);
    try {
      // 获取当前用户
      const authRes = await fetch("/api/auth");
      const authData = await authRes.json();
      if (authData.user) setCurrentUser(authData.user);

      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/my-approvals?${params}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const handleAction = async (ticketId: string, action: string) => {
    setActionLoading(true); setError("");
    const approver = currentUser?.name || "";
    if (!approver) { setError("未获取到用户信息，请刷新"); setActionLoading(false); return; }
    try {
      const res = await fetch("/api/tickets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ticketId, action, approver, opinion }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "操作失败"); return; }
      setDetail(null); setOpinion(""); load();
    } catch { setError("网络错误"); }
    finally { setActionLoading(false); }
  };

  const openDetail = async (ticketId: string) => {
    const res = await fetch(`/api/tickets?id=${ticketId}`);
    const data = await res.json();
    // 同时获取运单快照信息
    try {
      const snapRes = await fetch(`/api/tickets/${data.id}/snapshot`);
      const snapData = await snapRes.json();
      data.snapshot = snapData.snapshot || null;
    } catch {}
    setDetail(data); setOpinion(""); setError("");
  };

  return (
    <SidebarLayout>
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-ink">我自己审批</h2>
            <p className="text-sm text-ink-faint mt-0.5">待审批的异常工单</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border border-line bg-card text-xs">
              <option value="">全部状态</option>
              <option value="pending">待审批</option>
              <option value="level1">一级审批中</option>
              <option value="level2">二级审批中</option>
            </select>
            <button onClick={load} className="px-3 py-1.5 rounded-lg bg-bg text-xs text-ink-soft hover:bg-line-soft">刷新</button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-ink-faint text-sm">加载中...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <UserCheck className="w-12 h-12 text-ink-faint/30 mx-auto mb-3" />
            <p className="text-ink-faint">没有待审批的工单</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {items.map(t => (
              <div key={t.id} className="bg-card rounded-xl border border-line p-4 shadow-sm hover:border-jingtian/30 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-mono font-medium text-ink">{t.external_code}</span>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[t.status] || "bg-bg text-ink-faint"}`}>{STATUS_LABELS[t.status] || t.status}</span>
                      {t.overdue && <span className="flex items-center gap-1 text-[11px] text-danger"><Clock className="w-3 h-3" />超时</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-ink-soft mb-1">
                      <span className={SEVERITY_COLORS[t.severity] || ""}>{t.severity}</span>
                      <span>·</span>
                      <span>{TYPE_LABELS[t.exception_type] || t.exception_type}</span>
                      <span>·</span>
                      <span>上报人: {t.reporter}</span>
                      {t.store_name && <><span>·</span><span>{t.store_name}</span></>}
                      {t.receiver_name && <><span>·</span><span>收件人: {t.receiver_name}</span></>}
                    </div>
                    <p className="text-sm text-ink-soft truncate">{t.description}</p>
                    {t.amount > 0 && <p className="text-sm font-medium text-danger mt-1">¥{t.amount.toLocaleString()}</p>}
                    <p className="text-[11px] text-ink-faint mt-1">{formatDate(t.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => openDetail(t.id)} className="px-3 py-1.5 rounded-lg border border-line text-xs text-ink-soft hover:bg-bg flex items-center gap-1"><Eye className="w-3 h-3" />详情</button>
                    <button onClick={() => handleAction(t.id, "approve")} disabled={actionLoading} className="px-3 py-1.5 rounded-lg bg-success text-white text-xs font-medium hover:bg-success/90 disabled:opacity-50 flex items-center gap-1"><Check className="w-3 h-3" />通过</button>
                    <button onClick={() => handleAction(t.id, "reject")} disabled={actionLoading} className="px-3 py-1.5 rounded-lg bg-danger text-white text-xs font-medium hover:bg-danger/90 disabled:opacity-50 flex items-center gap-1"><X className="w-3 h-3" />驳回</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 详情弹窗 */}
        {detail && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
            <div className="bg-card rounded-2xl border border-line shadow-lg max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-6">
                <h3 className="text-lg font-bold text-ink mb-4">工单详情</h3>
                <div className="space-y-2 text-sm mb-4">
                  <div className="flex justify-between"><span className="text-ink-faint">运单号</span><span className="text-ink font-mono">{detail.external_code}</span></div>
                  <div className="flex justify-between"><span className="text-ink-faint">异常类型</span><span>{TYPE_LABELS[detail.exception_type] || detail.exception_type}</span></div>
                  <div className="flex justify-between"><span className="text-ink-faint">严重程度</span><span className={SEVERITY_COLORS[detail.severity]}>{detail.severity}</span></div>
                  <div className="flex justify-between"><span className="text-ink-faint">上报人</span><span>{detail.reporter}</span></div>
                  <div className="flex justify-between"><span className="text-ink-faint">金额</span><span className="text-danger font-medium">¥{(detail.amount || 0).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-ink-faint">描述</span><span className="text-right max-w-[60%]">{detail.description}</span></div>
                  <div className="flex justify-between"><span className="text-ink-faint">创建时间</span><span>{formatDate(detail.created_at)}</span></div>
                </div>
                {/* 运单快照信息 */}
                {detail.snapshot && (
                  <div className="mb-4 p-3 rounded-xl bg-jingtian-soft/30 border border-jingtian/10">
                    <h4 className="text-xs font-semibold text-ink mb-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-jingtian" />运单快照
                      <span className="text-[10px] text-ink-faint font-normal ml-auto">数据来源可能非最新</span>
                    </h4>
                    <div className="text-xs text-ink-soft space-y-1">
                      <div className="flex justify-between"><span>门店</span><span className="text-ink">{detail.snapshot.store_name || "-"}</span></div>
                      <div className="flex justify-between"><span>收件人</span><span className="text-ink">{detail.snapshot.receiver_name || "-"}</span></div>
                      <div className="flex justify-between"><span>电话</span><span className="text-ink">{detail.snapshot.receiver_phone || "-"}</span></div>
                      <div className="flex justify-between"><span>地址</span><span className="text-ink text-right max-w-[60%] truncate">{detail.snapshot.receiver_address || "-"}</span></div>
                      <div className="flex justify-between"><span>同步时间</span><span className="text-ink-faint">{formatDate(detail.snapshot.synced_at)}</span></div>
                    </div>
                    {detail.snapshot.items?.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-jingtian/10">
                        <span className="text-[10px] text-ink-faint">品项明细:</span>
                        {detail.snapshot.items.map((it:any,i:number)=>(
                          <div key={i} className="flex justify-between text-[11px] mt-1">
                            <span className="text-ink font-mono">{it.sku_code}</span>
                            <span className="text-ink-soft">{it.sku_name} x{it.quantity}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {error && <div className="mb-4 p-3 rounded-lg bg-danger-bg text-danger text-sm">{error}</div>}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-ink-soft mb-1.5">审批意见</label>
                  <textarea value={opinion} onChange={e => setOpinion(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-line bg-bg text-sm focus:outline-none focus:border-jingtian resize-none" rows={3} placeholder="输入审批意见..." />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => handleAction(detail.id, "approve")} disabled={actionLoading} className="flex-1 px-4 py-2.5 rounded-xl bg-success text-white text-sm font-medium hover:bg-success/90 disabled:opacity-50 flex items-center justify-center gap-2"><Check className="w-4 h-4" />通过</button>
                  <button onClick={() => handleAction(detail.id, "reject")} disabled={actionLoading} className="flex-1 px-4 py-2.5 rounded-xl bg-danger text-white text-sm font-medium hover:bg-danger/90 disabled:opacity-50 flex items-center justify-center gap-2"><X className="w-4 h-4" />驳回</button>
                </div>
                <button onClick={() => setDetail(null)} className="w-full mt-3 px-4 py-2 rounded-xl border border-line text-sm text-ink-soft hover:bg-bg">关闭</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
