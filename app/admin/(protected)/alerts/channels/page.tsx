"use client";

import { useState, useEffect, useCallback } from "react";
import { Pencil, Trash2, Plus, Radio } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { CrudDialog } from "@/components/admin/crud-dialog";

type ChannelType = "webhook" | "feishu" | "dingtalk";

interface ChannelRow {
  id: string;
  name: string;
  type: ChannelType;
  config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
}

interface ChannelForm {
  name: string;
  type: ChannelType;
  config_url: string;
  config_secret: string;
  enabled: boolean;
}

const TYPE_COLORS: Record<ChannelType, string> = {
  webhook: "bg-blue-500/10 text-blue-600",
  feishu: "bg-green-500/10 text-green-600",
  dingtalk: "bg-orange-500/10 text-orange-600",
};

const TYPE_LABELS: Record<ChannelType, string> = {
  webhook: "Webhook",
  feishu: "飞书",
  dingtalk: "钉钉",
};

const URL_LABEL: Record<ChannelType, string> = {
  webhook: "Webhook URL",
  feishu: "飞书机器人 URL",
  dingtalk: "钉钉机器人 URL",
};

function defaultForm(): ChannelForm {
  return { name: "", type: "webhook", config_url: "", config_secret: "", enabled: true };
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<ChannelRow | null>(null);
  const [form, setForm] = useState<ChannelForm>(defaultForm());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/alerts/channels");
    if (res.ok) setChannels(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditRow(null);
    setForm(defaultForm());
    setDialogOpen(true);
  }

  function openEdit(row: ChannelRow) {
    setEditRow(row);
    setForm({
      name: row.name,
      type: row.type,
      config_url: (row.config.url as string) ?? "",
      config_secret: (row.config.secret as string) ?? "",
      enabled: row.enabled,
    });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!form.name) { setMsg("名称必填"); return; }
    if (!form.config_url) { setMsg("URL 必填"); return; }
    setLoading(true);
    setMsg("");
    const config: Record<string, unknown> = { url: form.config_url };
    if (form.type === "webhook" && form.config_secret) config.secret = form.config_secret;
    const body = { name: form.name, type: form.type, config, enabled: form.enabled };
    const url = editRow ? `/api/admin/alerts/channels/${editRow.id}` : "/api/admin/alerts/channels";
    const method = editRow ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setLoading(false);
    if (res.ok) { setDialogOpen(false); load(); }
    else { const d = await res.json(); setMsg(d.error ?? "操作失败"); }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/alerts/channels/${id}`, { method: "DELETE" });
    setDeleteId(null);
    load();
  }

  async function toggleEnabled(row: ChannelRow, enabled: boolean) {
    await fetch(`/api/admin/alerts/channels/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">告警渠道</h1>
        <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90">
          <Plus className="h-4 w-4" />新建渠道
        </button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {["名称", "类型", "URL", "启用", "创建时间", ""].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {channels.map((row) => (
              <tr key={row.id} className="group hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 font-medium">{row.name}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[row.type]}`}>
                    {TYPE_LABELS[row.type]}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[220px]">
                  {(row.config.url as string) ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <Switch checked={row.enabled} onCheckedChange={(v) => toggleEnabled(row, v)} />
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
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
            ))}
          </tbody>
        </table>
        </div>
        {channels.length === 0 && (
          <div className="py-16 text-center">
            <Radio className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-3 text-sm font-medium">暂无告警渠道</p>
            <p className="mt-1 text-xs text-muted-foreground">创建渠道后可在规则中选择使用</p>
          </div>
        )}
      </div>

      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editRow ? "编辑渠道" : "新建渠道"} onSubmit={handleSubmit} loading={loading}>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">名称</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">类型</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ChannelType })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="webhook">Webhook</option>
              <option value="feishu">飞书</option>
              <option value="dingtalk">钉钉</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{URL_LABEL[form.type]}</label>
            <input value={form.config_url} onChange={(e) => setForm({ ...form, config_url: e.target.value })}
              placeholder="https://..."
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          {form.type === "webhook" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Secret（可选）</label>
              <input value={form.config_secret} onChange={(e) => setForm({ ...form, config_secret: e.target.value })}
                placeholder="X-Alert-Secret 请求头"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
            <span className="text-sm text-muted-foreground">启用</span>
          </div>
        </div>
        {msg && <p className="mt-2 text-sm text-destructive">{msg}</p>}
      </CrudDialog>

      <CrudDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="确认删除" onSubmit={() => deleteId && handleDelete(deleteId)}>
        <p className="text-sm text-muted-foreground">确认删除该渠道？关联规则中的渠道引用也会失效。</p>
      </CrudDialog>
    </div>
  );
}
