"use client";

import { useState, useEffect } from "react";
import {
  ClipboardList,
  ScanLine,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Shield,
  Activity,
} from "lucide-react";
import Link from "next/link";

type DashboardStats = {
  total_tickets: number;
  pending_tickets: number;
  overdue_tickets: number;
  today_scans: number;
  qc_hold_count: number;
  completed_today: number;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    total_tickets: 0,
    pending_tickets: 0,
    overdue_tickets: 0,
    today_scans: 0,
    qc_hold_count: 0,
    completed_today: 0,
  });
  const [loading, setLoading] = useState(true);
  const [v2Status, setV2Status] = useState<boolean | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // 获取工单统计
        const [dashboardRes, monitorRes] = await Promise.all([
          fetch("/api/dashboard"),
          fetch("/api/monitor"),
        ]);
        const dashboardData = await dashboardRes.json();
        const monitorData = await monitorRes.json();

        setV2Status(monitorData.v2_healthy);
        setStats({
          total_tickets: dashboardData.total_tickets || 0,
          pending_tickets: dashboardData.pending_tickets || 0,
          overdue_tickets: dashboardData.overdue_tickets || 0,
          today_scans: dashboardData.today_scans || 0,
          qc_hold_count: dashboardData.qc_hold_count || 0,
          completed_today: dashboardData.completed_today || 0,
        });
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const cards = [
    {
      title: "总工单",
      value: stats.total_tickets,
      icon: ClipboardList,
      color: "text-jingtian",
      bg: "bg-jingtian-soft",
      href: "/tickets",
    },
    {
      title: "待处理",
      value: stats.pending_tickets,
      icon: AlertTriangle,
      color: "text-warn",
      bg: "bg-warn-bg",
      href: "/tickets?status=pending",
    },
    {
      title: "已超时",
      value: stats.overdue_tickets,
      icon: Clock,
      color: "text-danger",
      bg: "bg-danger-bg",
      href: "/tickets?overdue=true",
    },
    {
      title: "今日扫描",
      value: stats.today_scans,
      icon: ScanLine,
      color: "text-info",
      bg: "bg-info-bg",
      href: "/scan",
    },
    {
      title: "品控暂扣",
      value: stats.qc_hold_count,
      icon: Shield,
      color: "text-warn",
      bg: "bg-warn-bg",
      href: "/scan",
    },
    {
      title: "今日完成",
      value: stats.completed_today,
      icon: CheckCircle2,
      color: "text-success",
      bg: "bg-jingtian-soft",
      href: "/tickets?status=done",
    },
  ];

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      {/* 状态栏 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-ink">工作台</h2>
          <p className="text-sm text-ink-faint mt-1">运单全流程管理概览</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            v2Status === null ? "bg-line-soft text-ink-faint"
            : v2Status ? "bg-success/10 text-success"
            : "bg-danger-bg text-danger"
          }`}>
            <Activity className="w-3 h-3" />
            V2 服务: {v2Status === null ? "检测中" : v2Status ? "正常" : "不可用"}
          </div>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="p-4 rounded-2xl bg-card border border-line shadow-sm hover:border-jingtian/30 hover:shadow-md transition-all"
          >
            <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </div>
            <p className="text-2xl font-bold text-ink">{card.value}</p>
            <p className="text-xs text-ink-faint mt-1">{card.title}</p>
          </Link>
        ))}
      </div>

      {/* 快捷操作 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl bg-card border border-line shadow-sm">
          <h3 className="font-semibold text-ink mb-4 flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-jingtian" />
            扫描品控
          </h3>
          <p className="text-sm text-ink-soft mb-4">
            仓库扫描操作入口，自动触发品控规则引擎检测
          </p>
          <Link
            href="/scan"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-jingtian text-white text-sm font-medium hover:bg-jingtian-dark transition-colors"
          >
            进入扫描
          </Link>
        </div>

        <div className="p-6 rounded-2xl bg-card border border-line shadow-sm">
          <h3 className="font-semibold text-ink mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warn" />
            异常上报
          </h3>
          <p className="text-sm text-ink-soft mb-4">
            手工上报物流异常：丢件、破损、拒收、超时、地址错误
          </p>
          <Link
            href="/report"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-warn text-white text-sm font-medium hover:bg-warn/90 transition-colors"
          >
            发起上报
          </Link>
        </div>
      </div>

      {/* 流程说明 */}
      <div className="mt-8 p-6 rounded-2xl bg-card border border-line shadow-sm">
        <h3 className="font-semibold text-ink mb-4">运单全流程</h3>
        <div className="flex items-center gap-2 text-sm text-ink-soft flex-wrap">
          {["V2 录单解析", "仓库扫描", "品控检测", "异常上报", "分级审批", "执行联动", "完成"].map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-lg bg-bg text-ink-soft">{step}</span>
              {i < 6 && <TrendingUp className="w-4 h-4 text-jingtian" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
