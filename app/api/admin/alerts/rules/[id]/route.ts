import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "../../_auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Ctx) {
  const err = await requireAuth();
  if (err) return err;
  const { id } = await params;
  const { name, condition_type, condition_params, channel_ids, config_ids, enabled, cooldown_seconds } = await request.json();
  const { error } = await createAdminClient()
    .from("alert_rules")
    .update({
      name, condition_type, condition_params,
      channel_ids, config_ids: config_ids?.length ? config_ids : null,
      enabled, cooldown_seconds,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const err = await requireAuth();
  if (err) return err;
  const { id } = await params;
  const body = await request.json();
  const { error } = await createAdminClient()
    .from("alert_rules")
    .update(body)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  const err = await requireAuth();
  if (err) return err;
  const { id } = await params;
  const { error } = await createAdminClient()
    .from("alert_rules")
    .delete()
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
