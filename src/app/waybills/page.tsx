"use client";

import { useState, useEffect } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import { Search, FileText, Package } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function WaybillsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

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

  return (
    <SidebarLayout>
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-ink">运单快照</h2>
            <p className="text-sm text-ink-faint mt-0.5">V3 本地同步的 V2 运单快照</p>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              value={q}
              onChange={e => { setQ(e.target.value); setPage(1); }}
              placeholder="搜索运单号 / 门店 / 收件人 / 电话"
              className="pl-9 pr-4 py-2 rounded-xl border border-line bg-card text-sm focus:outline-none focus:border-jingtian w-72"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-ink-faint text-sm">加载中...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-2xl border border-line">
            <FileText className="w-12 h-12 text-ink-faint/30 mx-auto mb-3" />
            <p className="text-ink-faint">暂无运单快照</p>
            <p className="text-xs text-ink-faint/70 mt-1">扫描或上报异常时会自动从 V2 同步</p>
          </div>
        ) : (
          <>
            <div className="bg-card rounded-2xl border border-line overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg text-left text-xs text-ink-faint uppercase">
                    <th className="px-4 py-3 font-medium">运单号</th>
                    <th className="px-4 py-3 font-medium">门店</th>
                    <th className="px-4 py-3 font-medium">收件人</th>
                    <th className="px-4 py-3 font-medium">电话</th>
                    <th className="px-4 py-3 font-medium">地址</th>
                    <th className="px-4 py-3 font-medium text-right">品项数</th>
                    <th className="px-4 py-3 font-medium">同步时间</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((w) => (
                    <tr key={w.id} className="border-b border-line-soft hover:bg-bg/50 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-ink">{w.external_code}</td>
                      <td className="px-4 py-3 text-ink-soft">{w.store_name || "-"}</td>
                      <td className="px-4 py-3 text-ink-soft">{w.receiver_name || "-"}</td>
                      <td className="px-4 py-3 text-ink-soft">{w.receiver_phone || "-"}</td>
                      <td className="px-4 py-3 text-ink-soft text-xs max-w-[240px] truncate" title={w.receiver_address}>{w.receiver_address || "-"}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1 text-xs text-ink-soft">
                          <Package className="w-3 h-3" />{w.item_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-faint text-xs">{formatDate(w.synced_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-4 text-xs text-ink-faint">
              <span>共 {total} 条</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg border border-line bg-card disabled:opacity-50 hover:bg-bg"
                >
                  上一页
                </button>
                <span>{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg border border-line bg-card disabled:opacity-50 hover:bg-bg"
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </SidebarLayout>
  );
}
