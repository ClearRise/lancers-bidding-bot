import "dotenv/config";
import { z } from "zod";

function csvToList(s: string | undefined): string[] {
  if (!s?.trim()) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

const emptyToUndef = (v: unknown) =>
  v === "" || v === undefined ? undefined : v;

const envSchema = z.object({
  LANCERS_DASHBOARD_URL: z.string().url(),
  STORAGE_STATE_PATH: z.string().default("./storage-state.json"),
  COOKIES_PATH: z.preprocess(emptyToUndef, z.string().optional()),
  REFRESH_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  MIN_BUDGET_JPY: z.preprocess(emptyToUndef, z.coerce.number().int().nonnegative().optional()),
  MAX_BUDGET_JPY: z.preprocess(emptyToUndef, z.coerce.number().int().nonnegative().optional()),
  SKIP_IF_BUDGET_UNKNOWN: z.preprocess(
    (v) => v === "true",
    z.boolean().optional(),
  ),
  MATCH_KEYWORDS: z.string().optional(),
  EXCLUDE_KEYWORDS: z.string().optional(),
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

export const config = {
  dashboardUrl: e.LANCERS_DASHBOARD_URL,
  storageStatePath: e.STORAGE_STATE_PATH,
  cookiesPath: e.COOKIES_PATH,
  refreshIntervalMs: e.REFRESH_INTERVAL_MS,
  minBudgetJpy: e.MIN_BUDGET_JPY,
  maxBudgetJpy: e.MAX_BUDGET_JPY,
  skipIfBudgetUnknown: e.SKIP_IF_BUDGET_UNKNOWN ?? false,
  matchKeywords: csvToList(e.MATCH_KEYWORDS),
  excludeKeywords: csvToList(e.EXCLUDE_KEYWORDS),
  bidBotUrl: e.BID_BOT_URL,
  bidBotSecret: e.BID_BOT_SECRET,
  headless: e.HEADLESS,
  seenIdsPath: e.SEEN_IDS_PATH,
  bootstrapSilent: e.BOOTSTRAP_SILENT ?? true,
  desktopNotification: e.DESKTOP_NOTIFICATION,
  notificationIconPath: e.NOTIFICATION_ICON_PATH,
  windowsToastAppId: e.WINDOWS_TOAST_APP_ID,
};
