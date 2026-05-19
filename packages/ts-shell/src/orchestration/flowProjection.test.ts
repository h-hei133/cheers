import { describe, expect, it } from "vitest";
import type { BrowserObservation } from "../core/context/browserObs.js";
import { createBrowserTxnResult } from "../core/context/browserTxnEvidence.js";
import {
  buildBrowserAgentBaseEvidence,
  projectBrowserContinuationEvidence,
  projectBrowserObservationEvidence,
  projectBrowserTransactionEvidence,
  projectVerificationEvidence,
} from "./flowEvidenceProjection.js";
import {
  projectBrowserContinuationResult,
  projectBrowserObservationResult,
  projectBrowserTransactionResult,
} from "./flowResultProjection.js";

describe("agent-loop flow projections", () => {
  const observation: BrowserObservation = {
    status: "success",
    operation: "observe",
    controlledTarget: "local-fixture://safe",
    visibleTextSummary: "Safe summary",
    actionResultSummary: "observe returned controlled observation",
    reasonCode: "ready",
    cleanupStatus: "closed",
    redactionStatus: "clean",
    evidenceId: "browser-obs-11111111",
    nextActions: ["Use the summarized browser evidence in the final answer."],
    evidence: [
      "browser-observation:evidence-id:browser-obs-11111111",
      "browser-observation:raw-dom-excluded",
      "browser-observation:no-secrets",
    ],
  };

  it("projects replay-safe browser continuation summaries without raw DOM", () => {
    const evidence = projectBrowserContinuationEvidence(
      buildBrowserAgentBaseEvidence({
        freshnessEvidence: ["freshness-boundary:ok"],
        planEvidence: ["browser-plan:continued"],
      }),
    );

    const projected = projectBrowserContinuationResult({
      evidence,
      continuationSummary: "Prior observation is still actionable.",
    });

    expect(projected.userFacingOutput).toBe(
      [
        "Browser evidence from prior session",
        "- Summary: Prior observation is still actionable.",
        "- Raw DOM: excluded",
      ].join("\n"),
    );
    expect(projected.codingResult.evidence).toContain(
      "browser-agent-loop:continued-from-prior-evidence",
    );
    expect(projected.codingResult.evidence.join("\n")).not.toMatch(/<html|secret|cookie/i);
    expect(projected.codingResult.verification.status).toBe("passed");
  });

  it("projects browser transaction stopped results with redacted evidence markers", () => {
    const transaction = createBrowserTxnResult({
      status: "stopped",
      transactionId: "txn-route137",
      controlledTarget: "local-fixture://safe",
      planner: {
        status: "planned",
        operation: "click",
        reason: "target missing",
        confidence: "high",
        repairAllowed: true,
        evidence: ["planner:evidence"],
      },
      stepSummaries: [
        {
          kind: "click",
          status: "stopped",
          target: "Save",
          summary: "Target missing",
          reasonCode: "action-target-missing",
        },
      ],
      finalSummary: "Target missing",
      reasonCode: "action-target-missing",
      cleanupStatus: "closed",
      redactionStatus: "clean",
      repairStatus: "failed",
      durationMs: 10,
      evidence: ["browser-transaction:raw-dom-excluded"],
    });
    const evidence = projectBrowserTransactionEvidence({
      evidence: ["browser-agent-loop:no-raw-dom"],
      transaction,
    });

    const projected = projectBrowserTransactionResult({
      evidence,
      transaction,
    });

    expect(projected.codingResult.failedFiles).toEqual([
      { path: "(browser)", reason: "Target missing" },
    ]);
    expect(projected.codingResult.verification).toMatchObject({
      status: "blocked",
      reason: "Target missing",
      blockerKind: "unknown",
    });
    expect(projected.codingResult.evidence).toEqual(
      expect.arrayContaining([
        "browser-agent-loop:no-raw-dom",
        "browser-agent-result:stopped",
        "browser-agent-reason:action-target-missing",
        "browser-transaction:raw-dom-excluded",
      ]),
    );
    expect(projected.userFacingOutput).toContain("Target missing");
  });

  it("projects browser observation success and evidence without secrets", () => {
    const evidence = [
      "browser-agent-loop:no-raw-dom",
      ...projectBrowserObservationEvidence(observation),
    ];

    const projected = projectBrowserObservationResult({
      evidence,
      finalObservation: observation,
    });

    expect(projected.userFacingOutput).toBe(
      [
        "Browser task completed",
        "- Operation: observe",
        "- Summary: Safe summary",
        "- Cleanup: closed",
        "- EvidenceId: browser-obs-11111111",
        "- Raw DOM: excluded",
      ].join("\n"),
    );
    expect(projected.codingResult.evidence).toEqual(
      expect.arrayContaining([
        "browser-agent-observation:browser-obs-11111111:observe:success:ready:closed:Safe summary",
        "browser-agent-result:success",
        "browser-agent-reason:ready",
        "browser-observation:raw-dom-excluded",
        "browser-observation:no-secrets",
      ]),
    );
  });

  it("projects browser observation failures as actionable stopped results", () => {
    const stopped = projectBrowserObservationResult({
      evidence: ["browser-agent-loop:no-raw-dom"],
      firstFailure: {
        reason: "Public web automation is blocked",
        reasonCode: "policy-blocked",
      },
      finalObservation: {
        ...observation,
        status: "stopped",
        reasonCode: "policy-blocked",
        nextActions: ["Use a controlled local fixture."],
      },
    });

    expect(stopped.userFacingOutput).toContain("Browser task stopped");
    expect(stopped.userFacingOutput).toContain("ReasonCode: policy-blocked");
    expect(stopped.codingResult.verification).toMatchObject({
      status: "blocked",
      nextAction: "Use a controlled local fixture.",
    });
    expect(stopped.codingResult.evidence).toContain(
      "browser-agent-result:stopped",
    );
  });

  it("projects verification evidence markers used by continue recovery", () => {
    const evidence = projectVerificationEvidence({
      verification: {
        status: "blocked",
        command: "npm test",
        reason: "approval denied",
        selectionScope: "explicit",
        selectionSource: "explicit-user",
        blockerKind: "approval-denied",
        nextAction:
          "Re-run and approve escalation for verify command execution.",
      },
      targetPath: "src/app.ts",
      workspaceRoot: "/repo",
      verifyLikeCommand: true,
    });

    expect(evidence).toEqual([
      "verify-command-hint:npm test",
      "verify-cwd-hint:/repo",
      "verify-target-hint:src/app.ts",
      "verify-blocker-kind:approval-denied",
      "verify-next-action:Re-run and approve escalation for verify command execution.",
      "verify-resume-eligible:true",
    ]);
  });
});
