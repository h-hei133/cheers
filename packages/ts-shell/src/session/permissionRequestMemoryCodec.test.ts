import { describe, expect, it } from "vitest";
import {
  extractLastPermissionRequestFromEvidence,
  extractLastRequestScopeFromEvidence,
  normalizePermissionRequestMemory,
  parsePermissionRequestMemory,
  parseRequestScopeMemory,
  resolvePermissionRequestMemory,
  resolveRequestScopeMemory,
} from "./permissionRequestMemoryCodec.js";

describe("permissionRequestMemoryCodec", () => {
  it("parses permission request memory from continuity before summary", () => {
    expect(
      parsePermissionRequestMemory({
        continuity: {
          lastPermissionRequestToolName: "bash",
          lastPermissionRequestOperation: "spawn",
          lastPermissionRequestTarget: "npm test",
          lastPermissionRequestProcess: "npm",
          lastPermissionRequestScopeKey: "bash:spawn:process:npm",
          lastPermissionRequestScopeLabel: "bash/spawn/process(npm)",
          lastPermissionRequestCacheKey: "/repo|bash:spawn:process:npm",
          lastPermissionRequestProjectRoot: "/repo",
          lastPermissionRequestSource: "verification-command",
          lastPermissionRequestLineage: "verify-1",
        },
        summary: [
          "- last-permission-request-tool: apply_patch",
          "- last-permission-request-source: approval-request",
        ],
      }),
    ).toEqual({
      toolName: "bash",
      operation: "spawn",
      target: "npm test",
      process: "npm",
      scopeKey: "bash:spawn:process:npm",
      scopeLabel: "bash/spawn/process(npm)",
      cacheKey: "/repo|bash:spawn:process:npm",
      projectRoot: "/repo",
      source: "verification-command",
      lineage: "verify-1",
    });
  });

  it("parses permission request and request scope from summary fallbacks", () => {
    expect(
      parsePermissionRequestMemory({
        summary: [
          "- last-permission-request-tool: bash",
          "- last-permission-request-operation: spawn",
          "- last-permission-request-target: npm test",
          "- last-permission-request-process: npm",
          "- last-permission-request-source: verification-command",
        ],
      }),
    ).toMatchObject({
      toolName: "bash",
      operation: "spawn",
      target: "npm test",
      process: "npm",
      source: "verification-command",
    });

    expect(
      parseRequestScopeMemory({
        summary: [
          "- last-request-scope-cache-key: /repo|bash",
          "- last-request-scope-label: bash/spawn",
          "- last-request-scope-project-root: /repo",
          "- last-request-scope-source: approval-request",
        ],
      }),
    ).toEqual({
      cacheKey: "/repo|bash",
      scopeLabel: "bash/spawn",
      projectRoot: "/repo",
      source: "approval-request",
    });
  });

  it("extracts the most recent evidence tokens with existing case normalization", () => {
    const evidence = [
      "current-permission-request-tool:Apply_Patch",
      "current-permission-request-target:old target",
      "current-request-scope-label:old-scope",
      "current-permission-request-tool:BASH",
      "current-permission-request-operation:SPAWN",
      "current-permission-request-target:npm test",
      "current-permission-request-process:NPM",
      "current-permission-request-scope-key:BASH:SPAWN:PROCESS:NPM",
      "current-permission-request-scope-label:bash/spawn/process(npm)",
      "current-permission-request-cache-key:/repo|bash:spawn:process:npm",
      "current-permission-request-project-root:/repo",
      "current-permission-request-source:verification-command",
      "current-permission-request-lineage:verify-2",
      "current-request-scope-cache-key:/repo|bash:spawn:process:npm",
      "current-request-scope-label:bash/spawn/process(npm)",
      "current-request-scope-project-root:/repo",
      "current-request-scope-source:verification-command",
    ];

    expect(extractLastPermissionRequestFromEvidence(evidence)).toEqual({
      toolName: "bash",
      operation: "spawn",
      target: "npm test",
      process: "npm",
      scopeKey: "bash:spawn:process:npm",
      scopeLabel: "bash/spawn/process(npm)",
      cacheKey: "/repo|bash:spawn:process:npm",
      projectRoot: "/repo",
      source: "verification-command",
      lineage: "verify-2",
    });
    expect(extractLastRequestScopeFromEvidence(evidence)).toEqual({
      cacheKey: "/repo|bash:spawn:process:npm",
      scopeLabel: "bash/spawn/process(npm)",
      projectRoot: "/repo",
      source: "verification-command",
    });
  });

  it("prefers memory over evidence only when memory matches the session root and evidence does not", () => {
    const evidence = {
      cacheKey: "/other|bash",
      projectRoot: "/other",
      toolName: "bash",
    };
    const memory = {
      cacheKey: "/repo|apply_patch",
      projectRoot: "/repo",
      toolName: "apply_patch",
      source: "approval-request" as const,
    };

    expect(
      resolvePermissionRequestMemory({
        evidence,
        memory,
        sessionProjectRoot: "/repo",
      }),
    ).toMatchObject({
      cacheKey: "/repo|apply_patch",
      projectRoot: "/repo",
      toolName: "apply_patch",
      source: "approval-request",
    });

    expect(
      resolvePermissionRequestMemory({
        evidence: { ...evidence, projectRoot: "/repo", cacheKey: "/repo|bash" },
        memory,
        sessionProjectRoot: "/repo",
      }),
    ).toMatchObject({
      cacheKey: "/repo|bash",
      projectRoot: "/repo",
      toolName: "bash",
      source: "approval-request",
    });
  });

  it("normalizes request records and resolves request scope with the same root preference", () => {
    expect(
      normalizePermissionRequestMemory({
        toolName: " bash ",
        source: " APPROVAL-REQUEST ",
        lineage: " approval-1 ",
      }),
    ).toEqual({
      toolName: "bash",
      source: "approval-request",
      lineage: "approval-1",
    });

    expect(
      resolveRequestScopeMemory({
        evidence: { cacheKey: "/other|bash", projectRoot: "/other" },
        memory: {
          cacheKey: "/repo|apply_patch",
          projectRoot: "/repo",
          scopeLabel: "apply_patch/write",
        },
        sessionProjectRoot: "/repo",
      }),
    ).toEqual({
      cacheKey: "/repo|apply_patch",
      projectRoot: "/repo",
      scopeLabel: "apply_patch/write",
      source: undefined,
    });
  });
});
