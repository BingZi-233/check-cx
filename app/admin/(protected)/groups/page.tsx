"use client";

import { useState, useEffect, useCallback } from "react";
import { Pencil, Trash2, Plus, Layers } from "lucide-react";
import { CrudDialog } from "@/components/admin/crud-dialog";
import { GroupForm, GroupFormData, defaultGroupForm } from "@/components/admin/group-form";

interface GroupRow {
  group_name: string;
  display_name: string | null;
  description: string | null;
  website_url: string | null;
  icon_url: string | null;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<GroupRow | null>(null);
  const [form, setForm] = useState<GroupFormData>(defaultGroupForm());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/groups");
    if (res.ok) setGroups(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">分组管理</h1>
        <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          新建分组
        </button>
      </div>
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">标识</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">显示名称</th>
              <th className="hidden sm:table-cell px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">描述</th>
              <th className="hidden sm:table-cell px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">官网链接</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.map((row) => (
              <tr key={row.group_name} className="group hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 font-mono text-xs font-medium">{row.group_name}</td>
                <td className="px-3 py-2">{row.display_name ?? "—"}</td>
                <td className="hidden sm:table-cell px-3 py-2 text-muted-foreground text-xs truncate max-w-[200px]">{row.description ?? "—"}</td>
                <td className="hidden sm:table-cell px-3 py-2 text-xs">
                  {row.website_url ? (
                    <a href={row.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block max-w-[160px]">{row.website_url}</a>
                  ) : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(row)} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setDeleteId(row.group_name)} className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-muted">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {groups.length === 0 && (
          <div className="py-16 text-center">
            <Layers className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-3 text-sm font-medium">暂无分组</p>
            <p className="mt-1 text-xs text-muted-foreground">创建分组后可将配置归类展示</p>
          </div>
        )}
      </div>

      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editRow ? "编辑分组" : "新建分组"} onSubmit={handleSubmit} loading={loading}>
        <GroupForm data={form} onChange={setForm} isEdit={!!editRow} />
        {msg && <p className="text-sm text-destructive">{msg}</p>}
      </CrudDialog>

      <CrudDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="确认删除" onSubmit={() => deleteId && handleDelete(deleteId)}>
        <p className="text-sm text-muted-foreground">确认删除分组 <strong>{deleteId}</strong>？此操作不可撤销。</p>
      </CrudDialog>
    </div>
  );
}
