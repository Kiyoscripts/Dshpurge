import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pluginAddSpec, TARBALL_URL } from "../lib/update.js";

describe("pluginAddSpec", () => {
  it("sends GitHub zip or http URLs to pnpm as tar.gz", () => {
    assert.equal(
      pluginAddSpec("https://github.com/YuJunZhiXue/dsh-purge/archive/refs/heads/master.zip"),
      TARBALL_URL,
    );
    assert.equal(pluginAddSpec(TARBALL_URL), TARBALL_URL);
    assert.equal(pluginAddSpec("https://example.invalid/dsh-purge.tgz"), TARBALL_URL);
  });

  it("keeps github: specs for git install", () => {
    assert.equal(pluginAddSpec("github:YuJunZhiXue/dsh-purge#master"), "github:YuJunZhiXue/dsh-purge#master");
    assert.equal(pluginAddSpec(""), "");
  });
});
