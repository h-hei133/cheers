import { describe, expect, it } from "vitest";
import { runCompactCommand } from "../command/compactCommandRunner.js";
import { evaluateCompactContinuityQuality } from "./compactContinuityQuality.js";
import { adaptCompactCheckpointForFutureTurn } from "../injection/compactFutureTurnAdapter.js";
import { formatCompactInjectedContext } from "../injection/compactInjectedContextFormatter.js";
import {
  createCompactLiveCheckpointStore,
  updateLatestCompactCheckpoint,
} from "../checkpoint/compactLiveCheckpoint.js";

describe("compact continuity quality", () => {
  it("passes safety-critical compact continuity checks and warns on missing optional evidence", () => {
    const store = createCompactLiveCheckpointStore({
      now: () => "2026-05-16T00:00:00.000Z",
      nextId: () => "checkpoint-quality",
    });
    const checkpoint = updateLatestCompactCheckpoint(store, {
      sessionScopeId: "session:sess-quality",
      sourceCommand: "/compact",
      result: runCompactCommand({
        mode: "render",
        source: "route",
        generatedAt: "2026-05-16T00:00:00.000Z",
        routeInfo: {
          routeId: "79",
          name: "Compact v2 quality",
          nextAction: "Run quality tests.",
        },
        taskGoal: {
          objective: "Harden injection quality.",
        },
        validationEvidence: {
          testsRun: ["compactContinuityQuality.test.ts"],
        },
      }),
    });
    const candidate = adaptCompactCheckpointForFutureTurn(checkpoint);
    const quality = evaluateCompactContinuityQuality({
      candidate,
      injectedContext: formatCompactInjectedContext(candidate),
    });

    expect(quality.qualityStatus).toBe("pass");
    expect(quality.blockers).toEqual([]);
    expect(quality.checklist.find((entry) => entry.id === "hasTaskGoal")?.status).toBe("pass");
    expect(quality.checklist.find((entry) => entry.id === "hasBlockedByDesignFacts")?.status).toBe("pass");
  });

  it("fails when required task, blocked facts, or safety boundaries are missing", () => {
    const store = createCompactLiveCheckpointStore({
      nextId: () => "checkpoint-bad-quality",
    });
    const checkpoint = updateLatestCompactCheckpoint(store, {
      sessionScopeId: "session:sess-bad-quality",
      sourceCommand: "/compact",
      result: runCompactCommand({
        mode: "render",
        source: "route",
        generatedAt: "2026-05-16T00:00:00.000Z",
      }),
    });
    const candidate = {
      ...adaptCompactCheckpointForFutureTurn(checkpoint),
      structuredFacts: {
        ...adaptCompactCheckpointForFutureTurn(checkpoint).structuredFacts,
        taskRoute: {},
        editCapability: {
          ...adaptCompactCheckpointForFutureTurn(checkpoint).structuredFacts.editCapability,
          closeoutStatus: undefined,
          blockedByDesign: [],
        },
        nextAction: undefined,
      },
    };
    const quality = evaluateCompactContinuityQuality({
      candidate,
      injectedContext:
        "Automatic recovery: enabled\nAtomic rollback: available\nRAW_SECRET",
    });

    expect(quality.qualityStatus).toBe("fail");
    expect(quality.blockers.map((blocker) => blocker.id)).toEqual(
      expect.arrayContaining([
        "hasNextAction",
        "hasEditCapabilityFacts",
        "hasBlockedByDesignFacts",
        "hasNoRawContentLeak",
        "hasNoAutomaticRecoveryClaim",
        "hasNoAtomicRollbackClaim",
      ]),
    );
  });
});
