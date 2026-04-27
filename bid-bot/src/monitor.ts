import { config } from "./config.js";
import { openContext } from "./browser.js";
import { submitBid } from "./lancers/bid.js";
import { loadHistory, saveHistory } from "./store.js";
import { takeQueuedTasks } from "./queue-store.js";
import { scrapeTaskDetail } from "./lancers/detail.js";
import { error, log } from "./logger.js";
import { studyNativeJapanese } from "./japanese-study.js";

export type MonitorWorker = {
  trigger: () => void;
};

function isValidTaskDetail(detail: {
  title: string;
  description: string;
}): boolean {
  return detail.title.trim().length > 0 && detail.description.trim().length > 0;
}

export async function startMonitorWorker(signal: AbortSignal): Promise<MonitorWorker> {
  const history = await loadHistory(config.seenIdsPath);
  const attemptedIds = new Set(Object.keys(history));
  const { browser, context, page } = await openContext();
  log("monitor", `startup dry_run=${config.dryRun} history=${attemptedIds.size}`);
  let cycle = 0;
  let isProcessing = false;
  let pendingTrigger = false;
  let processedPropertyCount = 0;

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

        const queued = await takeQueuedTasks(config.bidQueuePath, config.maxBidsPerCycle);
        const tasks = queued.tasks.filter((task) => !attemptedIds.has(task.workId));
        log(
          "monitor",
          `cycle=${cycle} dequeued=${queued.tasks.length} candidates=${tasks.length} remaining_queue=${queued.queueSize}`,
        );

        if (tasks.length === 0) {
          await openDashboardWhileIdle();
          break;
        }

        for (const queuedTask of tasks) {
          const { workId, dashboardUrlIndex } = queuedTask;
          processedPropertyCount += 1;
          // const studyEvery = config.japaneseStudyEveryNProperties;
          // if (studyEvery > 0 && processedPropertyCount % studyEvery === 0) {
          //   void studyNativeJapanese(`auto-monitor-${processedPropertyCount}`).catch((err) => {
          //     error(
          //       "monitor",
          //       `study-japanese failed property_count=${processedPropertyCount}`,
          //       err,
          //     );
          //   });
          // }

          log("monitor", `cycle=${cycle} open_task_link work_id=${workId}`);
          try {
            let detail = await scrapeTaskDetail(page, workId);
            if (!isValidTaskDetail(detail)) {
              log("monitor", `cycle=${cycle} detail_invalid work_id=${workId} retry=1`);
              detail = await scrapeTaskDetail(page, workId);
            }
            if (!isValidTaskDetail(detail)) {
              log("monitor", `cycle=${cycle} cannot submit on this task work_id=${workId}`);
              history[workId] = {
                attemptedAt: new Date().toISOString(),
                status: "failed",
                reason: "invalid_detail",
              };
              attemptedIds.add(workId);
              await saveHistory(config.seenIdsPath, history);
              await openDashboardWhileIdle();
              continue;
            }
            detail = { ...detail, dashboardUrlIndex };
            log("monitor", `cycle=${cycle} detail_loaded work_id=${workId} title="${detail.title.slice(0, 80)}"`);
            const result = await submitBid(page, detail);
            history[workId] = {
              attemptedAt: result.attemptedAt,
              status: result.status,
              reason: result.reason,
              stepHistory: result.stepHistory,
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
