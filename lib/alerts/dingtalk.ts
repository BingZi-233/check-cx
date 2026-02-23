export interface DingTalkConfig {
  url: string;
}

export async function sendDingTalk(
  config: DingTalkConfig,
  title: string,
  content: string
): Promise<void> {
  const body = {
    msgtype: "markdown",
    markdown: { title, text: `### ${title}\n\n${content}` },
  };

  const res = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { errcode: number; errmsg: string };
  if (data.errcode !== 0) throw new Error(`DingTalk error: ${data.errmsg}`);
}
