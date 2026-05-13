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
});
