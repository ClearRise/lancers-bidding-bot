import fs from "node:fs/promises";

export type QueuedTask = {
  workId: string;
  url: string;
  title: string;
  snippet: string;
  budgetMinJpy: number | null;
  budgetMaxJpy: number | null;
  budgetDisplayText: string | null;
  queuedAt: string;
  source: string;
};

export async function loadQueue(path: string): Promise<QueuedTask[]> {
  try {
    const raw = await fs.readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is QueuedTask =>
        !!x &&
        typeof x === "object" &&
        typeof (x as { workId?: unknown }).workId === "string" &&
        typeof (x as { url?: unknown }).url === "string",
    );
  } catch {
    return [];
  }
}

export async function saveQueue(path: string, queue: QueuedTask[]): Promise<void> {
  await fs.writeFile(path, JSON.stringify(queue, null, 2), "utf8");
}

export function enqueueUnique(queue: QueuedTask[], task: QueuedTask): { queue: QueuedTask[]; added: boolean } {
  const exists = queue.some((x) => x.workId === task.workId);
  if (exists) return { queue, added: false };
  return { queue: [...queue, task], added: true };
}
