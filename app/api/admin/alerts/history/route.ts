import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "../_auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const err = await requireAuth();
  if (err) return err;

  const { searchParams } = request.nextUrl;
  const rule_id = searchParams.get("rule_id");
  const config_id = searchParams.get("config_id");
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);

  let query = createAdminClient()
    .from("alert_history")
    .select(`
      id, rule_id, channel_id, config_id, status, error_message, triggered_at,
      alert_rules(name),
      alert_channels(name, type),
      check_configs(name)
    `)
    .order("triggered_at", { ascending: false })
    .limit(limit);

  if (rule_id) query = query.eq("rule_id", rule_id);
  if (config_id) query = query.eq("config_id", config_id);
  if (status) query = query.eq("status", status);
  if (from) query = query.gte("triggered_at", from);
  if (to) query = query.lte("triggered_at", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
