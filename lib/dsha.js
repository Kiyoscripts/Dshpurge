import fs from "node:fs";
import path from "node:path";
import * as core from "./core.js";

export function restartNote() {
  return "DSHA manages the Web process. Restart Web from the app's Launch page.";
}

export function portFromRequest(request) {
  const host = String(request?.headers?.host || "");
  const m = host.match(/:(\d+)$/);
  if (m) return Number(m[1]);
  return Number(process.env.PORT) || 3080;
}

export function hostFromRequest(request) {
  const hostHeader = String(request?.headers?.host || "127.0.0.1");
  return hostHeader.replace(/:\d+$/, "") || "127.0.0.1";
}

export function scheduleRestart() {
  // DSHA owns the proot/proroot launcher, PID identity, watchdog, and auth URL.
  // Exiting and respawning from inside the container bypasses those contracts.
  return { manual: true, hostManaged: true };
}

export function scheduleCleanupRestart({ cleanup = [] } = {}) {
  // Uninstall is intentionally handled by DSHA's plugin manager. This fallback
  // only removes plugin-private data; never delete the loaded package tree here.
  const dataDir = path.join(core.findDshHome(), "dsh-purge");
  for (const dir of cleanup) {
    if (!dir || path.resolve(dir) !== path.resolve(dataDir)) continue;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  return { manual: true, hostManaged: true };
}
