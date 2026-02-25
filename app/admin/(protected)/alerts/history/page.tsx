"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Clock, Search, Trash2, Eye, Loader2 } from "lucide-react";
import { Pagination } from "@/components/admin/pagination";
import { CrudDialog } from "@/components/admin/crud-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface HistoryRow {
  id: string;
  rule_id: string;
  channel_id: string;
  config_id: string;
  status: "sent" | "failed" | "skipped";
  error_message: string | null;
  triggered_at: string;
  payload: Record<string, unknown> | null;
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
  const [history, setHistory]       = useState<HistoryRow[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(50);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [detailRow, setDetailRow]   = useState<HistoryRow | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/admin/alerts/history?${params}`);
    if (res.ok) {
      const json = await res.json();
      setHistory(json.data ?? []);
      setTotal(json.total ?? 0);
    }
  }, [page, pageSize, statusFilter]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  const filtered = search.trim()
    ? history.filter((r) => {
        const q = search.toLowerCase();
        return (r.alert_rules?.name ?? "").toLowerCase().includes(q)
          || (r.alert_channels?.name ?? "").toLowerCase().includes(q)
          || (r.check_configs?.name ?? "").toLowerCase().includes(q)
          || (r.error_message ?? "").toLowerCase().includes(q);
      })
    : history;

  async function handleBatchDelete() {
    setBatchDeleting(true);
    await fetch("/api/admin/alerts/history", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
    setBatchDeleting(false);
    setSelected(new Set());
    setBatchDeleteOpen(false);
    load();
  }

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const someSelected = filtered.some((r) => selected.has(r.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelected((prev) => { const next = new Set(prev); filtered.forEach((r) => next.delete(r.id)); return next; });
    } else {
      setSelected((prev) => { const next = new Set(prev); filtered.forEach((r) => next.add(r.id)); return next; });
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">告警历史</h1>
          {total > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              共 {total.toLocaleString()} 条
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            自动刷新
          </span>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="">全部状态</option>
            <option value="sent">已发送</option>
            <option value="failed">失败</option>
            <option value="skipped">冷却中</option>
          </select>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索规则、渠道、配置、错误信息…"
          className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* 批量操作栏 */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-sm font-medium">已选 {selected.size} 条</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Set())} className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors">
              取消选择
            </button>
            <button
              onClick={() => setBatchDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 transition-all"
            >
              <Trash2 className="h-3.5 w-3.5" />
              批量删除
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 cursor-pointer accent-primary"
                  />
                </th>
                {["触发时间", "规则", "渠道", "配置", "状态", "错误信息", ""].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((row) => {
                const isSelected = selected.has(row.id);
                return (
                  <tr key={row.id} className={`group hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}>
                    <td className="w-10 px-3 py-2">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(row.id)} className="h-3.5 w-3.5 cursor-pointer accent-primary" />
                    </td>
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
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setDetailRow(row)}
                        className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted transition-all"
                        title="查看详情"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <Clock className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm font-medium">
              {search ? "未找到匹配的记录" : statusFilter ? "当前筛选条件下没有匹配的记录" : "暂无告警历史"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {search ? "尝试修改搜索关键词" : "告警触发后将在此处显示记录"}
            </p>
          </div>
        )}
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
      />

      {/* 批量删除确认 */}
      <CrudDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen} title="确认批量删除" onSubmit={handleBatchDelete} loading={batchDeleting}>
        <p className="text-sm text-muted-foreground">将删除已选 <strong>{selected.size}</strong> 条告警历史，此操作不可撤销。</p>
      </CrudDialog>

      {/* 详情弹窗 */}
      <Dialog open={!!detailRow} onOpenChange={(o) => !o && setDetailRow(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>告警详情</DialogTitle>
          </DialogHeader>
          {detailRow && (
            <div className="space-y-3 text-sm">
              <Row label="触发时间" value={new Date(detailRow.triggered_at).toLocaleString("zh-CN")} />
              <Row label="状态">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[detailRow.status] ?? ""}`}>
                  {STATUS_LABELS[detailRow.status] ?? detailRow.status}
                </span>
              </Row>
              <Row label="规则" value={detailRow.alert_rules?.name ?? "—"} />
              <Row label="渠道" value={detailRow.alert_channels ? `${detailRow.alert_channels.name} (${detailRow.alert_channels.type})` : "—"} />
              <Row label="配置" value={detailRow.check_configs?.name ?? "—"} />
              {detailRow.error_message && <Row label="错误信息" value={detailRow.error_message} />}
              {detailRow.payload && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Payload</span>
                  <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(detailRow.payload, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <span className="flex-1 break-all text-xs">{children ?? value}</span>
    </div>
  );
}
