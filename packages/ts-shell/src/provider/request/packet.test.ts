import { describe, expect, it } from "vitest";

import { selectContext } from "../../context/selection/model.js";
import { buildExecutionPlan } from "../../planning/execution/model.js";
import { buildTaskRequestPacket } from "./packet.js";

describe("task request packet", () => {
  it("shapes a report-safe request from context and plan facts", () => {
    const context = selectContext({
      taskKind: "docs-report",
      taskPath: "artifact",
      shortPrompt: "Write a source report.",
      workspaceFiles: [{ path: "notes/source.md", purpose: "source" }, { path: "reports/summary.md", purpose: "target" }],
      requiredPaths: ["reports/summary.md"],
      continuationAvailable: true,
      failureCategories: [],
    });
    const plan = buildExecutionPlan({
      taskKind: "docs-report",
      outputKind: "artifact",
      allowedTools: ["read", "write", "verify", "artifact"],
      allowedWrites: ["reports/summary.md"],
      successRubric: ["source", "validate"],
      context,
    });

    const packet = buildTaskRequestPacket({
      shortPrompt: "Write a source report.",
      taskKind: "docs-report",
      context,
      plan,
    });

    expect(packet).toMatchObject({
      state: "ready",
      outputContract: "source-scoped report artifact",
      contextPacketSummary: expect.stringContaining("1 target"),
      omittedContextCount: 0,
      terminalSuccessClaim: false,
    });
    expect(packet.contextPaths).toEqual(expect.arrayContaining(["notes/source.md", "reports/summary.md"]));
    expect(packet.redactionRules).toContain("exclude provider output");
  });
});
