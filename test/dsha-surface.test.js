import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adapterFor, detectSurface, isDshaSurface } from "../lib/surface.js";
import * as dsha from "../lib/dsha.js";

// DSHA 新版本注入的完整启动环境（源码：HarnessController.runCoreCommand）。
const DSHA_ENV = {
  DSH_HOME: "/root/.dsh",
  DSH_PERMISSION_MODE: "workspace-write",
  DSH_CONFIRM: "1",
  BROWSER: "true",
  DSHA_PRELOAD_PREVIOUS: "",
  NODE_OPTIONS: "--import=/root/.dsh/startup-observer.cjs",
  DSHA_UI_LANGUAGE: "en",
  DSHA_STARTUP_PROFILE: "web",
  DSHA_WEB_GENERATION: "7",
  DSHA_DNS_MODE: "auto",
  DSHA_APP: "1",
  PATH: "/root/dsh-bin:/usr/local/bin:/usr/bin:/bin",
  HOME: "/root",
};
const DSHA_ARGV = ["/usr/local/bin/node", "/usr/local/bin/dsh", "web", "--no-open", "--host", "127.0.0.1", "--port", "3080"];
const DSHA_EXEC = "/usr/local/bin/node";

describe("DSHA host adapter", () => {
  it("detects the explicit Android host marker", () => {
    assert.equal(detectSurface({ env: { DSHA_APP: "1" }, argv: [], execPath: "/usr/bin/node" }), "dsha");
    assert.equal(adapterFor("dsha"), "dsha");
  });

  it("detects a real DSHA Web environment", () => {
    assert.equal(detectSurface({ env: DSHA_ENV, argv: DSHA_ARGV, execPath: DSHA_EXEC }), "dsha");
  });

  it("still detects DSHA builds that predate DSHA_APP", () => {
    // 回归：DSHA 曾经不注入 DSHA_APP，插件因此误判为独立 dsh Web。
    const legacy = { ...DSHA_ENV };
    delete legacy.DSHA_APP;
    assert.equal(detectSurface({ env: legacy, argv: DSHA_ARGV, execPath: DSHA_EXEC }), "dsha");
  });

  it("keeps a plain official dsh Web CLI on the web surface", () => {
    const env = { DSH_HOME: "/root/.dsh", PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/root" };
    assert.equal(detectSurface({ env, argv: DSHA_ARGV, execPath: DSHA_EXEC }), "web");
    assert.equal(isDshaSurface({ env }), false);
  });

  it("treats DSHA_APP=0 as an explicit denial of the DSHA surface", () => {
    assert.equal(isDshaSurface({ env: { DSHA_APP: "0" } }), false);
    assert.equal(detectSurface({ env: { DSHA_APP: "0", DSHA_WEB_GENERATION: "7" }, argv: [], execPath: "/usr/bin/node" }), "web");
  });

  it("honours an explicit DSH_SURFACE override", () => {
    assert.equal(detectSurface({ env: { ...DSHA_ENV, DSH_SURFACE: "web" }, argv: DSHA_ARGV, execPath: DSHA_EXEC }), "web");
  });

  it("does not respawn the container-managed Web process", () => {
    assert.deepEqual(dsha.scheduleRestart(), { manual: true, hostManaged: true });
    assert.match(dsha.restartNote(), /DSHA/);
  });
});
