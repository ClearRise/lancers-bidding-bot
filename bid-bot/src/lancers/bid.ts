import type { Page } from "playwright";
import { selectors } from "./selectors.js";
import { config } from "../config.js";
import { generateProposalText } from "../ai-proposal.js";
import type { BidResult, TaskDetail } from "../types.js";

const STATIC_ESTIMATE_TEXT = `詳細はメッセージにてご相談できればと思っております。`;

function calculateEstimatePrice(task: TaskDetail): number | null {
  const min = task.budgetMinJpy;
  const max = task.budgetMaxJpy;
  let estimated: number | null = null;

  if (min != null && max != null) {
    // estimate = min + (max - min) * rate
    estimated = min + (max - min) * config.budgetDefinitionRate;
  } else if (min != null) {
    estimated = min;
  } else if (max != null) {
    estimated = max;
  }

  if (estimated == null) return null;
  const rounded = Math.round(estimated / 1000) * 1000;
  return Math.max(1000, rounded);
}

function toDeliverDate(deadline: string | null): string {
  if (deadline) {
    const m = deadline.match(/(\d{4})年0?(\d{1,2})月0?(\d{1,2})日/);
    if (m) {
      const yyyy = m[1];
      const month = String(Number(m[2]));
      const day = m[3].padStart(2, "0");
      return `${yyyy}-${month}-${day}`;
    }
  }

  const d = new Date();
  d.setDate(d.getDate() + 7);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")}`;
}

async function ensureNdaAgreement(page: Page): Promise<void> {
  const checkbox = page.locator(selectors.ndaAgreementCheckbox).first();
  if (!(await checkbox.count())) return;

  try {
    if (await checkbox.isChecked()) return;
  } catch {
    // Continue with fallback actions below.
  }

  try {
    await checkbox.scrollIntoViewIfNeeded();
    await checkbox.check({ force: true });
    return;
  } catch {
    // fallback to label click
  }

  const label = page.locator('label[for="ProposalIsAgreement"]').first();
  if (await label.count()) {
    await label.scrollIntoViewIfNeeded();
    await label.click({ force: true });
  }
}

async function setEstimatePriceValue(page: Page, value: number): Promise<boolean> {
  const amount = page.locator(selectors.estimatePriceInput).first();
  if (!(await amount.count())) return false;

  const commitByBlur = async (): Promise<void> => {
    await amount.evaluate((el) => {
      const input = el as HTMLInputElement;
      input.blur();
    });
    await page.keyboard.press("Tab").catch(() => undefined);
    await page.locator("body").click({ position: { x: 5, y: 5 }, force: true }).catch(() => undefined);
    await page.waitForTimeout(120);
  };

  try {
    await amount.scrollIntoViewIfNeeded().catch(() => undefined);
    await amount.click({ force: true });
    await amount.fill("");
    await amount.type(String(value), { delay: 20 });
    await commitByBlur();
    const afterType = await amount.inputValue().catch(() => "");
    if (afterType === String(value)) return true;
  } catch {
    // Fall through to evaluate-based setter.
  }

  try {
    await amount.evaluate((el, v) => {
      const input = el as HTMLInputElement;
      input.value = String(v);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    await commitByBlur();
    const afterEval = await amount.inputValue().catch(() => "");
    return afterEval === String(value);
  } catch {
    return false;
  }
}

export async function submitBid(page: Page, task: TaskDetail): Promise<BidResult> {
  if (config.dryRun) {
    return {
      workId: task.workId,
      attemptedAt: new Date().toISOString(),
      status: "skipped",
      reason: "dry-run",
    };
  }

  await ensureNdaAgreement(page);

  console.log("proposal estimate filling...");
  const estimate = page.locator(selectors.proposalEstimateTextarea).first();
  if (await estimate.count()) {
    await estimate.fill(STATIC_ESTIMATE_TEXT);
  }

  console.log("ai proposal creating...");
  const aiProposal = await generateProposalText(task).catch(() => null);
  const finalProposal =
    aiProposal ?? "はじめまして。募集内容を確認しました。詳細をすり合わせの上で迅速に対応いたします。";
  
  console.log("proposal description filling...");
  const proposalDescription = page.locator(selectors.proposalDescriptionTextarea).first();
  if (!(await proposalDescription.count())) {
    return {
      workId: task.workId,
      attemptedAt: new Date().toISOString(),
      status: "failed",
      reason: "proposal_description_field_not_found",
    };
  }
  await proposalDescription.fill(finalProposal);

  console.log("deliver date filling...");
  const deliverDate = page.locator(selectors.estimateDeliverDateInput).first();
  if (await deliverDate.count()) {
    await deliverDate.fill(toDeliverDate(task.deadline));
  }

  console.log("estimate price filling...");
  const estimatePrice = calculateEstimatePrice(task);
  console.log("estimate price:", estimatePrice);
  if (estimatePrice != null) {
    const ok = await setEstimatePriceValue(page, estimatePrice);
    if (!ok) {
      console.log("estimate price input not found");
    } else {
      console.log("estimate price applied");
    }
  }

  console.log("submit button clicking...");
  const submit = page.locator(selectors.submitButton).first();
  if (!(await submit.count())) {
    return {
      workId: task.workId,
      attemptedAt: new Date().toISOString(),
      status: "failed",
      reason: "submit_button_not_found",
    };
  }
  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    submit.click(),
  ]);
  
  // Final confirmation page: wait for load, then try final submit.
  await page.waitForLoadState("domcontentloaded");
  const finalSubmit = page.locator("#form_end").first();
  if (await finalSubmit.isVisible().catch(() => false)) {
    console.log("final submit button found");
    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      // finalSubmit.click(),
    ]);
  } else {
    console.log("final submit button not found");
  }

  return {
    workId: task.workId,
    attemptedAt: new Date().toISOString(),
    status: "submitted",
  };
}
