import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const emptyToUndef = (v: unknown) =>
  v === "" || v === undefined ? undefined : v;

const envSchema = z.object({
  LANCERS_DASHBOARD_URL: z.string().url(),
  STORAGE_STATE_PATH: z.string().default("./storage-state.json"),
  COOKIES_PATH: z.preprocess(emptyToUndef, z.string().optional()),
  REFRESH_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  BID_BOT_URL: z.preprocess(emptyToUndef, z.string().url().optional()),
  BID_BOT_SECRET: z.preprocess(emptyToUndef, z.string().optional()),
  HEADLESS: z.preprocess(
    (v) => (v === "" || v === undefined ? "true" : v),
    z.enum(["true", "false"]).transform((x) => x !== "false"),
  ),
  SEEN_IDS_PATH: z.string().default("./seen-work-ids.json"),
  /** If true, first poll only records IDs and sends no notifications (avoids spam on cold start). */
  BOOTSTRAP_SILENT: z.preprocess(
    (v) => v === "true",
    z.boolean().optional(),
  ),
  DESKTOP_NOTIFICATION: z.preprocess(
    (v) => (v === "" || v === undefined ? "true" : v),
    z.enum(["true", "false"]).transform((x) => x !== "false"),
  ),
  /** Absolute or cwd-relative path to toast icon; default is `src/download.jpg` beside the app. */
  NOTIFICATION_ICON_PATH: z.preprocess(emptyToUndef, z.string().optional()),
  /**
   * Windows: passed to SnoreToast as `-appID`. Must match the ID used with `npm run toast:register`
   * (see KDE SnoreToast: Start Menu shortcut + appID replaces the default "SnoreToast" header).
   */
  WINDOWS_TOAST_APP_ID: z.string().default("Lancers.NotificationBot"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const e = parsed.data;

const filterSettingsSchema = z.object({
  minBudgetJpy: z.number().int().nonnegative().nullable().optional(),
  maxBudgetJpy: z.number().int().nonnegative().nullable().optional(),
  skipIfBudgetUnknown: z.boolean().optional(),
});

function resolveFromSrc(relativePathFromSrc: string): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFilePath);
  return path.resolve(currentDir, relativePathFromSrc);
}

function loadKeywordFile(relativePathFromSrc: string): string[] {
  const keywordFilePath = resolveFromSrc(relativePathFromSrc);

  try {
    const raw = fs.readFileSync(keywordFilePath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    console.warn(
      `[config] Failed to load keyword file from ${keywordFilePath}:`,
      error,
    );
    return [];
  }
}

function loadFilterSettings(): z.infer<typeof filterSettingsSchema> {
  const settingsPath = resolveFromSrc("../filter_settings/settings.json");
  let parsedJson: unknown = {};

  try {
    const raw = fs.readFileSync(settingsPath, "utf8").trim();
    parsedJson = raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn(
      `[config] Failed to load filter settings from ${settingsPath}, using defaults:`,
      error,
    );
  }

  const settingsParsed = filterSettingsSchema.safeParse(parsedJson);
  if (!settingsParsed.success) {
    console.error(
      "Invalid filter_settings/settings.json:",
      settingsParsed.error.flatten().fieldErrors,
    );
    process.exit(1);
  }

  return settingsParsed.data;
}

const filterSettings = loadFilterSettings();

export const config = {
  dashboardUrl: e.LANCERS_DASHBOARD_URL,
  storageStatePath: e.STORAGE_STATE_PATH,
  cookiesPath: e.COOKIES_PATH,
  refreshIntervalMs: e.REFRESH_INTERVAL_MS,
  minBudgetJpy: filterSettings.minBudgetJpy ?? undefined,
  maxBudgetJpy: filterSettings.maxBudgetJpy ?? undefined,
  skipIfBudgetUnknown: filterSettings.skipIfBudgetUnknown ?? false,
  bidBotUrl: e.BID_BOT_URL,
  bidBotSecret: e.BID_BOT_SECRET,
  headless: e.HEADLESS,
  seenIdsPath: e.SEEN_IDS_PATH,
  bootstrapSilent: e.BOOTSTRAP_SILENT ?? true,
  desktopNotification: e.DESKTOP_NOTIFICATION,
  notificationIconPath: e.NOTIFICATION_ICON_PATH,
  windowsToastAppId: e.WINDOWS_TOAST_APP_ID,
  includeKeywords: loadKeywordFile("../filter_settings/include_keywords"),
  excludeKeywords: loadKeywordFile("../filter_settings/exclude_keywords"),
};
