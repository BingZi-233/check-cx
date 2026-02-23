import type { ReactNode } from "react";
import { Server, Activity, AlertCircle, Zap, Wrench, Clock, BellRing, Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AdminStatsCharts,
  type HistoryRow,
  type AvailabilityRow,
  type StatusDistributionRow,
  type HourlyFailureRow,
} from "@/components/admin/stats-charts";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

async function loadStats() {
  const admin = createAdminClient();
  const yesterday = new Date(Date.now() - 86400_000).toISOString();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const [activeRes, maintenanceRes, failRes, availRes, latencyRes, recentStatusRes, hourlyFailRes] =
    await Promise.all([
      admin.from("check_configs").select("id", { count: "exact", head: true }).eq("enabled", true).eq("is_maintenance", false),
      admin.from("check_configs").select("id", { count: "exact", head: true }).eq("enabled", true).eq("is_maintenance", true),
      admin.from("check_history").select("id", { count: "exact", head: true }).eq("status", "failed").gte("checked_at", yesterday),
      admin.from("availability_stats").select("config_id,availability_pct").eq("period", "30d"),
      admin.from("check_history").select("config_id,latency_ms,checked_at,check_configs(name)").not("latency_ms", "is", null).order("checked_at", { ascending: false }).limit(300),
      admin.from("check_history").select("config_id,status,checked_at").order("checked_at", { ascending: false }).limit(200),
      admin.from("check_history").select("status,checked_at").gte("checked_at", yesterday).in("status", ["failed", "degraded"]),
    ]);

  // Alert tables may not exist before migration is applied
  let activeAlertRules = 0;
  let alertsSentToday = 0;
  const [rulesRes, histRes] = await Promise.all([
    admin.from("alert_rules").select("id", { count: "exact", head: true }).eq("enabled", true),
    admin.from("alert_history").select("id", { count: "exact", head: true }).eq("status", "sent").gte("triggered_at", todayStart),
  ]);
  if (!rulesRes.error) activeAlertRules = rulesRes.count ?? 0;
  if (!histRes.error) alertsSentToday = histRes.count ?? 0;

  const availRows = (availRes.data ?? []) as unknown as AvailabilityRow[];
  const globalAvailability =
    availRows.length > 0
      ? availRows.reduce((s, r) => s + (r.availability_pct ?? 0), 0) / availRows.length
      : null;

  const latencyData = latencyRes.data ?? [];
  const validLatencies = latencyData.filter((r) => r.latency_ms);
  const avgLatency =
    validLatencies.length > 0
      ? Math.round(validLatencies.reduce((s, r) => s + (r.latency_ms ?? 0), 0) / validLatencies.length)
      : null;

  const topLatency = latencyData.reduce(
    (best: { latency_ms: number; name: string } | null, row) => {
      if (!row.latency_ms) return best;
      const name = (row.check_configs as unknown as { name: string } | null)?.name ?? "未知";
      return !best || row.latency_ms > best.latency_ms ? { latency_ms: row.latency_ms, name } : best;
    },
    null
  );

  // Latest status per config → distribution
  const latestByConfig = new Map<string, string>();
  for (const row of recentStatusRes.data ?? []) {
    if (!latestByConfig.has(row.config_id)) latestByConfig.set(row.config_id, row.status);
  }
  const statusCounts: Record<string, number> = {};
  for (const status of latestByConfig.values()) {
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }
  const statusDistribution: StatusDistributionRow[] = Object.entries(statusCounts).map(
    ([status, count]) => ({ status, count })
  );

  // 24h hourly failure/degraded distribution
  const hourlyMap = new Map<number, number>();
  for (let h = 0; h < 24; h++) hourlyMap.set(h, 0);
  for (const row of hourlyFailRes.data ?? []) {
    const h = new Date(row.checked_at).getHours();
    hourlyMap.set(h, (hourlyMap.get(h) ?? 0) + 1);
  }
  const hourlyFailures: HourlyFailureRow[] = Array.from(hourlyMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour, count]) => ({ hour: `${String(hour).padStart(2, "0")}:00`, count }));

  return {
    activeConfigs: activeRes.count ?? 0,
    maintenanceConfigs: maintenanceRes.count ?? 0,
    failureCount: failRes.count ?? 0,
    globalAvailability,
    avgLatency,
    topLatency,
    activeAlertRules,
    alertsSentToday,
    history: latencyData,
    availability: availRows,
    statusDistribution,
    hourlyFailures,
  };
}

function availabilityColor(v: number | null) {
  if (v == null) return "";
  if (v >= 99) return "text-emerald-500";
  if (v >= 95) return "text-yellow-500";
  return "text-red-500";
}

function StatCard({
  title, value, sub, icon, iconBg, valueClass,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
  iconBg: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <div className={cn("rounded-md p-1.5", iconBg)}>{icon}</div>
        </div>
      </CardHeader>
      <CardContent>
        <p className={cn("text-3xl font-bold", valueClass)}>{value}</p>
        {sub && <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default async function AdminDashboardPage() {
  const stats = await loadStats();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">概览</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="活跃配置"
          value={stats.activeConfigs}
          icon={<Server className="h-3.5 w-3.5 text-blue-500" />}
          iconBg="bg-blue-500/10"
        />
        <StatCard
          title="30d 全局可用率"
          value={stats.globalAvailability != null ? `${stats.globalAvailability.toFixed(1)}%` : "—"}
          icon={<Activity className="h-3.5 w-3.5 text-emerald-500" />}
          iconBg="bg-emerald-500/10"
          valueClass={availabilityColor(stats.globalAvailability)}
        />
        <StatCard
          title="24h 故障次数"
          value={stats.failureCount}
          icon={
            <AlertCircle
              className={cn("h-3.5 w-3.5", stats.failureCount > 0 ? "text-red-500" : "text-muted-foreground")}
            />
          }
          iconBg={stats.failureCount > 0 ? "bg-red-500/10" : "bg-muted"}
          valueClass={stats.failureCount > 0 ? "text-red-500" : undefined}
        />
        <StatCard
          title="维护中"
          value={stats.maintenanceConfigs}
          icon={
            <Wrench
              className={cn("h-3.5 w-3.5", stats.maintenanceConfigs > 0 ? "text-amber-500" : "text-muted-foreground")}
            />
          }
          iconBg={stats.maintenanceConfigs > 0 ? "bg-amber-500/10" : "bg-muted"}
          valueClass={stats.maintenanceConfigs > 0 ? "text-amber-500" : undefined}
        />
        <StatCard
          title="平均延迟"
          value={stats.avgLatency != null ? `${stats.avgLatency} ms` : "—"}
          icon={<Clock className="h-3.5 w-3.5 text-violet-500" />}
          iconBg="bg-violet-500/10"
        />
        <StatCard
          title="最高延迟"
          value={stats.topLatency ? `${stats.topLatency.latency_ms} ms` : "—"}
          sub={stats.topLatency?.name}
          icon={<Zap className="h-3.5 w-3.5 text-amber-500" />}
          iconBg="bg-amber-500/10"
        />
        <StatCard
          title="活跃告警规则"
          value={stats.activeAlertRules}
          icon={<BellRing className="h-3.5 w-3.5 text-purple-500" />}
          iconBg="bg-purple-500/10"
        />
        <StatCard
          title="今日告警"
          value={stats.alertsSentToday}
          icon={
            <Bell
              className={cn("h-3.5 w-3.5", stats.alertsSentToday > 0 ? "text-orange-500" : "text-muted-foreground")}
            />
          }
          iconBg={stats.alertsSentToday > 0 ? "bg-orange-500/10" : "bg-muted"}
          valueClass={stats.alertsSentToday > 0 ? "text-orange-500" : undefined}
        />
      </div>
      <AdminStatsCharts
        history={stats.history as unknown as HistoryRow[]}
        availability={stats.availability}
        statusDistribution={stats.statusDistribution}
        hourlyFailures={stats.hourlyFailures}
      />
    </div>
  );
}
