import { config } from "./config.js";
import { createBrowserContext } from "./browser.js";
import { scrapeTasksFromPage } from "./extract-tasks.js";
import { isTaskSuitable } from "./filters.js";
import { loadSeenIds, saveSeenIds } from "./seen-store.js";
import { notifyBidBot } from "./notify.js";
import { notifyDesktopMatch } from "./desktop-notify.js";

export async function runMonitorLoop(signal: AbortSignal): Promise<void> {
  const seen = await loadSeenIds(config.seenIdsPath);
  let bootstrapDone = seen.size > 0 || !config.bootstrapSilent;
  let cycle = 0;
  console.log(`[monitor] startup: loaded ${seen.size} known work id(s)`);
  console.log(`[monitor] startup: dashboard=${config.dashboardUrl}`);
  console.log(`[monitor] startup: refresh_interval_ms=${config.refreshIntervalMs}`);
  if (!bootstrapDone) {
    console.log("[monitor] startup: bootstrap_silent enabled, first cycle stores ids only");
  }

  const { browser, context } = await createBrowserContext();
  const page = await context.newPage();

  const persistSeen = async () => {
    await saveSeenIds(config.seenIdsPath, seen);
  };

  const tick = async () => {
    cycle += 1;
    const cycleStart = Date.now();
    console.log(`[monitor][cycle ${cycle}] start`);
    console.log(`[monitor][cycle ${cycle}] step=navigate`);
    await page.goto(config.dashboardUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 800));

    console.log(`[monitor][cycle ${cycle}] step=scrape`);
    const tasks = await scrapeTasksFromPage(page);
    console.log(`[monitor][cycle ${cycle}] scraped=${tasks.length}`);

    if (!bootstrapDone) {
      for (const task of tasks) seen.add(task.workId);
      await persistSeen();
      bootstrapDone = true;
      console.log(
        `[monitor][cycle ${cycle}] bootstrap_complete recorded=${tasks.length} notified=0`,
      );
      console.log(`[monitor][cycle ${cycle}] end elapsed_ms=${Date.now() - cycleStart}`);
      return;
    }

    let seenSkipped = 0;
    let notMatched = 0;
    let matched = 0;
    let notifyFailed = 0;

    for (const task of tasks) {
      if (seen.has(task.workId)) {
        seenSkipped += 1;
        continue;
      }
      console.log(`[monitor][cycle ${cycle}][task ${task.workId}] evaluate title="${task.title.slice(0, 80)}"`);
      if (!(await isTaskSuitable(task))) {
        notMatched += 1;
        console.log(`[monitor][cycle ${cycle}][task ${task.workId}] result=not_matched`);
        seen.add(task.workId);
        await persistSeen();
        continue;
      }

      matched += 1;
      console.log(`[monitor][cycle ${cycle}][task ${task.workId}] result=matched`);
      try {
        await notifyDesktopMatch(task);
        await notifyBidBot(task);
        seen.add(task.workId);
        await persistSeen();
        console.log(`[monitor][cycle ${cycle}][task ${task.workId}] notify=success`);
      } catch (err) {
        notifyFailed += 1;
        console.error(`[monitor][cycle ${cycle}][task ${task.workId}] notify=failed`, err);
      }
    }

    console.log(
      `[monitor][cycle ${cycle}] summary scraped=${tasks.length} seen_skipped=${seenSkipped} not_matched=${notMatched} matched=${matched} notify_failed=${notifyFailed}`,
    );
    console.log(`[monitor][cycle ${cycle}] end elapsed_ms=${Date.now() - cycleStart}`);
  };

  try {
    while (!signal.aborted) {
      await tick();
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
  } finally {
    console.log("[monitor] shutdown: closing browser context");
    await context.close();
    await browser.close();
    console.log("[monitor] shutdown: done");
  }
}
