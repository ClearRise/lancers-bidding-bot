import { config } from "./config.js";
import { startApiServer } from "./api-server.js";
import { run } from "./monitor.js";

const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
process.on("SIGTERM", () => controller.abort());

async function main(): Promise<void> {
  const tasks: Promise<void>[] = [startApiServer(controller.signal)];
  if (config.enableMonitor) {
    tasks.push(run(controller.signal));
  }
  await Promise.all(tasks);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
