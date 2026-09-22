import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rewritePromptAssembly, shouldInjectPrompt } from "../lib/identity.js";

describe("rewritePromptAssembly injectOnce", () => {
  it("first turn folds inject and keeps workspace sections", () => {
    const assembled = {
      sections: [
        { name: "deployment:persona-prefix", text: "official persona" },
        { name: "workspace-instructions", text: "AGENTS.md once" },
      ],
    };
    rewritePromptAssembly(assembled, { fallbackInject: "小码酱身份" });
    const names = assembled.sections.map((s) => s.name);
    assert.equal(names.includes("workspace-instructions"), true);
    assert.match(assembled.sections.find((s) => s.name === "deployment:persona-prefix").text, /小码酱身份/);
  });

  it("later turns do not inject again and do not pin the previous full prompt", () => {
    const assembled = {
      sections: [
        { name: "deployment:persona-prefix", text: "official persona" },
        { name: "workspace-instructions", text: "AGENTS.md this turn" },
      ],
    };
    rewritePromptAssembly(assembled, {
      fallbackInject: "",
      pinPersonaText: "上一轮整篇小码酱加AGENTS加AGENTS",
    });
    assert.equal(assembled.sections.length, 2);
    assert.equal(assembled.sections[1].name, "workspace-instructions");
    assert.equal(assembled.sections[1].text, "AGENTS.md this turn");
    assert.equal(assembled.sections.some((s) => String(s.text).includes("上一轮整篇")), false);
  });

  it("injectOnce skips after the first system prompt already contains inject", () => {
    const ctx = {
      turn: 2,
      session: {
        events: [{
          type: "system/message",
          data: { message: { content: [{ type: "text", text: "小码酱身份\n其它" }] } },
        }],
      },
    };
    assert.equal(shouldInjectPrompt(ctx, true, "小码酱身份"), false);
    assert.equal(shouldInjectPrompt(ctx, true, "小码酱身份") && shouldInjectPrompt({ turn: 1 }, true, "小码酱身份"), false);
    assert.equal(shouldInjectPrompt({ turn: 1 }, true, "小码酱身份"), true);
  });
});
