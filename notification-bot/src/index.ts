import { runMonitorLoop } from "./monitor.js";

const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
process.on("SIGTERM", () => controller.abort());

runMonitorLoop(controller.signal).catch((err) => {
  console.error(err);
  process.exit(1);
});
