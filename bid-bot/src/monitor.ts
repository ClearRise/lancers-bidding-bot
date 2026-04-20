import { config } from "./config.js";
import { openContext } from "./browser.js";
import { scrapeTasks } from "./lancers/scrape.js";
import { selectCandidates } from "./strategy.js";
import { submitBid } from "./lancers/bid.js";
import { loadHistory, saveHistory } from "./store.js";
import { error, log } from "./logger.js";

export async function run(signal: AbortSignal): Promise<void> {
  const history = await loadHistory(config.seenIdsPath);
  const attemptedIds = new Set(Object.keys(history));
  let cycle = 0;

  const { browser, context, page } = await openContext();
  log("monitor", `startup dry_run=${config.dryRun} history=${attemptedIds.size}`);

  try {
    while (!signal.aborted) {
      cycle += 1;
      log("monitor", `cycle=${cycle} start`);

      await page.goto(config.dashboardUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      const tasks = await scrapeTasks(page);
      log("monitor", `cycle=${cycle} scraped=${tasks.length}`);

      const candidates = selectCandidates(tasks, attemptedIds);
      log("monitor", `cycle=${cycle} candidates=${candidates.length}`);

      for (const candidate of candidates) {
        log("monitor", `cycle=${cycle} bid_attempt work_id=${candidate.workId}`);
        try {
          const result = await submitBid(page, candidate);
          history[candidate.workId] = {
            attemptedAt: result.attemptedAt,
            status: result.status,
            reason: result.reason,
          };
          attemptedIds.add(candidate.workId);
          await saveHistory(config.seenIdsPath, history);
          log("monitor", `cycle=${cycle} bid_result work_id=${candidate.workId} status=${result.status}`);
        } catch (err) {
          error("monitor", `cycle=${cycle} bid_failed work_id=${candidate.workId}`, err);
          history[candidate.workId] = {
            attemptedAt: new Date().toISOString(),
            status: "failed",
            reason: "exception",
          };
          attemptedIds.add(candidate.workId);
          await saveHistory(config.seenIdsPath, history);
        }
      }

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, config.pollIntervalMs);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
  } finally {
    await context.close();
    await browser.close();
    log("monitor", "shutdown complete");
  }
}
