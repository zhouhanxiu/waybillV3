"use client";

import { useState } from "react";
import SidebarLayout from "@/components/SidebarLayout";
import QcRulesTab from "./QcRulesTab";
import ApprovalRulesTab from "./ApprovalRulesTab";
import TimeoutRulesTab from "./TimeoutRulesTab";
import { ShieldCheck, GitBranch, Timer } from "lucide-react";

type TabKey = "qc" | "approval" | "timeout";

const tabs: { key: TabKey; label: string; icon: any; desc: string }[] = [
  { key: "qc", label: "品控规则", icon: ShieldCheck, desc: "扫描触发规则" },
  { key: "approval", label: "审批分级", icon: GitBranch, desc: "按金额定级别" },
  { key: "timeout", label: "超时规则", icon: Timer, desc: "超时自动动作" },
];

export default function RulesConfigPage() {
  const [active, setActive] = useState<TabKey>("qc");

  return (
    <SidebarLayout>
      <div className="p-6 max-w-[1200px] mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-ink">规则配置</h2>
          <p className="text-sm text-ink-faint mt-0.5">统一管理品控规则、审批分级、超时规则，规则串接流程：品控命中 → 审批分级 → 超时处理</p>
        </div>

        <div className="flex gap-2 mb-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                active === t.key
                  ? "bg-jingtian text-white border-jingtian shadow-sm"
                  : "bg-white text-ink-soft border-line hover:border-jingtian/30 hover:text-ink"
              }`}
            >
              <t.icon className="w-4 h-4" />
              <span>{t.label}</span>
              <span className={`text-xs ${active === t.key ? "text-white/80" : "text-ink-faint"}`}>{t.desc}</span>
            </button>
          ))}
        </div>

        {active === "qc" && <QcRulesTab />}
        {active === "approval" && <ApprovalRulesTab />}
        {active === "timeout" && <TimeoutRulesTab />}
      </div>
    </SidebarLayout>
  );
}
