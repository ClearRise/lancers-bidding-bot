import clipboard from "clipboardy";
import { config } from "./config.js";
import {
  isWindowsDesktopActionSupported,
  normalizeDesktopAction,
  sendDesktopNotification,
} from "./desktop-notification.js";
import type { ScrapedTask } from "./types.js";

const COPY_URL_LABEL = "Copy URL";
const CONTINUE_LABEL = "OK";
const SHUTDOWN_LABEL = "Cancel";

function formatBudget(task: ScrapedTask): string {
  if (task.budgetDisplayText) return task.budgetDisplayText;
  if (task.budgetMinJpy != null && task.budgetMaxJpy != null) {
    return task.budgetMinJpy === task.budgetMaxJpy
      ? `¥${task.budgetMaxJpy.toLocaleString("ja-JP")}`
      : `¥${task.budgetMinJpy.toLocaleString("ja-JP")}〜¥${task.budgetMaxJpy.toLocaleString("ja-JP")}`;
  }
  if (task.budgetJpy != null) return `¥${task.budgetJpy.toLocaleString("ja-JP")}`;
  return "予算不明";
}

export async function notifyMatchedTask(task: ScrapedTask): Promise<void> {
  const budget = formatBudget(task);
  const title = "Lancers: 条件に合う仕事";
  const message = `${task.title.slice(0, 120)}\n${budget}`;
  const useWinActions = isWindowsDesktopActionSupported();

  try {
    const result = await sendDesktopNotification({
      title,
      message,
      actions: useWinActions ? [COPY_URL_LABEL] : [],
      wait: useWinActions,
    });

    if (!useWinActions) return;
    const action = normalizeDesktopAction(result.response, result.metadata);
    if (action === "copy url") {
      clipboard.write(task.url).catch((e) => {
        console.error("[desktop-notification-service] clipboard:", e);
      });
    }
  } catch (err) {
    const messageText = err instanceof Error ? err.message : String(err);
    console.error("[desktop-notification-service] notify matched task failed:", messageText);
  }
}

export async function confirmContinueWithoutBidBot(errorMessage: string): Promise<boolean> {
  const useActions = isWindowsDesktopActionSupported() && config.desktopNotification;
  if (!useActions) {
    console.error(
      "[desktop-notification-service] bid-bot is unreachable and interactive confirmation is unavailable on this platform.",
    );
    return false;
  }

  console.error("[desktop-notification-service] bid-bot delivery failed:", errorMessage);
  console.log("[desktop-notification-service] waiting for user choice: OK=continue, Cancel=shutdown");

  try {
    const result = await sendDesktopNotification({
      title: "Bid Bot connection failed",
      message:
        "Bid-bot API server is unreachable.\nOK: continue without bid-bot\nCancel: shutdown notification-bot",
      actions: [CONTINUE_LABEL, SHUTDOWN_LABEL],
      wait: true,
    });
    const action = normalizeDesktopAction(result.response, result.metadata);
    return action === "ok";
  } catch (err) {
    const messageText = err instanceof Error ? err.message : String(err);
    console.error("[desktop-notification-service] confirmation toast failed:", messageText);
    return false;
  }
}
