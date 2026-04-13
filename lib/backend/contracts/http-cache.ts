import type { NextResponse } from "next/server";

export const DATA_CHANGE_CYCLE_SECONDS = 5 * 60;

export function generateEtagFromString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return `"${(hash >>> 0).toString(16)}"`;
}

export function generateStableEtag<T extends { generatedAt?: number }>(value: T): string {
  const { generatedAt, ...rest } = value;
  void generatedAt;
  return generateEtagFromString(JSON.stringify(rest));
}

export function applyJsonCacheHeaders(
  response: NextResponse,
  pollIntervalMs: number,
  etag: string
): NextResponse {
  const pollIntervalSeconds = Math.floor(pollIntervalMs / 1000);
  response.headers.set("Cache-Control", "public, no-cache");
  response.headers.set("CDN-Cache-Control", `max-age=${pollIntervalSeconds}`);
  response.headers.set(
    "Cloudflare-CDN-Cache-Control",
    `max-age=${pollIntervalSeconds}, stale-while-revalidate=${DATA_CHANGE_CYCLE_SECONDS}`
  );
  response.headers.set("ETag", etag);
  response.headers.set("Vary", "Accept-Encoding");
  return response;
}
