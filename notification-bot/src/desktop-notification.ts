import path from "node:path";
import { existsSync } from "node:fs";
import { cwd, platform } from "node:process";
import { fileURLToPath } from "node:url";
import notifier from "node-notifier";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_NOTIFICATION_ICON = path.join(
  __dirname,
  "..",
  "assets",
  "icons",
  "lancers-badge.jpg",
);

export type DesktopNotificationResponse = {
  response: string;
  metadata?: { activationType?: string; button?: string };
};

export function isWindowsDesktopActionSupported(): boolean {
  return platform === "win32";
}

export function normalizeDesktopAction(
  response: string,
  metadata?: { activationType?: string; button?: string },
): string {
  const raw =
    metadata?.activationType ??
    metadata?.button ??
    response ??
    "";
  return String(raw).trim().toLowerCase();
}

function resolveNotificationIconPath(): string | undefined {
  const custom = config.notificationIconPath;
  const customResolved = custom
    ? path.isAbsolute(custom)
      ? custom
      : path.resolve(cwd(), custom)
    : null;

  if (customResolved && existsSync(customResolved)) return customResolved;
  if (existsSync(DEFAULT_NOTIFICATION_ICON)) return DEFAULT_NOTIFICATION_ICON;
  return undefined;
}

type DesktopNotificationInput = {
  title: string;
  message: string;
  actions?: string[];
  wait?: boolean;
};

export async function sendDesktopNotification(
  input: DesktopNotificationInput,
): Promise<DesktopNotificationResponse> {
  if (!config.desktopNotification) {
    return { response: "disabled" };
  }

  const icon = resolveNotificationIconPath();
  const supportsActions = isWindowsDesktopActionSupported();
  const actions = supportsActions ? input.actions ?? [] : [];
  const wait = input.wait ?? actions.length > 0;

  const options = {
    title: input.title.slice(0, 64),
    message: input.message.slice(0, 256),
    wait,
    sound: true,
    ...(platform === "win32" ? { appID: config.windowsToastAppId } : {}),
    ...(icon ? { icon } : {}),
    ...(actions.length > 0 ? { actions } : {}),
  };

  return new Promise<DesktopNotificationResponse>((resolve, reject) => {
    notifier.notify(
      options as unknown as Parameters<typeof notifier.notify>[0],
      (err, response, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({ response, metadata });
      },
    );
  });
}
