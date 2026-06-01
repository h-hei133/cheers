import { describe, expect, it } from "vitest";

import {
  observeVerificationResult,
  observePostRepairVerificationResult,
  projectVerificationIntent,
  requestPostRepairVerification,
  requirePostRepairVerification,
  type VerificationIntentDispatchStatus,
  type VerificationIntentRelevanceStatus,
  type VerificationResultObservationStatus,
} from "./boundary.js";
import {
  createRepairApplyRequest,
  observeRepairApply,
  observeRepairAuthority,
  observeRepairProposal,
  projectRepairRequiredHandoff,
} from "../../repair/handoff/boundary.js";

describe("verification loop boundary", () => {
  it("represents verification intent states safely", () => {
    const statuses: VerificationIntentDispatchStatus[] = [
      "planned",
      "selected",
      "selected_not_run",
      "authority_required",
      "not_run",
      "unsupported",
      "dispatched",
      "passed",
      "failed",
      "timed_out",
      "cancelled",
      "skipped",
      "unavailable",
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
    expect(intents.map((intent) => intent.coverageStatus)).toEqual(
      statuses.map(() => "not_proven"),
    );
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
      "timed_out",
      "cancelled",
      "skipped",
      "unavailable",
      "not_run",
      "selected_not_run",
      "unsupported",
      "relevance_rejected",
    ];
    const results = statuses.map((status) => observeVerificationResult({ intent, status }));

    expect(results.map((result) => result.status)).toEqual(statuses);
    expect(results.every((result) => result.runtimeReceiptIds.length === 0)).toBe(true);
    expect(results.every((result) => result.repairEligible === false)).toBe(true);
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

  it("projects task-relevant receipt facts without success upgrade", () => {
    const intent = projectVerificationIntent({
      sourceTurnId: "turn-receipt",
      targetSummary: "target",
      receipt: {
        facadeVersion: "v1",
        selectedCommand: "npm test -w packages/ts-shell -- src/verification/boundary.test.ts",
        authority: "explicitly-approved",
        dispatchStatus: "dispatched",
        runtimeStatus: "timeout",
        runtimeReceiptIds: ["receipt-1"],
        relevanceStatus: "relevant",
        coverageStatus: "partially-covered",
        coveredFiles: ["packages/ts-shell/src/verification/boundary.ts"],
        uncoveredFiles: ["packages/ts-shell/src/verification/other.ts"],
        failureClass: "command-timed-out",
        repairEligible: false,
        notProvenClaims: ["task success"],
        verdictStatus: "blocked",
        verdict: {
          status: "BLOCKED",
          terminalClassification: "stopped",
          reason: "blocked",
          provenance: { source: "product-runtime", adapter: "verification-facade" },
          redaction: "raw-content-excluded",
          cleanup: "not-applicable",
          notProvenReasons: [],
          partialReasons: [],
          blockedReasons: ["blocked"],
        },
        selectedNotRunIsSuccess: false,
        oneFileSuccessCanHideAnotherFailure: false,
        mutationDuringVerification: "not-run",
        providerCallDuringVerification: "not-run",
      },
    });
    const result = observeVerificationResult({
      intent,
      receipt: {
        facadeVersion: "v1",
        selectedCommand: "npm test -w packages/ts-shell -- src/verification/boundary.test.ts",
        authority: "explicitly-approved",
        dispatchStatus: "dispatched",
        runtimeStatus: "timeout",
        runtimeReceiptIds: ["receipt-1"],
        relevanceStatus: "relevant",
        coverageStatus: "partially-covered",
        coveredFiles: ["packages/ts-shell/src/verification/boundary.ts"],
        uncoveredFiles: ["packages/ts-shell/src/verification/other.ts"],
        failureClass: "command-timed-out",
        repairEligible: false,
        notProvenClaims: ["task success"],
        verdictStatus: "blocked",
        verdict: {
          status: "BLOCKED",
          terminalClassification: "stopped",
          reason: "blocked",
          provenance: { source: "product-runtime", adapter: "verification-facade" },
          redaction: "raw-content-excluded",
          cleanup: "not-applicable",
          notProvenReasons: [],
          partialReasons: [],
          blockedReasons: ["blocked"],
        },
        selectedNotRunIsSuccess: false,
        oneFileSuccessCanHideAnotherFailure: false,
        mutationDuringVerification: "not-run",
        providerCallDuringVerification: "not-run",
      },
    });

    expect(intent.dispatchStatus).toBe("timed_out");
    expect(intent.relevanceStatus).toBe("task_relevant");
    expect(intent.coverageStatus).toBe("partially_covered");
    expect(result.status).toBe("timed_out");
    expect(result.runtimeReceiptIds).toEqual(["receipt-1"]);
    expect(result.failureClass).toBe("command-timed-out");
    expect(result.verdictStatus).toBe("blocked");
    expect(result.terminalSuccessClaim).toBe(false);
  });

  it("preserves post repair verification requirement, request, and not-run states", () => {
    const repairApply = makeRepairApply();
    const requirement = requirePostRepairVerification({ repairApply });
    const request = requestPostRepairVerification({
      requirement,
      selectedCommandSummary: "npm test -w packages/ts-shell -- focused.test.ts",
    });
    const result = observePostRepairVerificationResult({
      requirement,
      request,
    });

    expect(requirement).toMatchObject({
      sourceRepairApplyId: repairApply.repairApplyId,
      sourceRepairProposalId: repairApply.proposalId,
      sourceVerificationFailureId: repairApply.sourceFailureId,
      originalFailureClass: "test-failed",
      originalFailureStatus: "failed",
      repairApplyState: "applied",
      verificationRequired: true,
      requirementStatus: "required",
      verificationBlocker: "none",
      originalFailurePreserved: true,
      repairApplyPreserved: true,
      terminalSuccessClaim: false,
    });
    expect(request).toMatchObject({
      selectedNotRun: true,
      dispatchStatus: "selected_not_run",
      originalFailurePreserved: true,
      repairApplyPreserved: true,
      terminalSuccessClaim: false,
    });
    expect(result.status).toBe("selected_not_run");
    expect(result.verdictCandidateInput).toBeUndefined();
    expect(result.originalRuntimeReceiptIds).toEqual(["receipt-original"]);
    expect(result.repairApplyReceiptIds).toEqual(["receipt-apply"]);
    expect(result.touchedTargetSummaries).toEqual(["src/app.ts"]);
    expect(result.notProvenClaims).toEqual(
      expect.arrayContaining([
        "post-repair-verification-required-is-not-run",
        "selected-command-is-not-passed",
        "repair-applied-is-not-repair-success",
      ]),
    );
  });

  it("keeps post repair verification result states distinct and exposes passed as verdict input only", () => {
    const requirement = requirePostRepairVerification({ repairApply: makeRepairApply() });
    const request = requestPostRepairVerification({
      requirement,
      dispatchStatus: "dispatched",
      receiptIds: ["receipt-post-repair"],
    });
    const statuses = [
      "passed",
      "failed",
      "blocked",
      "timed_out",
      "cancelled",
      "unavailable",
      "skipped",
      "not_run",
      "selected_not_run",
    ] as const;
    const results = statuses.map((status) =>
      observePostRepairVerificationResult({
        requirement,
        request,
        status,
        receiptIds: ["receipt-post-repair"],
        failureClass: status === "failed" ? "test-failed-after-repair" : undefined,
      })
    );

    expect(results.map((result) => result.status)).toEqual(statuses);
    expect(results.every((result) => result.terminalSuccessClaim === false)).toBe(true);
    expect(results.find((result) => result.status === "passed")?.verdictCandidateInput)
      .toMatchObject({
        resultStatus: "passed",
        sourceRepairApplyId: requirement.sourceRepairApplyId,
        sourceVerificationFailureId: requirement.sourceVerificationFailureId,
        terminalSuccessClaim: false,
      });
    expect(JSON.stringify(results)).not.toContain('"success":true');
  });
});

function makeRepairApply() {
  const intent = projectVerificationIntent({
    sourceTurnId: "turn-post-repair",
    targetSummary: "verify repair target",
    dispatchStatus: "failed",
    relevanceStatus: "task_relevant",
    coverageStatus: "covered",
    authorityRequirement: "granted",
  });
  const result = observeVerificationResult({
    intent,
    status: "failed",
    runtimeReceiptIds: ["receipt-original"],
    failureClass: "test-failed",
    repairEligible: true,
  });
  const handoff = projectRepairRequiredHandoff({ verification: result });
  const proposal = observeRepairProposal({
    handoff,
    proposalSource: "deterministic_from_failure_evidence",
    readinessStatus: "exact_ready",
    applyStatus: "not_applied",
  });
  const authority = observeRepairAuthority({
    proposal,
    authorityDecision: "granted",
    authoritySource: "explicit_repair_authority",
  });
  const request = createRepairApplyRequest({
    proposal,
    authority,
    expectedEditOperationKind: "hunk_set",
  });
  return observeRepairApply({
    proposal,
    authority,
    request,
    editApplyObservation: {
      status: "hunk-set-applied",
      changedFiles: ["src/app.ts"],
      evidence: ["receipt-apply"],
    },
    applyReceiptIds: ["receipt-apply"],
    postRepairVerificationStatus: "not_run",
  });
}
