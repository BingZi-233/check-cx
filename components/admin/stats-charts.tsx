"use client";

import { useMemo, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface HistoryRow {
  config_id: string;
  latency_ms: number;
  checked_at: string;
  check_configs: { name: string } | null;
}

export interface AvailabilityRow {
  config_id: string;
  availability_pct: number | null;
}

export interface StatusDistributionRow {
  status: string;
  count: number;
}

export interface HourlyFailureRow {
  hour: string;
  count: number;
}

const LINE_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6"];

const STATUS_COLORS: Record<string, string> = {
  operational: "#10b981",
  degraded: "#f59e0b",
  failed: "#ef4444",
  maintenance: "#64748b",
};

const STATUS_LABELS: Record<string, string> = {
  operational: "正常",
  degraded: "降级",
  failed: "故障",
  maintenance: "维护",
};

export function AdminStatsCharts({
  history,
  availability,
  statusDistribution,
  hourlyFailures,
}: {
  history: HistoryRow[];
  availability: AvailabilityRow[];
  statusDistribution: StatusDistributionRow[];
  hourlyFailures: HourlyFailureRow[];
}) {
  const colorRef = useRef<Map<string, string>>(new Map());

  const getColor = (id: string) => {
    if (!colorRef.current.has(id)) {
      colorRef.current.set(id, LINE_COLORS[colorRef.current.size % LINE_COLORS.length]);
    }
    return colorRef.current.get(id)!;
  };

  const latencyData = useMemo(() => {
    const byConfig = new Map<string, { name: string; points: { t: number; v: number }[] }>();
    history.forEach((row) => {
      if (!row.latency_ms) return;
      const name = row.check_configs?.name ?? row.config_id.slice(0, 8);
      if (!byConfig.has(row.config_id)) byConfig.set(row.config_id, { name, points: [] });
      byConfig.get(row.config_id)!.points.push({ t: new Date(row.checked_at).getTime(), v: row.latency_ms });
    });

    const allTimes = [...new Set(history.map((r) => new Date(r.checked_at).getTime()))].sort().slice(-30);
    return allTimes.map((t) => {
      const entry: Record<string, number | string> = {
        time: new Date(t).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      };
      byConfig.forEach(({ name, points }, id) => {
        const closest = points.find((p) => Math.abs(p.t - t) < 120_000);
        if (closest) entry[id] = closest.v;
        void name;
      });
      return entry;
    });
  }, [history]);

  const configIds = useMemo(() => [...new Set(history.map((r) => r.config_id))], [history]);

  const availData = useMemo(
    () =>
      availability
        .filter((r) => r.availability_pct != null)
        .map((r) => {
          const name = history.find((h) => h.config_id === r.config_id)?.check_configs?.name ?? r.config_id.slice(0, 8);
          return { name, value: Number((r.availability_pct ?? 0).toFixed(1)) };
        })
        .sort((a, b) => b.value - a.value),
    [availability, history]
  );

  const hasAnyFailure = hourlyFailures.some((r) => r.count > 0);

  if (!latencyData.length && !availData.length && !statusDistribution.length) return null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {latencyData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">延迟趋势（近 30 次）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={latencyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} unit=" ms" />
                  <Tooltip />
                  {configIds.map((id) => (
                    <Line key={id} type="monotone" dataKey={id} stroke={getColor(id)} dot={false} strokeWidth={1.5} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {availData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">30d 可用率</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={availData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {statusDistribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">当前状态分布</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={80}
                    dataKey="count"
                    nameKey="status"
                  >
                    {statusDistribution.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#94a3b8"} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, n) => [v, STATUS_LABELS[n as string] ?? n]}
                  />
                  <Legend
                    formatter={(v) => STATUS_LABELS[v] ?? v}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {hasAnyFailure && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">24h 故障/降级分布</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyFailures}>
                  <defs>
                    <linearGradient id="failGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={3} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#ef4444"
                    fill="url(#failGradient)"
                    strokeWidth={1.5}
                    name="次数"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
