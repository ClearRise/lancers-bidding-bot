import { config } from "./config.js";
import type { ScrapedTask } from "./types.js";

function normalize(s: string): string {
  return s.toLowerCase();
}

/**
 * Returns true if the task passes keyword / budget filters.
 */
export function isTaskSuitable(task: ScrapedTask): boolean {
  const hay = normalize(`${task.title} ${task.snippet}`);

  for (const ex of config.excludeKeywords) {
    if (ex && hay.includes(normalize(ex))) return false;
  }

  if (config.matchKeywords.length > 0) {
    const any = config.matchKeywords.some((k) => k && hay.includes(normalize(k)));
    if (!any) return false;
  }

  const tMin = task.budgetMinJpy;
  const tMax = task.budgetMaxJpy;
  const unknown = tMin == null || tMax == null;

  if (unknown) {
    if (config.skipIfBudgetUnknown) return false;
  } else {
    const uMin = config.minBudgetJpy;
    const uMax = config.maxBudgetJpy;
    if (uMin != null && tMax < uMin) return false;
    if (uMax != null && tMin > uMax) return false;
  }

  return true;
}
