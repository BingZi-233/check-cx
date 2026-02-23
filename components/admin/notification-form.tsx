"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";

export interface NotificationFormData {
  message: string;
  level: string;
  start_time: string;
  end_time: string;
}

interface NotificationFormProps {
  data: NotificationFormData;
  onChange: (data: NotificationFormData) => void;
}

export function NotificationForm({ data, onChange }: NotificationFormProps) {
  const set = (key: keyof NotificationFormData, value: string) => onChange({ ...data, [key]: value });

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>级别</Label>
        <Select value={data.level} onValueChange={(v) => set("level", v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3 items-start">
        <div className="space-y-1.5">
          <Label htmlFor="notif-msg">消息内容 *（支持 Markdown）</Label>
          <Textarea
            id="notif-msg"
            required
            value={data.message}
            onChange={(e) => set("message", e.target.value)}
            placeholder="**系统维护**：今晚 22:00 进行维护"
            rows={6}
          />
        </div>
        <div className="space-y-1.5">
          <Label>预览</Label>
          <div className="min-h-[140px] rounded-md border border-border bg-muted/50 p-3 text-sm prose prose-sm dark:prose-invert max-w-none">
            {data.message ? (
              <ReactMarkdown>{data.message}</ReactMarkdown>
            ) : (
              <span className="text-muted-foreground">预览将在此显示</span>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="notif-start">开始时间</Label>
          <input
            id="notif-start"
            type="datetime-local"
            value={data.start_time}
            onChange={(e) => set("start_time", e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notif-end">结束时间</Label>
          <input
            id="notif-end"
            type="datetime-local"
            value={data.end_time}
            onChange={(e) => set("end_time", e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
    </div>
  );
}

export const defaultNotificationForm = (): NotificationFormData => ({
  message: "", level: "info", start_time: "", end_time: "",
});
