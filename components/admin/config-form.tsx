"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export interface ConfigFormData {
  name: string;
  type: string;
  model: string;
  endpoint: string;
  api_key: string;
  group_name: string;
  request_header: string;
  metadata: string;
  enabled: boolean;
  is_maintenance: boolean;
}

interface ConfigFormProps {
  data: ConfigFormData;
  onChange: (data: ConfigFormData) => void;
  isEdit?: boolean;
}

export function ConfigForm({ data, onChange, isEdit }: ConfigFormProps) {
  const set = (key: keyof ConfigFormData, value: string | boolean) =>
    onChange({ ...data, [key]: value });

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="cfg-name">名称 *</Label>
        <Input id="cfg-name" required value={data.name} onChange={(e) => set("name", e.target.value)} placeholder="主力 OpenAI" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>类型 *</Label>
          <Select value={data.type} onValueChange={(v) => set("type", v)}>
            <SelectTrigger>
              <SelectValue placeholder="选择类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="gemini">Gemini</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cfg-model">模型 *</Label>
          <Input id="cfg-model" required value={data.model} onChange={(e) => set("model", e.target.value)} placeholder="gpt-4o-mini" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cfg-endpoint">端点 *</Label>
        <Input id="cfg-endpoint" required value={data.endpoint} onChange={(e) => set("endpoint", e.target.value)} placeholder="https://api.openai.com/v1/chat/completions" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cfg-apikey">API Key {isEdit && <span className="text-muted-foreground font-normal">（留空不修改）</span>}</Label>
        <Input id="cfg-apikey" type="password" value={data.api_key} onChange={(e) => set("api_key", e.target.value)} placeholder={isEdit ? "留空不修改" : "sk-..."} required={!isEdit} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cfg-group">分组</Label>
        <Input id="cfg-group" value={data.group_name} onChange={(e) => set("group_name", e.target.value)} placeholder="生产环境" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cfg-headers">自定义请求头 (JSON)</Label>
        <Textarea id="cfg-headers" value={data.request_header} onChange={(e) => set("request_header", e.target.value)} placeholder='{"User-Agent": "custom/1.0"}' className="font-mono text-xs" rows={3} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cfg-metadata">Metadata (JSON)</Label>
        <Textarea id="cfg-metadata" value={data.metadata} onChange={(e) => set("metadata", e.target.value)} placeholder='{"temperature": 0.5}' className="font-mono text-xs" rows={3} />
      </div>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch id="cfg-enabled" checked={data.enabled} onCheckedChange={(v) => set("enabled", v)} />
          <Label htmlFor="cfg-enabled">启用</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="cfg-maintenance" checked={data.is_maintenance} onCheckedChange={(v) => set("is_maintenance", v)} />
          <Label htmlFor="cfg-maintenance">维护模式</Label>
        </div>
      </div>
    </div>
  );
}

export const defaultConfigForm = (): ConfigFormData => ({
  name: "", type: "openai", model: "", endpoint: "", api_key: "",
  group_name: "", request_header: "", metadata: "", enabled: true, is_maintenance: false,
});
