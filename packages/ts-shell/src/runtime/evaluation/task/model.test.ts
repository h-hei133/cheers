import { describe, expect, it } from "vitest";

import { createHostRuntime } from "../../api/host/runtime.js";
import {
  listTaskCases,
  runTaskAssessment,
  runTaskCase,
  type TaskLiveGateObservation,
  type TaskOutcome,
} from "./model.js";

describe("task capability assessment", () => {
  it("defines required task cases with rubrics, fixtures, verification, outputs, and redaction expectations", () => {
    const cases = listTaskCases();

    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(cases.filter((taskCase) => taskCase.taskKind === "coding-edit")).toHaveLength(2);
    expect(cases.filter((taskCase) => taskCase.taskKind === "debug-repair")).toHaveLength(3);
    expect(cases.filter((taskCase) => taskCase.taskKind === "workspace-understanding")).toHaveLength(4);
    expect(cases.filter((taskCase) => taskCase.taskPath === "artifact")).toHaveLength(8);
    expect(cases.map((taskCase) => taskCase.taskKind)).toEqual(
      expect.arrayContaining([
        "workspace-understanding",
        "docs-report",
        "data-artifact",
        "continuation",
        "live-triage",
      ]),
    );
    expect(cases.map((taskCase) => taskCase.taskPath)).toEqual(
      expect.arrayContaining(["provider", "tool", "edit", "artifact", "continuation"]),
    );
    for (const taskCase of cases) {
      expect(taskCase.shortPrompt.length).toBeGreaterThan(0);
      expect(taskCase.workspace.files.length).toBeGreaterThan(0);
      expect(taskCase.workspace.rawContentExcluded).toBe(true);
      expect(taskCase.allowedTools.length).toBeGreaterThan(0);
      expect(taskCase.successRubric.length).toBeGreaterThan(0);
      expect(taskCase.expectedVerification.taskRelevant).toBe(true);
      expect(taskCase.expectedOutput.summary.length).toBeGreaterThan(0);
      expect(taskCase.redactionExpectations).toEqual(
        expect.arrayContaining(["transcript", "provider output", "command output", "edit text", "secret"]),
      );
      expect(taskCase.terminalSuccessClaim).toBe(false);
    }
  });

  it("runs deterministic task cases through host evaluation and classifies real task outcomes", async () => {
    const host = createHostRuntime();
    const result = await runTaskAssessment({ dispatch: host.dispatch });

    expect(result.suiteId).toBe("task-capability-assessment");
    expect(result.terminalSuccessClaim).toBe(false);
    expect(result.cases.map((taskCase) => taskCase.caseId)).toEqual([
      "single-file-edit",
      "coordinated-edit",
      "failed-check-repair",
      "rollback-recovery",
      "retry-diagnosis-repair",
      "pathless-workspace-question",
      "test-impact-question",
      "owner-context-question",
      "package-script-impact-question",
      "source-report",
      "structured-artifact",
      "incident-summary-report",
      "csv-summary-artifact",
      "release-note-report",
      "metrics-summary-artifact",
      "owner-risk-summary",
      "unsupported-artifact-export",
      "resume-from-context",
      "resume-after-compaction",
      "live-provider-triage",
    ]);
    expect(result.cases.every((taskCase) => taskCase.terminalSuccessClaim === false)).toBe(true);
    expect(result.cases.every((taskCase) => taskCase.hostEvaluation.terminalSuccessClaim === false)).toBe(true);
    expect(result.cases.every((taskCase) => taskCase.redactionChecks.every((check) => check.passed))).toBe(true);
    expect(outcomeMap(result.cases)).toMatchObject({
      "single-file-edit": "complete",
      "coordinated-edit": "complete",
      "failed-check-repair": "complete",
      "rollback-recovery": "complete",
      "retry-diagnosis-repair": "complete",
      "pathless-workspace-question": "complete",
      "test-impact-question": "complete",
      "owner-context-question": "complete",
      "package-script-impact-question": "complete",
      "source-report": "complete",
      "structured-artifact": "complete",
      "incident-summary-report": "complete",
      "csv-summary-artifact": "complete",
      "release-note-report": "complete",
      "metrics-summary-artifact": "complete",
      "owner-risk-summary": "complete",
      "unsupported-artifact-export": "unsupported",
      "resume-from-context": "complete",
      "resume-after-compaction": "complete",
      "live-provider-triage": "skipped",
    });
    expect(result.outcomeCounts).toMatchObject({
      complete: 18,
      partial: 0,
      failed: 0,
      blocked: 0,
      skipped: 1,
      unsupported: 1,
      "not-proven": 0,
    });
    expect(result.liveTriage).toMatchObject({
      status: "ready",
      terminalSuccessClaim: false,
    });
    expect(result.liveTriage.blockers.length).toBeGreaterThan(0);
    expect(Object.fromEntries(result.liveReadiness.map((item) => [item.caseId, item.status]))).toMatchObject({
      "single-file-edit": "unsafe",
      "coordinated-edit": "unsafe",
      "failed-check-repair": "unsafe",
      "rollback-recovery": "unsafe",
      "retry-diagnosis-repair": "unsafe",
      "pathless-workspace-question": "ready",
      "test-impact-question": "ready",
      "owner-context-question": "ready",
      "package-script-impact-question": "ready",
      "source-report": "ready",
      "structured-artifact": "ready",
      "incident-summary-report": "ready",
      "csv-summary-artifact": "ready",
      "release-note-report": "ready",
      "metrics-summary-artifact": "ready",
      "owner-risk-summary": "ready",
      "unsupported-artifact-export": "unsupported",
      "resume-from-context": "ready",
      "resume-after-compaction": "ready",
      "live-provider-triage": "ready",
    });
    expect(result.liveReadiness.every((item) => item.defaultOff && item.optInRequired)).toBe(true);
    expect(result.liveReadiness.every((item) => item.terminalSuccessClaim === false)).toBe(true);
    expect(result.liveReadiness.filter((item) => item.status === "ready").map((item) => item.caseId)).toEqual([
      "pathless-workspace-question",
      "test-impact-question",
      "owner-context-question",
      "package-script-impact-question",
      "source-report",
      "structured-artifact",
      "incident-summary-report",
      "csv-summary-artifact",
      "release-note-report",
      "metrics-summary-artifact",
      "owner-risk-summary",
      "resume-from-context",
      "resume-after-compaction",
      "live-provider-triage",
    ]);
    expect(result.liveReadiness.find((item) => item.caseId === "pathless-workspace-question")).toMatchObject({
      safetyClass: "safe-no-write",
      gate: "read-only-provider",
      writePolicy: "no-write",
      providerReadiness: "required-at-gate",
      authReadiness: "required-at-gate",
      requestPacketStatus: "ready",
      evidenceResultStatus: "not-proven",
      executed: false,
    });
    expect(result.liveReadiness.find((item) => item.caseId === "resume-from-context")).toMatchObject({
      safetyClass: "safe-no-write",
      gate: "anchored-provider",
      writePolicy: "no-write",
    });
    expect(result.liveReadiness.find((item) => item.caseId === "live-provider-triage")).toMatchObject({
      safetyClass: "safe-no-write",
      gate: "provider-readiness",
      writePolicy: "no-write",
    });
    expect(result.liveReadiness.find((item) => item.caseId === "structured-artifact")).toMatchObject({
      status: "ready",
      gate: "artifact-dry-run",
      writePolicy: "manual-review-required",
      hardBlocker: "",
    });
    expect(result.liveExecutions.every((item) => item.executed === false)).toBe(true);
    expect(result.liveExecutions.every((item) => item.terminalSuccessClaim === false)).toBe(true);
    const progressedCases = result.cases.filter((taskCase) =>
      taskCase.progression.mode === "deterministic" &&
      taskCase.progression.modelSource === "deterministic-evaluation" &&
      taskCase.progression.stages.map((stage) => stage.stage).includes("provider-turn") &&
      taskCase.progression.stages.map((stage) => stage.stage).includes("verdict")
    );
    expect(progressedCases.length).toBeGreaterThanOrEqual(6);
    expect(progressedCases.every((taskCase) => taskCase.progression.terminalSuccessClaim === false)).toBe(true);
    expect(progressedCases.every((taskCase) =>
      taskCase.taskLoop.ownerCalls.includes("runtime/evaluation/task") &&
      taskCase.taskLoop.ownerCalls.includes("context/selection") &&
      taskCase.taskLoop.ownerCalls.includes("planning/execution") &&
      taskCase.taskLoop.ownerCalls.includes("provider/request") &&
      taskCase.taskLoop.ownerCalls.includes("verification/execution") &&
      taskCase.taskLoop.ownerCalls.includes("evidence/task") &&
      taskCase.taskLoop.ownerCalls.includes("result/task")
    )).toBe(true);
    expect(progressedCases.every((taskCase) =>
      taskCase.progression.ownerCalls.includes("runtime/evaluation/task") &&
      taskCase.progression.ownerCalls.includes("result/task")
    )).toBe(true);
    expect(progressedCases.filter((taskCase) => taskCase.outcome === "complete").every((taskCase) =>
      taskCase.progression.completeProof === true
    )).toBe(true);
    expect(result.notProvenClaims).toEqual(
      expect.arrayContaining([
        "terminal-success",
        "task-assessment-run-is-not-task-success",
        "host-evaluation-output-is-not-task-success",
      ]),
    );
  });

  it("projects opt-in live task executions without treating gate output as terminal success", async () => {
    const host = createHostRuntime();
    const result = await runTaskAssessment({
      dispatch: host.dispatch,
      liveGateObservations: [
        liveObservation("pathless-workspace-question", "read-only-provider"),
        liveObservation("test-impact-question", "read-only-provider"),
        liveObservation("resume-from-context", "anchored-provider"),
        liveObservation("csv-summary-artifact", "artifact-dry-run", {
          verificationStatus: "passed",
          artifactValidationStatus: "passed",
        }),
      ],
    });

    const executions = result.liveExecutions.filter((item) => item.executed);
    expect(executions.map((item) => item.caseId)).toEqual([
      "pathless-workspace-question",
      "test-impact-question",
      "csv-summary-artifact",
      "resume-from-context",
    ]);
    expect(executions.length).toBeGreaterThanOrEqual(3);
    expect(executions.filter((item) => item.status === "complete" || item.status === "useful-partial").length)
      .toBeGreaterThanOrEqual(2);
    expect(executions.some((item) => item.caseId === "csv-summary-artifact")).toBe(true);
    expect(executions.some((item) => item.caseId === "pathless-workspace-question")).toBe(true);
    for (const execution of executions) {
      expect(execution).toMatchObject({
        noMutation: true,
        changedFiles: [],
        noApply: true,
        redactionStatus: "passed",
        terminalSuccessClaim: false,
      });
      expect(execution.notProvenClaims).toEqual(
        expect.arrayContaining([
          "provider-call-is-not-task-success",
          "live-gate-pass-is-not-task-success",
          "terminal-success",
        ]),
      );
    }
  });

  it("keeps live provider blockers exact and does not execute unsafe observations", async () => {
    const host = createHostRuntime();
    const result = await runTaskAssessment({
      dispatch: host.dispatch,
      liveGateObservations: [
        liveObservation("owner-context-question", "read-only-provider", {
          providerOutcome: "provider-network-inconclusive",
          fallbackConfigured: false,
        }),
        liveObservation("failed-check-repair", "read-only-provider"),
        liveObservation("source-report", "artifact-dry-run", {
          artifactValidationStatus: "failed",
        }),
      ],
    });
    const owner = result.liveExecutions.find((item) => item.caseId === "owner-context-question");
    const repair = result.liveExecutions.find((item) => item.caseId === "failed-check-repair");
    const report = result.liveExecutions.find((item) => item.caseId === "source-report");

    expect(owner).toMatchObject({
      status: "blocked",
      executed: false,
      providerOutcome: "provider-network-inconclusive",
      blockers: ["provider network inconclusive and no configured fallback provider"],
    });
    expect(repair).toMatchObject({
      status: "unsafe",
      executed: false,
    });
    expect(report).toMatchObject({
      status: "artifact-validation-unavailable",
      executed: false,
      blockers: ["artifact validation unavailable"],
    });
  });

  it("records task proof facts for every complete case", async () => {
    const host = createHostRuntime();
    const result = await runTaskAssessment({ dispatch: host.dispatch });
    const completeCases = result.cases.filter((taskCase) => taskCase.outcome === "complete");

    expect(completeCases.map((taskCase) => taskCase.caseId)).toEqual([
      "single-file-edit",
      "coordinated-edit",
      "failed-check-repair",
      "rollback-recovery",
      "retry-diagnosis-repair",
      "pathless-workspace-question",
      "test-impact-question",
      "owner-context-question",
      "package-script-impact-question",
      "source-report",
      "structured-artifact",
      "incident-summary-report",
      "csv-summary-artifact",
      "release-note-report",
      "metrics-summary-artifact",
      "owner-risk-summary",
      "resume-from-context",
      "resume-after-compaction",
    ]);
    for (const taskCase of completeCases) {
      expect(taskCase.proofRecord).toMatchObject({
        taskKind: taskCase.taskKind,
        missingProof: [],
        validationResult: "complete",
        evidenceInput: taskCase.taskProof.proofId,
        resultVerdict: taskCase.taskVerdict.verdictId,
        redactionStatus: "passed",
        terminalSuccessClaim: false,
      });
      expect(taskCase.taskProof.evidenceOwner).toBe("evidence");
      expect(taskCase.taskVerdict.successOwner).toBe("evidence-result-verdict");
      expect(taskCase.proofRecord.requiredProof.length).toBeGreaterThan(0);
      expect(taskCase.proofRecord.incompleteWhen).toEqual(
        taskCase.proofRecord.requiredProof.map((item) => `missing ${item}`),
      );
    }
  });

  it("supports selected task subsets without upgrading host output to success", async () => {
    const host = createHostRuntime();
    const result = await runTaskAssessment({
      dispatch: host.dispatch,
      caseIds: ["single-file-edit", "live-provider-triage"],
    });
    const workspace = await runTaskCase({
      caseId: "pathless-workspace-question",
      dispatch: host.dispatch,
    });

    expect(result.outcomeCounts.complete).toBe(1);
    expect(result.outcomeCounts.skipped).toBe(1);
    expect(result.outcomeCounts.failed).toBe(0);
    expect(workspace.outcome).toBe("complete");
    expect(workspace.hostEvaluation.observedEvidenceVerdict).toBe("not-proven");
    expect(workspace.taskVerdict.completeProof).toBe(true);
  });

  it("summarizes top blockers from actual non-complete case results", async () => {
    const host = createHostRuntime();
    const result = await runTaskAssessment({ dispatch: host.dispatch });

    expect(result.topBlockers).toHaveLength(3);
    expect(result.topBlockers.map((blocker) => blocker.category)).toEqual([
      "environment issue",
      "provider failure",
      "unsupported capability",
    ]);
    expect(result.topBlockers[0]).toMatchObject({
      category: "environment issue",
      count: 1,
      caseIds: ["live-provider-triage"],
    });
  });

  it("integrates code verification with evidence/result proof before completion", async () => {
    const host = createHostRuntime();
    const result = await runTaskCase({ caseId: "single-file-edit", dispatch: host.dispatch });

    expect(result.outcome).toBe("complete");
    expect(result.verificationSelection).toMatchObject({
      purpose: "code-edit",
      state: "selected-passed",
      evidenceInputEligible: true,
      resultInputEligible: true,
      terminalSuccessClaim: false,
    });
    expect(result.repairDecision.state).toBe("not-needed");
    expect(result.hostEvaluation.observedEvidenceVerdict).toBe("complete");
    expect(result.taskVerdict.completeProof).toBe(true);
  });

  it("completes debug repair through repair action, rerun verification, and evidence/result verdict", async () => {
    const host = createHostRuntime();
    const result = await runTaskCase({ caseId: "failed-check-repair", dispatch: host.dispatch });

    expect(result.beforeOutcome).toBe("failed");
    expect(result.outcome).toBe("complete");
    expect(result.verificationSelection).toMatchObject({
      purpose: "debug-repair",
      state: "selected-failed",
      evidenceInputEligible: false,
    });
    expect(result.repairDecision).toMatchObject({
      failureClass: "verification",
      state: "failed",
      originalFailurePreserved: true,
      terminalSuccessClaim: false,
    });
    expect(result.contextSelection.state).toBe("ready");
    expect(result.executionPlan.state).toBe("ready");
    expect(result.toolStrategy.actions).toContain("repair");
    expect(result.toolStrategy.nextAction).toBe("repair");
    expect(result.repairAction).toMatchObject({
      attempted: true,
      postValidation: "passed",
      originalFailurePreserved: true,
    });
    expect(result.verificationExecution.state).toBe("passed");
    expect(result.changedBlockers).toEqual(expect.arrayContaining(["verification failed", "repair failed"]));
    expect(result.remainingBlockers).toEqual([]);
    expect(result.hostEvaluation.observedEvidenceVerdict).toBe("not-proven");
    expect(result.taskProof.status).toBe("complete");
    expect(result.taskVerdict).toMatchObject({
      completeProof: true,
      terminalSuccessClaim: false,
    });
    expect(result.progression.stages.map((stage) => stage.stage)).toEqual([
      "goal",
      "state",
      "context",
      "plan",
      "request",
      "provider-turn",
      "action",
      "observation",
      "verification",
      "repair",
      "proof",
      "verdict",
    ]);
  });

  it("completes rollback recovery through bounded repair and final validation evidence", async () => {
    const host = createHostRuntime();
    const result = await runTaskCase({ caseId: "rollback-recovery", dispatch: host.dispatch });

    expect(result.beforeOutcome).toBe("failed");
    expect(result.outcome).toBe("complete");
    expect(result.contextSelection.state).toBe("ready");
    expect(result.toolStrategy.actions).toContain("repair");
    expect(result.repairAction).toMatchObject({
      attempted: true,
      postValidation: "passed",
      originalFailurePreserved: true,
    });
    expect(result.verificationExecution.state).toBe("passed");
    expect(result.taskProof.presentProof).toEqual(
      expect.arrayContaining(["repair-action", "repair-post-validation", "original-failure-preserved"]),
    );
    expect(result.taskVerdict.completeProof).toBe(true);
    expect(result.changedBlockers).toEqual(expect.arrayContaining(["verification failed", "repair failed"]));
    expect(result.remainingBlockers).toEqual([]);
  });

  it("completes additional debug repair through diagnosis, bounded repair, and post-validation", async () => {
    const host = createHostRuntime();
    const result = await runTaskCase({ caseId: "retry-diagnosis-repair", dispatch: host.dispatch });

    expect(result.beforeOutcome).toBe("failed");
    expect(result.outcome).toBe("complete");
    expect(result.repairDecision).toMatchObject({
      failureClass: "verification",
      state: "failed",
      originalFailurePreserved: true,
      retryAllowed: false,
    });
    expect(result.toolStrategy.nextAction).toBe("repair");
    expect(result.repairDecision.diagnosticContextNeeded).toEqual(
      expect.arrayContaining(["selected check", "failure output summary"]),
    );
    expect(result.repairAction).toMatchObject({
      attempted: true,
      postValidation: "passed",
      originalFailurePreserved: true,
    });
    expect(result.verificationExecution.state).toBe("passed");
    expect(result.taskProof.presentProof).toEqual(
      expect.arrayContaining(["repair-action", "repair-post-validation", "original-failure-preserved"]),
    );
    expect(result.taskVerdict.completeProof).toBe(true);
  });

  it("completes artifact validation through correction, rerun verification, and proof verdict", async () => {
    const host = createHostRuntime();
    const result = await runTaskCase({ caseId: "structured-artifact", dispatch: host.dispatch });

    expect(result.beforeOutcome).toBe("failed");
    expect(result.outcome).toBe("complete");
    expect(result.verificationSelection).toMatchObject({
      purpose: "structured-output",
      state: "selected-failed",
    });
    expect(result.artifactReceipt).toMatchObject({
      intent: "produce structured-data artifact",
      kind: "structured-data",
      outputPath: "artifacts/totals.json",
      validationState: "validation-failed",
      terminalSuccessClaim: false,
    });
    expect(result.artifactCorrection).toMatchObject({
      attempted: true,
      validationState: "validation-passed",
      terminalSuccessClaim: false,
    });
    expect(result.repairDecision.state).toBe("post-validation-failed");
    expect(result.verificationExecution.state).toBe("passed");
    expect(result.changedBlockers).toEqual(expect.arrayContaining(["artifact invalid", "verification failed"]));
    expect(result.taskProof.presentProof).toEqual(
      expect.arrayContaining(["artifact-source-receipts", "artifact-validation"]),
    );
    expect(result.taskVerdict.completeProof).toBe(true);
  });

  it("keeps invalid or unsupported artifacts from becoming success", async () => {
    const host = createHostRuntime();
    const invalid = await runTaskCase({ caseId: "source-report", dispatch: host.dispatch });
    const unsupported = await runTaskCase({ caseId: "unsupported-artifact-export", dispatch: host.dispatch });

    expect(invalid.beforeOutcome).toBe("failed");
    expect(invalid.outcome).toBe("complete");
    expect(invalid.beforeBlockers).toEqual(["artifact invalid"]);
    expect(invalid.changedBlockers).toEqual(["artifact invalid"]);
    expect(invalid.remainingBlockers).toEqual([]);
    expect(invalid.verificationSelection.state).toBe("selected-not-run");
    expect(invalid.artifactReceipt?.validationState).toBe("invalid");
    expect(invalid.toolStrategy.nextAction).toBe("artifact");
    expect(invalid.artifactCorrection?.validationState).toBe("validation-passed");
    expect(invalid.verificationExecution.state).toBe("passed");
    expect(invalid.taskVerdict.completeProof).toBe(true);

    expect(unsupported.outcome).toBe("unsupported");
    expect(unsupported.remainingBlockers).toEqual(["unsupported capability"]);
    expect(unsupported.artifactReceipt?.validationState).toBe("not-proven");
    expect(unsupported.toolStrategy.state).toBe("blocked");
    expect(unsupported.toolStrategy.nextAction).toBe("artifact");
    expect(unsupported.artifactCorrection?.attempted).toBe(false);
  });

  it("completes continuation by refreshing context and projecting a proof verdict", async () => {
    const host = createHostRuntime();
    const result = await runTaskCase({ caseId: "resume-from-context", dispatch: host.dispatch });

    expect(result.beforeOutcome).toBe("not-proven");
    expect(result.outcome).toBe("complete");
    expect(result.beforeBlockers).toEqual(["continuation stale"]);
    expect(result.changedBlockers).toEqual(["continuation stale"]);
    expect(result.remainingBlockers).toEqual([]);
    expect(result.contextSelection).toMatchObject({
      state: "ready",
      refreshed: true,
      terminalSuccessClaim: false,
    });
    expect(result.verificationSelection).toMatchObject({
      purpose: "continuation",
      state: "selected-not-run",
      evidenceInputEligible: false,
      resultInputEligible: false,
    });
    expect(result.verificationExecution.state).toBe("partial");
    expect(result.taskProof.presentProof).toContain("continuation-freshness");
    expect(result.taskVerdict.completeProof).toBe(true);
  });

  it("completes pathless workspace questions through target resolution proof", async () => {
    const host = createHostRuntime();
    const result = await runTaskCase({ caseId: "pathless-workspace-question", dispatch: host.dispatch });

    expect(result.beforeOutcome).toBe("blocked");
    expect(result.outcome).toBe("complete");
    expect(result.contextSelection).toMatchObject({
      state: "ready",
      targetPaths: ["src/runtime/selector.ts"],
      terminalSuccessClaim: false,
    });
    expect(result.requestPacket.state).toBe("ready");
    expect(result.toolStrategy).toMatchObject({
      state: "ready",
      actions: expect.arrayContaining(["search", "verify"]),
      nextAction: "search",
    });
    expect(result.changedBlockers).toEqual(expect.arrayContaining(["context insufficient", "authority missing"]));
    expect(result.remainingBlockers).toEqual([]);
    expect(result.hostEvaluation.observedEvidenceVerdict).toBe("not-proven");
    expect(result.taskProof.presentProof).toContain("workspace-target-resolution");
    expect(result.taskVerdict.completeProof).toBe(true);
  });

  it("completes additional pathless context tasks without granting write authority", async () => {
    const host = createHostRuntime();
    const testImpact = await runTaskCase({ caseId: "test-impact-question", dispatch: host.dispatch });
    const ownerContext = await runTaskCase({ caseId: "owner-context-question", dispatch: host.dispatch });
    const packageImpact = await runTaskCase({ caseId: "package-script-impact-question", dispatch: host.dispatch });

    expect(testImpact.outcome).toBe("complete");
    expect(testImpact.allowedWrites).toEqual([]);
    expect(testImpact.contextSelection.targetPaths).toEqual(["src/cache/store.ts"]);
    expect(testImpact.contextSelection.selectedPaths).toEqual(
      expect.arrayContaining(["package.json", "src/cache/store.ts", "src/cache/store.test.ts", "src/http/client.ts"]),
    );
    expect(testImpact.taskProof.presentProof).toContain("workspace-target-resolution");
    expect(testImpact.taskVerdict.completeProof).toBe(true);

    expect(ownerContext.outcome).toBe("complete");
    expect(ownerContext.allowedWrites).toEqual([]);
    expect(ownerContext.contextSelection.targetPaths).toEqual(["src/runtime/execution/receipt.ts"]);
    expect(ownerContext.taskProof.presentProof).toContain("workspace-target-resolution");
    expect(ownerContext.taskVerdict.completeProof).toBe(true);

    expect(packageImpact.outcome).toBe("complete");
    expect(packageImpact.allowedWrites).toEqual([]);
    expect(packageImpact.contextSelection.targetPaths).toEqual(["src/runtime/api/host/runtime.ts"]);
    expect(packageImpact.contextSelection.selectedPaths).toEqual(
      expect.arrayContaining(["package.json", "src/runtime/api/host/runtime.ts", "src/runtime/api/host/runtime.test.ts"]),
    );
    expect(packageImpact.taskProof.presentProof).toContain("workspace-target-resolution");
    expect(packageImpact.taskVerdict.completeProof).toBe(true);
  });

  it("completes additional report and data artifacts through receipts and validation", async () => {
    const host = createHostRuntime();
    const report = await runTaskCase({ caseId: "incident-summary-report", dispatch: host.dispatch });
    const data = await runTaskCase({ caseId: "csv-summary-artifact", dispatch: host.dispatch });
    const release = await runTaskCase({ caseId: "release-note-report", dispatch: host.dispatch });
    const metrics = await runTaskCase({ caseId: "metrics-summary-artifact", dispatch: host.dispatch });
    const ownerRisk = await runTaskCase({ caseId: "owner-risk-summary", dispatch: host.dispatch });

    expect(report.outcome).toBe("complete");
    expect(report.artifactReceipt).toMatchObject({
      intent: "produce report artifact",
      outputPath: "reports/incident.md",
      validationState: "invalid",
    });
    expect(report.artifactCorrection).toMatchObject({
      attempted: true,
      validationState: "validation-passed",
    });
    expect(report.taskProof.presentProof).toEqual(
      expect.arrayContaining(["artifact-source-receipts", "artifact-validation"]),
    );

    expect(data.outcome).toBe("complete");
    expect(data.artifactReceipt).toMatchObject({
      intent: "produce structured-data artifact",
      outputPath: "artifacts/orders-summary.json",
      validationState: "validation-failed",
    });
    expect(data.artifactCorrection).toMatchObject({
      attempted: true,
      validationState: "validation-passed",
    });
    expect(data.taskVerdict.completeProof).toBe(true);

    for (const artifact of [release, metrics, ownerRisk]) {
      expect(artifact.outcome).toBe("complete");
      expect(artifact.artifactReceipt?.sourceReceipts.every((source) => source.available)).toBe(true);
      expect(artifact.artifactCorrection).toMatchObject({
        attempted: true,
        validationState: "validation-passed",
      });
      expect(artifact.taskProof.presentProof).toEqual(
        expect.arrayContaining(["artifact-source-receipts", "artifact-validation"]),
      );
      expect(artifact.taskVerdict.completeProof).toBe(true);
    }
    expect(metrics.artifactReceipt).toMatchObject({
      kind: "structured-data",
      outputPath: "artifacts/metrics-summary.json",
    });
  });

  it("completes additional continuation by rebuilding fresh retained context", async () => {
    const host = createHostRuntime();
    const result = await runTaskCase({ caseId: "resume-after-compaction", dispatch: host.dispatch });

    expect(result.beforeOutcome).toBe("not-proven");
    expect(result.outcome).toBe("complete");
    expect(result.setupEvaluations.map((setup) => setup.scenarioId)).toEqual(["branch-compaction-continuation"]);
    expect(result.contextSelection).toMatchObject({
      state: "ready",
      refreshed: true,
      targetPaths: ["src/ownerReview.ts"],
    });
    expect(result.taskProof.presentProof).toContain("continuation-freshness");
    expect(result.taskVerdict.completeProof).toBe(true);
  });

  it("meets autonomous development task mix gates", async () => {
    const host = createHostRuntime();
    const result = await runTaskAssessment({
      dispatch: host.dispatch,
      liveGateObservations: [
        liveObservation("pathless-workspace-question", "read-only-provider"),
        liveObservation("package-script-impact-question", "read-only-provider"),
      ],
    });
    const complete = result.cases.filter((taskCase) => taskCase.outcome === "complete");

    expect(complete).toHaveLength(18);
    expect(complete.filter((taskCase) => taskCase.taskKind === "workspace-understanding")).toHaveLength(4);
    expect(complete.filter((taskCase) => taskCase.taskKind === "debug-repair")).toHaveLength(3);
    expect(complete.filter((taskCase) => taskCase.taskPath === "artifact")).toHaveLength(7);
    expect(complete.filter((taskCase) => taskCase.taskKind === "continuation")).toHaveLength(2);
    expect(result.liveExecutions.filter((execution) =>
      execution.executed &&
      (execution.status === "complete" || execution.status === "useful-partial")
    )).toHaveLength(2);
  });

  it("keeps unsafe text out of task assessment results", async () => {
    const host = createHostRuntime();
    const result = await runTaskAssessment({ dispatch: host.dispatch });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toMatch(
      /token=secret|oldText:RAW|newText:RAW|RAW_OLD_TEXT_SHOULD_NOT_LEAK|RAW_NEW_TEXT_SHOULD_NOT_LEAK|hidden reasoning/i,
    );
    expect(serialized).not.toContain('"terminalSuccessClaim":true');
  });
});

function outcomeMap(cases: readonly { readonly caseId: string; readonly outcome: TaskOutcome }[]) {
  return Object.fromEntries(cases.map((taskCase) => [taskCase.caseId, taskCase.outcome]));
}

function liveObservation(
  caseId: TaskLiveGateObservation["caseId"],
  gate: TaskLiveGateObservation["gate"],
  overrides: Partial<Omit<TaskLiveGateObservation, "caseId" | "gate" | "explicitOptIn">> = {},
): TaskLiveGateObservation {
  return {
    caseId,
    gate,
    explicitOptIn: true,
    providerAttempted: true,
    providerOutcome: "passed",
    noMutation: true,
    changedFiles: [],
    noApply: true,
    redactionStatus: "passed",
    verificationStatus: "partial",
    ...overrides,
  };
}
