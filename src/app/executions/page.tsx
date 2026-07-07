"use client";

import { useState, useEffect } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { DollarSign, Package, CheckCircle, XCircle, Clock, Wand2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

const DIR_LABELS: Record<string, string> = { to_customer: "赔付客户", from_supplier: "向供应商追偿" };
const COMP_STATUS: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "待处理", color: "bg-warn-bg text-warn", icon: Clock },
  processing: { label: "处理中", color: "bg-info-bg text-info", icon: Clock },
  done: { label: "已完成", color: "bg-success/10 text-success", icon: CheckCircle },
};

export default function ExecutionsPage() {
  const [tab, setTab] = useState<"compensation" | "inventory">("compensation");
  const [compItems, setCompItems] = useState<any[]>([]);
  const [invItems, setInvItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      if (tab === "compensation") {
        const res = await fetch("/api/executions?type=compensation&pageSize=50");
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setMessage(`加载失败: ${err.error || res.status}`);
          setCompItems([]);
          return;
        }
        const data = await res.json();
        setCompItems(data.items || []);
      } else {
        const res = await fetch("/api/executions?type=inventory&pageSize=50");
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setMessage(`加载失败: ${err.error || res.status}`);
          setInvItems([]);
          return;
        }
        const data = await res.json();
        setInvItems(data.items || []);
      }
    } catch (e: any) {
      setMessage(`加载异常: ${e.message}`);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [tab]);

  const seedData = async () => {
    setSeeding(true);
    setMessage("");
    try {
      const res = await fetch("/api/seed/executions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 5 }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`已生成 ${data.count} 条测试记录`);
        await load();
      } else {
        setMessage(data.error || "生成失败");
      }
    } catch {
      setMessage("网络错误");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <SidebarLayout>
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-ink">执行记录</h2>
            <p className="text-sm text-ink-faint mt-0.5">审批通过后的执行联动记录</p>
          </div>
          <button
            onClick={seedData}
            disabled={seeding}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-jingtian text-white text-sm font-medium hover:bg-jingtian-dark transition-colors disabled:opacity-50"
          >
            <Wand2 className="w-4 h-4" />
            {seeding ? "生成中..." : "生成测试数据"}
          </button>
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded-xl text-sm ${message.includes("已生成") ? "bg-success/10 text-success" : "bg-danger-bg text-danger"}`}>
            {message}
          </div>
        )}


        {/* Tab 切换 */}
        <div className="flex gap-1 bg-bg rounded-xl p-1 mb-6 w-fit">
          <button onClick={() => setTab("compensation")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "compensation" ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>
            <DollarSign className="w-4 h-4" />赔付记录
          </button>
          <button onClick={() => setTab("inventory")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "inventory" ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>
            <Package className="w-4 h-4" />库存变更
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-ink-faint text-sm">加载中...</div>
        ) : tab === "compensation" ? (
          compItems.length === 0 ? (
            <div className="text-center py-20 bg-card rounded-2xl border border-line">
              <DollarSign className="w-12 h-12 text-ink-faint/30 mx-auto mb-3" />
              <p className="text-ink-faint mb-1">暂无赔付记录</p>
              <p className="text-xs text-ink-faint/70">工单审批通过后才会自动生成赔付/库存记录</p>
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-line overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg text-left text-xs text-ink-faint uppercase">
                    <th className="px-4 py-3 font-medium">运单号</th>
                    <th className="px-4 py-3 font-medium">异常类型</th>
                    <th className="px-4 py-3 font-medium">赔付方向</th>
                    <th className="px-4 py-3 font-medium text-right">金额</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium">原因</th>
                    <th className="px-4 py-3 font-medium">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {compItems.map(c => {
                    const st = COMP_STATUS[c.status] || { label: c.status, color: "bg-bg text-ink-faint", icon: Clock };
                    return (
                      <tr key={c.id} className="border-b border-line-soft hover:bg-bg/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-ink">{c.external_code || "-"}</td>
                        <td className="px-4 py-3 text-ink-soft">{c.exception_type || "-"}</td>
                        <td className="px-4 py-3">{DIR_LABELS[c.direction] || c.direction}</td>
                        <td className="px-4 py-3 text-right font-medium text-danger">¥{c.amount?.toLocaleString() || 0}</td>
                        <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${st.color}`}><st.icon className="w-3 h-3" />{st.label}</span></td>
                        <td className="px-4 py-3 text-ink-soft text-xs max-w-[200px] truncate">{c.reason || "-"}</td>
                        <td className="px-4 py-3 text-ink-faint text-xs">{formatDate(c.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          invItems.length === 0 ? (
            <div className="text-center py-20 bg-card rounded-2xl border border-line">
              <Package className="w-12 h-12 text-ink-faint/30 mx-auto mb-3" />
              <p className="text-ink-faint mb-1">暂无库存变更记录</p>
              <p className="text-xs text-ink-faint/70">工单审批通过后才会自动生成赔付/库存记录</p>
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-line overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg text-left text-xs text-ink-faint uppercase">
                    <th className="px-4 py-3 font-medium">SKU编码</th>
                    <th className="px-4 py-3 font-medium">变更数量</th>
                    <th className="px-4 py-3 font-medium">原因</th>
                    <th className="px-4 py-3 font-medium">关联工单</th>
                    <th className="px-4 py-3 font-medium">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {invItems.map((inv: any) => (
                    <tr key={inv.id} className="border-b border-line-soft hover:bg-bg/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-ink">{inv.sku_code || "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${inv.change_qty > 0 ? "text-success" : inv.change_qty < 0 ? "text-danger" : "text-ink-faint"}`}>
                          {inv.change_qty > 0 ? "+" : ""}{inv.change_qty}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-soft text-xs max-w-[300px] truncate">{inv.reason || "-"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-jingtian">{inv.ticket_id ? inv.ticket_id.substring(0, 12) + "..." : "-"}</td>
                      <td className="px-4 py-3 text-ink-faint text-xs">{formatDate(inv.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </SidebarLayout>
  );
}
