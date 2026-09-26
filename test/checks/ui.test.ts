import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { uiChecks } from "../../src/checks/ui.js";
import { MCP_APP_MIME, SKYBRIDGE_MIME } from "../../src/ui.js";
import { byId, goodTool, list, profile, runCheck, snapshot, src } from "./builders.js";

const check = (id: string) => byId(uiChecks, id);
const no = { value: false, ...src };
const yes = { value: true, ...src };

const uiTool = (meta: Record<string, unknown>, name = "show_chart") => ({ ...goodTool(name), _meta: meta });
const linked = (uri = "ui://app/chart") => uiTool({ ui: { resourceUri: uri } });
const uiResource = (extra: Record<string, unknown> = {}) => ({
  name: "chart",
  uri: "ui://app/chart",
  mimeType: MCP_APP_MIME,
  ...extra,
});
const withUi = (tools: Record<string, unknown>[], resources: Record<string, unknown>[] = [], extra = {}) =>
  snapshot({ lists: { tools: list(tools), resources: list(resources) }, ...extra });

describe("ui checks", () => {
  it("no UI check applies to a server without UI or when not connected", () => {
    const plain = snapshot({ lists: { tools: list([goodTool()]), resources: list([{ name: "r", uri: "x://r" }]) } });
    for (const c of uiChecks) {
      if (c.id === "UI_TOOL_LINK_BROKEN") continue;
      assert.equal(c.appliesTo(plain), false, c.id);
    }
    const down = withUi([linked()], [uiResource()], { connect: { ok: false, error: "boom" }, uiReads: {} });
    for (const c of uiChecks) assert.equal(c.appliesTo(down), false, c.id);
  });

  it("UI_RESOURCE_MIME", () => {
    const c = check("UI_RESOURCE_MIME");
    assert.deepEqual(runCheck(c, withUi([linked()], [uiResource()])), []);
    // Spacing and case in the parameter are normalised.
    assert.deepEqual(runCheck(c, withUi([], [uiResource({ mimeType: "Text/HTML; profile=mcp-app" })])), []);

    const [legacy] = runCheck(c, withUi([], [uiResource({ mimeType: SKYBRIDGE_MIME })]));
    assert.equal(legacy.severity, "warn");
    assert.equal(legacy.subject, "ui://app/chart");
    assert.match(legacy.message, /legacy/);

    const [wrong] = runCheck(c, withUi([], [uiResource({ mimeType: "text/html" })]));
    assert.equal(wrong.severity, "error");
    assert.match(wrong.message, /"text\/html"/);

    const [missing] = runCheck(c, withUi([], [uiResource({ mimeType: undefined })]));
    assert.equal(missing.severity, "error");
    assert.match(missing.message, /null/);
  });

  it("UI_RESOURCE_MIME also checks read content not listed, without double-reporting listed ones", () => {
    const c = check("UI_RESOURCE_MIME");
    const s = withUi([linked(), linked("ui://app/other")], [uiResource({ mimeType: "text/html" })], {
      uiReads: {
        "ui://app/chart": { ok: true, mimeType: "text/html" },
        "ui://app/other": { ok: true, mimeType: SKYBRIDGE_MIME },
        "ui://app/broken": { ok: false, error: "not found" },
      },
    });
    const findings = runCheck(c, s);
    assert.deepEqual(
      findings.map((f) => [f.subject, f.severity]),
      [
        ["ui://app/chart", "error"],
        ["ui://app/other", "warn"],
      ]
    );
    assert.match(findings[1].message, /UI resource content/);
    assert.deepEqual(
      runCheck(c, withUi([linked()], [], { uiReads: { "ui://app/chart": { ok: true, mimeType: MCP_APP_MIME } } })),
      []
    );
  });

  it("UI_RESOURCE_SCHEME", () => {
    const c = check("UI_RESOURCE_SCHEME");
    assert.deepEqual(runCheck(c, withUi([linked()], [uiResource()])), []);
    const findings = runCheck(
      c,
      withUi([linked("https://example.com/chart.html")], [uiResource({ uri: "https://example.com/chart.html" })])
    );
    assert.equal(findings.length, 1, "same URI from tool and resource is reported once");
    assert.equal(findings[0].severity, "error");
    assert.equal(findings[0].subject, "https://example.com/chart.html");
    // A resource that is UI only because of its mime type.
    const [byMime] = runCheck(c, withUi([], [uiResource({ uri: "app://chart" })]));
    assert.equal(byMime.subject, "app://chart");
  });

  it("UI_TOOL_LINK_BROKEN", () => {
    const c = check("UI_TOOL_LINK_BROKEN");
    assert.equal(c.appliesTo(withUi([linked()])), false, "needs uiReads");
    assert.deepEqual(runCheck(c, withUi([linked()], [], { uiReads: { "ui://app/chart": { ok: true, mimeType: MCP_APP_MIME } } })), []);
    assert.deepEqual(runCheck(c, withUi([linked()], [], { uiReads: {} })), [], "unread URIs aren't reported");
    const [f] = runCheck(c, withUi([linked()], [], { uiReads: { "ui://app/chart": { ok: false, error: "Resource not found" } } }));
    assert.equal(f.severity, "error");
    assert.equal(f.subject, "show_chart");
    assert.match(f.message, /ui:\/\/app\/chart/);
    assert.match(f.message, /Resource not found/);
  });

  it("UI_TOOL_LINK_KEY", () => {
    const c = check("UI_TOOL_LINK_KEY");
    assert.deepEqual(runCheck(c, withUi([linked()])), []);
    assert.deepEqual(
      runCheck(c, withUi([uiTool({ ui: { resourceUri: "ui://a/b" }, "openai/outputTemplate": "ui://a/b" })])),
      []
    );

    const [flat] = runCheck(c, withUi([uiTool({ "ui/resourceUri": "ui://a/b" })]));
    assert.equal(flat.severity, "warn");
    assert.equal(flat.subject, "show_chart");
    assert.match(flat.message, /deprecated/);

    const [openai] = runCheck(c, withUi([uiTool({ "openai/outputTemplate": "ui://a/b" }, "widget")]));
    assert.equal(openai.severity, "warn");
    assert.equal(openai.subject, "widget");
    assert.match(openai.message, /ChatGPT only/);
  });

  it("UI_UNSUPPORTED", () => {
    const c = check("UI_UNSUPPORTED");
    assert.equal(c.appliesTo(withUi([goodTool()], [uiResource()])), false, "UI resources alone don't matter");
    const s = withUi([linked(), goodTool()]);
    const profiles = [
      profile({ id: "no-ui", displayName: "No UI", supports: { uiResources: no } }),
      profile({ id: "partial", supports: { uiResources: { value: "partial", ...src, note: "flaky" } } }),
      profile({ id: "ui", supports: { uiResources: yes } }),
      profile({ id: "unknown" }),
    ];
    const findings = runCheck(c, s, { profiles });
    assert.deepEqual(
      findings.map((f) => [f.client, f.severity]),
      [
        ["no-ui", "warn"],
        ["partial", "warn"],
      ]
    );
    assert.match(findings[0].message, /^1 tool\(s\) return UI, but No UI/);
    assert.match(findings[1].message, /\(flaky\)$/);
    assert.equal(findings[0].source, src.source);
    assert.deepEqual(runCheck(c, s, { profiles: [profile({ supports: { uiResources: yes } })] }), []);
  });
});
