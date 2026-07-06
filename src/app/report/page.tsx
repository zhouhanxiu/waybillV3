"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Send, CheckCircle2, X } from "lucide-react";
import SidebarLayout from "@/components/SidebarLayout";

const EXCEPTION_TYPES = [
  { value: "lost", label: "丢件", desc: "运单在运输途中丢失" },
  { value: "damaged", label: "破损", desc: "货物在运输中损坏" },
  { value: "rejected", label: "客户拒收", desc: "客户拒绝签收" },
  { value: "timeout", label: "超时未签收", desc: "超出预计签收时间" },
  { value: "wrong_address", label: "地址错误", desc: "收货地址信息错误" },
];

const SEVERITY_OPTIONS = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "critical", label: "严重" },
];

export default function ReportPage() {
  const [form, setForm] = useState({
    external_code: "",
    exception_type: "lost",
    severity: "medium",
    description: "",
    amount: "",
    reporter: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ id: string; status: string } | null>(null);

  // 获取当前登录用户并设置上报人
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        const user = d.user;
        if (user) {
          setForm((f) => ({ ...f, reporter: user.name }));
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!form.external_code || !form.exception_type || !form.reporter) {
      setError("请填写运单号、异常类型和上报人");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess(null);

    try {
      // 先获取运单快照
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          external_code: form.external_code,
          exception_type: form.exception_type,
          source: "manual",
          severity: form.severity,
          description: form.description,
          amount: parseFloat(form.amount) || 0,
          reporter: form.reporter,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "上报失败");
      } else {
        setSuccess({ id: data.id, status: data.status });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SidebarLayout>
    <div className="p-6 max-w-[700px] mx-auto">
      <h2 className="text-2xl font-bold text-ink mb-2">异常上报</h2>
      <p className="text-sm text-ink-faint mb-8">手工上报物流异常，创建异常工单进入分级审批流程</p>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-danger-bg border border-danger/20 text-danger text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError("")} className="p-1 hover:bg-danger/10 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="mb-6 p-6 rounded-2xl bg-success/5 border border-success/20">
          <div className="flex items-center gap-3 mb-3">
            <CheckCircle2 className="w-8 h-8 text-success" />
            <div>
              <p className="font-semibold text-ink">上报成功</p>
              <p className="text-sm text-ink-soft">工单 ID: <code className="text-jingtian-dark">{success.id}</code></p>
              <p className="text-sm text-ink-soft">当前状态: {success.status}</p>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 rounded-2xl bg-card border border-line shadow-sm">
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">运单号 *</label>
            <input
              type="text"
              value={form.external_code}
              onChange={(e) => setForm((f) => ({ ...f, external_code: e.target.value }))}
              placeholder="输入运单号（需为 V2 中真实存在的运单）"
              className="w-full px-4 py-2.5 rounded-xl border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-jingtian/20 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft mb-2">异常类型 *</label>
            <div className="grid grid-cols-2 gap-2">
              {EXCEPTION_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setForm((f) => ({ ...f, exception_type: t.value }))}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    form.exception_type === t.value
                      ? "border-warn bg-warn-bg"
                      : "border-line hover:border-warn/30"
                  }`}
                >
                  <p className="font-medium text-sm text-ink">{t.label}</p>
                  <p className="text-xs text-ink-faint mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">严重度</label>
              <select
                value={form.severity}
                onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-jingtian/20 transition-all"
              >
                {SEVERITY_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">涉及金额 (¥)</label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full px-4 py-2.5 rounded-xl border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-jingtian/20 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">异常描述</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="请详细描述异常情况..."
              rows={4}
              className="w-full px-4 py-2.5 rounded-xl border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-jingtian/20 transition-all resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">上报人 *</label>
            <input
              type="text"
              value={form.reporter}
              onChange={(e) => setForm((f) => ({ ...f, reporter: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl border border-line bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-jingtian/20 transition-all"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-warn text-white font-medium hover:bg-warn/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Send className="w-5 h-5" />
            {loading ? "提交中..." : "提交异常工单"}
          </button>
        </div>
      </div>
    </div>
    </SidebarLayout>
  );
}
