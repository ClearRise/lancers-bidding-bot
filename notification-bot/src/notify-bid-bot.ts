import { config } from "./config.js";
import { confirmContinueWithoutBidBot } from "./notify-desktop.js";
import type { ScrapedTask } from "./types.js";

let continueWithoutBidBotConfirmed = false;

async function askContinueWithoutBidBot(errorMessage: string): Promise<boolean> {
  return confirmContinueWithoutBidBot(errorMessage);
}

function resolveBidBotHealthUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.pathname = "/health";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function verifyBidBotConnectionAtStartup(): Promise<void> {
  if (!config.bidBotUrl) return;
  if (continueWithoutBidBotConfirmed) return;

  const healthUrl = resolveBidBotHealthUrl(config.bidBotUrl);
  try {
    const headers: Record<string, string> = {};
    if (config.bidBotSecret) {
      headers["x-bot-secret"] = config.bidBotSecret;
    }
    const res = await fetch(healthUrl, { method: "GET", headers });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Bid bot health check failed ${res.status}: ${text.slice(0, 500)}`);
    }
    console.log(`[notify] startup bid-bot health check passed: ${healthUrl}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    const confirmed = await askContinueWithoutBidBot(message);
    if (confirmed) {
      continueWithoutBidBotConfirmed = true;
      console.warn("[notify] startup: user selected continue without bid-bot");
      return;
    }
    console.error("[notify] startup: user selected shutdown due to bid-bot connection failure");
    process.exit(1);
  }
}

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
    const message =
      error instanceof Error ? error.message : String(error);
    if (continueWithoutBidBotConfirmed) {
      console.warn("[notify] bid-bot unreachable, continuing without bid-bot notification");
      return;
    }
    const confirmed = await askContinueWithoutBidBot(message);
    if (confirmed) {
      continueWithoutBidBotConfirmed = true;
      console.warn("[notify] user selected continue; bid-bot notifications will be skipped for this run");
      return;
    }
    console.error("[notify] user selected shutdown due to bid-bot connection failure");
    process.exit(1);
  }
}
