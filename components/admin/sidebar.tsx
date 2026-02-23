"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Settings, Bell, Users, LogOut, Activity, Radio, Zap, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "概览", icon: LayoutDashboard, exact: true },
  { href: "/admin/configs", label: "配置管理", icon: Settings },
  { href: "/admin/groups", label: "分组管理", icon: Users },
  { href: "/admin/notifications", label: "通知管理", icon: Bell },
];

const ALERTS_NAV = [
  { href: "/admin/alerts/channels", label: "告警渠道", icon: Radio },
  { href: "/admin/alerts/rules", label: "告警规则", icon: Zap },
  { href: "/admin/alerts/history", label: "告警历史", icon: Clock },
];

function NavItem({
  href,
  label,
  icon: Icon,
  exact,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md py-2 pr-3 text-sm transition-colors",
        "border-l-2 pl-[10px]",
        active
          ? "border-primary bg-accent text-accent-foreground font-medium"
          : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}

interface AdminSidebarProps {
  mobileClose?: () => void;
}

export function AdminSidebar({ mobileClose }: AdminSidebarProps = {}) {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/admin/auth/signout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
          <Activity className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Check CX</span>
        {mobileClose ? (
          <button
            onClick={mobileClose}
            className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="关闭菜单"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <span className="ml-auto rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Admin</span>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 pt-3">
        {NAV.map((item) => <NavItem key={item.href} {...item} />)}

        <div className="h-px bg-border my-2" />
        <p className="px-[12px] pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">告警</p>
        {ALERTS_NAV.map((item) => <NavItem key={item.href} {...item} />)}
      </nav>

      <div className="border-t border-border p-2 pb-3">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2.5 rounded-md border-l-2 border-transparent py-2 pl-[10px] pr-3 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          退出登录
        </button>
      </div>
    </aside>
  );
}
