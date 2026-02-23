"use client";

import { useState, useEffect, useCallback } from "react";
import { Pencil, Trash2, Plus, Settings } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ProviderIcon } from "@/components/provider-icon";
import { CrudDialog } from "@/components/admin/crud-dialog";
import { ConfigForm, ConfigFormData, defaultConfigForm } from "@/components/admin/config-form";
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

export default function ConfigsPage() {
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<ConfigRow | null>(null);
  const [form, setForm] = useState<ConfigFormData>(defaultConfigForm());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/configs");
    if (res.ok) setConfigs(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditRow(null);
    setForm(defaultConfigForm());
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

  async function toggleField(id: string, field: "enabled" | "is_maintenance", value: boolean) {
    await fetch(`/api/admin/configs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">配置管理</h1>
        <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 active:scale-[0.98] transition-all">
          <Plus className="h-4 w-4" />
          新建配置
        </button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
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
              {configs.map((row) => (
                <tr key={row.id} className="group hover:bg-muted/30 transition-colors">
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
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(row)} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteId(row.id)} className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {configs.length === 0 && (
          <div className="py-16 text-center">
            <Settings className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-3 text-sm font-medium">暂无配置</p>
            <p className="mt-1 text-xs text-muted-foreground">点击右上角「新建配置」添加第一条监控项</p>
          </div>
        )}
      </div>

      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editRow ? "编辑配置" : "新建配置"} onSubmit={handleSubmit} loading={loading}>
        <ConfigForm data={form} onChange={setForm} isEdit={!!editRow} />
        {msg && <p className="text-sm text-destructive">{msg}</p>}
      </CrudDialog>

      <CrudDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="确认删除" onSubmit={() => deleteId && handleDelete(deleteId)}>
        <p className="text-sm text-muted-foreground">此操作不可撤销，确认删除该配置？</p>
      </CrudDialog>
    </div>
  );
}
