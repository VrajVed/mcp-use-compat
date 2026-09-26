import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { discoveryChecks } from "../../src/checks/discovery.js";
import { byId, goodTool, list, profile, runCheck, snapshot, src } from "./builders.js";

const check = (id: string) => byId(discoveryChecks, id);
const no = { value: false, ...src };
const yes = { value: true, ...src };

describe("discovery checks", () => {
  it("DISCOVERY_TOOLS_LIST_CHANGED only applies when declared", () => {
    assert.equal(check("DISCOVERY_TOOLS_LIST_CHANGED").appliesTo(snapshot()), false);
  });

  it("DISCOVERY_TOOLS_LIST_CHANGED warns only for clients known not to refresh", () => {
    const s = snapshot({ initialize: { capabilities: { tools: { listChanged: true } } } });
    const profiles = [
      profile({ id: "ignores", supports: { toolsListChanged: no } }),
      profile({ id: "refreshes", supports: { toolsListChanged: yes } }),
      profile({ id: "unknown" }),
    ];
    const findings = runCheck(check("DISCOVERY_TOOLS_LIST_CHANGED"), s, { profiles });
    assert.deepEqual(
      findings.map((f) => [f.client, f.severity]),
      [["ignores", "info"]]
    );
    assert.equal(findings[0].source, src.source);
  });

  it("DISCOVERY_TOOLS_LIST_CHANGED also warns for partial support, with the client's note", () => {
    const s = snapshot({ initialize: { capabilities: { tools: { listChanged: true } } } });
    const partial = profile({ supports: { toolsListChanged: { value: "partial", note: "regressed in 3.12", ...src } } });
    const [f] = runCheck(check("DISCOVERY_TOOLS_LIST_CHANGED"), s, { profiles: [partial] });
    assert.match(f.message, /does not reliably refresh/);
    assert.match(f.message, /Regressed in 3\.12\.$/);
  });

  it("DISCOVERY_RESOURCES_LIST_CHANGED and DISCOVERY_PROMPTS_LIST_CHANGED", () => {
    const s = snapshot({
      initialize: { capabilities: { resources: { listChanged: true }, prompts: { listChanged: true } } },
    });
    const profiles = [profile({ supports: { resourcesListChanged: no, promptsListChanged: yes } })];
    assert.equal(runCheck(check("DISCOVERY_RESOURCES_LIST_CHANGED"), s, { profiles }).length, 1);
    assert.equal(runCheck(check("DISCOVERY_PROMPTS_LIST_CHANGED"), s, { profiles }).length, 0);
  });

  it("DISCOVERY_PROMPTS_UNSUPPORTED", () => {
    const s = snapshot({ lists: { tools: list([goodTool()]), prompts: list([{ name: "p" }]) } });
    assert.equal(check("DISCOVERY_PROMPTS_UNSUPPORTED").appliesTo(snapshot()), false);
    assert.equal(runCheck(check("DISCOVERY_PROMPTS_UNSUPPORTED"), s, { profiles: [profile({ supports: { prompts: no } })] }).length, 1);
    assert.equal(runCheck(check("DISCOVERY_PROMPTS_UNSUPPORTED"), s, { profiles: [profile({ supports: { prompts: yes } })] }).length, 0);
  });

  it("DISCOVERY_RESOURCES_UNSUPPORTED", () => {
    const s = snapshot({ lists: { resources: list([{ name: "r", uri: "x://r" }]) } });
    const [f] = runCheck(check("DISCOVERY_RESOURCES_UNSUPPORTED"), s, {
      profiles: [profile({ supports: { resources: no } })],
    });
    assert.match(f.message, /1 resources/);
  });
});
