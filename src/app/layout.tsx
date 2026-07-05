import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "运单全流程管理 - V3",
  description: "运单全生命周期管理：扫描品控 → 异常上报 → 分级审批 → 执行联动",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <div className="min-h-screen flex flex-col">
          <header className="bg-white border-b border-line sticky top-0 z-40">
            <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-jingtian to-jingtian-dark flex items-center justify-center text-white font-bold text-sm">
                V3
              </div>
              <h1 className="text-lg font-bold text-ink tracking-tight">
                运单全流程管理
                <span className="ml-2 text-sm font-normal text-ink-faint">录单 · 品控 · 审批 · 执行</span>
              </h1>
              <nav className="ml-auto flex items-center gap-1">
                <a href="/" className="px-3 py-1.5 rounded-lg text-sm text-ink-soft hover:bg-bg transition-colors">
                  工作台
                </a>
                <a href="/tickets" className="px-3 py-1.5 rounded-lg text-sm text-ink-soft hover:bg-bg transition-colors">
                  工单列表
                </a>
                <a href="/scan" className="px-3 py-1.5 rounded-lg text-sm text-ink-soft hover:bg-bg transition-colors">
                  扫描品控
                </a>
                <a href="/report" className="px-3 py-1.5 rounded-lg text-sm text-ink-soft hover:bg-bg transition-colors">
                  异常上报
                </a>
                <a href="/monitor" className="px-3 py-1.5 rounded-lg text-sm text-ink-soft hover:bg-bg transition-colors">
                  同步监控
                </a>
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
