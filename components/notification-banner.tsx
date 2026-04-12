"use client";

import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SystemNotificationRow } from "@/lib/types/database";
import { cn } from "@/lib/utils/cn";

export function NotificationBanner() {
  const [notifications, setNotifications] = useState<SystemNotificationRow[]>([]);
  const [visible, setVisible] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    async function fetchNotifications() {
      try {
        const response = await fetch("/api/notifications");
        if (response.ok) {
          const data = await response.json();
          setNotifications(data);
        }
      } catch (error) {
        console.error("Failed to fetch notifications:", error);
      }
    }
    fetchNotifications();
  }, []);

  useEffect(() => {
    if (notifications.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % notifications.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [notifications.length]);

  if (!visible || notifications.length === 0) {
    return null;
  }

  const notification = notifications[currentIndex];

  const levelStyles: Record<string, string> = {
    info:    "border-[var(--status-maintenance)]/30 bg-[var(--status-maintenance)]/10 text-[var(--status-maintenance)]",
    warning: "border-[var(--status-degraded)]/30 bg-[var(--status-degraded)]/10 text-[var(--status-degraded)]",
    error:   "border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 text-[var(--status-failed)]",
  };

  const Icon = {
    info: Info,
    warning: AlertTriangle,
    error: AlertCircle,
  }[notification.level] ?? Info;

  return (
    <div className={cn(
      "relative w-full border-b px-4 py-3 text-sm backdrop-blur-sm transition-all animate-in fade-in slide-in-from-top-2",
      levelStyles[notification.level] ?? levelStyles.info
    )}>
      <div className="mx-auto flex max-w-[1600px] items-start gap-3 md:items-center">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 md:mt-0" />
        <div className="flex-1 [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2 [&_p]:leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {notification.message}
          </ReactMarkdown>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setVisible(false)}
          className="ml-2 h-7 w-7 shrink-0 rounded-full opacity-70 hover:opacity-100"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </div>
    </div>
  );
}
