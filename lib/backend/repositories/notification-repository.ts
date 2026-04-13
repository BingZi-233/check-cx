import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { SystemNotificationRow } from "@/lib/types/database";
import { logError } from "@/lib/utils";

export async function listActiveSystemNotifications(): Promise<SystemNotificationRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("system_notifications")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    logError("notificationRepository.listActiveSystemNotifications", error);
    return [];
  }

  return (data ?? []) as SystemNotificationRow[];
}
