"use client";

import { useState, useEffect, useCallback } from "react";
import { History, Filter, RefreshCw, Search, Trash2, Eye, Loader2 } from "lucide-react";
import { Pagination } from "@/components/admin/pagination";
import { CrudDialog } from "@/components/admin/crud-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface HistoryRow {
  id: string | number;
  config_id: string;
  status: string;
  latency_ms: number | null;
  ping_latency_ms: number | null;
  checked_at: string;
  message: string | null;
  check_configs: { name: string; type: string } | null;
}

interface ConfigOption {
  id: string;
  name: string;
}

const STATUS_STYLES: Record<string, string> = {
  operational:       "bg-green-500/10 text-green-600",
  degraded:          "bg-yellow-500/10 text-yellow-600",
  failed:            "bg-red-500/10 text-red-600",
  validation_failed: "bg-orange-500/10 text-orange-600",
  error:             "bg-red-500/10 text-red-600",
};

const STATUS_LABELS: Record<string, string> = {
  operational:       "正常",
  degraded:          "降级",
  failed:            "失败",
  validation_failed: "验证失败",
  error:             "错误",
};

export default function HistoryPage() {
  const [rows, setRows]               = useState<HistoryRow[]>([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [pageSize, setPageSize]       = useState(50);
  const [configs, setConfigs]         = useState<ConfigOption[]>([]);
  const [configId, setConfigId]       = useState("");
  const [status, setStatus]           = useState("");
  const [loading, setLoading]         = useState(false);
  const [search, setSearch]           = useState("");
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchDeleting, setBatchDeleting]     = useState(false);
  const [detailRow, setDetailRow]     = useState<HistoryRow | null>(null);

  useEffect(() => {
    fetch("/api/admin/configs")
      .then((r) => r.ok ? r.json() : [])
      .then((data: { id: string; name: string }[]) => setConfigs(data.map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (configId) params.set("config_id", configId);
    if (status)   params.set("status", status);
    const res = await fetch(`/api/admin/history?${params}`);
    if (res.ok) {
      const json = await res.json();
      setRows(json.data ?? []);
      setTotal(json.total ?? 0);
    }
    setLoading(false);
  }, [page, pageSize, configId, status]);

  useEffect(() => { load(); }, [load]);

  const filtered = search.trim()
    ? rows.filter((r) => {
        const q = search.toLowerCase();
        return (r.check_configs?.name ?? "").toLowerCase().includes(q)
          || r.status.toLowerCase().includes(q)
          || (r.message ?? "").toLowerCase().includes(q);
      })
    : rows;

  function applyFilter(newConfigId: string, newStatus: string) {
    setConfigId(newConfigId);
    setStatus(newStatus);
    setPage(1);
  }

  async function handleBatchDelete() {
    setBatchDeleting(true);
    await fetch("/api/admin/history", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
    setBatchDeleting(false);
    setSelected(new Set());
    setBatchDeleteOpen(false);
    load();
  }

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(String(r.id)));
  const someSelected = filtered.some((r) => selected.has(String(r.id)));

  function toggleSelectAll() {
    if (allSelected) {
      setSelected((prev) => { const next = new Set(prev); filtered.forEach((r) => next.delete(String(r.id))); return next; });
    } else {
      setSelected((prev) => { const next = new Set(prev); filtered.forEach((r) => next.add(String(r.id))); return next; });
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">检测历史</h1>
          {total > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              共 {total.toLocaleString()} 条
            </span>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索配置、消息…"
            className="h-8 w-40 rounded-md border border-input bg-background pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          刷新
        </button>
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <select value={configId} onChange={(e) => applyFilter(e.target.value, status)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring">
          <option value="">全部配置</option>
          {configs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={status} onChange={(e) => applyFilter(configId, e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring">
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
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
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">配置</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">状态</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">首 Token</th>
                <th className="hidden sm:table-cell px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Ping</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">检测时间</th>
                <th className="hidden md:table-cell px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">消息</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground/50" />
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <History className="mx-auto h-10 w-10 text-muted-foreground/30" />
                    <p className="mt-3 text-sm font-medium">
                      {search ? "未找到匹配的记录" : "暂无检测记录"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {search ? "尝试修改搜索关键词" : configId || status ? "当前筛选条件下没有匹配的记录" : "轮询器运行后将自动写入检测数据"}
                    </p>
                  </td>
                </tr>
              )}
              {!loading && filtered.map((row) => {
                const id = String(row.id);
                const isSelected = selected.has(id);
                return (
                  <tr key={id} className={`group hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}>
                    <td className="w-10 px-3 py-2">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(id)} className="h-3.5 w-3.5 cursor-pointer accent-primary" />
                    </td>
                    <td className="px-3 py-2 font-medium text-xs max-w-[140px] truncate">
                      {row.check_configs?.name ?? row.config_id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[row.status] ?? "bg-muted text-muted-foreground"}`}>
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums">
                      {row.latency_ms != null ? `${row.latency_ms} ms` : "—"}
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2 text-xs tabular-nums text-muted-foreground">
                      {row.ping_latency_ms != null ? `${Math.round(row.ping_latency_ms)} ms` : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(row.checked_at).toLocaleString("zh-CN")}
                    </td>
                    <td className="hidden md:table-cell px-3 py-2 text-xs text-muted-foreground max-w-[240px]">
                      <p className="truncate" title={row.message ?? ""}>{row.message ?? "—"}</p>
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
        <p className="text-sm text-muted-foreground">将删除已选 <strong>{selected.size}</strong> 条检测记录，此操作不可撤销。</p>
      </CrudDialog>

      {/* 详情弹窗 */}
      <Dialog open={!!detailRow} onOpenChange={(o) => !o && setDetailRow(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>检测详情</DialogTitle>
          </DialogHeader>
          {detailRow && (
            <div className="space-y-3 text-sm">
              <DetailRow label="配置" value={detailRow.check_configs?.name ?? detailRow.config_id} />
              <DetailRow label="类型" value={detailRow.check_configs?.type ?? "—"} />
              <DetailRow label="检测时间" value={new Date(detailRow.checked_at).toLocaleString("zh-CN")} />
              <DetailRow label="状态">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[detailRow.status] ?? "bg-muted text-muted-foreground"}`}>
                  {STATUS_LABELS[detailRow.status] ?? detailRow.status}
                </span>
              </DetailRow>
              <DetailRow label="首 Token" value={detailRow.latency_ms != null ? `${detailRow.latency_ms} ms` : "—"} />
              <DetailRow label="Ping" value={detailRow.ping_latency_ms != null ? `${Math.round(detailRow.ping_latency_ms)} ms` : "—"} />
              {detailRow.message && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">消息</span>
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{detailRow.message}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <span className="flex-1 break-all text-xs">{children ?? value}</span>
    </div>
  );
}
