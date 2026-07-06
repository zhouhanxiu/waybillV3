"use client";

import { useState, useEffect } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { Search, FileText, Package, MapPin, Phone, Store, ArrowLeft, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function WaybillsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await fetch(`/api/waybills?${params}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [q, page]);

  const totalPages = Math.ceil(total / pageSize) || 1;

  const toggleExpand = (id: string) => {
    setExpanded(expanded === id ? null : id);
  };

  return (
    <SidebarLayout>
      <div className="p-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-ink">运单快照</h2>
            <p className="text-sm text-ink-faint mt-0.5">V3 本地同步的 V2 运单快照</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                value={q}
                onChange={e => { setQ(e.target.value); setPage(1); }}
                placeholder="搜索运单号 / 门店 / 收件人 / 电话"
                className="pl-9 pr-4 py-2.5 rounded-xl border border-line bg-card text-sm focus:outline-none focus:border-jingtian focus:ring-2 focus:ring-jingtian/10 w-72 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-card rounded-2xl border border-line p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-jingtian-soft flex items-center justify-center text-jingtian">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-ink-faint">运单总数</p>
                <p className="text-lg font-bold text-ink">{total}</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-2xl border border-line p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-success">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-ink-faint">当前页</p>
                <p className="text-lg font-bold text-ink">{items.length} 条</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-2xl border border-line p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-info-bg flex items-center justify-center text-info">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-ink-faint">页码</p>
                <p className="text-lg font-bold text-ink">{page} / {totalPages}</p>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 bg-card rounded-2xl border border-line">
            <div className="w-8 h-8 border-2 border-jingtian border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-ink-faint text-sm">加载中...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-2xl border border-line">
            <FileText className="w-12 h-12 text-ink-faint/30 mx-auto mb-3" />
            <p className="text-ink-faint">暂无运单快照</p>
            <p className="text-xs text-ink-faint/70 mt-1">扫描或上报异常时会自动从 V2 同步</p>
          </div>
        ) : (
          <>
            <div className="bg-card rounded-2xl border border-line shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-bg/80 text-left text-xs text-ink-faint uppercase">
                      <th className="px-5 py-3.5 font-medium w-48">运单号</th>
                      <th className="px-5 py-3.5 font-medium">门店 / 收件人</th>
                      <th className="px-5 py-3.5 font-medium">联系方式</th>
                      <th className="px-5 py-3.5 font-medium">地址</th>
                      <th className="px-5 py-3.5 font-medium text-right">金额</th>
                      <th className="px-5 py-3.5 font-medium text-center">品项</th>
                      <th className="px-5 py-3.5 font-medium">同步时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((w) => (
                      <>
                        <tr
                          key={w.id}
                          onClick={() => toggleExpand(w.id)}
                          className="border-b border-line-soft hover:bg-bg/60 transition-colors cursor-pointer group"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-ink group-hover:text-jingtian transition-colors">{w.external_code}</span>
                              {expanded === w.id ? <ChevronUp className="w-3.5 h-3.5 text-ink-faint" /> : <ChevronDown className="w-3.5 h-3.5 text-ink-faint" />}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex flex-col">
                              <span className="text-ink font-medium flex items-center gap-1">
                                <Store className="w-3.5 h-3.5 text-ink-faint" />
                                {w.store_name || "未知门店"}
                              </span>
                              <span className="text-xs text-ink-soft mt-0.5">{w.receiver_name || "-"}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className="text-ink-soft flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5 text-ink-faint" />
                              {w.receiver_phone || "-"}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className="text-xs text-ink-soft max-w-[260px] truncate inline-block" title={w.receiver_address}>
                              {w.receiver_address || "-"}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className="font-mono font-medium text-ink">
                              ¥{Number(w.amount || 0).toFixed(2)}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${w.item_count > 0 ? "bg-jingtian-soft text-jingtian" : "bg-line-soft text-ink-faint"}`}>
                              <Package className="w-3 h-3" />{w.item_count}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-ink-faint text-xs">
                            {formatDate(w.synced_at)}
                          </td>
                        </tr>
                        {expanded === w.id && (
                          <tr className="bg-bg/40 border-b border-line-soft">
                            <td colSpan={7} className="px-5 py-4">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                <div className="bg-card rounded-xl border border-line p-3">
                                  <p className="text-ink-faint mb-1">完整地址</p>
                                  <p className="text-ink-soft">{w.receiver_address || "-"}</p>
                                </div>
                                <div className="bg-card rounded-xl border border-line p-3">
                                  <p className="text-ink-faint mb-1">快照 ID</p>
                                  <p className="font-mono text-ink-soft break-all">{w.id}</p>
                                </div>
                                <div className="bg-card rounded-xl border border-line p-3">
                                  <p className="text-ink-faint mb-1">金额 / 品项</p>
                                  <p className="text-ink-soft">¥{Number(w.amount || 0).toFixed(2)} / {w.item_count} 件</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-5">
              <span className="text-xs text-ink-faint">共 {total} 条</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 px-3.5 py-2 rounded-xl border border-line bg-card text-xs text-ink-soft disabled:opacity-40 hover:bg-bg transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> 上一页
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${page === p ? "bg-jingtian text-white" : "border border-line bg-card text-ink-soft hover:bg-bg"}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="flex items-center gap-1 px-3.5 py-2 rounded-xl border border-line bg-card text-xs text-ink-soft disabled:opacity-40 hover:bg-bg transition-colors"
                >
                  下一页 <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </SidebarLayout>
  );
}
