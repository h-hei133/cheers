import { describe, expect, it } from "vitest";

import { buildLoopContextRebuildInput } from "../context/rebuildInput.js";
import { projectSessionContextRebuild } from "../context/sessionContextRebuildProjection.js";
import { evaluateContinuationReadiness } from "./continuationReadiness.js";
import { summarizeReplaySafeLoopState } from "./replaySafeLoopState.js";
import { projectSessionTree } from "./sessionTreeProjection.js";

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
      terminalResultFacts: {
        status: "stopped",
        terminalClassification: "stopped",
        terminalReason: "waiting_for_input",
      },
    });
    const serialized = JSON.stringify(summary);

    expect(summary.contextRebuildInputId).toBe(rebuildInput.rebuildInputId);
    expect(summary.terminalResultFacts.terminalSuccessClaim).toBe(false);
    expect(summary.terminalSuccessClaim).toBe(false);
    expect(serialized).not.toMatch(
      /raw provider output|hidden reasoning|token=secret|oldText=before|newText=after/i,
    );
    expect(summary.notProvenClaims).toContain("replay-safe-summary-is-not-success");
  });
});
