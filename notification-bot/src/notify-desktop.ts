import clipboard from "clipboardy";
import {
  isWindowsDesktopActionSupported,
  normalizeDesktopAction,
  sendDesktopNotification,
} from "./desktop-notification.js";
import type { ScrapedTask } from "./types.js";

const COPY_URL_LABEL = "Copy URL";

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
