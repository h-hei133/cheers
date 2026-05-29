import { describe, expect, it } from "vitest";

import {
  observeVerificationResult,
  projectVerificationIntent,
  type VerificationIntentDispatchStatus,
  type VerificationIntentRelevanceStatus,
  type VerificationResultObservationStatus,
} from "./loopBoundary.js";

describe("verification loop boundary", () => {
  it("represents verification intent states safely", () => {
    const statuses: VerificationIntentDispatchStatus[] = [
      "planned",
      "selected",
      "authority_required",
      "not_run",
      "unsupported",
      "dispatched",
    ];

    const intents = statuses.map((dispatchStatus) =>
      projectVerificationIntent({
        sourceTurnId: `turn-${dispatchStatus}`,
        targetSummary: "verify changed file",
        commandCandidateSummary: "npm test -w packages/ts-shell",
        dispatchStatus,
        relevanceStatus: "task_relevant",
      })
    );

    expect(intents.map((intent) => intent.dispatchStatus)).toEqual(statuses);
    expect(intents.every((intent) => intent.terminalSuccessClaim === false)).toBe(true);
    expect(intents.flatMap((intent) => intent.notProvenClaims)).toContain(
      "verification-selected-is-not-success",
    );
  });

  it("preserves verification relevance states", () => {
    const statuses: VerificationIntentRelevanceStatus[] = [
      "task_relevant",
      "probably_relevant",
      "unrelated",
      "unknown",
      "not_proven",
    ];

    expect(
      statuses.map((relevanceStatus) =>
        projectVerificationIntent({
          sourceTurnId: `turn-${relevanceStatus}`,
          targetSummary: "target",
          relevanceStatus,
        }).relevanceStatus
      ),
    ).toEqual(statuses);
  });

  it("represents result states without terminal success", () => {
    const intent = projectVerificationIntent({
      sourceTurnId: "turn-result",
      targetSummary: "target",
      dispatchStatus: "selected",
      relevanceStatus: "probably_relevant",
    });
    const statuses: VerificationResultObservationStatus[] = [
      "passed",
      "failed",
      "blocked",
      "not_run",
      "selected_not_run",
      "unsupported",
      "relevance_rejected",
    ];
    const results = statuses.map((status) => observeVerificationResult({ intent, status }));

    expect(results.map((result) => result.status)).toEqual(statuses);
    expect(results.every((result) => result.terminalSuccessClaim === false)).toBe(true);
    expect(JSON.stringify(results)).not.toContain('"success":true');
  });

  it("redacts unsafe verification summaries and command candidates", () => {
    const intent = projectVerificationIntent({
      sourceTurnId: "turn-redact",
      targetSummary:
        "raw provider output: hidden reasoning token=secret oldText=before newText=after",
      commandCandidateSummary:
        "Authorization: Bearer abc /home/wang/.private-agents-real/provider.env",
      dispatchStatus: "selected",
      relevanceStatus: "unknown",
    });
    const result = observeVerificationResult({
      intent,
      status: "selected_not_run",
      safeSummary: "sk-1234567890 provider.env token=secret",
    });
    const serialized = JSON.stringify({ intent, result });

    expect(serialized).not.toMatch(
      /raw provider output|hidden reasoning|token=secret|oldText=before|newText=after|Bearer abc|private-agents-real|sk-1234567890/i,
    );
    expect(intent.redactionStatus).toBe("redacted");
    expect(result.redactionStatus).toBe("redacted");
  });
});
