"use client";

import { useState, useEffect, useCallback } from "react";
import { Pencil, Trash2, Plus, Layers, Search, PlayCircle, Loader2, RefreshCw } from "lucide-react";
import { CrudDialog } from "@/components/admin/crud-dialog";
import { GroupForm, GroupFormData, defaultGroupForm } from "@/components/admin/group-form";
import { Pagination } from "@/components/admin/pagination";

interface GroupRow {
  group_name: string;
  display_name: string | null;
  description: string | null;
  website_url: string | null;
  icon_url: string | null;
}

interface GroupTestResult {
  total: number;
  operational: number;
  degraded: number;
  failed: number;
}

export default function GroupsPage() {
  const [groups, setGroups]               = useState<GroupRow[]>([]);
  const [search, setSearch]               = useState("");
  const [page, setPage]                   = useState(1);
  const [pageSize, setPageSize]           = useState(20);
  const [dialogOpen, setDialogOpen]       = useState(false);
  const [deleteId, setDeleteId]           = useState<string | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [editRow, setEditRow]             = useState<GroupRow | null>(null);
  const [form, setForm]                   = useState<GroupFormData>(defaultGroupForm());
  const [loading, setLoading]             = useState(false);
  const [msg, setMsg]                     = useState("");
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [testLoading, setTestLoading]     = useState<Record<string, boolean>>({});
  const [testResults, setTestResults]     = useState<Record<string, GroupTestResult>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/groups");
    if (res.ok) setGroups(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = search.trim()
    ? groups.filter((r) => {
        const q = search.toLowerCase();
        return r.group_name.toLowerCase().includes(q)
          || (r.display_name ?? "").toLowerCase().includes(q)
          || (r.description ?? "").toLowerCase().includes(q);
      })
    : groups;

  function openCreate() {
    setEditRow(null);
    setForm(defaultGroupForm());
    setDialogOpen(true);
  }

  function openEdit(row: GroupRow) {
    setEditRow(row);
    setForm({ group_name: row.group_name, display_name: row.display_name ?? "", description: row.description ?? "", website_url: row.website_url ?? "", icon_url: row.icon_url ?? "" });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!form.group_name) { setMsg("group_name 必填"); return; }
    setLoading(true);
    setMsg("");
    const url = editRow ? `/api/admin/groups/${encodeURIComponent(editRow.group_name)}` : "/api/admin/groups";
    const method = editRow ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setLoading(false);
    if (res.ok) { setDialogOpen(false); load(); }
    else { const d = await res.json(); setMsg(d.error ?? "操作失败"); }
  }

  async function handleDelete(name: string) {
    await fetch(`/api/admin/groups/${encodeURIComponent(name)}`, { method: "DELETE" });
    setDeleteId(null);
    load();
  }

  async function handleBatchDelete() {
    await Promise.all([...selected].map((name) =>
      fetch(`/api/admin/groups/${encodeURIComponent(name)}`, { method: "DELETE" })
    ));
    setSelected(new Set());
    setBatchDeleteOpen(false);
    load();
  }

  async function runGroupTest(groupName: string) {
    setTestLoading((prev) => ({ ...prev, [groupName]: true }));
    setTestResults((prev) => { const next = { ...prev }; delete next[groupName]; return next; });
    try {
      const res = await fetch("/api/admin/configs");
      if (!res.ok) throw new Error();
      const allConfigs: { id: string; group_name: string | null }[] = await res.json();
      const ids = allConfigs.filter((c) => c.group_name === groupName).map((c) => c.id);
      if (ids.length === 0) {
        setTestResults((prev) => ({ ...prev, [groupName]: { total: 0, operational: 0, degraded: 0, failed: 0 } }));
        return;
      }
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const r = await fetch(`/api/admin/configs/${id}/test`, { method: "POST" });
            return r.ok ? await r.json() : { status: "error" };
          } catch { return { status: "error" }; }
        })
      );
      const agg: GroupTestResult = { total: results.length, operational: 0, degraded: 0, failed: 0 };
      for (const r of results) {
        if (r.status === "operational") agg.operational++;
        else if (r.status === "degraded") agg.degraded++;
        else agg.failed++;
      }
      setTestResults((prev) => ({ ...prev, [groupName]: agg }));
    } catch {
      setTestResults((prev) => ({ ...prev, [groupName]: { total: 0, operational: 0, degraded: 0, failed: 0 } }));
    } finally {
      setTestLoading((prev) => ({ ...prev, [groupName]: false }));
    }
  }

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pageIds = pageRows.map((r) => r.group_name);
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
        <h1 className="text-xl font-semibold">分组管理</h1>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </button>
          <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            新建分组
          </button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="搜索标识、显示名称、描述…"
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
                    checked={allPageSelected}
                    ref={(el) => { if (el) el.indeterminate = !allPageSelected && somePageSelected; }}
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 cursor-pointer accent-primary"
                  />
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">标识</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">显示名称</th>
                <th className="hidden sm:table-cell px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">描述</th>
                <th className="hidden sm:table-cell px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">官网链接</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageRows.map((row) => {
                const tl = testLoading[row.group_name];
                const tr = testResults[row.group_name];
                const isSelected = selected.has(row.group_name);
                return (
                  <tr key={row.group_name} className={`group hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}>
                    <td className="w-10 px-3 py-2">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(row.group_name)} className="h-3.5 w-3.5 cursor-pointer accent-primary" />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-medium">{row.group_name}</td>
                    <td className="px-3 py-2">{row.display_name ?? "—"}</td>
                    <td className="hidden sm:table-cell px-3 py-2 text-muted-foreground text-xs truncate max-w-[200px]">{row.description ?? "—"}</td>
                    <td className="hidden sm:table-cell px-3 py-2 text-xs">
                      {row.website_url ? (
                        <a href={row.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block max-w-[160px]">{row.website_url}</a>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {tr && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" title={`${tr.total} 项：${tr.operational} 正常 / ${tr.degraded} 延迟 / ${tr.failed} 失败`}>
                            <span className="text-green-600">{tr.operational}</span>
                            <span className="opacity-40">/</span>
                            <span className="text-red-600">{tr.failed}</span>
                          </span>
                        )}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => runGroupTest(row.group_name)}
                            disabled={tl}
                            className="rounded p-1 text-muted-foreground hover:text-primary hover:bg-muted transition-colors disabled:opacity-50"
                            title="测试该分组所有配置"
                          >
                            {tl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                          </button>
                          <button onClick={() => openEdit(row)} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setDeleteId(row.group_name)} className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-muted">
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
            <Layers className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-3 text-sm font-medium">{search ? "未找到匹配的分组" : "暂无分组"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{search ? "尝试修改搜索关键词" : "创建分组后可将配置归类展示"}</p>
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

      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editRow ? "编辑分组" : "新建分组"} onSubmit={handleSubmit} loading={loading}>
        <GroupForm data={form} onChange={setForm} isEdit={!!editRow} />
        {msg && <p className="text-sm text-destructive">{msg}</p>}
      </CrudDialog>

      <CrudDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="确认删除" onSubmit={() => deleteId && handleDelete(deleteId)}>
        <p className="text-sm text-muted-foreground">确认删除分组 <strong>{deleteId}</strong>？此操作不可撤销。</p>
      </CrudDialog>

      <CrudDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen} title="确认批量删除" onSubmit={handleBatchDelete}>
        <p className="text-sm text-muted-foreground">将删除已选 <strong>{selected.size}</strong> 个分组，此操作不可撤销。</p>
      </CrudDialog>
    </div>
  );
}
