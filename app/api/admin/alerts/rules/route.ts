import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "../_auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidConditionType } from "@/lib/alerts/conditions";

export async function GET() {
  const err = await requireAuth();
  if (err) return err;
  const { data, error } = await createAdminClient()
    .from("alert_rules")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const err = await requireAuth();
  if (err) return err;
  const body = await request.json();
  const { name, condition_type, condition_params, channel_ids, config_ids, enabled, cooldown_seconds } = body;
  if (!name || !condition_type || !channel_ids?.length) {
    return NextResponse.json({ error: "name、condition_type、channel_ids 必填" }, { status: 400 });
  }
  if (!isValidConditionType(condition_type)) {
    return NextResponse.json({ error: "无效的 condition_type" }, { status: 400 });
  }
  const { data, error } = await createAdminClient()
    .from("alert_rules")
    .insert({
      name, condition_type, condition_params: condition_params ?? {},
      channel_ids, config_ids: config_ids?.length ? config_ids : null,
      enabled: enabled ?? true, cooldown_seconds: cooldown_seconds ?? 300,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
