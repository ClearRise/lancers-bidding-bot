/**
 * One-time (per machine): registers a Start Menu shortcut + App User Model ID for SnoreToast.
 * After this, toasts use your app name in the header instead of "SnoreToast" (must match WINDOWS_TOAST_APP_ID in .env).
 *
 * Requires SnoreToast bundled with node-notifier: .../node-notifier/vendor/snoreToast/snoretoast-x64.exe
 * If missing, install node-notifier normally or download SnoreToast from https://github.com/KDE/snoretoast
 *
 * Usage: npm run toast:register
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { arch, env, execPath } from "node:process";

const require = createRequire(import.meta.url);
const notifierRoot = path.dirname(
  require.resolve("node-notifier/package.json"),
);
const is64 = arch === "x64" || arch === "arm64";
const snoreExe = path.join(
  notifierRoot,
  "vendor",
  "snoreToast",
  `snoretoast-x${is64 ? "64" : "86"}.exe`,
);

const appId = env.WINDOWS_TOAST_APP_ID ?? "Lancers.NotificationBot";
/** Relative to Start Menu\Programs\ */
const shortcutName =
  env.WINDOWS_TOAST_SHORTCUT_NAME ??
  "Lancers Notification Bot\\Lancers Notification Bot.lnk";
const targetExe = env.WINDOWS_TOAST_REGISTER_EXE ?? execPath;

async function main(): Promise<void> {
  if (!existsSync(snoreExe)) {
    console.error(
      "SnoreToast executable not found at:\n  " +
        snoreExe +
        "\n\n" +
        "Reinstall dependencies (npm install) or place snoretoast-x64.exe from KDE SnoreToast next to node-notifier, then retry.",
    );
    process.exit(1);
  }

  const args = ["-install", shortcutName, targetExe, appId];
  console.log("Running:", snoreExe, args.join(" "));
  const r = spawnSync(snoreExe, args, { stdio: "inherit", shell: false });
  if (r.status !== 0) {
    console.error("register-windows-toast failed with exit", r.status);
    process.exit(r.status ?? 1);
  }
  console.log(
    "\nDone. Set WINDOWS_TOAST_APP_ID=" +
      JSON.stringify(appId) +
      " in .env if you used a custom value.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
