import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "../../../alerts/_auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { runProviderChecks } from "@/lib/providers";
import { appendHistory } from "@/lib/database/history";
import type { ProviderConfig, ProviderType } from "@/lib/types";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await requireAuth();
  if (err) return err;

  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("check_configs")
    .select("id,name,type,model,endpoint,api_key,is_maintenance,request_header,metadata,group_name")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "配置不存在" }, { status: 404 });

  const config: ProviderConfig = {
    id: data.id,
    name: data.name,
    type: data.type as ProviderType,
    endpoint: data.endpoint,
    model: data.model,
    apiKey: data.api_key,
    is_maintenance: data.is_maintenance,
    requestHeaders: (data.request_header as Record<string, string>) || null,
    metadata: (data.metadata as Record<string, unknown>) || null,
    groupName: data.group_name || null,
  };

  const [result] = await runProviderChecks([config]);

  // 写入历史记录
  await appendHistory([result]);

  return NextResponse.json({
    status: result.status,
    latencyMs: result.latencyMs,
    pingLatencyMs: result.pingLatencyMs,
    message: result.message ?? null,
  });
}
