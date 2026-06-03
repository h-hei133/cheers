import { describe, expect, it } from "vitest";

import { createHostRuntime } from "../../api/host/runtime.js";
import {
  listTaskCases,
  runTaskAssessment,
  runTaskCase,
  type TaskOutcome,
} from "./model.js";

describe("task capability assessment", () => {
  it("defines required task cases with rubrics, fixtures, verification, outputs, and redaction expectations", () => {
    const cases = listTaskCases();

    expect(cases.length).toBeGreaterThanOrEqual(8);
    expect(cases.filter((taskCase) => taskCase.taskKind === "coding-edit")).toHaveLength(2);
    expect(cases.filter((taskCase) => taskCase.taskKind === "debug-repair")).toHaveLength(2);
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
      "pathless-workspace-question",
      "source-report",
      "structured-artifact",
      "unsupported-artifact-export",
      "resume-from-context",
      "live-provider-triage",
    ]);
    expect(result.cases.every((taskCase) => taskCase.terminalSuccessClaim === false)).toBe(true);
    expect(result.cases.every((taskCase) => taskCase.hostEvaluation.terminalSuccessClaim === false)).toBe(true);
    expect(result.cases.every((taskCase) => taskCase.redactionChecks.every((check) => check.passed))).toBe(true);
    expect(outcomeMap(result.cases)).toMatchObject({
      "single-file-edit": "complete",
      "coordinated-edit": "complete",
      "failed-check-repair": "failed",
      "rollback-recovery": "failed",
      "pathless-workspace-question": "blocked",
      "source-report": "failed",
      "structured-artifact": "failed",
      "unsupported-artifact-export": "unsupported",
      "resume-from-context": "not-proven",
      "live-provider-triage": "skipped",
    });
    expect(result.outcomeCounts).toMatchObject({
      complete: 2,
      partial: 0,
      failed: 4,
      blocked: 1,
      skipped: 1,
      unsupported: 1,
      "not-proven": 1,
    });
    expect(result.liveTriage).toMatchObject({
      status: "skipped",
      terminalSuccessClaim: false,
    });
    expect(result.liveTriage.blockers.length).toBeGreaterThan(0);
    expect(result.notProvenClaims).toEqual(
      expect.arrayContaining([
        "terminal-success",
        "task-assessment-run-is-not-task-success",
        "host-evaluation-output-is-not-task-success",
      ]),
    );
  });

  it("supports selected task subsets without upgrading host output to success", async () => {
    const host = createHostRuntime();
    const result = await runTaskAssessment({
      dispatch: host.dispatch,
      caseIds: ["single-file-edit", "live-provider-triage"],
    });
    const unsupported = await runTaskCase({
      caseId: "pathless-workspace-question",
      dispatch: host.dispatch,
    });

    expect(result.outcomeCounts.complete).toBe(1);
    expect(result.outcomeCounts.skipped).toBe(1);
    expect(result.outcomeCounts.failed).toBe(0);
    expect(unsupported.outcome).toBe("blocked");
    expect(unsupported.hostEvaluation.observedEvidenceVerdict).toBe("not-proven");
    expect(unsupported.notProvenClaims).toContain("task-completion-not-proven");
  });

  it("summarizes top blockers from actual non-complete case results", async () => {
    const host = createHostRuntime();
    const result = await runTaskAssessment({ dispatch: host.dispatch });

    expect(result.topBlockers).toHaveLength(3);
    expect(result.topBlockers.map((blocker) => blocker.category)).toEqual([
      "repair failed",
      "verification failed",
      "artifact invalid",
    ]);
    expect(result.topBlockers[0]).toMatchObject({
      category: "repair failed",
      count: 3,
    });
    expect(result.topBlockers[0].caseIds).toEqual(
      expect.arrayContaining(["failed-check-repair", "rollback-recovery", "structured-artifact"]),
    );
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
  });

  it("integrates debug repair diagnosis, failed repair, and preserved original failure", async () => {
    const host = createHostRuntime();
    const result = await runTaskCase({ caseId: "failed-check-repair", dispatch: host.dispatch });

    expect(result.outcome).toBe("failed");
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
    expect(result.remainingBlockers).toEqual(expect.arrayContaining(["verification failed", "repair failed"]));
  });

  it("integrates artifact validation receipts before artifact completion can be proven", async () => {
    const host = createHostRuntime();
    const result = await runTaskCase({ caseId: "structured-artifact", dispatch: host.dispatch });

    expect(result.outcome).toBe("failed");
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
    expect(result.repairDecision.state).toBe("post-validation-failed");
  });

  it("keeps invalid or unsupported artifacts from becoming success", async () => {
    const host = createHostRuntime();
    const invalid = await runTaskCase({ caseId: "source-report", dispatch: host.dispatch });
    const unsupported = await runTaskCase({ caseId: "unsupported-artifact-export", dispatch: host.dispatch });

    expect(invalid.outcome).toBe("failed");
    expect(invalid.beforeBlockers).toEqual(expect.arrayContaining(["verification not selected", "artifact invalid"]));
    expect(invalid.changedBlockers).toContain("verification not selected");
    expect(invalid.remainingBlockers).toEqual(["artifact invalid"]);
    expect(invalid.verificationSelection.state).toBe("selected-not-run");
    expect(invalid.artifactReceipt?.validationState).toBe("invalid");

    expect(unsupported.outcome).toBe("unsupported");
    expect(unsupported.remainingBlockers).toEqual(["unsupported capability"]);
    expect(unsupported.artifactReceipt?.validationState).toBe("not-proven");
  });

  it("keeps continuation not proven when freshness verification is selected but not run", async () => {
    const host = createHostRuntime();
    const result = await runTaskCase({ caseId: "resume-from-context", dispatch: host.dispatch });

    expect(result.outcome).toBe("not-proven");
    expect(result.beforeBlockers).toEqual(expect.arrayContaining(["continuation stale", "verification not selected"]));
    expect(result.changedBlockers).toContain("verification not selected");
    expect(result.remainingBlockers).toEqual(["continuation stale"]);
    expect(result.verificationSelection).toMatchObject({
      purpose: "continuation",
      state: "selected-not-run",
      evidenceInputEligible: false,
      resultInputEligible: false,
    });
    expect(result.notProvenClaims).toContain("task-completion-not-proven");
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
