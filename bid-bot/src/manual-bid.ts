import fs from "node:fs/promises";
import { config } from "./config.js";
import { openContext } from "./browser.js";
import { executeBidForWorkId } from "./bid-executor.js";
import { loadHistory } from "./store.js";
import { error, log } from "./logger.js";

function parseTaskIds(raw: string): string[] {
  const ids = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.split(/\s+/)[0] ?? "")
    .map((id) => id.trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

async function main(): Promise<void> {
  const raw = await fs.readFile(config.manualBidTaskIdsPath, "utf8");
  const workIds = parseTaskIds(raw);
  if (workIds.length === 0) {
    log("manual", `no task IDs found in ${config.manualBidTaskIdsPath}`);
    return;
  }

  const history = await loadHistory(config.seenIdsPath);
  const attemptedIds = new Set(Object.keys(history));
  const { browser, context, page } = await openContext();
  log("manual", `loaded ${workIds.length} manual work id(s) from ${config.manualBidTaskIdsPath}`);

  try {
    for (const [index, workId] of workIds.entries()) {
      await executeBidForWorkId({
        page,
        workId,
        history,
        attemptedIds,
        historyPath: config.seenIdsPath,
        dashboardUrlIndex: null,
        contextLabel: `manual=${index + 1}/${workIds.length}`,
        logger: {
          log: (message) => log("manual", message),
          error: (message, err) => error("manual", message, err),
        },
      });
    }
  } finally {
    await context.close();
    await browser.close();
    log("manual", "shutdown complete");
  }
}

main().catch((err) => {
  error("manual", "fatal", err);
  process.exit(1);
});
