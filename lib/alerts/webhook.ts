export interface WebhookConfig {
  url: string;
  secret?: string;
}

export async function sendWebhook(
  config: WebhookConfig,
  payload: Record<string, unknown>
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.secret) headers["X-Alert-Secret"] = config.secret;

  const res = await fetch(config.url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
