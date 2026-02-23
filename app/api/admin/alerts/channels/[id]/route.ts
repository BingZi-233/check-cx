import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "../../_auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Ctx) {
  const err = await requireAuth();
  if (err) return err;
  const { id } = await params;
  const { name, type, config, enabled } = await request.json();
  const { error } = await createAdminClient()
    .from("alert_channels")
    .update({ name, type, config, enabled })
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
    .from("alert_channels")
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
    .from("alert_channels")
    .delete()
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
