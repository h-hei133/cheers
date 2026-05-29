import { describe, expect, it } from "vitest";

import { projectSessionContextRebuild } from "../context/sessionContextRebuildProjection.js";
import { evaluateContinuationReadiness, type ContinuationReadinessStatus } from "./continuationReadiness.js";
import { projectSessionTree } from "./sessionTreeProjection.js";

describe("continuation readiness", () => {
  it("represents readiness states without executing the next turn", () => {
    const statuses: ContinuationReadinessStatus[] = [
      "ready",
      "ready_with_missing_optional_facts",
      "blocked_missing_required_facts",
      "blocked_unsafe_context",
      "blocked_stale_session",
      "unsupported",
      "not_ready",
      "not_proven",
    ];

    const projections = statuses.map((expected) => {
      const sessionProjection = projectSessionTree({
        session: {
          id: `sess-${expected}`,
          projectRoot: "/workspace",
          createdAt: "2026-05-29T00:00:00.000Z",
          updatedAt: "2026-05-29T00:00:01.000Z",
          status: "active",
          turns: expected === "not_ready" ? [] : [{ role: "user", content: "x" }],
        },
        branchSummaries: expected === "blocked_unsafe_context"
          ? [{
              id: "branch",
              targetLocation: "/home/wang/.private-agents-real/provider.env",
              summary: "secret",
            }]
          : [],
      });
      const contextRebuildProjection = projectSessionContextRebuild({
        sessionProjection,
        requiredFacts: expected === "blocked_missing_required_facts"
          ? ["required-a"]
          : [],
        optionalFacts: expected === "ready_with_missing_optional_facts"
          ? ["optional-a"]
          : [],
        staleFacts: expected === "blocked_stale_session" ? ["stale-a"] : [],
      });
      return evaluateContinuationReadiness({
        sessionProjection,
        contextRebuildProjection,
        requiredFacts: expected === "blocked_missing_required_facts" ? ["required-a"] : [],
        optionalFacts: expected === "ready_with_missing_optional_facts" ? ["optional-a"] : [],
        staleFacts: expected === "blocked_stale_session" ? ["stale-a"] : [],
        unsupported: expected === "unsupported",
        notProven: expected === "not_proven",
      });
    });

    expect(projections.map((projection) => projection.status)).toEqual(statuses);
    expect(projections.every((projection) => projection.nextTurnExecuted === false)).toBe(true);
    expect(projections.every((projection) => projection.terminalSuccessClaim === false)).toBe(true);
  });

  it("keeps branch and compaction gaps visible", () => {
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-gaps",
        projectRoot: "/workspace",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:01.000Z",
        status: "active",
        turns: [{ role: "user", content: "x" }],
      },
    });
    const readiness = evaluateContinuationReadiness({
      sessionProjection,
      contextRebuildProjection: projectSessionContextRebuild({ sessionProjection }),
    });

    expect(readiness.branchGapStatus).toBe("branch_unsupported");
    expect(readiness.compactionGapStatus).toBe("compaction_unsupported");
    expect(readiness.notProvenClaims).toContain("continuation-ready-is-not-success");
  });
});
