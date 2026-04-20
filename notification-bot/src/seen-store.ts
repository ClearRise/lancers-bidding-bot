import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export async function loadSeenIds(path: string): Promise<Set<string>> {
  if (!existsSync(path)) return new Set();
  try {
    const raw = await readFile(path, "utf8");
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export async function saveSeenIds(path: string, ids: Set<string>): Promise<void> {
  await writeFile(path, JSON.stringify([...ids], null, 0) + "\n", "utf8");
}
