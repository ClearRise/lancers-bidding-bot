import path from "node:path";
import { existsSync } from "node:fs";
import { cwd, platform } from "node:process";
import { fileURLToPath } from "node:url";
import clipboard from "clipboardy";
import notifier from "node-notifier";
import { config } from "./config.js";
import type { ScrapedTask } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Lancers-style icon next to this module (`src/download.jpg`). */
const DEFAULT_NOTIFICATION_ICON = path.join(__dirname, "download.jpg");

const COPY_URL_LABEL = "Copy URL";

function isCopyUrlActivation(
  response: string,
  metadata?: { activationType?: string; button?: string },
): boolean {
  // node-notifier lowercases `response` (activation type) before the callback.
  const raw =
    metadata?.activationType ?? metadata?.button ?? response ?? "";
  const t = String(raw).trim().toLowerCase();
  if (!t || t === "timeout" || t === "timedout") return false;
  if (t === "activate" || t === "clicked") return false;
  return t === "copy url";
}

/**
 * Windows / macOS / Linux toast via node-notifier (SnoreToast on Windows 10+).
 * On Windows, adds a "Copy URL" action that copies the task link to the clipboard.
 */
export async function notifyDesktopMatch(task: ScrapedTask): Promise<void> {
  if (!config.desktopNotification) return;

  let budget: string;
  if (task.budgetDisplayText) {
    budget = task.budgetDisplayText;
  } else if (task.budgetMinJpy != null && task.budgetMaxJpy != null) {
    budget =
      task.budgetMinJpy === task.budgetMaxJpy
        ? `¥${task.budgetMaxJpy.toLocaleString("ja-JP")}`
        : `¥${task.budgetMinJpy.toLocaleString("ja-JP")}〜¥${task.budgetMaxJpy.toLocaleString("ja-JP")}`;
  } else if (task.budgetJpy != null) {
    budget = `¥${task.budgetJpy.toLocaleString("ja-JP")}`;
  } else {
    budget = "予算不明";
  }

  const title = "Lancers: 条件に合う仕事";
  const message = `${task.title.slice(0, 120)}\n${budget}`;

  const custom = config.notificationIconPath;
  const customResolved = custom
    ? path.isAbsolute(custom)
      ? custom
      : path.resolve(cwd(), custom)
    : null;
  const icon =
    customResolved && existsSync(customResolved)
      ? customResolved
      : existsSync(DEFAULT_NOTIFICATION_ICON)
        ? DEFAULT_NOTIFICATION_ICON
        : undefined;

  const useWinActions = platform === "win32";

  notifier.notify(
    {
      title: title.slice(0, 64),
      message: message.slice(0, 256),
      wait: useWinActions,
      sound: true,
      ...(platform === "win32" ? { appID: config.windowsToastAppId } : {}),
      ...(icon ? { icon } : {}),
      ...(useWinActions ? { actions: [COPY_URL_LABEL] } : {}),
    },
    (err, response, metadata) => {
      if (err) console.error("[desktop-notify]", err.message);
      if (!useWinActions) return;
      if (isCopyUrlActivation(response, metadata)) {
        clipboard.write(task.url).catch((e) => {
          console.error("[desktop-notify] clipboard:", e);
        });
      }
    },
  );
}
