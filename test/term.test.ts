import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { colorEnabled, colorJson, painter, shortUrl, visible, wrap } from "../src/term.js";

describe("term", () => {
  it("colorEnabled follows TTY, NO_COLOR, FORCE_COLOR and TERM=dumb", () => {
    assert.equal(colorEnabled({ isTTY: true }, {}), true);
    assert.equal(colorEnabled({ isTTY: false }, {}), false);
    assert.equal(colorEnabled({ isTTY: true }, { NO_COLOR: "1" }), false);
    assert.equal(colorEnabled({ isTTY: true }, { TERM: "dumb" }), false);
    assert.equal(colorEnabled({ isTTY: false }, { FORCE_COLOR: "1" }), true);
    assert.equal(colorEnabled({ isTTY: true }, { FORCE_COLOR: "0" }), true);
  });

  it("painter adds codes only when on", () => {
    assert.equal(painter(false).red("x"), "x");
    assert.equal(painter(true).red("x"), "\x1b[31mx\x1b[39m");
  });

  it("visible ignores colour codes and hyperlinks", () => {
    const p = painter(true);
    assert.equal(visible(p.bold(p.red("abc"))), 3);
    assert.equal(visible("\x1b]8;;https://x.example\x1b\\link\x1b]8;;\x1b\\"), 4);
  });

  it("wrap breaks on words and indents continuation lines", () => {
    assert.equal(wrap("one two three four", 9, "  "), "one two\n  three\n  four");
    assert.equal(wrap("short", 20), "short");
  });

  it("shortUrl keeps host and last segment for long URLs", () => {
    assert.equal(shortUrl("https://cursor.com/docs/mcp"), "cursor.com/docs/mcp");
    assert.equal(
      shortUrl("https://github.com/openai/codex/blob/8f195c93d7e7acfef95acf273f0e49cce917e291/codex-rs/protocol/src/models.rs#L1"),
      "github.com/…/models.rs"
    );
  });

  it("colorJson is plain JSON without colour", () => {
    assert.equal(colorJson(painter(false), { a: 1 }), '{\n  "a": 1\n}');
    assert.match(colorJson(painter(true), { a: true }), /\x1b\[36m"a"\x1b\[39m: \x1b\[35mtrue/);
  });
});
