import { describe, expect, it } from "vitest";
import { createHostRuntime } from "../../api/host/runtime.js";
import { parseTaskLiveCatalog } from "./catalog.js";
import {
  listTaskLiveEntries,
  projectLiveObservationsFromGateReceipts,
  runTaskLiveReport,
  type TaskLiveGateReceipt,
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

  it("defines focused live entries with the smaller recovery hard-gate mix", () => {
    const entries = listTaskLiveEntries("focused");

    expect(entries.map((entry) => entry.entryId)).toEqual([
      "label-normalization",
      "status-consumer-coordination",
      "assertion-repair",
      "incident-brief-report",
      "context-review-resume",
      "provider-recovery-triage",
      "owner-receipt-question",
      "metrics-rollup-artifact",
    ]);
    expect(entries.length).toBeGreaterThanOrEqual(6);
    expect(entries.length).toBeLessThanOrEqual(8);
    expect(entries.filter((entry) => entry.writePolicy === "manual-review-required").map((entry) => entry.entryId))
      .toEqual(expect.arrayContaining([
        "label-normalization",
        "status-consumer-coordination",
        "assertion-repair",
      ]));
    expect(entries.find((entry) => entry.entryId === "provider-recovery-triage")).toMatchObject({
      gate: "anchored-provider",
      writePolicy: "no-write",
      terminalSuccessClaim: false,
    });
    for (const entry of entries) {
      expect(entry.requirements).toEqual(
        expect.arrayContaining(["explicit opt-in", "isolated runtime home", "redacted output"]),
      );
      expect(entry.defaultOff).toBe(true);
      expect(entry.optInRequired).toBe(true);
      expect(entry.terminalSuccessClaim).toBe(false);
    }
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

  it("consumes external task catalog entries through the live runtime without opt-in execution", async () => {
    const host = createHostRuntime();
    const catalog = parseTaskLiveCatalog(catalogFixture());
    const report = await runTaskLiveReport({ dispatch: host.dispatch, catalog });

    expect(report.profile).toBe("catalog");
    expect(report.entries).toHaveLength(8);
    expect(report.entries.map((entry) => entry.entryId)).toEqual([
      "catalog-label-policy",
      "catalog-status-chain",
      "catalog-assertion-fix",
      "catalog-incident-brief",
      "catalog-rollup-data",
      "catalog-review-resume",
      "catalog-provider-recovery",
      "catalog-owner-receipt",
    ]);
    expect(report.summary).toMatchObject({
      entryCount: 8,
      executedCount: 0,
      hardGateStatus: "not-passed",
      terminalSuccessClaim: false,
    });
    expect(report.results.find((result) => result.entryId === "catalog-status-chain")?.blockers)
      .toEqual(["explicit opt-in gate not executed: anchored-provider"]);
  });

  it("runs catalog entries through receipt projection and keeps fallback non-terminal", async () => {
    const host = createHostRuntime();
    const catalog = parseTaskLiveCatalog(catalogFixture());
    const report = await runTaskLiveReport({
      dispatch: host.dispatch,
      catalog,
      gateReceipts: [
        gateReceipt("read-only-provider"),
        primarySuccessFallbackSkippedReceipt(),
        forcedPrimaryFailureFallbackReceipt(),
      ],
      reviewedApplyOptIn: true,
    });

    expect(report.summary).toMatchObject({
      profile: "catalog",
      entryCount: 8,
      executedCount: 8,
      completedWithTaskProofCount: 8,
      completedWriteTaskProofCount: 3,
      reviewedDisposablePostApplyProofCount: 3,
      debugOrRepairComplete: true,
      multiFileCompleteOrExactPartial: true,
      artifactOrReportComplete: true,
      continuationOrContextComplete: true,
      primaryProviderSuccess: true,
      primarySuccessFallbackSkipped: true,
      forcedPrimaryFailureFallbackAttempted: true,
      forcedPrimaryFailureFallbackPassed: true,
      providerFallbackCoveragePassed: true,
      hardGateStatus: "passed",
      terminalSuccessClaim: false,
    });
    expect(report.results.find((result) => result.entryId === "catalog-status-chain")?.changedFiles)
      .toEqual(["src/status/producer.ts", "src/status/consumer.ts"]);
    expect(report.results.find((result) => result.entryId === "catalog-provider-recovery")?.proofStatus)
      .toBe("complete");
    expect(report.notProvenClaims).toEqual(expect.arrayContaining([
      "terminal-success",
      "live-run-report-is-not-task-success",
      "provider-call-is-not-task-success",
    ]));
  });

  it("uses safe owner receipt validation when read-only provider metadata is unavailable", async () => {
    const host = createHostRuntime();
    const catalog = parseTaskLiveCatalog(catalogFixture());
    const report = await runTaskLiveReport({
      dispatch: host.dispatch,
      catalog,
      gateReceipts: [
        gateReceipt("read-only-provider", {
          outcome: "config-or-skip",
          noMutation: false,
          changedFiles: ["unverified-change"],
          blocker: "live gate did not produce passed safe metadata",
        }),
        primarySuccessFallbackSkippedReceipt(),
        forcedPrimaryFailureFallbackReceipt(),
      ],
      reviewedApplyOptIn: true,
    });

    const ownerReceipt = report.results.find((result) => result.entryId === "catalog-owner-receipt");
    expect(ownerReceipt).toMatchObject({
      status: "complete",
      executed: true,
      providerOutcome: "config-or-skip",
      noMutation: true,
      changedFiles: [],
      noApply: true,
      redactionStatus: "passed",
      proofStatus: "complete",
      blockers: [],
      terminalSuccessClaim: false,
    });
    expect(ownerReceipt?.proofItems).toEqual(expect.arrayContaining([
      "owner-receipt-validation",
      "task-proof",
      "no-mutation-check",
      "no-apply-check",
    ]));
    expect(report.summary).toMatchObject({
      profile: "catalog",
      entryCount: 8,
      executedCount: 8,
      completedWithTaskProofCount: 8,
      completedWriteTaskProofCount: 3,
      reviewedDisposablePostApplyProofCount: 3,
      manualCorrectionCount: 0,
      providerFallbackCoveragePassed: true,
      hardGateStatus: "passed",
      terminalSuccessClaim: false,
    });
  });

  it("reports exact missing proof when owner receipt fallback has no safe source", async () => {
    const host = createHostRuntime();
    const catalog = parseTaskLiveCatalog(catalogFixture());
    const report = await runTaskLiveReport({
      dispatch: host.dispatch,
      catalog,
      gateReceipts: [
        gateReceipt("read-only-provider", {
          outcome: "config-or-skip",
          noMutation: false,
          changedFiles: ["unverified-change"],
          blocker: "live gate did not produce passed safe metadata",
        }),
      ],
      reviewedApplyOptIn: true,
    });

    expect(report.results.find((result) => result.entryId === "catalog-owner-receipt")).toMatchObject({
      status: "failed",
      executed: false,
      proofStatus: "missing",
      blockers: ["owner receipt proof missing: safe no-write receipt source unavailable"],
      terminalSuccessClaim: false,
    });
  });

  it("summarizes executed live entries with proof without treating provider calls as success", async () => {
    const host = createHostRuntime();
    const report = await runTaskLiveReport({
      dispatch: host.dispatch,
      gateReceipts: [
        gateReceipt("read-only-provider"),
        primarySuccessFallbackSkippedReceipt(),
        forcedPrimaryFailureFallbackReceipt(),
      ],
      observations: [
        writeObservation("single-file-edit", {
          changedFiles: ["src/format.ts"],
          postApplyVerificationStatus: "passed",
          realWorkspaceApplyStatus: "applied",
          realWorkspaceApplyScope: "isolated-selected-workspace",
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
      completedWriteTaskProofCount: 3,
      reviewedDisposablePostApplyProofCount: 3,
      correctionFreeCompletedWriteCount: 3,
      debugOrRepairUseful: true,
      debugOrRepairComplete: true,
      multiFileCompleteOrExactPartial: true,
      artifactOrReportComplete: true,
      continuationOrContextComplete: true,
      rollbackRecoveryStatus: "useful-partial",
      qualityRecordCount: 7,
      writeOrArtifactQualityRecordCount: 7,
      dryRunQualityRecordCount: 5,
      reviewedIsolatedPostApplyCount: 3,
      realWorkspaceReadyCount: 3,
      realWorkspaceApplyCount: 1,
      manualCorrectionCount: 2,
      correctionDispositionCount: 2,
      debugRepairFailureProvedCount: 1,
      multiFileQualityRecord: true,
      multiFileCompleteOrExactPartial: true,
      artifactOrReportComplete: true,
      continuationOrContextComplete: true,
      artifactQualityPassed: true,
      primaryProviderSuccess: true,
      primarySuccessFallbackSkipped: true,
      forcedPrimaryFailureFallbackAttempted: true,
      forcedPrimaryFailureFallbackPassed: true,
      providerFallbackCoveragePassed: true,
      hardGateStatus: "passed",
      blockers: [],
      terminalSuccessClaim: false,
    });
    const liveProgressions = report.results.filter((result) =>
      result.progression.mode === "live" &&
      result.progression.modelSource === "explicit-live-gate" &&
      result.progression.stages.map((stage) => stage.stage).includes("provider-turn") &&
      result.progression.stages.map((stage) => stage.stage).includes("verdict")
    );
    expect(liveProgressions.length).toBeGreaterThanOrEqual(6);
    expect(liveProgressions.every((result) => result.progression.terminalSuccessClaim === false)).toBe(true);
    expect(liveProgressions.every((result) =>
      result.progression.ownerCalls.includes("runtime/evaluation/task") &&
      result.progression.ownerCalls.includes("context/selection") &&
      result.progression.ownerCalls.includes("planning/execution") &&
      result.progression.ownerCalls.includes("provider/request") &&
      result.progression.ownerCalls.includes("provider/response") &&
      result.progression.ownerCalls.includes("verification/execution") &&
      result.progression.ownerCalls.includes("evidence/task") &&
      result.progression.ownerCalls.includes("result/task")
    )).toBe(true);
    expect(report.results.find((result) => result.entryId === "write-planning-dry-run")).toMatchObject({
      executed: true,
      status: "manual-review-required",
      writePolicy: "dry-run-only",
      noApply: true,
      changedFiles: [],
      patchIntentStatus: "present",
      dryRunDiffStatus: "produced",
      progression: {
        mode: "live",
        modelSource: "explicit-live-gate",
        completeProof: false,
      },
    });
    expect(report.results.find((result) => result.entryId === "write-planning-dry-run")?.progression.stages)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ stage: "action", owner: "edit", status: "partial" }),
        expect.objectContaining({ stage: "proof", owner: "evidence/task", status: "partial" }),
        expect.objectContaining({ stage: "verdict", owner: "result/task", status: "not-proven" }),
      ]));
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
      realWorkspaceApplyStatus: "applied",
      realWorkspaceApplyScope: "isolated-selected-workspace",
      postApplyVerificationStatus: "passed",
      proofStatus: "complete",
      qualityRecord: expect.objectContaining({
        targetFileCount: 1,
        targetFileMatch: "matched",
        hunkOrSectionCount: 1,
        applyScope: "isolated-selected-workspace",
        realWorkspaceApplyStatus: "applied",
        postActionVerificationStatus: "passed",
        finalReadiness: "applied-in-disposable-workspace",
        terminalSuccessClaim: false,
      }),
      terminalSuccessClaim: false,
      progression: {
        mode: "live",
        modelSource: "explicit-live-gate",
        completeProof: true,
      },
    });
    expect(report.results.find((result) => result.entryId === "rollback-recovery")).toMatchObject({
      status: "useful-partial",
      rollbackStatus: "partial",
      realWorkspaceMutation: false,
      terminalSuccessClaim: false,
    });
    expect(JSON.stringify(report)).not.toMatch(/Bearer |api[_-]?key|token|headers|raw provider output|diff --git|\*\*\* Begin Patch/i);
  });

  it("summarizes focused live entries against the smaller hard gates", async () => {
    const host = createHostRuntime();
    const report = await runTaskLiveReport({
      dispatch: host.dispatch,
      profile: "focused",
      gateReceipts: [
        gateReceipt("read-only-provider"),
        primarySuccessFallbackSkippedReceipt(),
        forcedPrimaryFailureFallbackReceipt(),
      ],
      observations: [
        writeObservation("label-normalization", {
          changedFiles: ["src/labels.ts"],
          postApplyVerificationStatus: "passed",
          realWorkspaceApplyStatus: "applied",
          realWorkspaceApplyScope: "isolated-selected-workspace",
        }),
        writeObservation("status-consumer-coordination", {
          changedFiles: ["src/status.ts", "src/statusConsumer.ts"],
          postApplyVerificationStatus: "passed",
        }),
        writeObservation("assertion-repair", {
          changedFiles: ["src/assertion.ts"],
          postApplyVerificationStatus: "passed",
        }),
        observation("incident-brief-report", "artifact-dry-run", {
          verificationStatus: "passed",
          artifactValidationStatus: "passed",
        }),
        observation("context-review-resume", "anchored-provider", { verificationStatus: "partial" }),
        observation("provider-recovery-triage", "anchored-provider", {
          verificationStatus: "passed",
          proofStatus: "complete",
          fallbackConfigured: true,
          fallbackAttempted: true,
          fallbackOutcome: "passed",
        }),
        observation("owner-receipt-question", "read-only-provider", { verificationStatus: "partial" }),
        observation("metrics-rollup-artifact", "artifact-dry-run", {
          verificationStatus: "passed",
          artifactValidationStatus: "passed",
        }),
      ],
    });

    expect(report.profile).toBe("focused");
    expect(report.summary).toMatchObject({
      profile: "focused",
      entryCount: 8,
      executedCount: 8,
      completedWithTaskProofCount: 8,
      completedWriteTaskProofCount: 3,
      reviewedDisposablePostApplyProofCount: 3,
      correctionFreeCompletedWriteCount: 3,
      manualCorrectionCount: 0,
      multiFileQualityRecord: true,
      multiFileCompleteOrExactPartial: true,
      artifactOrReportComplete: true,
      continuationOrContextComplete: true,
      primaryProviderSuccess: true,
      primarySuccessFallbackSkipped: true,
      forcedPrimaryFailureFallbackAttempted: true,
      forcedPrimaryFailureFallbackPassed: true,
      providerFallbackCoveragePassed: true,
      hardGateStatus: "passed",
      blockers: [],
      terminalSuccessClaim: false,
    });
    expect(report.results.find((result) => result.entryId === "status-consumer-coordination")).toMatchObject({
      status: "complete",
      changedFiles: ["src/status.ts", "src/statusConsumer.ts"],
      qualityRecord: expect.objectContaining({
        targetFileCount: 2,
        targetFileMatch: "matched",
        manualCorrectionNeeded: false,
      }),
    });
    expect(report.results.find((result) => result.entryId === "provider-recovery-triage")).toMatchObject({
      status: "complete",
      proofStatus: "complete",
      noMutation: true,
      changedFiles: [],
      noApply: true,
      terminalSuccessClaim: false,
    });
    expect(JSON.stringify(report)).not.toMatch(/Bearer |api[_-]?key|token|headers|raw provider output|diff --git|\*\*\* Begin Patch/i);
  });

  it("projects gate receipts into task-loop live entries inside the runtime owner", async () => {
    const host = createHostRuntime();
    const entries = listTaskLiveEntries();
    const observations = projectLiveObservationsFromGateReceipts({
      entries,
      reviewedApplyOptIn: true,
      gateReceipts: [
        gateReceipt("read-only-provider"),
        gateReceipt("anchored-provider", {
          fallbackConfigured: true,
          fallbackAttempted: false,
          fallbackOutcome: "skipped",
          primaryFailureClass: "none",
        }),
        forcedPrimaryFailureFallbackReceipt(),
      ],
      workspaceApplyReceipts: [workspaceApplyReceipt()],
    });
    const report = await runTaskLiveReport({
      dispatch: host.dispatch,
      reviewedApplyOptIn: true,
      gateReceipts: [
        gateReceipt("read-only-provider"),
        gateReceipt("anchored-provider", {
          fallbackConfigured: true,
          fallbackAttempted: false,
          fallbackOutcome: "skipped",
          primaryFailureClass: "none",
        }),
        forcedPrimaryFailureFallbackReceipt(),
      ],
      workspaceApplyReceipts: [workspaceApplyReceipt()],
    });

    expect(observations.map((observation) => observation.entryId)).toEqual([
      "package-script-impact",
      "pathless-workspace-question",
      "owner-context-question",
      "test-impact-question",
      "readonly-coding-check",
      "resume-from-context",
      "incident-summary-report",
      "metrics-summary-artifact",
      "write-planning-dry-run",
      "single-file-edit",
      "coordinated-edit",
      "failed-check-repair",
      "rollback-recovery",
    ]);
    expect(report.summary).toMatchObject({
      executedCount: 13,
      completeOrUsefulPartialCount: 12,
      isolatedApplyCount: 4,
      postApplyProofCount: 3,
      completedWriteTaskProofCount: 3,
      reviewedDisposablePostApplyProofCount: 3,
      correctionFreeCompletedWriteCount: 3,
      qualityRecordCount: 7,
      writeOrArtifactQualityRecordCount: 7,
      dryRunQualityRecordCount: 5,
      reviewedIsolatedPostApplyCount: 3,
      realWorkspaceReadyCount: 3,
      realWorkspaceApplyCount: 1,
      correctionDispositionCount: 2,
      debugRepairFailureProvedCount: 1,
      multiFileQualityRecord: true,
      multiFileCompleteOrExactPartial: true,
      artifactOrReportComplete: true,
      continuationOrContextComplete: true,
      artifactQualityPassed: true,
      primaryProviderSuccess: true,
      primarySuccessFallbackSkipped: true,
      forcedPrimaryFailureFallbackAttempted: true,
      forcedPrimaryFailureFallbackPassed: true,
      providerFallbackCoveragePassed: true,
      hardGateStatus: "passed",
      terminalSuccessClaim: false,
    });
    expect(report.results.find((result) => result.entryId === "single-file-edit")).toMatchObject({
      status: "complete",
      changedFiles: ["src/format.ts"],
      isolatedApply: true,
      realWorkspaceMutation: false,
      realWorkspaceApplyStatus: "applied",
      realWorkspaceApplyScope: "isolated-selected-workspace",
      qualityRecord: expect.objectContaining({
        applyScope: "isolated-selected-workspace",
        finalReadiness: "applied-in-disposable-workspace",
      }),
      progression: {
        mode: "live",
        modelSource: "explicit-live-gate",
        completeProof: true,
      },
    });
    expect(report.results.find((result) => result.entryId === "incident-summary-report")).toMatchObject({
      status: "complete",
      artifactValidationStatus: "passed",
      noApply: true,
      qualityRecord: expect.objectContaining({
        actionKind: "report-artifact",
        hunkOrSectionCount: 4,
        verificationRelevance: "task-relevant",
        manualCorrectionNeeded: false,
        finalReadiness: "manual-review-required",
      }),
    });
    expect(report.results.every((result) => result.terminalSuccessClaim === false)).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/Bearer |api[_-]?key|token|headers|raw provider output|diff --git|\*\*\* Begin Patch/i);
  });

  it("projects gate receipts into focused live entries including forced provider recovery", async () => {
    const host = createHostRuntime();
    const entries = listTaskLiveEntries("focused");
    const observations = projectLiveObservationsFromGateReceipts({
      entries,
      reviewedApplyOptIn: true,
      gateReceipts: [
        gateReceipt("read-only-provider"),
        primarySuccessFallbackSkippedReceipt(),
        forcedPrimaryFailureFallbackReceipt(),
      ],
      workspaceApplyReceipts: [{
        ...workspaceApplyReceipt(),
        entryId: "label-normalization",
        changedFiles: ["src/labels.ts"],
      }],
    });
    const report = await runTaskLiveReport({
      dispatch: host.dispatch,
      profile: "focused",
      reviewedApplyOptIn: true,
      gateReceipts: [
        gateReceipt("read-only-provider"),
        primarySuccessFallbackSkippedReceipt(),
        forcedPrimaryFailureFallbackReceipt(),
      ],
      workspaceApplyReceipts: [{
        ...workspaceApplyReceipt(),
        entryId: "label-normalization",
        changedFiles: ["src/labels.ts"],
      }],
    });

    expect(observations.map((observation) => observation.entryId)).toEqual([
      "owner-receipt-question",
      "label-normalization",
      "status-consumer-coordination",
      "assertion-repair",
      "context-review-resume",
      "incident-brief-report",
      "metrics-rollup-artifact",
      "provider-recovery-triage",
    ]);
    expect(report.summary).toMatchObject({
      profile: "focused",
      entryCount: 8,
      executedCount: 8,
      completedWithTaskProofCount: 8,
      completedWriteTaskProofCount: 3,
      reviewedDisposablePostApplyProofCount: 3,
      correctionFreeCompletedWriteCount: 3,
      manualCorrectionCount: 0,
      providerFallbackCoveragePassed: true,
      hardGateStatus: "passed",
      blockers: [],
      terminalSuccessClaim: false,
    });
    expect(report.results.find((result) => result.entryId === "label-normalization")).toMatchObject({
      changedFiles: ["src/labels.ts"],
      realWorkspaceApplyStatus: "applied",
      realWorkspaceApplyScope: "isolated-selected-workspace",
      qualityRecord: expect.objectContaining({
        applyScope: "isolated-selected-workspace",
        finalReadiness: "applied-in-disposable-workspace",
      }),
    });
    expect(report.results.find((result) => result.entryId === "provider-recovery-triage")).toMatchObject({
      status: "complete",
      proofStatus: "complete",
      providerOutcome: "passed",
      noMutation: true,
      noApply: true,
    });
  });

  it("keeps SP029 live development hard gate incomplete without disposable selected-workspace apply proof", async () => {
    const host = createHostRuntime();
    const report = await runTaskLiveReport({
      dispatch: host.dispatch,
      reviewedApplyOptIn: true,
      gateReceipts: [
        gateReceipt("read-only-provider"),
        gateReceipt("anchored-provider"),
      ],
    });

    expect(report.summary).toMatchObject({
      qualityRecordCount: 7,
      writeOrArtifactQualityRecordCount: 7,
      dryRunQualityRecordCount: 5,
      reviewedIsolatedPostApplyCount: 4,
      realWorkspaceReadyCount: 4,
      realWorkspaceApplyCount: 0,
      completedWriteTaskProofCount: 3,
      reviewedDisposablePostApplyProofCount: 3,
      correctionFreeCompletedWriteCount: 3,
      hardGateStatus: "not-passed",
      terminalSuccessClaim: false,
    });
    expect(report.summary.blockers).toEqual(
      expect.arrayContaining([
        "no reviewed real-workspace apply was proven in a disposable isolated selected workspace",
        "forced primary provider-network failure did not attempt configured fallback",
      ]),
    );
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
  entryId: Extract<TaskLiveRunObservation["entryId"], "single-file-edit" | "coordinated-edit" | "failed-check-repair" | "rollback-recovery" | "label-normalization" | "status-consumer-coordination" | "assertion-repair">,
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

function gateReceipt(
  gate: "read-only-provider" | "anchored-provider",
  overrides: Partial<TaskLiveGateReceipt> = {},
): TaskLiveGateReceipt {
  return {
    gate,
    attempted: true,
    outcome: "passed" as const,
    noMutation: true,
    changedFiles: [],
    noApply: true,
    redactionStatus: "passed" as const,
    ...overrides,
  };
}

function primarySuccessFallbackSkippedReceipt(): TaskLiveGateReceipt {
  return gateReceipt("anchored-provider", {
    fallbackConfigured: true,
    fallbackAttempted: false,
    fallbackOutcome: "skipped",
    primaryFailureClass: "none",
  });
}

function forcedPrimaryFailureFallbackReceipt(): TaskLiveGateReceipt {
  return gateReceipt("anchored-provider", {
    fallbackConfigured: true,
    fallbackAttempted: true,
    fallbackOutcome: "passed",
    primaryFailureClass: "provider-network",
    forcedPrimaryFailure: true,
  });
}

function workspaceApplyReceipt(): {
  readonly gate: "selected-workspace-apply";
  readonly attempted: true;
  readonly outcome: "passed";
  readonly entryId: "single-file-edit";
  readonly changedFiles: readonly ["src/format.ts"];
  readonly writerTarget: "isolated-selected-workspace";
  readonly postActionVerificationStatus: "passed";
  readonly redactionStatus: "passed";
  readonly repositoryClean: true;
} {
  return {
    gate: "selected-workspace-apply",
    attempted: true,
    outcome: "passed",
    entryId: "single-file-edit",
    changedFiles: ["src/format.ts"],
    writerTarget: "isolated-selected-workspace",
    postActionVerificationStatus: "passed",
    redactionStatus: "passed",
    repositoryClean: true,
  };
}

function catalogFixture() {
  return {
    catalogId: "test-catalog",
    version: 1,
    tasks: [
      catalogTask({
        entryId: "catalog-label-policy",
        caseId: "catalog-label-policy",
        baseCaseId: "single-file-edit",
        entryKind: "write-edit",
        taskKind: "coding-edit",
        taskPath: "edit",
        allowedWrites: ["src/status/policy.ts"],
        requiredPaths: ["src/status/policy.ts"],
        hostEvaluationCaseId: "multi-target-mutation-success",
      }),
      catalogTask({
        entryId: "catalog-status-chain",
        caseId: "catalog-status-chain",
        baseCaseId: "coordinated-edit",
        entryKind: "write-edit",
        taskKind: "coding-edit",
        taskPath: "edit",
        allowedWrites: ["src/status/producer.ts", "src/status/consumer.ts"],
        requiredPaths: ["src/status/producer.ts", "src/status/consumer.ts"],
        hostEvaluationCaseId: "multi-target-mutation-success",
      }),
      catalogTask({
        entryId: "catalog-assertion-fix",
        caseId: "catalog-assertion-fix",
        baseCaseId: "failed-check-repair",
        entryKind: "write-repair",
        taskKind: "debug-repair",
        taskPath: "edit",
        allowedWrites: ["src/assertions/check.ts"],
        requiredPaths: ["src/assertions/check.ts"],
        hostEvaluationCaseId: "mutation-recovery-success",
        repairValidationEvidence: {
          status: "passed",
          check: "rerun original assertion check",
          originalFailurePreserved: true,
        },
      }),
      catalogTask({
        entryId: "catalog-incident-brief",
        caseId: "catalog-incident-brief",
        baseCaseId: "incident-summary-report",
        entryKind: "report-artifact",
        taskKind: "docs-report",
        taskPath: "artifact",
        gate: "artifact-dry-run",
        allowedWrites: ["reports/incident-brief.md"],
        requiredPaths: ["reports/incident-brief.md"],
        hostEvaluationCaseId: "provider-compatibility-happy",
      }),
      catalogTask({
        entryId: "catalog-rollup-data",
        caseId: "catalog-rollup-data",
        baseCaseId: "metrics-summary-artifact",
        entryKind: "data-artifact",
        taskKind: "data-artifact",
        taskPath: "artifact",
        gate: "artifact-dry-run",
        allowedWrites: ["reports/metrics-rollup.json"],
        requiredPaths: ["reports/metrics-rollup.json"],
        hostEvaluationCaseId: "provider-compatibility-happy",
      }),
      catalogTask({
        entryId: "catalog-review-resume",
        caseId: "catalog-review-resume",
        baseCaseId: "resume-from-context",
        entryKind: "continuation",
        taskKind: "continuation",
        taskPath: "continuation",
        writePolicy: "no-write",
        safetyClass: "safe-no-write",
        allowedWrites: [],
        requiredPaths: [],
        hostEvaluationCaseId: "branch-compaction-continuation",
        setupEvaluationCaseIds: ["branch-compaction-continuation"],
      }),
      catalogTask({
        entryId: "catalog-provider-recovery",
        caseId: "catalog-provider-recovery",
        baseCaseId: "live-provider-triage",
        entryKind: "provider-triage",
        taskKind: "live-triage",
        taskPath: "provider",
        writePolicy: "no-write",
        safetyClass: "safe-no-write",
        allowedWrites: [],
        requiredPaths: [],
        hostEvaluationCaseId: "provider-fallback",
      }),
      catalogTask({
        entryId: "catalog-owner-receipt",
        caseId: "catalog-owner-receipt",
        baseCaseId: "owner-context-question",
        entryKind: "pathless-context",
        taskKind: "workspace-understanding",
        taskPath: "tool",
        gate: "read-only-provider",
        writePolicy: "no-write",
        safetyClass: "safe-no-write",
        allowedWrites: [],
        requiredPaths: [],
        hostEvaluationCaseId: "read-only-tool-loop",
      }),
    ],
  };
}

function catalogTask(input: {
  readonly entryId: string;
  readonly caseId: string;
  readonly baseCaseId: string;
  readonly entryKind: string;
  readonly taskKind: string;
  readonly taskPath: string;
  readonly gate?: string;
  readonly safetyClass?: string;
  readonly writePolicy?: string;
  readonly allowedWrites: readonly string[];
  readonly requiredPaths: readonly string[];
  readonly hostEvaluationCaseId: string;
  readonly setupEvaluationCaseIds?: readonly string[];
  readonly repairValidationEvidence?: unknown;
}) {
  return {
    ...input,
    gate: input.gate ?? "anchored-provider",
    safetyClass: input.safetyClass ?? "manual-review",
    writePolicy: input.writePolicy ?? "manual-review-required",
    shortPrompt: `${input.entryId} task`,
    validationPlan: `${input.entryId} validation`,
    requirements: ["task proof"],
    allowedTools: ["read", "verify"],
    expectedOutput: {
      kind: input.taskPath === "continuation" ? "continuation" : input.taskPath === "artifact" ? "artifact" : "diff",
      summary: `${input.entryId} output`,
      requiredPaths: input.requiredPaths,
    },
    expectedVerification: {
      verificationId: `${input.entryId}-check`,
      commandOrCheck: `${input.entryId} focused check`,
      expectedStatus: "passed",
    },
    successRubric: ["proof"],
    failureCategories: ["completion proof missing"],
    redactionExpectations: ["provider-output"],
  };
}
