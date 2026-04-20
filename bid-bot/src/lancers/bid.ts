import type { Page } from "playwright";
import { selectors } from "./selectors.js";
import { config } from "../config.js";
import type { BidCandidate, BidResult } from "../types.js";

export async function submitBid(page: Page, task: BidCandidate): Promise<BidResult> {
  await page.goto(task.url, { waitUntil: "domcontentloaded", timeout: 60_000 });

  if (config.dryRun) {
    return {
      workId: task.workId,
      attemptedAt: new Date().toISOString(),
      status: "skipped",
      reason: "dry-run",
    };
  }

  const proposal = page.locator(selectors.proposalTextarea).first();
  await proposal.fill(config.proposalText);

  if (config.defaultBidAmountJpy != null) {
    const amount = page.locator(selectors.proposalAmountInput).first();
    if (await amount.count()) {
      await amount.fill(String(config.defaultBidAmountJpy));
    }
  }

  const submit = page.locator(selectors.submitButton).first();
  await submit.click();

  return {
    workId: task.workId,
    attemptedAt: new Date().toISOString(),
    status: "submitted",
  };
}
