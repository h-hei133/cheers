import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectLegacyPermissionRootCandidate,
  normalizeLegacyPermissionWorkingMemory,
  projectRebasedSessionRoot,
  projectRootRebase,
} from "./projectRootRebaseProjection.js";

describe("projectRootRebaseProjection", () => {
  it("projects a trimmed resolved session root", () => {
    expect(projectRebasedSessionRoot("  ./workspace-next  ")).toBe(
      path.resolve("./workspace-next"),
    );
  });

  it("rebases nested project-root strings and approval cache keys", () => {
    const oldRoot = "/tmp/OldRoot";
    const nextRoot = "/tmp/NextRoot";
    const projection = projectRootRebase({
      previousRoot: oldRoot,
      nextRoot,
      value: {
        continuity: {
          projectRoot: oldRoot,
          recentTargetFiles: [`${oldRoot}/src/a.ts`],
          lastApprovalProjectRoot: oldRoot,
          lastApprovalCacheKey: `${oldRoot.toLowerCase()}|bash:spawn:node`,
          lastRequestScopeLabel: "bash/spawn/process(node)",
        },
        approvalAudit: {
          projectRoot: oldRoot,
          cacheKey: `${oldRoot.toLowerCase()}|bash:spawn:node`,
        },
        approvalAuditHistory: [
          { cacheKey: `${oldRoot.toLowerCase()}|bash:spawn:npm` },
        ],
        summary: [
          `summary rooted at ${oldRoot}`,
          `- last-approval-cache-key: ${oldRoot.toLowerCase()}|bash:spawn:node`,
        ],
      },
    });

    const workingMemory = projection.workingMemory as {
      continuity: Record<string, unknown>;
      approvalAudit: Record<string, unknown>;
      approvalAuditHistory: Array<Record<string, unknown>>;
      summary: string[];
    };
    expect(workingMemory.continuity.projectRoot).toBe(nextRoot);
    expect(workingMemory.continuity.recentTargetFiles).toEqual([
      `${nextRoot}/src/a.ts`,
    ]);
    expect(workingMemory.continuity.lastApprovalCacheKey).toBe(
      `${nextRoot.toLowerCase()}|bash:spawn:node`,
    );
    expect(workingMemory.continuity.lastPermissionRequestCacheKey).toBe(
      `${nextRoot.toLowerCase()}|bash:spawn:node`,
    );
    expect(workingMemory.continuity.lastPermissionRequestScopeLabel).toBe(
      "bash/spawn/process(node)",
    );
    expect(workingMemory.approvalAudit.cacheKey).toBe(
      `${nextRoot.toLowerCase()}|bash:spawn:node`,
    );
    expect(workingMemory.approvalAuditHistory[0]?.cacheKey).toBe(
      `${nextRoot.toLowerCase()}|bash:spawn:npm`,
    );
    expect(workingMemory.summary).toContain(`summary rooted at ${nextRoot}`);
    expect(workingMemory.summary).toContain(
      `- last-approval-cache-key: ${nextRoot.toLowerCase()}|bash:spawn:node`,
    );
  });

  it("normalizes legacy permission roots through the session project root", () => {
    const sessionRoot = "/tmp/session-root";
    const legacyRoot = "/tmp/legacy-root";
    const workingMemory = normalizeLegacyPermissionWorkingMemory({
      sessionProjectRoot: sessionRoot,
      workingMemory: {
        approvalAudit: {
          projectRoot: legacyRoot,
          cacheKey: `${legacyRoot}|edit:write:target:${legacyRoot}/a.ts`,
        },
        continuity: {
          lastApprovalProjectRoot: legacyRoot,
          lastApprovalCacheKey: `${legacyRoot}|edit:write:target:${legacyRoot}/a.ts`,
        },
        summary: [
          `- last-approval-cache-key: ${legacyRoot}|edit:write:target:${legacyRoot}/a.ts`,
        ],
      },
    }) as {
      approvalAudit: Record<string, unknown>;
      continuity: Record<string, unknown>;
      summary: string[];
    };

    expect(workingMemory.approvalAudit.projectRoot).toBe(sessionRoot);
    expect(workingMemory.approvalAudit.cacheKey).toBe(
      `${sessionRoot.toLowerCase()}|edit:write:target:${sessionRoot.toLowerCase()}/a.ts`,
    );
    expect(workingMemory.continuity.lastApprovalProjectRoot).toBe(sessionRoot);
    expect(workingMemory.summary[0]).toBe(
      `- last-approval-cache-key: ${sessionRoot.toLowerCase()}|edit:write:target:${sessionRoot.toLowerCase()}/a.ts`,
    );
  });

  it("detects exactly one legacy permission root candidate", () => {
    expect(
      detectLegacyPermissionRootCandidate({
        sessionProjectRoot: "/tmp/current-root",
        workingMemory: {
          approvalAudit: {
            projectRoot: "/tmp/legacy-root",
            cacheKey: "/tmp/legacy-root|bash:spawn:npm",
          },
          summary: ["- last-approval-project-root: /tmp/legacy-root"],
        },
      }),
    ).toBe(path.resolve("/tmp/legacy-root"));

    expect(
      detectLegacyPermissionRootCandidate({
        sessionProjectRoot: "/tmp/current-root",
        workingMemory: {
          approvalAudit: { projectRoot: "/tmp/legacy-a" },
          continuity: { lastApprovalProjectRoot: "/tmp/legacy-b" },
        },
      }),
    ).toBeUndefined();
  });

  it("rewrites each original root once and excludes siblings and embedded prefixes", () => {
    const value = { target: "/repo/a.ts", sibling: "/repo-other/a.ts", embedded: "/outer/repo/a.ts", summary: "read /repo/a.ts; target:/repo/b.ts" };
    expect(projectRootRebase({ value, previousRoot: "/repo", nextRoot: "/repo/worktree" }).workingMemory).toEqual({
      target: "/repo/worktree/a.ts", sibling: value.sibling, embedded: value.embedded,
      summary: "read /repo/worktree/a.ts; target:/repo/worktree/b.ts",
    });
    expect(value.target).toBe("/repo/a.ts");
  });

  it("keeps destination case and handles legacy permission paths through the same boundary", () => {
    const result = normalizeLegacyPermissionWorkingMemory({
      sessionProjectRoot: "/Repo/Next", workingMemory: {
        approvalAudit: { projectRoot: "/repo", cacheKey: "/repo|read:target:/repo/a.ts" },
        target: "/repo/a.ts", sibling: "/repo-other/a.ts", embedded: "/outer/repo/a.ts",
      },
    }) as Record<string, unknown>;
    expect(result.target).toBe("/Repo/Next/a.ts");
    expect(result.sibling).toBe("/repo-other/a.ts");
    expect(result.embedded).toBe("/outer/repo/a.ts");
    expect(result.approvalAudit).toMatchObject({ cacheKey: "/repo/next|read:target:/repo/next/a.ts" });
  });

  it("normalizes cache-key roots in a summary without other permission fields", () => {
    const result = projectRootRebase({ previousRoot: "/old", nextRoot: "/Next", value: {
      summary: ["- last-approval-cache-key: /old|read:target:/old/a.ts", "Edited /old/a.ts"],
    } }).workingMemory;
    expect(result).toEqual({ summary: ["- last-approval-cache-key: /next|read:target:/next/a.ts", "Edited /Next/a.ts"] });
  });

  it("does not reprocess a newly inserted destination while normalizing cache keys", () => {
    const cacheKey = "/repo|read:target:/repo/a.ts";
    const result = projectRootRebase({ previousRoot: "/repo", nextRoot: "/repo/next", value: {
      approvalAudit: { cacheKey }, approvalAuditHistory: [{ cacheKey }],
      continuity: { lastApprovalCacheKey: cacheKey, lastApprovalHistory: [{ cacheKey }] },
      summary: [`- last-approval-cache-key: ${cacheKey}`],
    } }).workingMemory;
    const expected = "/repo/next|read:target:/repo/next/a.ts";
    expect(result).toMatchObject({
      approvalAudit: { cacheKey: expected }, approvalAuditHistory: [{ cacheKey: expected }],
      continuity: { lastApprovalCacheKey: expected, lastApprovalHistory: [{ cacheKey: expected }] },
      summary: [`- last-approval-cache-key: ${expected}`],
    });
  });

  it("preserves cache scopes outside an explicitly relocated root", () => {
    const cacheKey = "/other|read:target:/old/a";
    const value = { approvalAudit: { cacheKey }, continuity: { lastApprovalCacheKey: cacheKey }, summary: [`- last-approval-cache-key: ${cacheKey}`] };
    expect(projectRootRebase({ value, previousRoot: "/old", nextRoot: "/new" }).workingMemory).toMatchObject(value);
  });

  it.each([
    { approvalAudit: { projectRoot: "/first" }, summary: ["- last-approval-cache-key: /second|read"] },
    { approvalAudit: { projectRoot: "/Old", cacheKey: "/old|read" }, continuity: { lastApprovalProjectRoot: "/old", lastApprovalCacheKey: "/old|read" } },
    { continuity: { lastApprovalProjectRoot: "/first", lastRequestScopeProjectRoot: "/second", lastApprovalCacheKey: "/first|read" } },
  ])("preserves all memory when legacy root identity is ambiguous: %j", workingMemory => {
    expect(normalizeLegacyPermissionWorkingMemory({ workingMemory, sessionProjectRoot: "/new" })).toBe(workingMemory);
    expect(detectLegacyPermissionRootCandidate({ workingMemory, sessionProjectRoot: "/new" })).toBeUndefined();
  });

  it.each([
    ["/new", "/old/a.ts", "/new/a.ts"],
    ["/old/next", "/old/a.ts", "/old/next/a.ts"],
    ["/old/next", "/old/next-other/a.ts", "/old/next/next-other/a.ts"],
    ["/old/next", "/old/next.txt", "/old/next/next.txt"],
    ["/old/next", "/old/next/../a.ts", "/old/next/next/../a.ts"],
  ])("repairs old targets in current cache namespaces without moving current targets again: %s %s", (nextRoot, oldTarget, expectedTarget) => {
    const mixedKey = `${nextRoot}|read:target:${oldTarget}`;
    const currentKey = `${nextRoot}|read:target:${nextRoot}/b.ts`;
    const value = { approvalAudit: { projectRoot: "/old", cacheKey: mixedKey },
      approvalAuditHistory: [{ cacheKey: currentKey }],
      continuity: { lastApprovalProjectRoot: "/old", lastApprovalCacheKey: mixedKey },
      summary: [`- last-approval-cache-key: ${mixedKey}`],
    };
    for (const result of [
      projectRootRebase({ value, previousRoot: "/old", nextRoot }).workingMemory,
      normalizeLegacyPermissionWorkingMemory({ workingMemory: value, sessionProjectRoot: nextRoot }),
    ]) {
      expect(result).toMatchObject({
        approvalAudit: { projectRoot: nextRoot, cacheKey: `${nextRoot}|read:target:${expectedTarget}` },
        approvalAuditHistory: [{ cacheKey: currentKey }],
        continuity: { lastApprovalCacheKey: `${nextRoot}|read:target:${expectedTarget}` },
        summary: [`- last-approval-cache-key: ${nextRoot}|read:target:${expectedTarget}`],
      });
    }
  });
});
