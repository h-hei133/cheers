import { describe, expect, it } from "vitest";

import {
  evaluateSessionResumeEligibility,
} from "./sessionResumeEligibility.js";
import type { RecoverySnapshot } from "./sessionRecoverySnapshot.js";
import type { RecoveryTrustBoundaryBlock } from "./recoveryTrustBoundary.js";
import type { Session } from "../schema/sessionRecord.js";

describe("session resume eligibility", () => {
  it.each([true, false])("admits image-only pending recovery only with matching content (image=%s)", image => {
    const result = evaluateSessionResumeEligibility({ session: session({ status: "interrupted" }), createBlock,
      loadRecoverySnapshot: () => snapshot({ pendingPrompt: "", runPhase: "prompt-persisted", interruptedKind: "prompt",
        lastUserMessage: { role: "user", content: image ? [{ type: "image", data: "aGVsbG8=", mimeType: "image/png" }] : "" } }) });
    expect(result.autoResumeReady).toBe(image);
  });

  it("keeps stopped durable status non-resumable", () => {
    const result = evaluateSessionResumeEligibility({
      session: session({ status: "error" }),
      loadRecoverySnapshot: () =>
        snapshot({
          durableStatus: "stopped",
          terminalClassification: "stopped",
        }),
      createBlock,
    });

    expect(result).toMatchObject({
      recoverable: false,
      disposition: "not-resumable",
      autoResumeReady: false,
      detail: "Durable status is stopped",
      block: {
        reason: "continuation-evidence-missing",
        detail: "durable status is stopped and cannot continue",
      },
    });
  });

  it("keeps indeterminate terminal evidence blocked for error sessions", () => {
    const result = evaluateSessionResumeEligibility({
      session: session({ status: "error" }),
      loadRecoverySnapshot: () =>
        snapshot({
          durableStatus: undefined,
          terminalClassification: undefined,
          transcriptEvents: [],
        }),
      createBlock,
    });

    expect(result).toMatchObject({
      recoverable: false,
      disposition: "not-resumable",
      detail: "Terminal evidence is indeterminate",
      block: {
        reason: "terminal-evidence-indeterminate",
      },
    });
  });

  it("allows interrupted prompt recovery only with pending prompt and recovery evidence", () => {
    const result = evaluateSessionResumeEligibility({
      session: session({ status: "interrupted" }),
      loadRecoverySnapshot: () =>
        snapshot({
          pendingPrompt: "continue",
          runPhase: "prompt-persisted",
          interruptedKind: "prompt",
        }),
      createBlock,
    });

    expect(result).toEqual({
      recoverable: true,
      disposition: "fully-resumable",
      autoResumeReady: true,
      detail: "Pending prompt and interruption evidence are available",
    });
  });
});

function session(input: { readonly status: Session["status"] }): Session {
  return {
    id: "sess_resume",
    projectRoot: "/repo",
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:01.000Z",
    status: input.status,
    turns: [],
  };
}

function snapshot(
  overrides: Partial<RecoverySnapshot> = {},
): RecoverySnapshot {
  return {
    pendingLifecycle: {
      pendingApprovals: {},
      pendingTools: {},
      taskStates: {},
    },
    repairSummary: {
      insertedPromptMessage: false,
      insertedQueryStarted: false,
      insertedRunInterrupted: false,
      ignoredDuplicateTurnStarts: 0,
      ignoredUnpairedTurnCompletions: 0,
      ignoredRoleMismatchedTurnCompletions: 0,
    },
    transcriptEvents: [
      {
        type: "lifecycle",
        event: "run-error",
        timestamp: "2026-05-28T00:00:01.000Z",
      },
    ],
    ...overrides,
  };
}

function createBlock(
  session: Session,
  reason: RecoveryTrustBoundaryBlock["reason"],
  detail: string,
): RecoveryTrustBoundaryBlock {
  return {
    sessionId: session.id,
    reason,
    detail,
    recoveryHint: "hint",
  };
}

describe('a session killed without a clean shutdown', () => {
  it('is resumable when an unfinished run left evidence', () => {
    // The prompt barrier leaves the session `active`; only a clean interrupt
    // writes `interrupted`. Refusing on the status alone would turn away the
    // exact case bootstrap adopts as unfinished work.
    const result = evaluateSessionResumeEligibility({
      session: session({ status: "active" }), createBlock,
      loadRecoverySnapshot: () => snapshot({ pendingPrompt: "Do the work",
        runPhase: "prompt-persisted",
        pendingLifecycle: { pendingApprovals: {}, taskStates: {},
          pendingTools: { call: { taskId: "call", toolName: "write" } } } }),
    });
    expect(result.recoverable).toBe(true);
    expect(result.autoResumeReady).toBe(true);
  })

  it('is still refused when the active session left no evidence', () => {
    const result = evaluateSessionResumeEligibility({
      session: session({ status: "active" }), createBlock,
      loadRecoverySnapshot: () => snapshot({ runPhase: "idle" }),
    })
    expect(result.recoverable).toBe(false)
    expect(result.detail).toBe("Active session has no unfinished work")
  })
})
