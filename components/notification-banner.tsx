"use client";

import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { SystemNotificationRow } from "@/lib/types/database";
import { cn } from "@/lib/utils/cn";

const LEVEL_ACCENT: Record<string, string> = {
  info:    "border-l-[var(--status-maintenance)]",
  warning: "border-l-[var(--status-degraded)]",
  error:   "border-l-[var(--status-failed)]",
};

const LEVEL_ICONS = {
  info:    Info,
  warning: AlertTriangle,
  error:   AlertCircle,
} as const;

export function NotificationBanner() {
  const [notifications, setNotifications] = useState<SystemNotificationRow[]>([]);
  const [visible, setVisible] = useState(true);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : []))
      .then(setNotifications)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (notifications.length <= 1) return;
    const t = setInterval(() => setIdx((p) => (p + 1) % notifications.length), 5000);
    return () => clearInterval(t);
  }, [notifications.length]);

  if (!visible || notifications.length === 0) return null;

  const n = notifications[idx];
  const Icon = LEVEL_ICONS[n.level as keyof typeof LEVEL_ICONS] ?? Info;
  const accentClass = LEVEL_ACCENT[n.level] ?? LEVEL_ACCENT.info;

  return (
    <Alert
      className={cn(
        "rounded-none border-0 border-b border-l-4 px-4 py-2.5",
        accentClass,
        "[&>svg]:text-current"
      )}
    >
      <Icon className="h-4 w-4" />
      <AlertDescription className="flex items-start justify-between gap-4">
        <div className="flex-1 text-sm [&_a]:underline [&_a]:underline-offset-2 [&_p]:leading-snug">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{n.message}</ReactMarkdown>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setVisible(false)}
          className="h-6 w-6 shrink-0 rounded opacity-50 hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
