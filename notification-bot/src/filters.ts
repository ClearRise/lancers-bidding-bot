import { config } from "./config.js";
import type { ScrapedTask } from "./types.js";

function normalize(s: string): string {
  return s.toLowerCase();
}

/**
 * Returns true if the task passes keyword / budget filters.
 */
export function isTaskSuitable(task: ScrapedTask): boolean {
  const normalizedSnippet = normalize(task.snippet);

  for (const keyword of config.excludeKeywords) {
    if (keyword && normalizedSnippet.includes(normalize(keyword))) return false;
  }

  if (config.includeKeywords.length > 0) {
    const any = config.includeKeywords.some(
      (keyword) => keyword && normalizedSnippet.includes(normalize(keyword)),
    );
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
