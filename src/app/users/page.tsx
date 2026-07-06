"use client";

import { useState, useEffect } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { Plus, Save, Ban, CheckCircle, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

const ALL_ROLES = ["admin", "qc_supervisor", "level1_approver", "level2_approver", "reporter", "operator"];
const ROLE_LABELS: Record<string, string> = {
  admin: "管理员", qc_supervisor: "品控主管", level1_approver: "一级审批", level2_approver: "二级审批", reporter: "上报人", operator: "操作员",
};

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [form, setForm] = useState({ name: "", password: "", display_name: "", roles: ["reporter"] });
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (res.ok) setUsers(data.users || []);
      else setError(data.error);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleRole = (role: string) => {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (!form.name) { setError("请输入用户名"); return; }
    if (!editUser && !form.password) { setError("请输入密码"); return; }

    try {
      const res = await fetch("/api/users", {
        method: editUser ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editUser ? { id: editUser.id, ...form } : form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "操作失败"); return; }
      setShowForm(false); setEditUser(null);
      setForm({ name: "", password: "", display_name: "", roles: ["reporter"] });
      load();
    } catch { setError("网络错误"); }
  };

  const toggleActive = async (user: any) => {
    await fetch("/api/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, active: !user.active }),
    });
    load();
  };

  const deleteUser = async (id: string, name: string) => {
    if (!confirm(`确认删除用户 "${name}"？此操作不可撤销。`)) return;
    try {
      const res = await fetch(`/api/users?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "删除失败"); return; }
      load();
    } catch { alert("网络错误"); }
  };

  return (
    <SidebarLayout>
      <div className="p-6 max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-ink">用户管理</h2>
            <p className="text-sm text-ink-faint mt-0.5">管理系统用户和权限</p>
          </div>
          <button onClick={() => { setShowForm(true); setEditUser(null); setForm({ name: "", password: "", display_name: "", roles: ["reporter"] }); setError(""); }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-jingtian text-white text-sm font-medium hover:bg-jingtian-dark transition-colors">
            <Plus className="w-4 h-4" />新建用户
          </button>
        </div>

        {showForm && (
          <div className="bg-card rounded-2xl border border-line p-6 mb-6 shadow-sm">
            <h3 className="text-base font-semibold text-ink mb-4">{editUser ? "编辑用户" : "新建用户"}</h3>
            {error && <div className="mb-4 p-3 rounded-lg bg-danger-bg text-danger text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-ink-soft mb-1.5">用户名 *</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-line bg-bg text-sm focus:outline-none focus:border-jingtian" placeholder="英文用户名" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-soft mb-1.5">{editUser ? "新密码（留空不修改）" : "密码 *"}</label>
                  <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-line bg-bg text-sm focus:outline-none focus:border-jingtian" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1.5">显示名称</label>
                <input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-line bg-bg text-sm focus:outline-none focus:border-jingtian" placeholder="中文名" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-2">角色权限</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_ROLES.map(r => (
                    <button key={r} type="button" onClick={() => toggleRole(r)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${form.roles.includes(r) ? "bg-jingtian-soft border-jingtian text-jingtian" : "bg-bg border-line text-ink-soft hover:border-jingtian/30"}`}>
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button type="submit" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-jingtian text-white text-sm font-medium hover:bg-jingtian-dark"><Save className="w-4 h-4" />{editUser ? "保存" : "创建"}</button>
                <button type="button" onClick={() => { setShowForm(false); setEditUser(null); }} className="px-4 py-2 rounded-xl border border-line text-sm text-ink-soft hover:bg-bg">取消</button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-ink-faint text-sm">加载中...</div>
        ) : (
          <div className="bg-card rounded-2xl border border-line overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-bg text-left text-xs text-ink-faint uppercase">
                  <th className="px-4 py-3 font-medium">用户名</th>
                  <th className="px-4 py-3 font-medium">显示名称</th>
                  <th className="px-4 py-3 font-medium">角色</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">创建时间</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-line-soft hover:bg-bg/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-ink">{u.name}</td>
                    <td className="px-4 py-3 text-ink-soft">{u.display_name || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles?.map((r: string) => (
                          <span key={r} className="px-2 py-0.5 rounded bg-jingtian-soft text-jingtian text-[11px] font-medium">{ROLE_LABELS[r] || r}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${u.active ? "bg-success/10 text-success" : "bg-danger-bg text-danger"}`}>
                        {u.active ? <><CheckCircle className="w-3 h-3" />启用</> : <><Ban className="w-3 h-3" />禁用</>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-faint text-xs">{formatDate(u.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => { setEditUser(u); setForm({ name: u.name, password: "", display_name: u.display_name || "", roles: [...(u.roles || [])] }); setShowForm(true); setError(""); }} className="px-3 py-1 rounded-lg text-xs text-jingtian hover:bg-jingtian-soft mr-1">编辑</button>
                      <button onClick={() => toggleActive(u)} className={`px-3 py-1 rounded-lg text-xs mr-1 ${u.active ? "text-warn hover:bg-warn-bg" : "text-success hover:bg-success/10"}`}>{u.active ? "禁用" : "启用"}</button>
                      <button onClick={() => deleteUser(u.id, u.name)} className="px-3 py-1 rounded-lg text-xs text-danger hover:bg-danger-bg"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
