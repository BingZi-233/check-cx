"use client";

import { useState, useEffect, useCallback } from "react";
import { Pencil, Trash2, Plus, Settings, RefreshCw, Play, Loader2, Copy, PlayCircle, Search } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ProviderIcon } from "@/components/provider-icon";
import { CrudDialog } from "@/components/admin/crud-dialog";
import { ConfigForm, ConfigFormData, defaultConfigForm } from "@/components/admin/config-form";
import { Pagination } from "@/components/admin/pagination";
import type { ProviderType } from "@/lib/types";

interface ConfigRow {
  id: string;
  name: string;
  type: string;
  model: string;
  endpoint: string;
  api_key: string;
  enabled: boolean;
  is_maintenance: boolean;
  group_name: string | null;
  request_header: unknown;
  metadata: unknown;
}

interface TestResult {
  status: string;
  latencyMs: number | null;
  message: string | null;
}

const TEST_STATUS_STYLES: Record<string, string> = {
  operational:       "bg-green-500/10 text-green-600",
  degraded:          "bg-yellow-500/10 text-yellow-600",
  failed:            "bg-red-500/10 text-red-600",
  validation_failed: "bg-orange-500/10 text-orange-600",
  error:             "bg-red-500/10 text-red-600",
};

export default function ConfigsPage() {
  const [configs, setConfigs]           = useState<ConfigRow[]>([]);
  const [groups, setGroups]             = useState<string[]>([]);
  const [search, setSearch]             = useState("");
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState(20);
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [deleteId, setDeleteId]         = useState<string | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [editRow, setEditRow]           = useState<ConfigRow | null>(null);
  const [form, setForm]                 = useState<ConfigFormData>(defaultConfigForm());
  const [loading, setLoading]           = useState(false);
  const [msg, setMsg]                   = useState("");
  const [testLoading, setTestLoading]   = useState<Record<string, boolean>>({});
  const [testResults, setTestResults]   = useState<Record<string, TestResult>>({});
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/configs");
    if (res.ok) setConfigs(await res.json());
    const gr = await fetch("/api/admin/groups");
    if (gr.ok) {
      const list: { group_name: string }[] = await gr.json();
      setGroups(list.map((g) => g.group_name));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = search.trim()
    ? configs.filter((r) => {
        const q = search.toLowerCase();
        return r.name.toLowerCase().includes(q)
          || r.model.toLowerCase().includes(q)
          || r.endpoint.toLowerCase().includes(q)
          || (r.group_name ?? "").toLowerCase().includes(q);
      })
    : configs;

  function openCreate() {
    setEditRow(null);
    setForm(defaultConfigForm());
    setDialogOpen(true);
  }

  function openCopy(row: ConfigRow) {
    setEditRow(null);
    setForm({
      name: row.name + " (副本)",
      type: row.type,
      model: row.model,
      endpoint: row.endpoint,
      api_key: "",
      group_name: row.group_name ?? "",
      request_header: row.request_header ? JSON.stringify(row.request_header, null, 2) : "",
      metadata: row.metadata ? JSON.stringify(row.metadata, null, 2) : "",
      enabled: row.enabled,
      is_maintenance: row.is_maintenance,
    });
    setDialogOpen(true);
  }

  function openEdit(row: ConfigRow) {
    setEditRow(row);
    setForm({
      name: row.name,
      type: row.type,
      model: row.model,
      endpoint: row.endpoint,
      api_key: "",
      group_name: row.group_name ?? "",
      request_header: row.request_header ? JSON.stringify(row.request_header, null, 2) : "",
      metadata: row.metadata ? JSON.stringify(row.metadata, null, 2) : "",
      enabled: row.enabled,
      is_maintenance: row.is_maintenance,
    });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!form.name || !form.type || !form.model || !form.endpoint) {
      setMsg("请填写必填字段");
      return;
    }
    setLoading(true);
    setMsg("");
    let reqHeader: unknown = null;
    let meta: unknown = null;
    try {
      if (form.request_header.trim()) reqHeader = JSON.parse(form.request_header);
      if (form.metadata.trim()) meta = JSON.parse(form.metadata);
    } catch {
      setMsg("JSON 格式错误");
      setLoading(false);
      return;
    }
    const body = { ...form, request_header: reqHeader, metadata: meta };
    const url = editRow ? `/api/admin/configs/${editRow.id}` : "/api/admin/configs";
    const method = editRow ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setLoading(false);
    if (res.ok) { setDialogOpen(false); load(); }
    else { const d = await res.json(); setMsg(d.error ?? "操作失败"); }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/configs/${id}`, { method: "DELETE" });
    setDeleteId(null);
    load();
  }

  async function handleBatchDelete() {
    await Promise.all([...selected].map((id) => fetch(`/api/admin/configs/${id}`, { method: "DELETE" })));
    setSelected(new Set());
    setBatchDeleteOpen(false);
    load();
  }

  async function toggleField(id: string, field: "enabled" | "is_maintenance", value: boolean) {
    await fetch(`/api/admin/configs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    load();
  }

  async function runTest(id: string) {
    setTestLoading((prev) => ({ ...prev, [id]: true }));
    setTestResults((prev) => { const next = { ...prev }; delete next[id]; return next; });
    try {
      const res = await fetch(`/api/admin/configs/${id}/test`, { method: "POST" });
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [id]: data }));
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: { status: "error", latencyMs: null, message: "请求失败" } }));
    } finally {
      setTestLoading((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function runBatchTest() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBatchRunning(true);
    await Promise.all(ids.map((id) => runTest(id)));
    setBatchRunning(false);
  }

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pageIds = pageRows.map((r) => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelected((prev) => { const next = new Set(prev); pageIds.forEach((id) => next.delete(id)); return next; });
    } else {
      setSelected((prev) => { const next = new Set(prev); pageIds.forEach((id) => next.add(id)); return next; });
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">配置管理</h1>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </button>
          <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 active:scale-[0.98] transition-all">
            <Plus className="h-4 w-4" />
            新建配置
          </button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="搜索名称、模型、端点、分组…"
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
              onClick={runBatchTest}
              disabled={batchRunning}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-all"
            >
              {batchRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
              批量检测
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
                    checked={allPageSelected}
                    ref={(el) => { if (el) el.indeterminate = !allPageSelected && somePageSelected; }}
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 cursor-pointer accent-primary"
                  />
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">名称</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">类型</th>
                <th className="hidden sm:table-cell px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">模型</th>
                <th className="hidden md:table-cell px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">端点</th>
                <th className="hidden sm:table-cell px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">分组</th>
                <th className="hidden lg:table-cell px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">API Key</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">启用</th>
                <th className="hidden sm:table-cell px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">维护</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageRows.map((row) => {
                const tr = testResults[row.id];
                const tl = testLoading[row.id];
                const isSelected = selected.has(row.id);
                return (
                  <tr key={row.id} className={`group hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}>
                    <td className="w-10 px-3 py-2.5">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(row.id)} className="h-3.5 w-3.5 cursor-pointer accent-primary" />
                    </td>
                    <td className="px-3 py-2.5 font-medium">{row.name}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <ProviderIcon type={row.type as ProviderType} size={14} />
                        <span className="hidden sm:inline capitalize text-sm">{row.type}</span>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2.5 text-muted-foreground font-mono text-xs">{row.model}</td>
                    <td className="hidden md:table-cell px-3 py-2.5 text-muted-foreground text-xs truncate max-w-[180px]">{row.endpoint}</td>
                    <td className="hidden sm:table-cell px-3 py-2.5 text-muted-foreground text-xs">{row.group_name ?? "—"}</td>
                    <td className="hidden lg:table-cell px-3 py-2.5 font-mono text-xs text-muted-foreground">{row.api_key}</td>
                    <td className="px-3 py-2.5">
                      <Switch checked={row.enabled} onCheckedChange={(v) => toggleField(row.id, "enabled", v)} />
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2.5">
                      <Switch checked={row.is_maintenance} onCheckedChange={(v) => toggleField(row.id, "is_maintenance", v)} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {tr && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TEST_STATUS_STYLES[tr.status] ?? "bg-muted text-muted-foreground"}`}
                            title={tr.message ?? undefined}
                          >
                            {tr.status}
                            {tr.latencyMs != null && <span className="opacity-70">{tr.latencyMs}ms</span>}
                          </span>
                        )}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => runTest(row.id)} disabled={tl} className="rounded p-1 text-muted-foreground hover:text-primary hover:bg-muted transition-colors disabled:opacity-50" title="即时测试">
                            {tl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                          </button>
                          <button onClick={() => openEdit(row)} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => openCopy(row)} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="复制配置">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setDeleteId(row.id)} className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <Settings className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-3 text-sm font-medium">{search ? "未找到匹配的配置" : "暂无配置"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{search ? "尝试修改搜索关键词" : "点击右上角「新建配置」添加第一条监控项"}</p>
          </div>
        )}
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
      />

      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editRow ? "编辑配置" : "新建配置"} onSubmit={handleSubmit} loading={loading}>
        <ConfigForm data={form} onChange={setForm} isEdit={!!editRow} groups={groups} />
        {msg && <p className="text-sm text-destructive">{msg}</p>}
      </CrudDialog>

      <CrudDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="确认删除" onSubmit={() => deleteId && handleDelete(deleteId)}>
        <p className="text-sm text-muted-foreground">此操作不可撤销，确认删除该配置？</p>
      </CrudDialog>

      <CrudDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen} title="确认批量删除" onSubmit={handleBatchDelete}>
        <p className="text-sm text-muted-foreground">将删除已选 <strong>{selected.size}</strong> 条配置，此操作不可撤销。</p>
      </CrudDialog>
    </div>
  );
}

