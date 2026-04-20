import fs from "node:fs/promises";

type BidHistory = Record<string, { attemptedAt: string; status: string; reason?: string }>;

export async function loadHistory(path: string): Promise<BidHistory> {
  try {
    const raw = await fs.readFile(path, "utf8");
    const parsed = JSON.parse(raw) as BidHistory;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export async function saveHistory(path: string, data: BidHistory): Promise<void> {
  await fs.writeFile(path, JSON.stringify(data, null, 2), "utf8");
}
