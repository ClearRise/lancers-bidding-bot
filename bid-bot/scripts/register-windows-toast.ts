import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { arch, env, execPath } from "node:process";

const require = createRequire(import.meta.url);
const notifierRoot = path.dirname(require.resolve("node-notifier/package.json"));
const is64 = arch === "x64" || arch === "arm64";
const snoreExe = path.join(
  notifierRoot,
  "vendor",
  "snoreToast",
  `snoretoast-x${is64 ? "64" : "86"}.exe`,
);

const appId = env.WINDOWS_TOAST_APP_ID ?? "Cursor";
const shortcutName = env.WINDOWS_TOAST_SHORTCUT_NAME ?? "Cursor\\Cursor.lnk";
const targetExe = env.WINDOWS_TOAST_REGISTER_EXE ?? execPath;
const iconPathRaw = env.WINDOWS_TOAST_ICON_PATH ?? "./cursor-ai-code-icon.ico";
const iconPath = path.isAbsolute(iconPathRaw)
  ? iconPathRaw
  : path.resolve(process.cwd(), iconPathRaw);

async function main(): Promise<void> {
  if (!existsSync(snoreExe)) {
    console.error(`SnoreToast executable not found: ${snoreExe}`);
    process.exit(1);
  }
  if (!existsSync(iconPath)) {
    console.error(`WINDOWS_TOAST_ICON_PATH not found: ${iconPath}`);
    process.exit(1);
  }

  const args = ["-install", shortcutName, targetExe, appId, iconPath];
  console.log("Running:", snoreExe, args.join(" "));
  const result = spawnSync(snoreExe, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) {
    console.error("register-windows-toast failed with exit", result.status);
    process.exit(result.status ?? 1);
  }
  console.log(`Done. Registered AppID: ${appId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
