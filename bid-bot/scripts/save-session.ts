import "dotenv/config";
import { chromium } from "playwright";
import { config } from "../src/config.js";

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.lancers.jp/", { waitUntil: "domcontentloaded" });
  console.log("Please login manually, then press Enter in this terminal.");

  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });

  await context.storageState({ path: config.storageStatePath });
  await browser.close();
  console.log(`Saved storage state to ${config.storageStatePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
