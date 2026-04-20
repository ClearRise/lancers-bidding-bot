import "dotenv/config";
import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" || v === undefined ? undefined : v);

const schema = z.object({
  LANCERS_DASHBOARD_URL: z.string().url(),
  STORAGE_STATE_PATH: z.string().default("./storage-state.json"),
  HEADLESS: z.preprocess(
    (v) => (v === "" || v === undefined ? "true" : v),
    z.enum(["true", "false"]).transform((x) => x !== "false"),
  ),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  SEEN_IDS_PATH: z.string().default("./bid-history.json"),
  MAX_BIDS_PER_CYCLE: z.coerce.number().int().positive().default(2),
  MIN_BUDGET_JPY: z.preprocess(emptyToUndefined, z.coerce.number().int().nonnegative().optional()),
  MAX_BUDGET_JPY: z.preprocess(emptyToUndefined, z.coerce.number().int().nonnegative().optional()),
  DEFAULT_PROPOSAL_TEXT: z.string().min(1),
  DEFAULT_BID_AMOUNT_JPY: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().nonnegative().optional(),
  ),
  DRY_RUN: z.preprocess(
    (v) => (v === "" || v === undefined ? "true" : v),
    z.enum(["true", "false"]).transform((x) => x !== "false"),
  ),
  BID_BOT_PORT: z.coerce.number().int().positive().default(3847),
  BID_BOT_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  BID_QUEUE_PATH: z.string().default("./bid-queue.json"),
  ENABLE_MONITOR: z.preprocess(
    (v) => (v === "" || v === undefined ? "false" : v),
    z.enum(["true", "false"]).transform((x) => x !== "false"),
  ),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const e = parsed.data;

export const config = {
  dashboardUrl: e.LANCERS_DASHBOARD_URL,
  storageStatePath: e.STORAGE_STATE_PATH,
  headless: e.HEADLESS,
  pollIntervalMs: e.POLL_INTERVAL_MS,
  seenIdsPath: e.SEEN_IDS_PATH,
  maxBidsPerCycle: e.MAX_BIDS_PER_CYCLE,
  minBudgetJpy: e.MIN_BUDGET_JPY,
  maxBudgetJpy: e.MAX_BUDGET_JPY,
  proposalText: e.DEFAULT_PROPOSAL_TEXT,
  defaultBidAmountJpy: e.DEFAULT_BID_AMOUNT_JPY,
  dryRun: e.DRY_RUN,
  bidBotPort: e.BID_BOT_PORT,
  bidBotSecret: e.BID_BOT_SECRET,
  bidQueuePath: e.BID_QUEUE_PATH,
  enableMonitor: e.ENABLE_MONITOR,
};
