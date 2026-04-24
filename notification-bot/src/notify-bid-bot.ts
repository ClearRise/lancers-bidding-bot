import { config } from "./config.js";
import type { ScrapedTask } from "./types.js";

export async function notifyBidBot(task: ScrapedTask): Promise<void> {
  if (!config.bidBotUrl) {
    console.log("[notify] BID_BOT_URL not set; printing payload only");
    console.log(JSON.stringify(task, null, 2));
    return;
  }

  const body = {
    source: "lancers-notification-bot",
    workId: task.workId,
    url: task.url,
    title: task.title,
    snippet: task.snippet,
    budgetJpy: task.budgetJpy,
    budgetMinJpy: task.budgetMinJpy,
    budgetMaxJpy: task.budgetMaxJpy,
    budgetDisplayText: task.budgetDisplayText,
    notifiedAt: new Date().toISOString(),
  };

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (config.bidBotSecret) {
    headers["x-bot-secret"] = config.bidBotSecret;
  }

  try {
    const res = await fetch(config.bidBotUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Bid bot responded ${res.status}: ${text.slice(0, 500)}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[notify] bid-bot notification failed work_id=${task.workId}: ${message}`);
  }
}
