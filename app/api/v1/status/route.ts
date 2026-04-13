import { NextRequest, NextResponse } from "next/server";

import { buildPublicStatusResponse } from "@/lib/backend/services/public-status-service";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const response = await buildPublicStatusResponse({
    group: searchParams.get("group"),
    model: searchParams.get("model"),
  });

  return NextResponse.json(response);
}
