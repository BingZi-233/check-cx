"use client";

import { useState, useEffect, useCallback } from "react";
import { Pencil, Trash2, Plus, Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { CrudDialog } from "@/components/admin/crud-dialog";
import { NotificationForm, NotificationFormData, defaultNotificationForm } from "@/components/admin/notification-form";

interface NotifRow {
  id: string;
  message: string;
  level: string;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
}

const LEVEL_COLORS: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-600",
  warning: "bg-yellow-500/10 text-yellow-600",
  error: "bg-red-500/10 text-red-600",
};

function isActive(row: NotifRow): boolean {
  const now = Date.now();
  if (row.start_time && new Date(row.start_time).getTime() > now) return false;
  if (row.end_time && new Date(row.end_time).getTime() < now) return false;
  return true;
}

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<NotifRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<NotifRow | null>(null);
  const [form, setForm] = useState<NotificationFormData>(defaultNotificationForm());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/notifications");
    if (res.ok) setNotifs(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditRow(null);
    setForm(defaultNotificationForm());
    setDialogOpen(true);
  }

  function openEdit(row: NotifRow) {
    setEditRow(row);
    const toLocal = (iso: string | null) => iso ? new Date(iso).toISOString().slice(0, 16) : "";
    setForm({ message: row.message, level: row.level, start_time: toLocal(row.start_time), end_time: toLocal(row.end_time) });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!form.message) { setMsg("消息内容必填"); return; }
    setLoading(true);
    setMsg("");
    const body = { ...form, start_time: form.start_time ? new Date(form.start_time).toISOString() : null, end_time: form.end_time ? new Date(form.end_time).toISOString() : null };
    const url = editRow ? `/api/admin/notifications/${editRow.id}` : "/api/admin/notifications";
    const method = editRow ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setLoading(false);
    if (res.ok) { setDialogOpen(false); load(); }
    else { const d = await res.json(); setMsg(d.error ?? "操作失败"); }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/notifications/${id}`, { method: "DELETE" });
    setDeleteId(null);
    load();
  }

  async function toggleExpiry(row: NotifRow, active: boolean) {
    const body = active
      ? { start_time: new Date().toISOString(), end_time: null }
      : { end_time: new Date().toISOString() };
    await fetch(`/api/admin/notifications/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">通知管理</h1>
        <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          新建通知
        </button>
      </div>
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">消息摘要</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">级别</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">激活中</th>
              <th className="hidden sm:table-cell px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">创建时间</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {notifs.map((row) => {
              const active = isActive(row);
              return (
                <tr key={row.id} className="group hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 max-w-[200px] sm:max-w-[280px]">
                    <p className="truncate text-xs">{row.message.slice(0, 60)}{row.message.length > 60 ? "…" : ""}</p>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_COLORS[row.level] ?? ""}`}>
                      {row.level}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Switch checked={active} onCheckedChange={(v) => toggleExpiry(row, v)} />
                  </td>
                  <td className="hidden sm:table-cell px-3 py-2 text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("zh-CN")}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(row)} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteId(row.id)} className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-muted">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {notifs.length === 0 && (
          <div className="py-16 text-center">
            <Bell className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-3 text-sm font-medium">暂无通知</p>
            <p className="mt-1 text-xs text-muted-foreground">创建通知后将在首页横幅中展示</p>
          </div>
        )}
      </div>

      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editRow ? "编辑通知" : "新建通知"} onSubmit={handleSubmit} loading={loading}>
        <NotificationForm data={form} onChange={setForm} />
        {msg && <p className="text-sm text-destructive">{msg}</p>}
      </CrudDialog>

      <CrudDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="确认删除" onSubmit={() => deleteId && handleDelete(deleteId)}>
        <p className="text-sm text-muted-foreground">确认删除该通知？此操作不可撤销。</p>
      </CrudDialog>
    </div>
  );
}
