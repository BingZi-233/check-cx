"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Clock } from "lucide-react";

interface HistoryRow {
  id: string;
  rule_id: string;
  channel_id: string;
  config_id: string;
  status: "sent" | "failed" | "skipped";
  error_message: string | null;
  triggered_at: string;
  alert_rules: { name: string } | null;
  alert_channels: { name: string; type: string } | null;
  check_configs: { name: string } | null;
}

const STATUS_STYLES: Record<string, string> = {
  sent:    "bg-emerald-500/10 text-emerald-600",
  failed:  "bg-red-500/10 text-red-600",
  skipped: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  sent: "已发送", failed: "失败", skipped: "冷却中",
};

export default function AlertHistoryPage() {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: "100" });
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/admin/alerts/history?${params}`);
    if (res.ok) setHistory(await res.json());
  }, [statusFilter]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">告警历史</h1>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            自动刷新
          </span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="">全部状态</option>
            <option value="sent">已发送</option>
            <option value="failed">失败</option>
            <option value="skipped">冷却中</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {["触发时间", "规则", "渠道", "配置", "状态", "错误信息"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {history.map((row) => (
              <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(row.triggered_at).toLocaleString("zh-CN")}
                </td>
                <td className="px-3 py-2 text-sm">{row.alert_rules?.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {row.alert_channels ? `${row.alert_channels.name} (${row.alert_channels.type})` : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{row.check_configs?.name ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[row.status] ?? ""}`}>
                    {STATUS_LABELS[row.status] ?? row.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                  {row.error_message ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {history.length === 0 && (
          <div className="py-16 text-center">
            <Clock className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-3 text-sm font-medium">暂无告警历史</p>
            <p className="mt-1 text-xs text-muted-foreground">告警触发后将在此处显示记录</p>
          </div>
        )}
      </div>
    </div>
  );
}
