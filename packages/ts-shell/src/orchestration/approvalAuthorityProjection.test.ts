import { describe, expect, it } from "vitest";
import {
  appendCurrentRequestScopeEvidence,
  deriveCurrentPermissionRequestFromToolInput,
  formatApprovalAuthorityFacts,
  projectApprovalAuthority,
  projectApprovalProvenance,
} from "./approvalAuthorityProjection.js";

describe("approval authority projection", () => {
  it("formats one-shot approval memory without granting authorization", () => {
    const output = formatApprovalAuthorityFacts({
      continuity: {
        projectRoot: "/repo",
        lastApprovalDecision: "allow-once",
        lastApprovalDecisionSource: "interactive",
        lastApprovalPersistent: false,
        lastApprovalCacheEffect: "not-persisted",
        lastApprovalProjectRoot: "/repo",
        lastApprovalScope: "bash/spawn/process(npm)",
        lastApprovalCacheKey: "/repo|bash:spawn:process:npm",
        lastApprovalLineage: "approval.requested>approval.resolved",
        lastApprovalRecordedAt: "2026-05-13T00:00:00.000Z",
        lastPermissionRequestToolName: "bash",
        lastPermissionRequestOperation: "spawn",
        lastPermissionRequestTarget: "npm test -- --help",
        lastPermissionRequestProcess: "npm",
        lastPermissionRequestProjectRoot: "/repo",
      },
    });

    expect(output).toContain("Last approval decision: allow-once.");
    expect(output).toContain("Lifecycle: one-shot (allow-once/deny).");
    expect(output).toContain("Authoritative approval now: allow-once");
    expect(output).toContain("Why asking again: allow-once grants are consumed by a single execution and are not persisted.");
  });

  it("scopes authority to the current permission request cache key", () => {
    const authority = projectApprovalAuthority({
      projectRoot: "/repo",
      lastPermissionRequestToolName: "bash",
      lastPermissionRequestOperation: "spawn",
      lastPermissionRequestTarget: "npm test -- --help",
      lastPermissionRequestProcess: "npm",
      lastPermissionRequestProjectRoot: "/repo",
      lastApprovalHistory: [
        {
          decision: "allow-always",
          persistent: true,
          projectRoot: "/repo",
          cacheKey: "/repo|bash:spawn:process:node",
          scopeLabel: "bash/spawn/process(node)",
          recordedAt: "2026-05-13T00:00:00.000Z",
        },
        {
          decision: "deny",
          persistent: false,
          projectRoot: "/repo",
          cacheKey: "/repo|bash:spawn:process:npm",
          scopeLabel: "bash/spawn/process(npm)",
          stopReason: "Approval denied by user",
          recordedAt: "2026-05-13T00:01:00.000Z",
        },
      ],
    });

    expect(authority.active?.decision).toBe("deny");
    expect(authority.active?.reason).toContain("current approval scope");
    expect(authority.overriddenByHistory).toBeUndefined();
  });

  it("projects approval provenance from compact scope memory", () => {
    const provenance = projectApprovalProvenance({
      projectRoot: "/repo",
      lastApprovalScope: "bash/spawn/process(npm)",
      lastApprovalCacheKey: "/repo|bash:spawn:process:npm",
    });

    expect(provenance).toMatchObject({
      label: "bash/spawn/process(npm)",
      scope: "bash/spawn/process(npm)",
      cacheKey: "/repo|bash:spawn:process:npm",
      root: "/repo",
      isPartial: true,
      reconstructionSource: "last-approval",
    });
  });

  it("derives current permission request scope evidence without deciding approval", () => {
    const scope = deriveCurrentPermissionRequestFromToolInput({
      toolName: "bash",
      operation: "spawn",
      target: "npm test -- --help",
      workspaceRoot: "/repo",
      source: "verification-command",
      lineageHint: "verify-command",
    });
    const evidence: string[] = [];
    appendCurrentRequestScopeEvidence(evidence, scope);

    expect(scope).toMatchObject({
      toolName: "bash",
      operation: "spawn",
      process: "npm",
      scopeKey: "bash:spawn:process:npm",
      scopeLabel: "bash/spawn/process(npm)",
      cacheKey: "/repo|bash:spawn:process:npm",
      projectRoot: "/repo",
      source: "verification-command",
    });
    expect(evidence).toEqual(
      expect.arrayContaining([
        "current-permission-request-tool:bash",
        "current-permission-request-process:npm",
        "current-request-scope-source:verification-command",
      ]),
    );
  });
});
