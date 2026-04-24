import type { Page } from "playwright";
import { selectors } from "./selectors.js";
import { config } from "../config.js";
// import { generateProposalText } from "../ai-proposal-openai.js";
// import { generateProposalText } from "../ai-proposal-base44.js";
// import { generateProposalText } from "../ai-proposal.js";
// import { generateProposalText } from "../ai-proposal-groq.js";
import { generateProposalText } from "../ai-proposal-mistral.js";
import type { BidResult, TaskDetail } from "../types.js";

const STATIC_ESTIMATE_TEXT = `詳細はメッセージにてご相談できればと思っております。`;

async function calculateEstimatePrice(task: TaskDetail): Promise<number | null> {
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
      const month = String(Number(m[2])).padStart(2, "0");
      const day = String(Number(m[3])).padStart(2, "0");
      return `${yyyy}-${month}-${day}`;
    }
  }

  const d = new Date();
  d.setDate(d.getDate() + 7);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
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
  const stepHistory: NonNullable<BidResult["stepHistory"]> = [];
  const recordStep = (
    step: string,
    status: "ok" | "skipped" | "failed",
    message?: string,
  ) => {
    stepHistory.push({
      step,
      status,
      ...(message ? { message } : {}),
      at: new Date().toISOString(),
    });
  };

  console.log("[bid] submitting bid for task: ", task.workId);
  if (config.dryRun) {
    recordStep("dry-run", "skipped", "DRY_RUN enabled");
    return {
      workId: task.workId,
      attemptedAt: new Date().toISOString(),
      status: "skipped",
      reason: "dry-run",
      stepHistory,
    };
  }

  const proposalDescription = page.locator(selectors.proposalDescriptionTextarea).first();
  if ((await proposalDescription.count()) === 0) {
    console.log("[bid] cannot submit on this task (proposal description field not found)");
    recordStep("form-check", "skipped", "proposal description field not found");
    return {
      workId: task.workId,
      attemptedAt: new Date().toISOString(),
      status: "skipped",
      reason: "proposal_description_field_not_found",
      stepHistory,
    };
  }

  // 1) NDA checkbox: only handle when present.
  const ndaCheckbox = page.locator(selectors.ndaAgreementCheckbox).first();
  if ((await ndaCheckbox.count()) > 0) {
    await ensureNdaAgreement(page);
    recordStep("nda-agreement", "ok");
  } else {
    recordStep("nda-agreement", "skipped", "field not found");
  }

  // 2) Fill estimate text area.
  console.log("[bid] proposal estimate filling...");
  const estimate = page.locator(selectors.proposalEstimateTextarea).first();
  const estimateCount = await estimate.count();
  if (estimateCount > 0) {
    await estimate.fill(STATIC_ESTIMATE_TEXT);
    recordStep("proposal-estimate-fill", "ok");
  } else {
    recordStep("proposal-estimate-fill", "skipped", "field not found");
  }

  console.log("[bid] ai proposal creating...");
  const aiProposal = await generateProposalText(task).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bid] AI proposal generation threw an unexpected error: ${message}`);
    return null;
  });
  
  if(!aiProposal) {
    recordStep("ai-proposal-generation", "failed", "ai proposal generation failed");
    return {
      workId: task.workId,
      attemptedAt: new Date().toISOString(),
      status: "failed",
      reason: "ai_proposal_generation_failed",
      stepHistory,
    };
  }
  
  console.log("[bid] proposal created");
  console.log("[bid] ============proposal start================");
  console.log(aiProposal);
  console.log("[bid] ============proposal end================");

  // 3) Fill proposal detail text area.
  console.log("[bid] proposal description filling...");
  try {
    const finalProposal =
      aiProposal ?? "はじめまして。募集内容を確認しました。詳細をすり合わせの上で迅速に対応いたします。";
    await proposalDescription.scrollIntoViewIfNeeded().catch(() => undefined);
    await proposalDescription.fill(finalProposal);
    recordStep("proposal-description-fill", "ok");
  } catch {
    recordStep("proposal-description-fill", "failed", "fill failed");
    return {
      workId: task.workId,
      attemptedAt: new Date().toISOString(),
      status: "failed",
      reason: "proposal_description_fill_failed",
      stepHistory,
    };
  }

  // 4) Fill estimate date.
  console.log("[bid] deliver date filling: ", toDeliverDate(task.deadline));
  const deliverDate = page.locator(selectors.estimateDeliverDateInput).first();
  const deliverDateCount = await deliverDate.count();
  if (deliverDateCount > 0) {
    await deliverDate.fill(toDeliverDate(task.deadline));
    recordStep("deliver-date-fill", "ok", toDeliverDate(task.deadline));
  } else {
    recordStep("deliver-date-fill", "skipped", "field not found");
  }

  // 5) Fill estimate price.
  const estimatePrice = await calculateEstimatePrice(task);
  console.log("[bid] estimate price filling: ", estimatePrice);
  if (estimatePrice != null) {
    const ok = await setEstimatePriceValue(page, estimatePrice);
    if (!ok) {
      console.log("[bid] estimate price filling failed");
      recordStep("estimate-price-fill", "failed", `value=${estimatePrice}`);
    } else {
      recordStep("estimate-price-fill", "ok", `value=${estimatePrice}`);
    }
  } else {
    recordStep("estimate-price-fill", "skipped", "value not computable");
  }
  
  // 6) Click submit button.
  console.log("[bid] submit button clicking...");
  const submit = page.locator(selectors.submitButton).first();
  const submitCount = await submit.count();
  if (submitCount === 0) {
    recordStep("submit-click", "failed", "submit button not found");
    return {
      workId: task.workId,
      attemptedAt: new Date().toISOString(),
      status: "failed",
      reason: "submit_button_not_found",
      stepHistory,
    };
  }

  // 7) Wait for next page load after first submit.
  // await Promise.all([
  //   page.waitForLoadState("domcontentloaded"),
  //   submit.click(),
  // ]);
  await page.waitForTimeout(500);
  await submit.click();
  await page.waitForTimeout(500);
  recordStep("submit-click", "ok");

  // 8) Click final submit button after the page is loaded.
  const finalSubmit = page.locator("#form_end").first();
  try {
    await finalSubmit.waitFor({ state: "visible", timeout: 10000 });
    console.log("[bid] final submit button found");
    recordStep("final-submit-check", "ok", "final submit button found");
    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      finalSubmit.click(),
    ]);
    await page.waitForTimeout(500);
    recordStep("final-submit-click", "ok");
  } catch {
    console.log("[bid] final submit button not found or timed out");
    recordStep("final-submit-check", "failed", "final submit button not found or timed out");
    return {
      workId: task.workId,
      attemptedAt: new Date().toISOString(),
      status: "failed",
      reason: "final_submit_button_not_found",
      stepHistory,
    };
  }

  console.log("[bid] bid submitted successfully");
  return {
    workId: task.workId,
    attemptedAt: new Date().toISOString(),
    status: "submitted",
    stepHistory,
  };
}
