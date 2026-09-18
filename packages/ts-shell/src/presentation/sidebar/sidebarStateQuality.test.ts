import { describe, expect, it } from "vitest";
import { bridgeSidebarEvents } from "./sidebarEventBridge.js";
import { projectSidebarState } from "./sidebarStateProjection.js";
import { renderSidebarStateSurface } from "./sidebarStateSurface.js";
import { checkSidebarStateQuality } from "./sidebarStateQuality.js";

describe("sidebar state quality", () => {
  it("passes for complete sidebar state with recent activity", () => {
    const events = bridgeSidebarEvents({
      commandResults: [{ command: "/sidebar", outcome: "status", summary: "Rendered." }],
    }).events;
    const snapshot = projectSidebarState({
      task: { title: "sidebar", objective: "quality check" },
      editCloseout: { status: "ready" },
      compactInjectionState: {
        sessionScopeId: "session:test",
        injectionStatus: "pending",
        checkpointId: "checkpoint",
        injectionCount: 0,
        supersededCheckpointIds: [],
        warnings: [],
        persistence: "none",
        providerCall: "none",
        evidence: ["test"],
      },
      projectMemoryRecords: [],
      startupWarmHealth: {
        mode: "test-only",
        ok: true,
        writable: false,
        found: false,
        staleness: "unknown",
        detail: "missing is safe",
        evidence: ["test"],
      },
      validation: {
        testsRun: ["sidebarStateQuality.test.ts"],
        verifierResults: [{ command: "focused", status: "passed" }],
        buildStatus: "passed",
        resultContractStatus: "passed",
      },
      toolAvailability: { localCommands: [{ id: "sidebar", status: "available" }] },
      events,
      nextAction: "Continue.",
    });
    const output = renderSidebarStateSurface(snapshot);
    const quality = checkSidebarStateQuality({ snapshot, renderedOutput: output });

    expect(quality.qualityStatus).toBe("pass");
    expect(quality.checks.hasCurrentTaskOrRoute).toBe("pass");
    expect(quality.checks.eventBudgetStatus).toBe("pass");
  });

  it("warns when next action is missing", () => {
    const snapshot = projectSidebarState({
      task: { title: "sidebar", objective: "quality check" },
    });
    const withoutNext = { ...snapshot, nextActions: [] };
    const quality = checkSidebarStateQuality({ snapshot: withoutNext });

    expect(quality.qualityStatus).toBe("warn");
    expect(quality.checks.hasNextAction).toBe("warn");
  });

  it("fails when rendered output leaks raw content, secrets, or hidden reasoning", () => {
    const snapshot = projectSidebarState({
      task: { title: "sidebar", objective: "quality check" },
    });
    const quality = checkSidebarStateQuality({
      snapshot,
      renderedOutput: "RAW_SECRET raw event content sk-123456789 hidden reasoning",
    });

    expect(quality.qualityStatus).toBe("fail");
    expect(quality.checks.hasNoRawContentLeak).toBe("fail");
    expect(quality.checks.hasNoSecretLeak).toBe("fail");
    expect(quality.checks.hasNoHiddenReasoningLeak).toBe("fail");
  });
});
