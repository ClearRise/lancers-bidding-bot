import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { config } from "./config.js";
import { enqueueUnique, loadQueue, saveQueue, type QueuedTask } from "./queue-store.js";
import { error, log } from "./logger.js";

type NotifyPayload = {
  source?: string;
  workId?: string;
  url?: string;
  title?: string;
  snippet?: string;
  budgetMinJpy?: number | null;
  budgetMaxJpy?: number | null;
  budgetDisplayText?: string | null;
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += String(chunk);
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function isValidPayload(payload: NotifyPayload): payload is Required<Pick<NotifyPayload, "workId" | "url" | "title" | "snippet">> & NotifyPayload {
  return (
    typeof payload.workId === "string" &&
    payload.workId.length > 0 &&
    typeof payload.url === "string" &&
    payload.url.length > 0 &&
    typeof payload.title === "string" &&
    typeof payload.snippet === "string"
  );
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export async function startApiServer(signal: AbortSignal): Promise<void> {
  let queue = await loadQueue(config.bidQueuePath);
  log("api", `loaded queue_size=${queue.length}`);

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        return json(res, 200, { ok: true, queueSize: queue.length });
      }

      if (req.method === "POST" && req.url === "/notify") {
        if (config.bidBotSecret) {
          const secret = req.headers["x-bot-secret"];
          if (secret !== config.bidBotSecret) {
            return json(res, 401, { ok: false, error: "unauthorized" });
          }
        }

        const raw = await readBody(req);
        const payload = JSON.parse(raw) as NotifyPayload;
        if (!isValidPayload(payload)) {
          return json(res, 400, { ok: false, error: "invalid_payload" });
        }

        const queued: QueuedTask = {
          workId: payload.workId,
          url: payload.url,
          title: payload.title,
          snippet: payload.snippet,
          budgetMinJpy: payload.budgetMinJpy ?? null,
          budgetMaxJpy: payload.budgetMaxJpy ?? null,
          budgetDisplayText: payload.budgetDisplayText ?? null,
          queuedAt: new Date().toISOString(),
          source: payload.source ?? "unknown",
        };

        const next = enqueueUnique(queue, queued);
        queue = next.queue;
        if (next.added) {
          await saveQueue(config.bidQueuePath, queue);
          log("api", `queued work_id=${queued.workId} queue_size=${queue.length}`);
        } else {
          log("api", `duplicate_ignored work_id=${queued.workId}`);
        }
        return json(res, 200, { ok: true, queued: next.added, queueSize: queue.length });
      }

      json(res, 404, { ok: false, error: "not_found" });
    } catch (e) {
      error("api", "request_failed", e);
      json(res, 500, { ok: false, error: "internal_error" });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.bidBotPort, () => resolve());
  });
  log("api", `listening port=${config.bidBotPort}`);

  await new Promise<void>((resolve) => {
    signal.addEventListener(
      "abort",
      () => {
        server.close(() => resolve());
      },
      { once: true },
    );
  });
  log("api", "shutdown complete");
}
