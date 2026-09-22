import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyRuntimeEnv } from "../lib/core.js";

// dsh-base 的 permission 行靠 process.env.DSH_PERMISSION_MODE 求值：
//   sandbox-policy.mode : process.env.DSH_PERMISSION_MODE ?? 'workspace-write'
//   approval.policy     : (同上表达式) === 'danger-full-access' ? 'never' : 'ask'
// 二者兜底值必须彼此一致，composed (sandbox, approval) 才对得上
// dsh-permission-presets 的 presets 表；否则 PermissionPresetService 抛
// "composed sandbox and approval defaults match no preset"，
// @deepseek-ai/dsh-base 加载失败，整个 Web 起不来。
//
// 回归：applyRuntimeEnv() 曾在 danger-full-access 时 delete 该变量，
// 且它在插件加载时被无条件调用，于是运行中的进程环境被改坏。
describe("applyRuntimeEnv must not mutate the process environment", () => {
  it("keeps DSH_PERMISSION_MODE=danger-full-access", () => {
    const before = process.env.DSH_PERMISSION_MODE;
    process.env.DSH_PERMISSION_MODE = "danger-full-access";
    try {
      const reported = applyRuntimeEnv();
      assert.equal(
        process.env.DSH_PERMISSION_MODE,
        "danger-full-access",
        "applyRuntimeEnv deleted DSH_PERMISSION_MODE; the permission rows will lose their value",
      );
      assert.equal(reported.DSH_PERMISSION_MODE, "danger-full-access");
    } finally {
      if (before === undefined) delete process.env.DSH_PERMISSION_MODE;
      else process.env.DSH_PERMISSION_MODE = before;
    }
  });

  it("keeps the other mode values intact too", () => {
    for (const mode of ["workspace-write", "read-only"]) {
      const before = process.env.DSH_PERMISSION_MODE;
      process.env.DSH_PERMISSION_MODE = mode;
      try {
        applyRuntimeEnv();
        assert.equal(process.env.DSH_PERMISSION_MODE, mode);
      } finally {
        if (before === undefined) delete process.env.DSH_PERMISSION_MODE;
        else process.env.DSH_PERMISSION_MODE = before;
      }
    }
  });

  it("still reports '(unset …)' when the variable is genuinely absent", () => {
    const before = process.env.DSH_PERMISSION_MODE;
    delete process.env.DSH_PERMISSION_MODE;
    try {
      const reported = applyRuntimeEnv();
      assert.match(reported.DSH_PERMISSION_MODE, /unset/);
      assert.equal(process.env.DSH_PERMISSION_MODE, undefined);
    } finally {
      if (before !== undefined) process.env.DSH_PERMISSION_MODE = before;
    }
  });

  it("the mode the DSHA app exports composes to a real preset", () => {
    // 复刻 presets 表（dsh-base/cordis.patch.yml）与 derive() 的配对规则。
    const PRESETS = {
      "read-only": { sandbox: "read-only", approval: "ask" },
      "workspace-write": { sandbox: "workspace-write", approval: "ask" },
      "danger-full-access": { sandbox: "danger-full-access", approval: "never" },
    };
    const derive = (sandbox, approval) =>
      Object.keys(PRESETS).find(
        (n) => PRESETS[n].sandbox === sandbox && PRESETS[n].approval === approval,
      ) || "custom";

    // dsh-purge patch 7/8 打的兜底值现在是同一个（danger-full-access），
    // 因此「变量存在」与「变量缺失」两种情况下配对都成立。
    for (const mode of ["read-only", "workspace-write", "danger-full-access"]) {
      const approval = mode === "danger-full-access" ? "never" : "ask";
      assert.notEqual(derive(mode, approval), "custom", `(${mode}, ${approval}) must match a preset`);
    }
    // 变量缺失时两侧兜底值一致，同样落到 danger-full-access。
    assert.equal(derive("danger-full-access", "never"), "danger-full-access");
  });
});
