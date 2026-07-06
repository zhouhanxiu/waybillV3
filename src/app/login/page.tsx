"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "登录失败");
        return;
      }
      router.push("/");
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-jingtian to-jingtian-dark flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4">
            V3
          </div>
          <h1 className="text-xl font-bold text-ink">运单全流程管理</h1>
          <p className="text-sm text-ink-faint mt-1">录单 · 品控 · 审批 · 执行</p>
        </div>

        <form onSubmit={handleLogin} className="bg-card rounded-2xl border border-line p-6 shadow-sm">
          <h2 className="text-base font-semibold text-ink mb-4">登录</h2>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger-bg text-danger text-sm">{error}</div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1.5">用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-line bg-bg text-sm focus:outline-none focus:border-jingtian focus:ring-1 focus:ring-jingtian/20"
                placeholder="admin"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1.5">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-line bg-bg text-sm focus:outline-none focus:border-jingtian focus:ring-1 focus:ring-jingtian/20"
                placeholder="admin"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-jingtian text-white text-sm font-medium hover:bg-jingtian-dark transition-colors disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              {loading ? "登录中..." : "登录"}
            </button>
          </div>
          <p className="mt-4 text-xs text-ink-faint text-center">默认账号: admin / admin</p>
        </form>
      </div>
    </div>
  );
}
