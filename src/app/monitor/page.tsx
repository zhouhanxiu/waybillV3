"use client";

import { useState, useEffect } from "react";
import { Activity, Wifi, WifiOff, Clock, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

type MonitorData = {
  v2_healthy: boolean;
  last_sync_at: string | null;
  stats_24h: {
    total: number;
    success: number;
    failed: number;
    success_rate: string;
  };
  recent_logs: {
    id: string;
    request_id: string;
    endpoint: string;
    method: string;
    status_code: number;
    success: boolean;
    duration_ms: number;
    error_message: string;
    created_at: string;
  }[];
};

export default function MonitorPage() {
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/monitor");
      const d = await res.json();
      setData(d);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-ink">同步监控</h2>
          <p className="text-sm text-ink-faint mt-1">V2 接口同步状态与调用日志</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-line text-sm text-ink-soft hover:bg-bg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      {data && (
        <>
          {/* 状态卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="p-5 rounded-2xl bg-card border border-line shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                {data.v2_healthy ? (
                  <Wifi className="w-6 h-6 text-success" />
                ) : (
                  <WifiOff className="w-6 h-6 text-danger" />
                )}
                <p className="font-semibold text-ink">V2 服务状态</p>
              </div>
              <p className={`text-lg font-bold ${data.v2_healthy ? "text-success" : "text-danger"}`}>
                {data.v2_healthy ? "正常运行" : "不可用"}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-card border border-line shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <Clock className="w-6 h-6 text-info" />
                <p className="font-semibold text-ink">最近同步</p>
              </div>
              <p className="text-sm text-ink-soft">
                {data.last_sync_at
                  ? new Date(data.last_sync_at).toLocaleString("zh-CN")
                  : "暂无记录"}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-card border border-line shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <Activity className="w-6 h-6 text-jingtian" />
                <p className="font-semibold text-ink">24h 成功率</p>
              </div>
              <p className="text-lg font-bold text-ink">
                {data.stats_24h.total > 0 ? (
                  <span className={parseFloat(data.stats_24h.success_rate) >= 90 ? "text-success" : "text-warn"}>
                    {data.stats_24h.success_rate}%
                  </span>
                ) : "N/A"}
                <span className="text-sm text-ink-faint font-normal ml-2">
                  ({data.stats_24h.success}/{data.stats_24h.total})
                </span>
              </p>
            </div>
          </div>

          {/* 调用日志 */}
          <div className="p-5 rounded-2xl bg-card border border-line shadow-sm">
            <h3 className="font-semibold text-ink mb-4">最近接口调用日志</h3>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line-soft">
                    <th className="text-left py-2 px-3 font-medium text-ink-faint">时间</th>
                    <th className="text-left py-2 px-3 font-medium text-ink-faint">Request ID</th>
                    <th className="text-left py-2 px-3 font-medium text-ink-faint">接口</th>
                    <th className="text-left py-2 px-3 font-medium text-ink-faint">方法</th>
                    <th className="text-center py-2 px-3 font-medium text-ink-faint">状态码</th>
                    <th className="text-center py-2 px-3 font-medium text-ink-faint">耗时</th>
                    <th className="text-center py-2 px-3 font-medium text-ink-faint">结果</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_logs.map((log) => (
                    <tr key={log.id} className="border-b border-line-soft hover:bg-bg transition-colors">
                      <td className="py-2 px-3 text-xs text-ink-soft">
                        {new Date(log.created_at).toLocaleString("zh-CN")}
                      </td>
                      <td className="py-2 px-3 text-xs font-mono text-ink-faint">
                        {log.request_id.slice(0, 16)}...
                      </td>
                      <td className="py-2 px-3 text-xs text-ink">{log.endpoint}</td>
                      <td className="py-2 px-3 text-xs">
                        <span className="px-1.5 py-0.5 rounded bg-bg text-ink-soft font-mono">{log.method}</span>
                      </td>
                      <td className="py-2 px-3 text-xs text-center">
                        {log.status_code || "—"}
                      </td>
                      <td className="py-2 px-3 text-xs text-center text-ink-faint">
                        {log.duration_ms ? `${log.duration_ms}ms` : "—"}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {log.success ? (
                          <CheckCircle2 className="w-4 h-4 text-success inline" />
                        ) : (
                          <XCircle className="w-4 h-4 text-danger inline" title={log.error_message} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.recent_logs.length === 0 && (
              <div className="py-8 text-center text-ink-faint text-sm">暂无调用记录</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
