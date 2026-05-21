import { describe, expect, it } from "vitest";
import { planDiscoveryEdit } from "./discoveryEditPlanner.js";
import { buildDiscoveryEditPlanResult } from "./discoveryEditResult.js";

describe("discoveryEditResult", () => {
  it("maps manifest-only discovery edits to stopped no-write result surface", () => {
    const plan = planDiscoveryEdit({
      prompt: [
        "Find the file that contains this exact block and replace it",
        "```",
        "status: draft",
        "```",
        "with",
        "```",
        "status: ready",
        "```",
      ].join("\n"),
      candidates: [
        { path: "src/app.ts", content: "status: draft\n" },
        { path: "src/other.ts", content: "status: draft\n" },
      ],
    });
    if (
      plan.status === "ready-for-handoff" ||
      plan.status === "ready-for-target-set"
    ) {
      throw new Error("expected no-write plan");
    }

    const result = buildDiscoveryEditPlanResult({
      sessionId: "sess_discovery_result",
      prompt: "discovery edit",
      plan,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "discovery-edit-result:manifest-produced",
        "discovery-edit-result:mutation-authority:not-granted",
        "discovery-edit-result:mutation:not-run",
        "discovery-edit-result:raw-content-excluded",
      ]),
    );
    expect(result.finalOutput).toContain("discovery edit manifest produced");
    expect(JSON.stringify(result)).not.toContain("status: ready");
    expect(JSON.stringify(result)).not.toContain("status: draft");
  });
});
