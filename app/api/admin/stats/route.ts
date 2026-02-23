import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const [activeConfigsRes, failureCountRes, availabilityRes, latencyRes] = await Promise.all([
    admin.from("check_configs").select("id", { count: "exact", head: true }).eq("enabled", true),
    admin
      .from("check_history")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("checked_at", new Date(Date.now() - 86400_000).toISOString()),
    admin.from("availability_stats").select("config_id,availability_pct_30d").not("availability_pct_30d", "is", null),
    admin
      .from("check_history")
      .select("config_id,latency_ms,checked_at,check_configs(name)")
      .not("latency_ms", "is", null)
      .order("checked_at", { ascending: false })
      .limit(1),
  ]);

  const activeConfigs = activeConfigsRes.count ?? 0;
  const failureCount = failureCountRes.count ?? 0;

  const availRows = availabilityRes.data ?? [];
  const globalAvailability =
    availRows.length > 0
      ? availRows.reduce((s, r) => s + (r.availability_pct_30d ?? 0), 0) / availRows.length
      : null;

  const topLatency = latencyRes.data?.[0]
    ? {
        name: (latencyRes.data[0].check_configs as unknown as { name: string } | null)?.name ?? "未知",
        latency_ms: latencyRes.data[0].latency_ms,
      }
    : null;

  // 获取最近每配置最多 60 条延迟历史（用于折线图）
  const { data: historyRows } = await admin
    .from("check_history")
    .select("config_id,latency_ms,checked_at,check_configs(name)")
    .not("latency_ms", "is", null)
    .order("checked_at", { ascending: false })
    .limit(300);

  return NextResponse.json({
    activeConfigs,
    failureCount,
    globalAvailability,
    topLatency,
    history: historyRows ?? [],
    availability: availRows,
  });
}
