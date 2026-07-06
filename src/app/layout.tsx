import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "运单全流程管理 - V3",
  description: "运单全生命周期管理：扫描品控 → 异常上报 → 分级审批 → 执行联动",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
