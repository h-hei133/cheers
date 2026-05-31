import { describe, expect, it } from "vitest";

import { buildLoopContextRebuildInput } from "../../context/rebuildInput.js";
import { projectSessionContextRebuild } from "../../context/sessionContextRebuildProjection.js";
import { evaluateContinuationReadiness } from "../continuation/readiness.js";
import { summarizeReplaySafeLoopState } from "./state.js";
import { projectSessionTree } from "../sessionTreeProjection.js";

describe("replay-safe loop state summary", () => {
  it("contains safe references and excludes raw transcript content", () => {
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-replay-safe",
        projectRoot: "/workspace",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:01.000Z",
        status: "active",
        turns: [{
          role: "user",
          content:
            "raw provider output: hidden reasoning token=secret oldText=before newText=after",
        }],
      },
    });
    const contextRebuildProjection = projectSessionContextRebuild({ sessionProjection });
    const rebuildInput = buildLoopContextRebuildInput({
      sessionProjection,
      contextRebuildProjection,
    });
    const continuationReadiness = evaluateContinuationReadiness({
      sessionProjection,
      contextRebuildProjection,
      rebuildInput,
    });
    const summary = summarizeReplaySafeLoopState({
      sessionProjection,
      contextRebuildProjection,
      continuationReadiness,
      rebuildInput,
      replaySafePlanningStates: [{
        replayStateId: "replay-planning-state-1",
        taskIntentSummary: "safe planning continuation",
        discoveryHandoffIds: ["discovery-handoff-1"],
        stagedContextIds: ["packet-1"],
        contextSufficiencyStatus: "sufficient_for_review_only_plan",
        planningQualityIds: ["quality-1"],
        assumptionsAndConstraints: ["mutationAuthority=not-granted"],
        editHandoffIds: ["edit-handoff-safe-id"],
        verificationHandoffIds: ["verification-handoff-safe-id"],
        staleInvalidationFacts: ["missingFreshnessEvidence"],
        continuationReadiness: "requires-refresh",
        notProvenClaims: [
          "replay-state-available-is-not-plan-validity",
          "replayed-edit-handoff-is-not-mutation-authority",
          "replayed-verification-intent-is-not-verification-passed",
        ],
      }],
      terminalResultFacts: {
        status: "stopped",
        terminalClassification: "stopped",
        terminalReason: "waiting_for_input",
      },
    });
    const serialized = JSON.stringify(summary);

    expect(summary.contextRebuildInputId).toBe(rebuildInput.rebuildInputId);
    expect(summary.replaySafePlanningStateIds).toEqual(["replay-planning-state-1"]);
    expect(summary.discoveryHandoffIds).toEqual(["discovery-handoff-1"]);
    expect(summary.stagedContextIds).toEqual(["packet-1"]);
    expect(summary.planningQualityIds).toEqual(["quality-1"]);
    expect(summary.terminalResultFacts.terminalSuccessClaim).toBe(false);
    expect(summary.terminalSuccessClaim).toBe(false);
    expect(serialized).not.toMatch(
      /raw provider output|hidden reasoning|token=secret|oldText=before|newText=after/i,
    );
    expect(summary.notProvenClaims).toContain("replay-safe-summary-is-not-success");
    expect(summary.notProvenClaims).toContain("replay-state-available-is-not-plan-validity");
    expect(summary.notProvenClaims).toContain("replayed-verification-intent-is-not-verification-passed");
  });
});
