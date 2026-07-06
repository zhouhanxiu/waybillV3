"use client";

import { useState, useEffect } from "react";
import { Plus, Save, Trash2, Power, PowerOff, ShieldCheck } from "lucide-react";
import { formatDate } from "@/lib/utils";

const SUBTYPE_LABELS: Record<string, string> = {
  qty_mismatch: "数量不符", appearance: "外观破损", spec_mismatch: "规格不符", label_error: "标签错误", batch_error: "批次异常",
};
const SEVERITY_OPTIONS = ["low", "medium", "high", "critical"];
const FIELD_LABELS: Record<string, string> = {
  qty_diff_pct: "数量差异(%)", damage_level: "破损等级", spec_deviation: "规格偏差", label_valid: "标签有效", batch_valid: "批次有效",
};
const OPERATOR_LABELS: Record<string, string> = {
  gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=", neq: "≠",
};

export default function QcRulesTab() {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", exception_subtype: "qty_mismatch", severity: "medium",
    auto_create_ticket: true, approval_level: 1, enabled: true,
    conditions: [{ field: "qty_diff_pct", operator: "gt", value: "10" }],
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rules?type=qc");
      const data = await res.json();
      setRules(data.rules || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addCondition = () => {
    setForm(f => ({ ...f, conditions: [...f.conditions, { field: "qty_diff_pct", operator: "gt", value: "10" }] }));
  };
  const removeCondition = (idx: number) => {
    setForm(f => ({ ...f, conditions: f.conditions.filter((_, i) => i !== idx) }));
  };
  const updateCondition = (idx: number, key: string, value: any) => {
    setForm(f => ({
      ...f,
      conditions: f.conditions.map((c, i) => i === idx ? { ...c, [key]: value } : c),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setMessage("");
    const body: any = { ...form, conditions: form.conditions.map(c => ({ ...c, value: isNaN(Number(c.value)) ? c.value : Number(c.value) })) };
    if (editId) body.id = editId;
    try {
      const res = await fetch("/api/rules", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, type: "qc" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "保存失败"); return; }
      setMessage(editId ? "已更新" : "已创建");
      setShowForm(false); setEditId(null);
      load();
    } catch { setError("网络错误"); }
  };

  const toggleRule = async (rule: any) => {
    await fetch("/api/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, enabled: !rule.enabled, type: "qc" }),
    });
    load();
  };

  const deleteRule = async (id: string) => {
    if (!confirm("确认删除？")) return;
    await fetch(`/api/rules?id=${id}&type=qc`, { method: "DELETE" });
    load();
  };

  const editRule = (rule: any) => {
    setEditId(rule.id);
    setForm({
      name: rule.name, exception_subtype: rule.exception_subtype, severity: rule.severity,
      auto_create_ticket: rule.auto_create_ticket, approval_level: rule.approval_level, enabled: rule.enabled,
      conditions: rule.condition || [{ field: "qty_diff_pct", operator: "gt", value: "10" }],
    });
    setShowForm(true); setError(""); setMessage("");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-ink">品控规则</h3>
          <p className="text-sm text-ink-faint mt-0.5">扫描品控自动检测规则，命中后按审批级别进入审批流程</p>
        </div>
        <button onClick={() => { setEditId(null); setForm({ name: "", exception_subtype: "qty_mismatch", severity: "medium", auto_create_ticket: true, approval_level: 1, enabled: true, conditions: [{ field: "qty_diff_pct", operator: "gt", value: "10" }] }); setShowForm(true); setError(""); setMessage(""); }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-jingtian text-white text-sm font-medium hover:bg-jingtian-dark"><Plus className="w-4 h-4" />新建规则</button>
      </div>

      {message && <div className="mb-4 p-3 rounded-lg bg-success/10 text-success text-sm">{message}</div>}

      {showForm && (
        <div className="bg-card rounded-2xl border border-line p-6 mb-6 shadow-sm">
          <h3 className="text-base font-semibold text-ink mb-4">{editId ? "编辑规则" : "新建规则"}</h3>
          {error && <div className="mb-4 p-3 rounded-lg bg-danger-bg text-danger text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1.5">规则名称</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-line bg-bg text-sm focus:outline-none focus:border-jingtian" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1.5">异常子类型</label>
                <select value={form.exception_subtype} onChange={e => setForm({ ...form, exception_subtype: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-line bg-bg text-sm focus:outline-none focus:border-jingtian">
                  {Object.entries(SUBTYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1.5">严重程度</label>
                <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-line bg-bg text-sm">
                  {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1.5">审批级别</label>
                <select value={form.approval_level} onChange={e => setForm({ ...form, approval_level: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-line bg-bg text-sm">
                  <option value={1}>一级审批</option>
                  <option value={2}>二级审批</option>
                </select>
              </div>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 text-sm text-ink-soft mb-2"><input type="checkbox" checked={form.auto_create_ticket} onChange={e => setForm({ ...form, auto_create_ticket: e.target.checked })} className="rounded" />自动建工单</label>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-ink-soft">触发条件</label>
                <button type="button" onClick={addCondition} className="text-xs text-jingtian hover:underline">+ 添加条件</button>
              </div>
              {form.conditions.map((c, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <select value={c.field} onChange={e => updateCondition(i, "field", e.target.value)} className="px-3 py-2 rounded-lg border border-line bg-bg text-sm w-40">
                    {Object.entries(FIELD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select value={c.operator} onChange={e => updateCondition(i, "operator", e.target.value)} className="px-3 py-2 rounded-lg border border-line bg-bg text-sm w-16">
                    {Object.entries(OPERATOR_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input value={c.value} onChange={e => updateCondition(i, "value", e.target.value)} className="px-3 py-2 rounded-lg border border-line bg-bg text-sm w-24" />
                  {form.conditions.length > 1 && (
                    <button type="button" onClick={() => removeCondition(i)} className="p-2 text-danger hover:bg-danger-bg rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              ))}
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
        <div className="text-center py-20"><ShieldCheck className="w-12 h-12 text-ink-faint/30 mx-auto mb-3" /><p className="text-ink-faint">暂无色控规则，点击上方按钮创建</p></div>
      ) : (
        <div className="bg-card rounded-2xl border border-line overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line bg-bg text-left text-xs text-ink-faint uppercase">
              <th className="px-4 py-3 font-medium">规则名称</th><th className="px-4 py-3 font-medium">异常子类型</th><th className="px-4 py-3 font-medium">严重程度</th><th className="px-4 py-3 font-medium">审批级别</th><th className="px-4 py-3 font-medium">自动建单</th><th className="px-4 py-3 font-medium">启用</th><th className="px-4 py-3 font-medium">更新时间</th><th className="px-4 py-3 font-medium text-right">操作</th>
            </tr></thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} className="border-b border-line-soft hover:bg-bg/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">{r.name}</td>
                  <td className="px-4 py-3 text-ink-soft">{SUBTYPE_LABELS[r.exception_subtype] || r.exception_subtype}</td>
                  <td className="px-4 py-3"><span className={`text-[11px] font-medium ${r.severity === "critical" ? "text-danger" : r.severity === "high" ? "text-warn" : "text-ink-soft"}`}>{r.severity}</span></td>
                  <td className="px-4 py-3 text-ink-soft">{r.approval_level === 2 ? "二级" : "一级"}</td>
                  <td className="px-4 py-3">{r.auto_create_ticket ? <span className="text-success text-xs">是</span> : <span className="text-ink-faint text-xs">否</span>}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleRule(r)}>{r.enabled ? <Power className="w-4 h-4 text-success" /> : <PowerOff className="w-4 h-4 text-ink-faint" />}</button>
                  </td>
                  <td className="px-4 py-3 text-ink-faint text-xs">{formatDate(r.updated_at || r.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => editRule(r)} className="px-3 py-1 rounded-lg text-xs text-jingtian hover:bg-jingtian-soft mr-1">编辑</button>
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
