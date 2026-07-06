"use client";

import { useState, useEffect } from "react";
import { Plus, Save, Trash2, Power, PowerOff, Timer } from "lucide-react";
import { formatDate } from "@/lib/utils";

const SCOPE_LABELS: Record<string, string> = {
  ticket_pending: "工单待审批", ticket_level1: "一级审批中", ticket_level2: "二级审批中", qc_hold: "品控暂扣",
};
const ACTION_LABELS: Record<string, string> = {
  escalate: "自动升级", reject: "自动驳回", auto_escalate_to_level2: "自动升级至二级",
};

export default function TimeoutRulesTab() {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ scope: "ticket_pending", timeout_minutes: "60", action: "escalate", enabled: true });
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rules?type=timeout");
      const data = await res.json();
      setRules(data.rules || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    const body: any = { ...form, timeout_minutes: Number(form.timeout_minutes) };
    if (editId) body.id = editId;
    try {
      const res = await fetch("/api/rules", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, type: "timeout" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "保存失败"); return; }
      setShowForm(false); setEditId(null); load();
    } catch { setError("网络错误"); }
  };

  const toggleRule = async (rule: any) => {
    await fetch("/api/rules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rule.id, enabled: !rule.enabled, type: "timeout" }) });
    load();
  };

  const deleteRule = async (id: string) => {
    if (!confirm("确认删除？")) return;
    await fetch(`/api/rules?id=${id}&type=timeout`, { method: "DELETE" });
    load();
  };

  const formatMinutes = (m: number) => m >= 1440 ? `${m / 1440}天` : m >= 60 ? `${m / 60}小时` : `${m}分钟`;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-ink">超时规则</h3>
          <p className="text-sm text-ink-faint mt-0.5">审批或暂扣超时时自动触发升级/驳回</p>
        </div>
        <button onClick={() => { setEditId(null); setForm({ scope: "ticket_pending", timeout_minutes: "60", action: "escalate", enabled: true }); setShowForm(true); setError(""); }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-jingtian text-white text-sm font-medium hover:bg-jingtian-dark"><Plus className="w-4 h-4" />新建规则</button>
      </div>

      {showForm && (
        <div className="bg-card rounded-2xl border border-line p-6 mb-6 shadow-sm">
          <h3 className="text-base font-semibold text-ink mb-4">{editId ? "编辑规则" : "新建规则"}</h3>
          {error && <div className="mb-4 p-3 rounded-lg bg-danger-bg text-danger text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1.5">适用范围</label>
                <select value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-line bg-bg text-sm">
                  {Object.entries(SCOPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1.5">超时时间(分钟)</label>
                <input value={form.timeout_minutes} onChange={e => setForm({ ...form, timeout_minutes: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-line bg-bg text-sm" type="number" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1.5">超时动作</label>
                <select value={form.action} onChange={e => setForm({ ...form, action: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-line bg-bg text-sm">
                  {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
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
        <div className="text-center py-20"><Timer className="w-12 h-12 text-ink-faint/30 mx-auto mb-3" /><p className="text-ink-faint">暂无超时规则</p></div>
      ) : (
        <div className="bg-card rounded-2xl border border-line overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line bg-bg text-left text-xs text-ink-faint uppercase">
              <th className="px-4 py-3 font-medium">适用范围</th><th className="px-4 py-3 font-medium">超时时间</th><th className="px-4 py-3 font-medium">超时动作</th><th className="px-4 py-3 font-medium">启用</th><th className="px-4 py-3 font-medium">更新时间</th><th className="px-4 py-3 font-medium text-right">操作</th>
            </tr></thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} className="border-b border-line-soft hover:bg-bg/50 transition-colors">
                  <td className="px-4 py-3 text-ink">{SCOPE_LABELS[r.scope] || r.scope}</td>
                  <td className="px-4 py-3 font-medium text-ink">{formatMinutes(r.timeout_minutes)}</td>
                  <td className="px-4 py-3 text-ink-soft">{ACTION_LABELS[r.action] || r.action}</td>
                  <td className="px-4 py-3"><button onClick={() => toggleRule(r)}>{r.enabled ? <Power className="w-4 h-4 text-success" /> : <PowerOff className="w-4 h-4 text-ink-faint" />}</button></td>
                  <td className="px-4 py-3 text-ink-faint text-xs">{formatDate(r.updated_at || r.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { setEditId(r.id); setForm({ scope: r.scope, timeout_minutes: r.timeout_minutes.toString(), action: r.action, enabled: r.enabled }); setShowForm(true); setError(""); }} className="px-3 py-1 rounded-lg text-xs text-jingtian hover:bg-jingtian-soft mr-1">编辑</button>
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
