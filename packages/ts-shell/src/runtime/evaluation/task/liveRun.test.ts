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
      "single-file-edit",
      "coordinated-edit",
      "failed-check-repair",
      "rollback-recovery",
      "package-script-impact",
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
    expect(entries.filter((entry) => entry.writePolicy === "manual-review-required").map((entry) => entry.entryId))
      .toEqual(expect.arrayContaining(["single-file-edit", "coordinated-edit", "failed-check-repair", "rollback-recovery"]));
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
        writeObservation("single-file-edit", {
          changedFiles: ["src/format.ts"],
          postApplyVerificationStatus: "passed",
        }),
        writeObservation("coordinated-edit", {
          changedFiles: ["src/parser.ts", "src/caller.ts"],
          postApplyVerificationStatus: "passed",
        }),
        writeObservation("failed-check-repair", {
          changedFiles: ["src/check.ts"],
          postApplyVerificationStatus: "passed",
        }),
        writeObservation("rollback-recovery", {
          changedFiles: ["src/alpha.ts"],
          postApplyVerificationStatus: "partial",
          proofStatus: "partial",
          rollbackStatus: "partial",
        }),
        observation("package-script-impact", "read-only-provider", { verificationStatus: "partial" }),
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
          patchIntentStatus: "present",
          safePlanStatus: "ready",
          dryRunDiffStatus: "produced",
          reviewAuthority: "missing",
          applyStatus: "not-run",
          isolatedApply: false,
          realWorkspaceMutation: false,
        }),
      ],
    });

    expect(report.summary).toMatchObject({
      entryCount: 13,
      executedCount: 12,
      completeOrUsefulPartialCount: 11,
      pathlessOrContextExecuted: true,
      reportArtifactOrDataExecuted: true,
      continuationExecutedOrExactPartial: true,
      readonlyCodingExecuted: true,
      writeEntrySafe: true,
      writePatchIntentDryRunCount: 5,
      isolatedApplyCount: 4,
      postApplyProofCount: 3,
      debugOrRepairUseful: true,
      rollbackRecoveryStatus: "useful-partial",
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
      patchIntentStatus: "present",
      dryRunDiffStatus: "produced",
    });
    for (const result of report.results.filter((entry) => entry.executed && entry.writePolicy === "no-write")) {
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
    expect(report.results.find((result) => result.entryId === "single-file-edit")).toMatchObject({
      status: "complete",
      changedFiles: ["src/format.ts"],
      reviewAuthority: "approved",
      applyStatus: "applied",
      isolatedApply: true,
      realWorkspaceMutation: false,
      postApplyVerificationStatus: "passed",
      proofStatus: "complete",
      terminalSuccessClaim: false,
    });
    expect(report.results.find((result) => result.entryId === "rollback-recovery")).toMatchObject({
      status: "useful-partial",
      rollbackStatus: "partial",
      realWorkspaceMutation: false,
      terminalSuccessClaim: false,
    });
    expect(JSON.stringify(report)).not.toMatch(/Bearer |api[_-]?key|token|headers|raw provider output|diff --git|\*\*\* Begin Patch/i);
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

  it("does not treat patch intent or dry-run diff as apply authority", async () => {
    const host = createHostRuntime();
    const report = await runTaskLiveReport({
      dispatch: host.dispatch,
      observations: [
        observation("single-file-edit", "anchored-provider", {
          noMutation: false,
          noApply: true,
          patchIntentStatus: "present",
          safePlanStatus: "ready",
          dryRunDiffStatus: "produced",
          reviewAuthority: "missing",
          applyStatus: "not-run",
          isolatedApply: false,
          realWorkspaceMutation: false,
          postApplyVerificationStatus: "not-run",
          proofStatus: "partial",
        }),
        observation("rollback-recovery", "anchored-provider", {
          noMutation: false,
          noApply: true,
          patchIntentStatus: "present",
          safePlanStatus: "ready",
          dryRunDiffStatus: "produced",
          reviewAuthority: "missing",
          applyStatus: "not-run",
          isolatedApply: false,
          realWorkspaceMutation: false,
          rollbackStatus: "blocked",
          exactBlocker: "explicit review authority missing for isolated rollback recovery",
          proofStatus: "partial",
        }),
      ],
    });

    expect(report.results.find((result) => result.entryId === "single-file-edit")).toMatchObject({
      executed: false,
      status: "failed",
      patchIntentStatus: "present",
      dryRunDiffStatus: "produced",
      reviewAuthority: "missing",
      applyStatus: "not-run",
      isolatedApply: false,
      blockers: expect.arrayContaining(["explicit review authority missing", "isolated apply not completed"]),
      terminalSuccessClaim: false,
    });
    expect(report.results.find((result) => result.entryId === "rollback-recovery")).toMatchObject({
      executed: false,
      status: "blocked",
      blockers: ["explicit review authority missing for isolated rollback recovery"],
      terminalSuccessClaim: false,
    });
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

function writeObservation(
  entryId: Extract<TaskLiveRunObservation["entryId"], "single-file-edit" | "coordinated-edit" | "failed-check-repair" | "rollback-recovery">,
  overrides: Partial<Omit<TaskLiveRunObservation, "entryId" | "gate" | "explicitOptIn">> = {},
): TaskLiveRunObservation {
  return observation(entryId, "anchored-provider", {
    noMutation: false,
    changedFiles: ["src/app.ts"],
    noApply: false,
    verificationStatus: "passed",
    proofStatus: "complete",
    patchIntentStatus: "present",
    safePlanStatus: "ready",
    dryRunDiffStatus: "produced",
    reviewAuthority: "approved",
    applyStatus: "applied",
    isolatedApply: true,
    realWorkspaceMutation: false,
    postApplyVerificationStatus: "passed",
    rollbackStatus: entryId === "rollback-recovery" ? "complete" : "not-run",
    ...overrides,
  });
}
