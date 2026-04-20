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
  console.log(`Loaded ${seen.size} known work id(s). Dashboard: ${config.dashboardUrl}`);
  if (!bootstrapDone) {
    console.log(
      "BOOTSTRAP_SILENT: first refresh will record current listings without notifying.",
    );
  }

  const { browser, context } = await createBrowserContext();
  const page = await context.newPage();

  const persistSeen = async () => {
    await saveSeenIds(config.seenIdsPath, seen);
  };

  const tick = async () => {
    await page.goto(config.dashboardUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 800));

    const tasks = await scrapeTasksFromPage(page);

    if (!bootstrapDone) {
      for (const task of tasks) seen.add(task.workId);
      await persistSeen();
      bootstrapDone = true;
      console.log(`[bootstrap] recorded ${tasks.length} work id(s), no notifications sent.`);
      return;
    }

    for (const task of tasks) {
      if (seen.has(task.workId)) continue;

      if (!isTaskSuitable(task)) {
        console.log(`[not suitable] ${task.workId} ${task.title.slice(0, 80)}`);
        seen.add(task.workId);
        await persistSeen();
        continue;
      }

      console.log(`[match] ${task.workId} ${task.title.slice(0, 80)}`);
      try {
        await notifyDesktopMatch(task);
        // await notifyBidBot(task);
        seen.add(task.workId);
        await persistSeen();
      } catch (err) {
        console.error(`[notify failed] ${task.workId}`, err);
      }
    }
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
    await context.close();
    await browser.close();
  }
}
