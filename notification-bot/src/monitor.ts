import { config } from "./config.js";
import { createBrowserContext } from "./browser.js";
import { scrapeTasksFromPage } from "./extract-tasks.js";
import { isTaskSuitable } from "./filters.js";
import type { ScrapedTask } from "./types.js";
import { loadSeenIds, saveSeenIds } from "./seen-store.js";
import { notifyBidBot } from "./notify-bid-bot.js";
import { notifyMatchedTask } from "./notify-desktop.js";

export async function runMonitorLoop(signal: AbortSignal): Promise<void> {
  const seen = await loadSeenIds(config.seenIdsPath);
  let processCount = 0;
  let saveLock: Promise<void> = Promise.resolve();
  const taskQueue: ScrapedTask[] = [];
  let queueWaiter: (() => void) | null = null;
  const workerBootstrapDone = config.dashboardUrls.map(() => seen.size > 0 || !config.bootstrapSilent);

  const enqueueTask = (task: ScrapedTask) => {
    taskQueue.push(task);
    if (queueWaiter) {
      const resolve = queueWaiter;
      queueWaiter = null;
      resolve();
    }
  };

  const waitForTask = async (): Promise<void> => {
    if (taskQueue.length > 0) return;
    await new Promise<void>((resolve) => {
      queueWaiter = resolve;
      signal.addEventListener(
        "abort",
        () => {
          if (queueWaiter) {
            const done = queueWaiter;
            queueWaiter = null;
            done();
          }
        },
        { once: true },
      );
    });
  };

  const withSeenLock = async (fn: () => Promise<void>) => {
    saveLock = saveLock.then(fn, fn);
    await saveLock;
  };

  const markSeen = async (workId: string) => {
    await withSeenLock(async () => {
      seen.add(workId);
      await saveSeenIds(config.seenIdsPath, seen);
    });
  };

  console.log(`[monitor] startup: loaded ${seen.size} known work id(s)`);
  console.log(`[monitor] startup: dashboards=${config.dashboardUrls.length}`);
  console.log(`[monitor] startup: refresh_interval_ms=${config.refreshIntervalMs}`);
  if (!(seen.size > 0 || !config.bootstrapSilent)) {
    console.log("[monitor] startup: bootstrap_silent enabled, first cycle stores ids only");
  }

  const { browser, context } = await createBrowserContext();

  try {
    const workers = config.dashboardUrls.map((url, workerIndex) => (async () => {
      const page = await context.newPage();
      let cycle = 0;
      while (!signal.aborted) {
        cycle += 1;
        try {
          console.log(`[monitor][worker ${workerIndex + 1}][cycle ${cycle}] refreshing dashboard-${workerIndex + 1}`);
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
          await new Promise((r) => setTimeout(r, 800));
          const tasks = await scrapeTasksFromPage(page);
          console.log(`[monitor][worker ${workerIndex + 1}][cycle ${cycle}] scraped=${tasks.length}`);

          if (!workerBootstrapDone[workerIndex]) {
            for (const task of tasks) {
              await markSeen(task.workId);
            }
            workerBootstrapDone[workerIndex] = true;
            console.log(`[monitor][worker ${workerIndex + 1}][cycle ${cycle}] bootstrap_complete`);
          } else {
            for (const task of tasks) {
              enqueueTask(task);
            }
          }
        } catch (err) {
          console.error(`[monitor][worker ${workerIndex + 1}][cycle ${cycle}] failed`, err);
        }

        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, config.refreshIntervalMs);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(t);
              resolve();
            },
            { once: true },
          );
        });
      }
      await page.close();
    })());

    const processor = (async () => {
      while (!signal.aborted) {
        await waitForTask();
        const task = taskQueue.shift();
        if (!task) continue;
        processCount += 1;
        if (seen.has(task.workId)) continue;

        console.log(`[monitor][process ${processCount}][task ${task.workId}] evaluate title="${task.title.slice(0, 80)}"`);
        if (!(await isTaskSuitable(task))) {
          console.log(`[monitor][process ${processCount}][task ${task.workId}] result=not_matched`);
          await markSeen(task.workId);
          continue;
        }

        console.log(`[monitor][process ${processCount}][task ${task.workId}] result=matched`);
        try {
          console.log(`[monitor][process ${processCount}][task ${task.workId}] notifying desktop match`);
          await notifyMatchedTask(task);
          console.log(`[monitor][process ${processCount}][task ${task.workId}] notifying bid bot`);
          void notifyBidBot(task).catch((err) => {
            console.error(
              `[monitor][process ${processCount}][task ${task.workId}] notify_bid_bot=failed`,
              err,
            );
          });
          await markSeen(task.workId);
          console.log(`[monitor][process ${processCount}][task ${task.workId}] notify=enqueued`);
        } catch (err) {
          console.error(`[monitor][process ${processCount}][task ${task.workId}] notify=failed`, err);
        }
      }
    })();

    await Promise.all([...workers, processor]);
  } finally {
    console.log("[monitor] shutdown: closing browser context");
    await context.close();
    await browser.close();
    console.log("[monitor] shutdown: done");
  }
}
