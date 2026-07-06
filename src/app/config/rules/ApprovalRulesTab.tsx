"use client";

import { useState, useEffect } from "react";
import { Plus, Save, Trash2, Power, PowerOff, GitBranch } from "lucide-react";
import { formatDate } from "@/lib/utils";

const TYPE_OPTIONS = ["lost", "damaged", "rejected", "timeout", "wrong_address", "qty_mismatch", "appearance", "spec_mismatch", "label_error", "batch_error"];
const TYPE_LABELS: Record<string, string> = {
  lost: "丢件", damaged: "破损", rejected: "拒收", timeout: "超时未签收", wrong_address: "地址错误",
  qty_mismatch: "数量不符", appearance: "外观破损", spec_mismatch: "规格不符", label_error: "标签错误", batch_error: "批次异常",
};

export default function ApprovalRulesTab() {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ level: 1, min_amount: "", max_amount: "", exception_types: [] as string[], enabled: true });
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rules?type=approval");
      const data = await res.json();
      setRules(data.rules || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleType = (t: string) => {
    setForm(f => ({ ...f, exception_types: f.exception_types.includes(t) ? f.exception_types.filter(x => x !== t) : [...f.exception_types, t] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    const body: any = { ...form, min_amount: form.min_amount ? Number(form.min_amount) : null, max_amount: form.max_amount ? Number(form.max_amount) : null };
    if (editId) body.id = editId;
    try {
      const res = await fetch("/api/rules", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, type: "approval" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "保存失败"); return; }
      setShowForm(false); setEditId(null); load();
    } catch { setError("网络错误"); }
  };

  const toggleRule = async (rule: any) => {
    await fetch("/api/rules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rule.id, enabled: !rule.enabled, type: "approval" }) });
    load();
  };

  const deleteRule = async (id: string) => {
    if (!confirm("确认删除？")) return;
    await fetch(`/api/rules?id=${id}&type=approval`, { method: "DELETE" });
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-ink">审批分级</h3>
          <p className="text-sm text-ink-faint mt-0.5">根据金额和异常类型决定需要几级审批</p>
        </div>
        <button onClick={() => { setEditId(null); setForm({ level: 1, min_amount: "", max_amount: "", exception_types: [], enabled: true }); setShowForm(true); setError(""); }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-jingtian text-white text-sm font-medium hover:bg-jingtian-dark"><Plus className="w-4 h-4" />新建规则</button>
      </div>

      {showForm && (
        <div className="bg-card rounded-2xl border border-line p-6 mb-6 shadow-sm">
          <h3 className="text-base font-semibold text-ink mb-4">{editId ? "编辑规则" : "新建规则"}</h3>
          {error && <div className="mb-4 p-3 rounded-lg bg-danger-bg text-danger text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1.5">审批级别</label>
                <select value={form.level} onChange={e => setForm({ ...form, level: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-line bg-bg text-sm">
                  <option value={1}>一级审批</option>
                  <option value={2}>二级审批</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1.5">最低金额</label>
                <input value={form.min_amount} onChange={e => setForm({ ...form, min_amount: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-line bg-bg text-sm" placeholder="0" type="number" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1.5">最高金额</label>
                <input value={form.max_amount} onChange={e => setForm({ ...form, max_amount: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-line bg-bg text-sm" placeholder="留空不限制" type="number" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-2">适用异常类型（留空表示全部）</label>
              <div className="flex flex-wrap gap-2">
                {TYPE_OPTIONS.map(t => (
                  <button key={t} type="button" onClick={() => toggleType(t)} className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${form.exception_types.includes(t) ? "bg-jingtian-soft border-jingtian text-jingtian" : "bg-bg border-line text-ink-soft hover:border-jingtian/30"}`}>
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-jingtian text-white text-sm font-medium hover:bg-jingtian-dark"><Save className="w-4 h-4" />{editId ? "保存" : "创建"}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditId(null); }} className="px-4 py-2 rounded-xl border border-line text-sm text-ink-soft hover:bg-bg">取消</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-ink-faint text-sm">加载中...</div>
      ) : rules.length === 0 ? (
        <div className="text-center py-20"><GitBranch className="w-12 h-12 text-ink-faint/30 mx-auto mb-3" /><p className="text-ink-faint">暂无审批分级规则</p></div>
      ) : (
        <div className="bg-card rounded-2xl border border-line overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line bg-bg text-left text-xs text-ink-faint uppercase">
              <th className="px-4 py-3 font-medium">审批级别</th><th className="px-4 py-3 font-medium">金额范围</th><th className="px-4 py-3 font-medium">适用异常类型</th><th className="px-4 py-3 font-medium">启用</th><th className="px-4 py-3 font-medium">更新时间</th><th className="px-4 py-3 font-medium text-right">操作</th>
            </tr></thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} className="border-b border-line-soft hover:bg-bg/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">{r.level === 2 ? "二级审批" : "一级审批"}</td>
                  <td className="px-4 py-3 text-ink-soft">
                    {r.min_amount != null ? `¥${r.min_amount}` : "0"} ~ {r.max_amount != null ? `¥${r.max_amount}` : "不限"}
                  </td>
                  <td className="px-4 py-3">
                    {r.exception_types && r.exception_types.length > 0 ? (
                      <div className="flex flex-wrap gap-1">{r.exception_types.map((t: string) => <span key={t} className="px-2 py-0.5 rounded bg-bg text-ink-faint text-[11px]">{TYPE_LABELS[t] || t}</span>)}</div>
                    ) : <span className="text-ink-faint text-xs">全部</span>}
                  </td>
                  <td className="px-4 py-3"><button onClick={() => toggleRule(r)}>{r.enabled ? <Power className="w-4 h-4 text-success" /> : <PowerOff className="w-4 h-4 text-ink-faint" />}</button></td>
                  <td className="px-4 py-3 text-ink-faint text-xs">{formatDate(r.updated_at || r.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { setEditId(r.id); setForm({ level: r.level, min_amount: r.min_amount?.toString() || "", max_amount: r.max_amount?.toString() || "", exception_types: r.exception_types || [], enabled: r.enabled }); setShowForm(true); setError(""); }} className="px-3 py-1 rounded-lg text-xs text-jingtian hover:bg-jingtian-soft mr-1">编辑</button>
                    <button onClick={() => deleteRule(r.id)} className="px-3 py-1 rounded-lg text-xs text-danger hover:bg-danger-bg">删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
