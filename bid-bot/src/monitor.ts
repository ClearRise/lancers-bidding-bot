import { config } from "./config.js";
import { openContext } from "./browser.js";
import { submitBid } from "./lancers/bid.js";
import { loadHistory, saveHistory } from "./store.js";
import { takeQueuedWorkIds } from "./queue-store.js";
import { scrapeTaskDetail } from "./lancers/detail.js";
import { error, log } from "./logger.js";

export type MonitorWorker = {
  trigger: () => void;
};

export async function startMonitorWorker(signal: AbortSignal): Promise<MonitorWorker> {
  const history = await loadHistory(config.seenIdsPath);
  const attemptedIds = new Set(Object.keys(history));
  const { browser, context, page } = await openContext();
  log("monitor", `startup dry_run=${config.dryRun} history=${attemptedIds.size}`);
  let cycle = 0;
  let isProcessing = false;
  let pendingTrigger = false;

  const closeBrowser = async () => {
    await context.close();
    await browser.close();
    log("monitor", "shutdown complete");
  };

  signal.addEventListener(
    "abort",
    () => {
      void closeBrowser();
    },
    { once: true },
  );

  const openDashboardWhileIdle = async (): Promise<void> => {
    try {
      await page.goto(config.dashboardUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      log("monitor", "idle dashboard opened");
    } catch (err) {
      error("monitor", "failed to open idle dashboard", err);
    }
  };

  const processQueue = async (): Promise<void> => {
    if (isProcessing) {
      pendingTrigger = true;
      return;
    }

    isProcessing = true;
    try {
      do {
        // const TEST_WORK_ID = "5530547";
        // const detail = await scrapeTaskDetail(page, TEST_WORK_ID);
        // console.log("\n##############-scraped task details-###############\n");
        // console.log(detail);
        // console.log("\n##########################################\n");

        // const result = await submitBid(page, detail);
        // console.log("\n##############-bid result-###############\n");
        // console.log(result);
        // console.log("\n##########################################\n");
        pendingTrigger = false;
        cycle += 1;
        log("monitor", `cycle=${cycle} start`);

        const queued = await takeQueuedWorkIds(config.bidQueuePath, config.maxBidsPerCycle);
        const workIds = queued.workIds.filter((workId) => !attemptedIds.has(workId));
        log(
          "monitor",
          `cycle=${cycle} dequeued=${queued.workIds.length} candidates=${workIds.length} remaining_queue=${queued.queueSize}`,
        );

        if (workIds.length === 0) {
          await openDashboardWhileIdle();
          break;
        }

        for (const workId of workIds) {
          log("monitor", `cycle=${cycle} open_task_link work_id=${workId}`);
          try {
            const detail = await scrapeTaskDetail(page, workId);
            log("monitor", `cycle=${cycle} detail_loaded work_id=${workId} title="${detail.title.slice(0, 80)}"`);
            const result = await submitBid(page, detail);
            history[workId] = {
              attemptedAt: result.attemptedAt,
              status: result.status,
              reason: result.reason,
            };
            attemptedIds.add(workId);
            await saveHistory(config.seenIdsPath, history);
            log("monitor", `cycle=${cycle} bid_result work_id=${workId} status=${result.status}`);
          } catch (err) {
            error("monitor", `cycle=${cycle} bid_failed work_id=${workId}`, err);
            history[workId] = {
              attemptedAt: new Date().toISOString(),
              status: "failed",
              reason: "exception",
            };
            attemptedIds.add(workId);
            await saveHistory(config.seenIdsPath, history);
          }
        }

        await openDashboardWhileIdle();
      } while (pendingTrigger && !signal.aborted);
    } finally {
      isProcessing = false;
    }
  };

  // Process any existing queued items on startup.
  void processQueue();

  return {
    trigger: () => {
      void processQueue();
    },
  };
}
