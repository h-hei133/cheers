import { describe, expect, it } from "vitest";
import { createQueryRuntimeHarnessState } from "../../core/query/runtime/harness.js";
import { buildCompactContinuitySummary } from "./compactSummary.js";

describe("buildCompactContinuitySummary", () => {
  it("projects approval, mutation write, failure, and seed continuity into compact summary entries", () => {
    const result = buildCompactContinuitySummary({
      summary: [
        "- keep-this: prior context",
        "- last-write-effect: stale",
        "- last-success-handoff-diagnostic: stale",
      ],
      continuity: {
        existing: "preserved",
        lastRequestScopeCacheKey: "existing-cache",
      },
      approvalAudit: {
        decision: "allow-once",
        decisionSource: "cli-policy",
        persistent: false,
        cacheEffect: "none",
        projectRoot: "/workspace",
        cacheKey: "/workspace|apply_patch:workspace-write",
        scopeLabel: "apply_patch/workspace-write",
        lineage: "lineage-1",
        channel: "non-interactive",
        inputKey: "y",
        recordedAt: "2026-05-12T00:00:00.000Z",
      },
      approvalAuditHistory: [
        {
          decision: "allow-once",
          decisionSource: "cli-policy",
          persistent: false,
          cacheEffect: "none",
          projectRoot: "/workspace",
          cacheKey: "/workspace|apply_patch:workspace-write",
          scopeLabel: "apply_patch/workspace-write",
          recordedAt: "2026-05-12T00:00:00.000Z",
        },
      ],
      result: {
        taskKind: "edit-file",
        actionHandoffSummary: "Action handoff: edit-file target=src/a.ts.",
        writeContinuity: {
          writerStarted: true,
          writeEffect: "unknown",
          requiresUserInspection: true,
          target: "src/b.ts",
        },
        seedInfluence: "target-carryover",
        seedInfluenceHandoffSummary: "Seed handoff: target carried over.",
        failureHandoffDiagnostic:
          "Failure handoff: status=blocked; blocker=partial-mutation-failed.",
      },
    });

    expect(result.continuity).toMatchObject({
      existing: "preserved",
      lastApprovalDecision: "allow-once",
      lastApprovalDecisionSource: "cli-policy",
      lastApprovalPersistent: false,
      lastApprovalCacheEffect: "none",
      lastApprovalProjectRoot: "/workspace",
      lastApprovalCacheKey: "/workspace|apply_patch:workspace-write",
      lastApprovalScope: "apply_patch/workspace-write",
      lastApprovalLineage: "lineage-1",
      lastApprovalChannel: "non-interactive",
      lastApprovalInputKey: "y",
      lastRequestScopeCacheKey: "existing-cache",
      lastRequestScopeLabel: "apply_patch/workspace-write",
      lastRequestScopeProjectRoot: "/workspace",
      lastRequestScopeSource: "approval-request",
      lastPermissionRequestScopeLabel: "apply_patch/workspace-write",
      lastPermissionRequestCacheKey: "/workspace|apply_patch:workspace-write",
      lastPermissionRequestProjectRoot: "/workspace",
      lastPermissionRequestSource: "approval-request",
      lastPermissionRequestLineage: "lineage-1",
      lastActionHandoffSummary: "Action handoff: edit-file target=src/a.ts.",
      lastWriterStarted: true,
      lastWriteEffect: "unknown",
      lastWriteRequiresUserInspection: true,
      lastWriteEffectTarget: "src/b.ts",
      lastSeedInfluence: "target-carryover",
      lastSeedInfluenceHandoffSummary: "Seed handoff: target carried over.",
      lastFailureHandoffDiagnostic:
        "Failure handoff: status=blocked; blocker=partial-mutation-failed.",
    });
    expect(result.approvalAuditHistory).toHaveLength(1);
    expect(result.summary).toContain("- keep-this: prior context");
    expect(result.summary).toContain("- last-write-effect: unknown");
    expect(result.summary).toContain(
      "- last-failure-handoff-diagnostic: Failure handoff: status=blocked; blocker=partial-mutation-failed.",
    );
    expect(result.summary).not.toContain("- last-write-effect: stale");
    expect(result.summary).not.toContain(
      "- last-success-handoff-diagnostic: stale",
    );
  });

  it("preserves success handoff without inventing failure or approval history", () => {
    const result = buildCompactContinuitySummary({
      summary: undefined,
      continuity: undefined,
      approvalAuditHistory: [],
      result: {
        taskKind: "edit-file",
        successHandoffDiagnostic:
          "Success handoff: status=passed; verified=src/a.ts,src/b.ts.",
      },
    });

    expect(result.approvalAuditHistory).toBeUndefined();
    expect(result.continuity).toEqual({
      lastTaskKind: "edit-file",
      lastSuccessHandoffDiagnostic:
        "Success handoff: status=passed; verified=src/a.ts,src/b.ts.",
    });
    expect(result.summary).toEqual([
      "- last-success-handoff-diagnostic: Success handoff: status=passed; verified=src/a.ts,src/b.ts.",
    ]);
  });

  it("carries safe harness queues through compact continuity", () => {
    const result = buildCompactContinuitySummary({
      summary: undefined,
      continuity: undefined,
      approvalAuditHistory: [],
      harness: createQueryRuntimeHarnessState({
        pendingVerification: [
          {
            queueId: "verify-compact",
            targetFiles: ["src/compact.ts"],
            command: "npm test compact",
          },
        ],
      }),
    });

    expect(result.continuity.harnessState).toMatchObject({
      version: 1,
      pendingVerification: [
        {
          queueId: "verify-compact",
          targetFiles: ["src/compact.ts"],
        },
      ],
    });
    expect(result.summary).toEqual([]);
  });
});
