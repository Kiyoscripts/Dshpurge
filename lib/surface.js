import path from "node:path";

/** 当前已接线的宿主面。gui / tui 先能识别，适配仍回退 web。 */
export const SURFACES = Object.freeze(["web", "desktop", "dsha", "gui", "tui"]);

function norm(value) {
  return String(value || "").trim().toLowerCase();
}

function slash(value) {
  return String(value || "").replace(/\\/g, "/").toLowerCase();
}

function exeName(execPath) {
  return path.basename(String(execPath || "")).toLowerCase();
}

export function pathLooksDesktop(p) {
  const n = slash(p);
  if (!n) return false;
  return (
    n.includes("/dsh desktop/") ||
    n.includes("/dsh desktop.app/") ||
    n.includes("dsh-desktop") ||
    n.includes("dsh-plugin-desktop") ||
    /\/dsh desktop\.exe$/i.test(n) ||
    n.endsWith("/host-process-entry.js") ||
    n.endsWith("/desktop-cli.js")
  );
}

export function isDesktopSurface(input = {}) {
  const env = input.env ?? process.env;
  const forced = norm(env.DSH_SURFACE);
  if (forced === "desktop") return true;
  if (forced && SURFACES.includes(forced)) return false;

  const execPath = input.execPath ?? process.execPath;
  const name = exeName(execPath);
  if (name === "dsh desktop.exe" || name === "dsh desktop") return true;
  if (pathLooksDesktop(execPath)) return true;

  const resourcesPath = input.resourcesPath ?? process.resourcesPath;
  if (pathLooksDesktop(resourcesPath)) return true;

  const argv = input.argv ?? process.argv;
  if ((Array.isArray(argv) ? argv : []).some((arg) => pathLooksDesktop(arg))) return true;

  const parentPort = input.parentPort !== undefined ? input.parentPort : process.parentPort;
  if (parentPort && (pathLooksDesktop(execPath) || pathLooksDesktop(resourcesPath))) return true;

  if (env.ELECTRON_RUN_AS_NODE && pathLooksDesktop(execPath)) return true;
  return false;
}

function forcedSurface(env) {
  const forced = norm(env.DSH_SURFACE);
  return SURFACES.includes(forced) ? forced : "";
}

/** DSHA 专有环境标记；只在 App 启动 Web 时注入。 */
const DSHA_ONLY_ENV = [
  "DSHA_APP",
  "DSHA_WEB_GENERATION",
  "DSHA_STARTUP_PROFILE",
  "DSHA_UI_LANGUAGE",
  "DSHA_PRELOAD_PREVIOUS",
  "DSHA_DNS_MODE",
];

export function isDshaSurface(input = {}) {
  const env = input.env ?? process.env;
  // 1) 显式标记：DSHA >= 本次修复后始终为 "1"。显式给了其它值（例如 "0"）
  //    表示调用方明确否认 DSHA，此时不再看下面的旁证变量。
  const explicit = String(env.DSHA_APP ?? "").trim();
  if (explicit === "1") return true;
  if (explicit !== "") return false;
  // 2) 兼容旧版 DSHA：这些变量只由 App 的启动命令注入，
  //    独立 dsh CLI 不会设置，出现任意一个即可判定宿主为 DSHA。
  return DSHA_ONLY_ENV.some(
    (key) => key !== "DSHA_APP" && String(env[key] ?? "").trim() !== "",
  );
}

export function detectSurface(input = {}) {
  const env = input.env ?? process.env;
  const forced = forcedSurface(env);
  if (forced) return forced;
  if (isDshaSurface(input)) return "dsha";
  if (isDesktopSurface(input)) return "desktop";
  return "web";
}

/** gui / tui 尚未单独适配，先走 web 重启与探测。 */
export function adapterFor(kind) {
  if (kind === "desktop") return "desktop";
  if (kind === "dsha") return "dsha";
  return "web";
}
