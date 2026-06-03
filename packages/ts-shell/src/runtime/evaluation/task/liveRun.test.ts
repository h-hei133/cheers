import { describe, expect, it } from "vitest";
import { createHostRuntime } from "../../api/host/runtime.js";
import {
  listTaskLiveEntries,
  runTaskLiveReport,
  type TaskLiveRunObservation,
} from "./liveRun.js";

describe("task live run report", () => {
  it("defines target live entries with exact requirements and default-off gates", () => {
    const entries = listTaskLiveEntries();

    expect(entries.map((entry) => entry.entryId)).toEqual([
      "pathless-workspace-question",
      "owner-context-question",
      "test-impact-question",
      "incident-summary-report",
      "metrics-summary-artifact",
      "resume-from-context",
      "readonly-coding-check",
      "write-planning-dry-run",
    ]);
    expect(entries.length).toBeGreaterThanOrEqual(6);
    for (const entry of entries) {
      expect(entry.requirements).toEqual(
        expect.arrayContaining(["explicit opt-in", "isolated runtime home", "redacted output"]),
      );
      expect(entry.validationPlan.length).toBeGreaterThan(0);
      expect(entry.defaultOff).toBe(true);
      expect(entry.optInRequired).toBe(true);
      expect(entry.terminalSuccessClaim).toBe(false);
    }
    expect(entries.find((entry) => entry.entryId === "write-planning-dry-run")).toMatchObject({
      writePolicy: "dry-run-only",
      safetyClass: "manual-review",
    });
  });

  it("keeps missing opt-in as exact non-executed blockers", async () => {
    const host = createHostRuntime();
    const report = await runTaskLiveReport({ dispatch: host.dispatch });

    expect(report.results.every((result) => result.executed === false)).toBe(true);
    expect(report.summary).toMatchObject({
      hardGateStatus: "not-passed",
      executedCount: 0,
      terminalSuccessClaim: false,
    });
    expect(report.results.find((result) => result.entryId === "pathless-workspace-question")?.blockers)
      .toEqual(["explicit opt-in gate not executed: read-only-provider"]);
    expect(report.results.find((result) => result.entryId === "resume-from-context")?.blockers)
      .toEqual(["explicit opt-in gate not executed: anchored-provider"]);
    expect(report.notProvenClaims).toEqual(
      expect.arrayContaining(["terminal-success", "live-run-report-is-not-task-success"]),
    );
  });

  it("summarizes executed live entries with proof without treating provider calls as success", async () => {
    const host = createHostRuntime();
    const report = await runTaskLiveReport({
      dispatch: host.dispatch,
      observations: [
        observation("pathless-workspace-question", "read-only-provider", { verificationStatus: "partial" }),
        observation("owner-context-question", "read-only-provider", { verificationStatus: "partial" }),
        observation("incident-summary-report", "artifact-dry-run", {
          verificationStatus: "passed",
          artifactValidationStatus: "passed",
        }),
        observation("metrics-summary-artifact", "artifact-dry-run", {
          verificationStatus: "passed",
          artifactValidationStatus: "passed",
        }),
        observation("resume-from-context", "anchored-provider", { verificationStatus: "partial" }),
        observation("readonly-coding-check", "read-only-provider", {
          verificationStatus: "partial",
          proofStatus: "complete",
        }),
        observation("write-planning-dry-run", "anchored-provider", {
          verificationStatus: "partial",
          proofStatus: "partial",
        }),
      ],
    });

    expect(report.summary).toMatchObject({
      entryCount: 8,
      executedCount: 7,
      completeOrUsefulPartialCount: 6,
      pathlessOrContextExecuted: true,
      reportArtifactOrDataExecuted: true,
      continuationExecutedOrExactPartial: true,
      readonlyCodingExecuted: true,
      writeEntrySafe: true,
      hardGateStatus: "passed",
      blockers: [],
      terminalSuccessClaim: false,
    });
    expect(report.results.find((result) => result.entryId === "write-planning-dry-run")).toMatchObject({
      executed: true,
      status: "manual-review-required",
      writePolicy: "dry-run-only",
      noApply: true,
      changedFiles: [],
    });
    for (const result of report.results.filter((entry) => entry.executed)) {
      expect(result).toMatchObject({
        providerAttempted: true,
        noMutation: true,
        changedFiles: [],
        noApply: true,
        redactionStatus: "passed",
        terminalSuccessClaim: false,
      });
      expect(result.notProvenClaims).toEqual(
        expect.arrayContaining([
          "provider-call-is-not-task-success",
          "live-gate-pass-is-not-task-success",
          "terminal-success",
        ]),
      );
    }
  });

  it("preserves exact provider and redaction blockers", async () => {
    const host = createHostRuntime();
    const report = await runTaskLiveReport({
      dispatch: host.dispatch,
      observations: [
        observation("owner-context-question", "read-only-provider", {
          providerOutcome: "provider-network-inconclusive",
          fallbackConfigured: false,
        }),
        observation("readonly-coding-check", "read-only-provider", {
          redactionStatus: "failed",
          proofStatus: "complete",
        }),
      ],
    });

    expect(report.results.find((result) => result.entryId === "owner-context-question")).toMatchObject({
      executed: false,
      status: "blocked",
      blockers: ["provider network inconclusive and no configured fallback provider"],
    });
    expect(report.results.find((result) => result.entryId === "readonly-coding-check")).toMatchObject({
      executed: false,
      status: "redaction-blocked",
      blockers: ["redaction blocked"],
    });
    expect(JSON.stringify(report)).not.toMatch(/Bearer |api[_-]?key|token|headers|raw provider output/i);
  });
});

function observation(
  entryId: TaskLiveRunObservation["entryId"],
  gate: TaskLiveRunObservation["gate"],
  overrides: Partial<Omit<TaskLiveRunObservation, "entryId" | "gate" | "explicitOptIn">> = {},
): TaskLiveRunObservation {
  return {
    entryId,
    gate,
    explicitOptIn: true,
    providerAttempted: true,
    providerOutcome: "passed",
    noMutation: true,
    changedFiles: [],
    noApply: true,
    redactionStatus: "passed",
    verificationStatus: "partial",
    proofStatus: "complete",
    ...overrides,
  };
}
