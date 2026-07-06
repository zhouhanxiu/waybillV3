"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  ScanLine,
  AlertTriangle,
  CheckCircle,
  FileText,
  ShieldCheck,
  Timer,
  GitBranch,
  Activity,
  UserCheck,
  Users,
  Settings,
  LogOut,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";

type AuthUser = {
  id: string;
  name: string;
  display_name: string;
  roles: string[];
};

const menuGroups = [
  {
    label: "业务中心",
    items: [
      { href: "/", label: "工作台", icon: LayoutDashboard },
      { href: "/tickets", label: "工单列表", icon: ClipboardList },
      { href: "/scan", label: "扫描品控", icon: ScanLine },
      { href: "/report", label: "异常上报", icon: AlertTriangle },
    ],
  },
  {
    label: "审批中心",
    items: [
      { href: "/my-approvals", label: "我自己审批", icon: UserCheck, roles: ["admin", "level1_approver", "level2_approver"] },
    ],
  },
  {
    label: "执行联动",
    items: [
      { href: "/executions", label: "执行记录", icon: CheckCircle },
    ],
  },
  {
    label: "规则配置",
    items: [
      { href: "/config/qc", label: "品控规则", icon: ShieldCheck },
      { href: "/config/approval", label: "审批分级", icon: GitBranch },
      { href: "/config/timeout", label: "超时规则", icon: Timer },
      { href: "/config/flow", label: "审批流", icon: Settings },
    ],
  },
  {
    label: "系统管理",
    items: [
      { href: "/monitor", label: "同步监控", icon: Activity },
      { href: "/users", label: "用户管理", icon: Users, roles: ["admin"] },
    ],
  },
];

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    业务中心: true,
    审批中心: true,
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        setUser(d.user);
        setLoading(false);
        if (!d.user) router.push("/login");
      })
      .catch(() => { setLoading(false); router.push("/login"); });
  }, [router]);

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin w-8 h-8 border-2 border-jingtian border-t-transparent rounded-full" /></div>;
  if (!user) return null;

  const handleLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
  };

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const filteredGroups = menuGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (!item.roles) return true;
      if (!user) return false;
      return item.roles.some((r) => user.roles.includes(r));
    }),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 移动端遮罩 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* 左侧菜单 */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 bg-white border-r border-line flex flex-col transition-all duration-200 ${
          mobileOpen ? "w-60" : collapsed ? "w-[68px]" : "w-60"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center gap-3 px-4 border-b border-line shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-jingtian to-jingtian-dark flex items-center justify-center text-white font-bold text-sm shrink-0">
            V3
          </div>
          {!collapsed && (
            <span className="text-sm font-bold text-ink whitespace-nowrap">运单全流程管理</span>
          )}
          <button
            className="ml-auto p-1 rounded-md hover:bg-bg lg:block hidden"
            onClick={() => setCollapsed(!collapsed)}
          >
            <Menu className="w-4 h-4 text-ink-faint" />
          </button>
          <button
            className="ml-auto p-1 rounded-md hover:bg-bg lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <X className="w-4 h-4 text-ink-faint" />
          </button>
        </div>

        {/* 菜单 */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {filteredGroups.map((group) => (
            <div key={group.label} className="mb-1">
              {!collapsed && (
                <button
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] font-medium text-ink-faint uppercase tracking-wider hover:text-ink-soft transition-colors"
                  onClick={() => toggleGroup(group.label)}
                >
                  {expandedGroups[group.label] ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  {group.label}
                </button>
              )}
              {(collapsed || expandedGroups[group.label] !== false) &&
                group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all mb-0.5 group ${
                      isActive(item.href)
                        ? "bg-jingtian-soft text-jingtian font-medium"
                        : "text-ink-soft hover:bg-bg hover:text-ink"
                    }`}
                    title={collapsed ? item.label : undefined}
                    onClick={() => setMobileOpen(false)}
                  >
                    <item.icon className={`w-4 h-4 shrink-0 ${isActive(item.href) ? "text-jingtian" : "text-ink-faint group-hover:text-ink-soft"}`} />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                ))}
            </div>
          ))}
        </nav>

        {/* 底部用户信息 */}
        {user && (
          <div className="border-t border-line p-3 shrink-0">
            <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
              <div className="w-7 h-7 rounded-full bg-jingtian-soft text-jingtian flex items-center justify-center text-xs font-bold shrink-0">
                {user.name[0]?.toUpperCase()}
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-ink truncate">{user.display_name || user.name}</p>
                  <p className="text-[10px] text-ink-faint truncate">{user.roles.join(", ")}</p>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-md hover:bg-danger-bg text-ink-faint hover:text-danger transition-colors shrink-0"
                title="退出登录"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* 右侧内容 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 顶部栏 */}
        <header className="h-14 bg-white border-b border-line flex items-center px-4 gap-4 shrink-0">
          <button
            className="p-1.5 rounded-md hover:bg-bg lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5 text-ink-soft" />
          </button>

          {/* 面包屑 */}
          <div className="text-xs text-ink-faint flex items-center gap-1.5">
            {pathname
              .split("/")
              .filter(Boolean)
              .map((seg, i, arr) => {
                const labelMap: Record<string, string> = {
                  tickets: "工单列表",
                  scan: "扫描品控",
                  report: "异常上报",
                  monitor: "同步监控",
                  users: "用户管理",
                  "my-approvals": "我自己审批",
                  executions: "执行记录",
                  config: "规则配置",
                  qc: "品控规则",
                  approval: "审批分级",
                  timeout: "超时规则",
                  flow: "审批流",
                };
                const label = labelMap[seg] || seg;
                return (
                  <span key={seg} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-line">/</span>}
                    <span className={i === arr.length - 1 ? "text-ink-soft" : ""}>{label}</span>
                  </span>
                );
              })}
            {pathname === "/" && <span>工作台</span>}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-ink-faint">
              {user?.display_name || user?.name || ""}
            </span>
          </div>
        </header>

        {/* 主内容 */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
