"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface GroupFormData {
  group_name: string;
  display_name: string;
  description: string;
  website_url: string;
  icon_url: string;
}

interface GroupFormProps {
  data: GroupFormData;
  onChange: (data: GroupFormData) => void;
  isEdit?: boolean;
}

export function GroupForm({ data, onChange, isEdit }: GroupFormProps) {
  const set = (key: keyof GroupFormData, value: string) => onChange({ ...data, [key]: value });

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="grp-name">分组标识 *</Label>
        <Input
          id="grp-name"
          required
          readOnly={isEdit}
          value={data.group_name}
          onChange={(e) => set("group_name", e.target.value)}
          placeholder="production"
          className={isEdit ? "bg-muted cursor-not-allowed" : ""}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="grp-display">显示名称</Label>
        <Input id="grp-display" value={data.display_name} onChange={(e) => set("display_name", e.target.value)} placeholder="生产环境" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="grp-desc">描述</Label>
        <Textarea id="grp-desc" value={data.description} onChange={(e) => set("description", e.target.value)} placeholder="核心生产环境模型" rows={3} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="grp-url">官网链接</Label>
        <Input id="grp-url" type="url" value={data.website_url} onChange={(e) => set("website_url", e.target.value)} placeholder="https://status.openai.com" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="grp-icon">图标 URL</Label>
        <Input id="grp-icon" type="url" value={data.icon_url} onChange={(e) => set("icon_url", e.target.value)} placeholder="https://example.com/icon.png" />
      </div>
    </div>
  );
}

export const defaultGroupForm = (): GroupFormData => ({
  group_name: "", display_name: "", description: "", website_url: "", icon_url: "",
});
