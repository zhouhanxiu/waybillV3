"use client";

import { useState, useEffect } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { Plus, Save, Trash2, ArrowRight, Settings, Wand2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  admin: "管理员", level1_approver: "一级审批人", level2_approver: "二级审批人", qc_supervisor: "品控主管", reporter: "上报人", operator: "操作员",
};

export default function ApprovalFlowPage() {
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [initing, setIniting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", steps: [{ role: "level1_approver", order: 1, label: "一级审批" }] });
  const [error, setError] = useState("");

  const initData = async () => {
    setIniting(true);
    try {
      const res = await fetch("/api/init-db");
      const data = await res.json();
      if (res.ok) await load();
      else setError(data.error || "初始化失败");
    } catch {
      setError("初始化请求失败");
    } finally {
      setIniting(false);
    }
  };

  const load = async () => {

    try {
      const res = await fetch("/api/flows");
      const data = await res.json();
      setFlows(data.configs || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const addStep = () => {
    const nextOrder = form.steps.length + 1;
    setForm(f => ({ ...f, steps: [...f.steps, { role: "level2_approver", order: nextOrder, label: `第${nextOrder}步` }] }));
  };
  const removeStep = (idx: number) => {
    setForm(f => ({ ...f, steps: f.steps.filter((_, i) => i !== idx) }));
  };
  const updateStep = (idx: number, key: string, value: any) => {
    setForm(f => ({ ...f, steps: f.steps.map((s, i) => i === idx ? { ...s, [key]: value } : s) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      const body = { name: form.name, steps: form.steps.map((s, i) => ({ ...s, order: i + 1 })) };
      const res = await fetch("/api/flows", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editId ? { ...body, id: editId } : body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "保存失败"); return; }
      setShowForm(false); setEditId(null); load();
    } catch { setError("网络错误"); }
  };

  const deleteFlow = async (id: string) => {
    if (!confirm("确认删除？")) return;
    await fetch(`/api/flows?id=${id}`, { method: "DELETE" });
    load();
  };

  return (
    <SidebarLayout>
      <div className="p-6 max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div><h2 className="text-xl font-bold text-ink">审批流配置</h2><p className="text-sm text-ink-faint mt-0.5">定义审批流程步骤</p></div>
          <button onClick={() => { setEditId(null); setForm({ name: "", steps: [{ role: "level1_approver", order: 1, label: "一级审批" }] }); setShowForm(true); setError(""); }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-jingtian text-white text-sm font-medium hover:bg-jingtian-dark"><Plus className="w-4 h-4" />新建审批流</button>
        </div>

        {showForm && (
          <div className="bg-card rounded-2xl border border-line p-6 mb-6 shadow-sm">
            <h3 className="text-base font-semibold text-ink mb-4">{editId ? "编辑审批流" : "新建审批流"}</h3>
            {error && <div className="mb-4 p-3 rounded-lg bg-danger-bg text-danger text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1.5">审批流名称</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-line bg-bg text-sm focus:outline-none focus:border-jingtian" placeholder="如：标准审批流" required />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-ink-soft">审批步骤</label>
                  <button type="button" onClick={addStep} className="text-xs text-jingtian hover:underline">+ 添加步骤</button>
                </div>
                <div className="space-y-3">
                  {form.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-bg border border-line">
                      <span className="text-xs font-bold text-ink-faint w-6 text-center">{i + 1}</span>
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-ink-faint mb-1 block">步骤名称</label>
                          <input value={step.label} onChange={e => updateStep(i, "label", e.target.value)} className="w-full px-2 py-1.5 rounded border border-line bg-white text-sm" placeholder="如：一级审批" />
                        </div>
                        <div>
                          <label className="text-[10px] text-ink-faint mb-1 block">审批角色</label>
                          <select value={step.role} onChange={e => updateStep(i, "role", e.target.value)} className="w-full px-2 py-1.5 rounded border border-line bg-white text-sm">
                            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </div>
                      </div>
                      {form.steps.length > 1 && (
                        <button type="button" onClick={() => removeStep(i)} className="p-2 text-danger hover:bg-danger-bg rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  ))}
                </div>
                {form.steps.length > 1 && (
                  <div className="flex items-center gap-2 mt-3 text-xs text-ink-faint">
                    {form.steps.map((s, i) => (
                      <span key={i} className="flex items-center gap-2">
                        {i > 0 && <ArrowRight className="w-3 h-3" />}
                        <span className="px-2 py-1 rounded bg-jingtian-soft text-jingtian">{s.label}</span>
                      </span>
                    ))}
                  </div>
                )}
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
        ) : flows.length === 0 ? (
          <div className="text-center py-20">
            <Settings className="w-12 h-12 text-ink-faint/30 mx-auto mb-3" />
            <p className="text-ink-faint mb-4">暂无审批流配置</p>
            <button
              onClick={initData}
              disabled={initing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-jingtian text-white text-sm font-medium hover:bg-jingtian-dark mx-auto disabled:opacity-60"
            >
              <Wand2 className="w-4 h-4" />
              {initing ? "初始化中..." : "初始化默认审批流"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {flows.map(flow => (
              <div key={flow.id} className="bg-card rounded-2xl border border-line p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-ink">{flow.name}</h3>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditId(flow.id); setForm({ name: flow.name, steps: flow.steps }); setShowForm(true); setError(""); }} className="px-3 py-1 rounded-lg text-xs text-jingtian hover:bg-jingtian-soft">编辑</button>
                    <button onClick={() => deleteFlow(flow.id)} className="px-3 py-1 rounded-lg text-xs text-danger hover:bg-danger-bg">删除</button>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {flow.steps?.map((s: any, i: number) => (
                    <span key={i} className="flex items-center gap-2">
                      {i > 0 && <ArrowRight className="w-4 h-4 text-ink-faint" />}
                      <span className="px-3 py-1.5 rounded-xl bg-jingtian-soft text-jingtian text-sm font-medium">
                        {s.label}
                        <span className="ml-1.5 text-[10px] text-jingtian/60">({ROLE_LABELS[s.role] || s.role})</span>
                      </span>
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-ink-faint mt-3">{formatDate(flow.updated_at || flow.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
