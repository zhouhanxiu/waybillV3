"use client";

import { useState } from "react";
import { ScanLine, CheckCircle2, AlertTriangle, Shield, X } from "lucide-react";
import SidebarLayout from "@/components/SidebarLayout";

type ScanResult = {
  id?: string;
  result: "pass" | "fail";
  ticket_id?: string;
  exception_subtype?: string;
  severity?: string;
  reason?: string;
  message: string;
  existing_ticket?: string;
};

const EXCEPTION_TYPE_MAP: Record<string, string> = {
  qty_mismatch: "数量不符",
  appearance: "外观破损",
  spec_mismatch: "规格不符",
  label_error: "标签错误",
  batch_error: "批次异常",
};

export default function ScanPage() {
  const [form, setForm] = useState({
    external_code: "",
    sku_code: "",
    sku_name: "",
    operator: "operator_01",
    expected_qty: "",
    actual_qty: "",
    damage_level: "0",
    spec_match: true,
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");

  // 快速放行表单
  const [fastRelease, setFastRelease] = useState({ scan_id: "", operator: "qc_supervisor", reason: "" });
  const [fastReleasing, setFastReleasing] = useState(false);

  const handleScan = async () => {
    if (!form.external_code || !form.sku_code) {
      setError("请填写运单号和 SKU 编码");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          external_code: form.external_code,
          sku_code: form.sku_code,
          sku_name: form.sku_name || form.sku_code,
          operator: form.operator,
          expected_qty: parseInt(form.expected_qty) || 0,
          actual_qty: parseInt(form.actual_qty) || parseInt(form.expected_qty) || 0,
          damage_level: parseInt(form.damage_level) || 0,
          spec_match: form.spec_match,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "扫描失败");
      } else {
        setResult(data);
        // 扫描成功时自动把 scan_id 带到快速放行表单
        if (data.id) {
          setFastRelease((f) => ({ ...f, scan_id: data.id }));
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFastRelease = async () => {
    if (!fastRelease.scan_id || !fastRelease.reason) {
      setError("请填写扫描记录 ID 和放行原因");
      return;
    }
    setFastReleasing(true);
    setError("");

    try {
      const res = await fetch("/api/scan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fastRelease),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "快速放行失败");
      } else {
        setResult({ result: "pass", id: fastRelease.scan_id, message: "快速放行成功" });
        setFastRelease({ scan_id: "", operator: "qc_supervisor", reason: "" });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFastReleasing(false);
    }
  };

  return (
    <SidebarLayout>
    <div className="p-6 max-w-[1000px] mx-auto">
      <h2 className="text-2xl font-bold text-ink mb-2">扫描品控</h2>
      <p className="text-sm text-ink-faint mb-8">仓库扫描录入，自动触发品控规则引擎检测</p>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-danger-bg border border-danger/20 text-danger text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError("")} className="p-1 hover:bg-danger/10 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 扫描结果 */}
      {result && (
        <div className={`mb-6 p-6 rounded-2xl border ${
          result.result === "pass" ? "bg-success/5 border-success/20" : "bg-warn-bg border-warn/20"
        }`}>
          <div className="flex items-center gap-3 mb-3">
            {result.result === "pass" ? (
              <CheckCircle2 className="w-8 h-8 text-success" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-warn" />
            )}
            <div>
              <p className="font-semibold text-ink">
                {result.result === "pass" ? "品控通过" : "品控异常"}
              </p>
              <p className="text-sm text-ink-soft">{result.message}</p>
            </div>
          </div>
          {result.id && (
            <div className="mt-3 p-3 rounded-xl bg-white/50 text-sm">
              <p>扫描记录 ID: <code className="text-jingtian-dark">{result.id}</code></p>
              {result.ticket_id && (
                <>
                  <p className="mt-1">工单 ID: <code className="text-jingtian-dark">{result.ticket_id}</code></p>
                  {result.exception_subtype && (
                    <p className="mt-1">异常子类型: {EXCEPTION_TYPE_MAP[result.exception_subtype] || result.exception_subtype}</p>
                  )}
                  {result.severity && <p>严重度: {result.severity}</p>}
                  {result.reason && <p className="text-ink-faint mt-1">{result.reason}</p>}
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 扫描表单 */}
        <div className="p-6 rounded-2xl bg-card border border-line shadow-sm">
          <h3 className="font-semibold text-ink mb-4 flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-jingtian" />
            扫描录入
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">运单号 *</label>
              <input
                type="text"
                value={form.external_code}
                onChange={(e) => setForm((f) => ({ ...f, external_code: e.target.value }))}
                placeholder="输入运单号"
                className="w-full px-4 py-2.5 rounded-xl border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-jingtian/20 transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1">SKU 编码 *</label>
                <input
                  type="text"
                  value={form.sku_code}
                  onChange={(e) => setForm((f) => ({ ...f, sku_code: e.target.value }))}
                  placeholder="SKU 编码"
                  className="w-full px-4 py-2.5 rounded-xl border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-jingtian/20 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1">SKU 名称</label>
                <input
                  type="text"
                  value={form.sku_name}
                  onChange={(e) => setForm((f) => ({ ...f, sku_name: e.target.value }))}
                  placeholder="SKU 名称"
                  className="w-full px-4 py-2.5 rounded-xl border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-jingtian/20 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1">期望数量</label>
                <input
                  type="number"
                  value={form.expected_qty}
                  onChange={(e) => setForm((f) => ({ ...f, expected_qty: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-jingtian/20 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1">实际数量</label>
                <input
                  type="number"
                  value={form.actual_qty}
                  onChange={(e) => setForm((f) => ({ ...f, actual_qty: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-jingtian/20 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">破损等级 (0-5)</label>
              <input
                type="range"
                min="0"
                max="5"
                value={form.damage_level}
                onChange={(e) => setForm((f) => ({ ...f, damage_level: e.target.value }))}
                className="w-full accent-jingtian"
              />
              <div className="flex justify-between text-xs text-ink-faint mt-1">
                <span>0 (完好)</span>
                <span>当前: {form.damage_level}</span>
                <span>5 (严重)</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-ink-soft">规格匹配</label>
              <button
                onClick={() => setForm((f) => ({ ...f, spec_match: !f.spec_match }))}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  form.spec_match ? "bg-success/10 text-success" : "bg-danger-bg text-danger"
                }`}
              >
                {form.spec_match ? "匹配" : "不匹配"}
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">操作人</label>
              <input
                type="text"
                value={form.operator}
                onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-jingtian/20 transition-all"
              />
            </div>

            <button
              onClick={handleScan}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-jingtian text-white font-medium hover:bg-jingtian-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <ScanLine className="w-5 h-5" />
              {loading ? "扫描检测中..." : "执行扫描"}
            </button>
          </div>
        </div>

        {/* 快速放行 */}
        <div className="p-6 rounded-2xl bg-card border border-line shadow-sm">
          <h3 className="font-semibold text-ink mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-warn" />
            品控主管快速放行
          </h3>
          <p className="text-sm text-ink-soft mb-4">
            仅品控主管可操作，用于误判快速放行。操作需留痕记录。
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">扫描记录 ID</label>
              <input
                type="text"
                value={fastRelease.scan_id}
                onChange={(e) => setFastRelease((f) => ({ ...f, scan_id: e.target.value }))}
                placeholder="输入扫描记录 ID"
                className="w-full px-4 py-2.5 rounded-xl border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-jingtian/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">操作人（品控主管）</label>
              <input
                type="text"
                value={fastRelease.operator}
                onChange={(e) => setFastRelease((f) => ({ ...f, operator: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-jingtian/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">放行原因 *</label>
              <textarea
                value={fastRelease.reason}
                onChange={(e) => setFastRelease((f) => ({ ...f, reason: e.target.value }))}
                placeholder="请详细说明误判复核原因"
                rows={3}
                className="w-full px-4 py-2.5 rounded-xl border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-jingtian/20 transition-all resize-none"
              />
            </div>
            <button
              onClick={handleFastRelease}
              disabled={fastReleasing}
              className="w-full py-3 rounded-xl bg-warn text-white font-medium hover:bg-warn/90 transition-colors disabled:opacity-50"
            >
              {fastReleasing ? "处理中..." : "确认快速放行"}
            </button>
          </div>
        </div>
      </div>
    </div>
    </SidebarLayout>
  );
}
