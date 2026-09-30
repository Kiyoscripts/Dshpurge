import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALL_PATCHES, applyReplacementsToText } from "../lib/core.js";

// 回归锚点：WAF/CDN 拦截页是完整 HTML，不是 JSON API 应答。原实现从任意文本里
// 正则抠 401/403 数字就判 AUTH，Cloudflare/Render 的 403 拦截页会让 UI 报
// 「API key is invalid」。patch id 47 必须把 HTML 拦截页归 BLOCKED、截断正文摘要，
// 并且只在干净的状态行上才可能判定为密钥错误。
const WAF_BLOCK_PAGE =
  "<!DOCTYPE html><html><head><title>Blocked</title></head><body>" +
  "<h1>403 - Forbidden</h1>Your request was blocked by this site's web application firewall " +
  "(WAF). Request ID: a4097a15b9d88986 Your IP address: 131.226.99.89" +
  "</body></html>";

// dsh-llm-pi-ai/lib/index.js 里被 patch 改写的原文（来自未打补丁的备份）。
// 只保留分类器函数本体：补丁会在它前面插三个辅助函数、改 AUTH 分支、改 message 行。
const ORIGINAL_SNIPPET =
  "function classifyPiAiError(message) {\n" +
  '\tif (/\\b(?:401|403)\\b/.test(message)) return "AUTH";\n' +
  "\treturn \"PI_AI_ERROR\";\n" +
  "}\n" +
  '\t\t\t\t\tmessage: text,\n' +
  "\t\t\t\t\tcode: classifyPiAiError(text)";

function loadWafPatch() {
  const patch = ALL_PATCHES.find((p) => p.id === 47);
  assert.ok(patch, "patch id 47 (WAF_BLOCK_CLASSIFIER) must exist");
  return patch;
}

describe("WAF_BLOCK_CLASSIFIER (patch id 47)", () => {
  it("targets dsh-llm-pi-ai and carries the block-page classifier", () => {
    const patch = loadWafPatch();
    assert.equal(patch.file, "dsh-llm-pi-ai");
    assert.ok(patch.markers.some((m) => m.includes("summarizeFailureText")));
    const text = patchReplacementsText(patch);
    assert.ok(text.includes("function isHtmlErrorBody(text)"));
    assert.ok(text.includes("function isBlockPage(text)"));
    assert.ok(text.includes("function summarizeFailureText(text)"));
    assert.ok(text.includes('return "BLOCKED"'));
  });

  it("keeps regex-AUTH but only for non-HTML bare status lines", () => {
    const patch = loadWafPatch();
    const text = patchReplacementsText(patch);
    // AUTH 判定必须被 isHtmlErrorBody 包住：HTML 标记不可能证明密钥错误。
    assert.ok(text.includes("!isHtmlErrorBody(message) && /\\b(?:401|403)\\b/.test(message)) return \"AUTH\""));
  });

  it("applies cleanly to the original snippet and is idempotent", () => {
    const patch = loadWafPatch();
    const once = applyReplacementsToText(ORIGINAL_SNIPPET, patch, "");
    assert.equal(once.changed, true);
    const out = once.text;
    assert.ok(out.includes("message: summarizeFailureText(text),"));
    assert.ok(!out.includes("message: text,\n"));
    // 已打上标记后再次应用必须无变化（skipIfMarked + markers）。
    const twice = applyReplacementsToText(out, patch, "");
    assert.equal(twice.changed, false);
  });

  it("classifies a WAF block page as BLOCKED, not AUTH", () => {
    const patch = loadWafPatch();
    const out = applyReplacementsToText(ORIGINAL_SNIPPET, patch, "").text;
    // 用打补丁后的文本重建分类器，直接验证语义。
    const classify = patchToClassifier(out);
    assert.equal(classify(WAF_BLOCK_PAGE), "BLOCKED");
    assert.equal(classify("401 Unauthorized"), "AUTH");
    assert.equal(classify('<title>502 Bad Gateway</title>'), "PI_AI_ERROR");
  });

  it("recovers the HTTP status from a block page whose body starts with markup", () => {
    // 拦截页以 <!DOCTYPE html> 开头，状态码不在行首。早期实现只做 /^\s*(\d{3})/，
    // 于是摘要退化成 "HTTP error"，把最关键的号码丢了。这里锁定必须取到 403。
    const patch = loadWafPatch();
    const out = applyReplacementsToText(ORIGINAL_SNIPPET, patch, "").text;
    const summarize = patchToSummarizer(out);
    const summary = summarize(WAF_BLOCK_PAGE);
    assert.match(summary, /HTTP 403/, `summary lost the status: ${summary}`);
    assert.match(summary, /not an API-key problem/);
    // 请求 ID 也要留在摘要里，便于对账。
    assert.match(summary, /a4097a15b9d88986/);
    // 摘要本身是一行固定文案，存在下限；真正要保证的是对真实拦截页的绝对截断：
    // 数百 KB 的 markup 必须收敛成一行，否则整页会进 transcript 并逐轮回放给模型。
    assert.ok(summary.length < 400, `summary not bounded: ${summary.length} bytes`);
    const huge =
      "<!DOCTYPE html><html><head><title>Blocked</title></head><body>" +
      "<h1>403 - Forbidden</h1>" +
      "<p>Your request was blocked by this site's web application firewall (WAF). " +
      "Request ID: a4097a15b9d88986</p><div>" +
      "x".repeat(200000) +
      "</div></body></html>";
    const hugeSummary = summarize(huge);
    assert.ok(
      hugeSummary.length < 400,
      `200KB block page was not truncated: ${hugeSummary.length} bytes`,
    );
    assert.match(hugeSummary, /HTTP 403/);
  });

  it("still reports a non-block HTML page with its status and title", () => {
    const patch = loadWafPatch();
    const out = applyReplacementsToText(ORIGINAL_SNIPPET, patch, "").text;
    const summarize = patchToSummarizer(out);
    const summary = summarize("<html><head><title>503 Service Unavailable</title></head><body>x</body></html>");
    assert.match(summary, /HTTP 503/, `summary lost the status: ${summary}`);
    assert.match(summary, /503 Service Unavailable/);
  });

  it("leaves a bare status line untouched (no HTML, no truncation)", () => {
    const patch = loadWafPatch();
    const out = applyReplacementsToText(ORIGINAL_SNIPPET, patch, "").text;
    const summarize = patchToSummarizer(out);
    assert.equal(summarize("401 Unauthorized"), "401 Unauthorized");
    assert.equal(summarize("connection reset by peer"), "connection reset by peer");
  });
});

function patchReplacementsText(patch) {
  return patch.replacements
    .map((r) => `${r.pattern}\n===REPLACE===\n${r.replace}`)
    .join("\n");
}

function patchToClassifier(text) {
  // 补丁在 classifyPiAiError 前面插入了三个辅助函数并改写了它的主体。
  // 原文尾部还带着 message/code 两行（属于调用方），eval 时把它们一并裁掉，
  // 剩下的整段 JS 即插完辅助函数 + 改完分支的完整分类器定义。
  const cut = text.indexOf("\n\t\t\t\t\tmessage: ");
  const body = (cut >= 0 ? text.slice(0, cut) : text);
  return new Function(`${body}\nreturn classifyPiAiError;`)();
}

function patchToSummarizer(text) {
  const cut = text.indexOf("\n\t\t\t\t\tmessage: ");
  const body = (cut >= 0 ? text.slice(0, cut) : text);
  return new Function(`${body}\nreturn summarizeFailureText;`)();
}