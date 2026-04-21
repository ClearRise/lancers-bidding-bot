import fs from "node:fs/promises";

export async function loadQueue(path: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

export async function saveQueue(path: string, queue: string[]): Promise<void> {
  await fs.writeFile(path, JSON.stringify(queue, null, 2), "utf8");
}

export function enqueueUnique(queue: string[], workId: string): { queue: string[]; added: boolean } {
  const exists = queue.includes(workId);
  if (exists) return { queue, added: false };
  return { queue: [...queue, workId], added: true };
}

export async function enqueueTask(path: string, workId: string): Promise<{ added: boolean; queueSize: number }> {
  const queue = await loadQueue(path);
  const next = enqueueUnique(queue, workId);
  if (next.added) {
    await saveQueue(path, next.queue);
  }
  return { added: next.added, queueSize: next.queue.length };
}

export async function takeQueuedWorkIds(
  path: string,
  maxCount: number,
): Promise<{ workIds: string[]; queueSize: number }> {
  const queue = await loadQueue(path);
  const workIds = queue.slice(0, maxCount);
  const remaining = queue.slice(maxCount);
  if (workIds.length > 0) {
    await saveQueue(path, remaining);
  }
  return { workIds, queueSize: remaining.length };
}
