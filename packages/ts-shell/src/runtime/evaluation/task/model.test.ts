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
      "rollback-recovery": "partial",
      "pathless-workspace-question": "blocked",
      "source-report": "not-proven",
      "structured-artifact": "failed",
      "unsupported-artifact-export": "unsupported",
      "resume-from-context": "not-proven",
      "live-provider-triage": "skipped",
    });
    expect(result.outcomeCounts).toMatchObject({
      complete: 2,
      partial: 1,
      failed: 2,
      blocked: 1,
      skipped: 1,
      unsupported: 1,
      "not-proven": 2,
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
      "verification not selected",
      "artifact invalid",
      "repair failed",
    ]);
    expect(result.topBlockers[0]).toMatchObject({
      category: "verification not selected",
      count: 3,
    });
    expect(result.topBlockers[0].caseIds).toEqual(
      expect.arrayContaining(["rollback-recovery", "source-report", "resume-from-context"]),
    );
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
