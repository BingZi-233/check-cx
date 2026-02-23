export interface FeishuConfig {
  url: string;
}

export async function sendFeishu(
  config: FeishuConfig,
  title: string,
  content: string
): Promise<void> {
  const body = {
    msg_type: "post",
    content: {
      post: {
        zh_cn: {
          title,
          content: [[{ tag: "text", text: content }]],
        },
      },
    },
  };

  const res = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { code: number; msg: string };
  if (data.code !== 0) throw new Error(`Feishu error: ${data.msg}`);
}
