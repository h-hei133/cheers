import { describe, expect, it } from "vitest";
import {
  projectApprovalAudit,
  projectApprovalAuditContinuity,
  projectApprovalSummaryFallback,
} from "./approvalAuditProjection.js";
import type { ApprovalAuditMemoryState } from "./sessionContinuityTypes.js";

describe("approvalAuditProjection", () => {
  const approvalAudit: ApprovalAuditMemoryState = {
    decision: "allow-once",
    decisionSource: "cli-policy",
    persistent: false,
    cacheEffect: "none",
    projectRoot: "/repo",
    cacheKey: "/repo|apply_patch:workspace-write",
    scopeLabel: "apply_patch/workspace-write",
    lineage: "route-31",
    stopReason: "permission accepted",
    channel: "non-interactive",
    inputKey: "y",
    recordedAt: "2026-01-01T00:00:00.000Z",
  };

  it("projects approval audit facts into continuity snapshot fields", () => {
    expect(projectApprovalAudit(approvalAudit)).toEqual({
      lastApprovalDecision: "allow-once",
      lastApprovalDecisionSource: "cli-policy",
      lastApprovalPersistent: false,
      lastApprovalCacheEffect: "none",
      lastApprovalProjectRoot: "/repo",
      lastApprovalCacheKey: "/repo|apply_patch:workspace-write",
      lastApprovalScope: "apply_patch/workspace-write",
      lastApprovalLineage: "route-31",
      lastApprovalStopReason: "permission accepted",
      lastApprovalChannel: "non-interactive",
      lastApprovalInputKey: "y",
      lastApprovalRecordedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("projects durable approval continuity without deciding authorization", () => {
    expect(
      projectApprovalAuditContinuity({
        approvalAudit,
        approvalAuditHistory: [approvalAudit],
      }),
    ).toEqual({
      lastApprovalDecision: "allow-once",
      lastApprovalDecisionSource: "cli-policy",
      lastApprovalPersistent: false,
      lastApprovalCacheEffect: "none",
      lastApprovalProjectRoot: "/repo",
      lastApprovalCacheKey: "/repo|apply_patch:workspace-write",
      lastApprovalScope: "apply_patch/workspace-write",
      lastApprovalRecordedAt: "2026-01-01T00:00:00.000Z",
      lastApprovalLineage: "route-31",
      lastApprovalStopReason: "permission accepted",
      lastApprovalChannel: "non-interactive",
      lastApprovalInputKey: "y",
      lastRequestScopeCacheKey: "/repo|apply_patch:workspace-write",
      lastRequestScopeLabel: "apply_patch/workspace-write",
      lastRequestScopeProjectRoot: "/repo",
      lastRequestScopeSource: "approval-request",
      lastPermissionRequestCacheKey: "/repo|apply_patch:workspace-write",
      lastPermissionRequestScopeLabel: "apply_patch/workspace-write",
      lastPermissionRequestProjectRoot: "/repo",
      lastPermissionRequestSource: "approval-request",
      lastPermissionRequestLineage: "route-31",
      lastApprovalHistory: [approvalAudit],
    });
  });

  it("rewrites only last-approval summary fallback entries", () => {
    expect(
      projectApprovalSummaryFallback({
        currentSummaryEntries: [
          "- keep-this: yes",
          "- last-approval-decision: deny",
          "- last-approval-lineage: old-lineage",
          "- last-request-scope-cache-key: /old|bash",
          "malformed",
          "",
        ],
        approvalAudit: {
          decision: "deny",
          decisionSource: "cli-policy",
          persistent: false,
          cacheEffect: "none",
          projectRoot: "/repo",
          cacheKey: "/repo|bash",
          scopeLabel: "bash/spawn",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).toEqual([
      "- keep-this: yes",
      "- last-request-scope-cache-key: /old|bash",
      "malformed",
      "- last-approval-decision: deny",
      "- last-approval-decision-source: cli-policy",
      "- last-approval-persistent: no",
      "- last-approval-cache-effect: none",
      "- last-approval-project-root: /repo",
      "- last-approval-cache-key: /repo|bash",
      "- last-approval-scope: bash/spawn",
      "- last-approval-recorded-at: 2026-01-01T00:00:00.000Z",
    ]);
  });
});
