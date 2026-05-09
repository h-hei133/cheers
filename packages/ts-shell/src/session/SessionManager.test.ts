import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLongSessionContinuityFixture } from "./__tests__/longSessionContinuityFixtures.js";
import { SessionManager } from "./SessionManager.js";

describe("SessionManager", () => {
  const originalUserProfile = process.env.USERPROFILE;
  const originalHome = process.env.HOME;
  let fakeHome: string;

  beforeEach(() => {
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "private-agents-home-"));
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;
  });

  afterEach(() => {
    process.env.USERPROFILE = originalUserProfile;
    process.env.HOME = originalHome;
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it("restores an interrupted session and preserves pending prompt metadata", () => {
    const manager = new SessionManager();
    const session = manager.createNew();

    manager.markRunStarted(session.id, "resume me later");
    manager.addTurn(session.id, { role: "user", content: "resume me later" });
    manager.saveInterrupted(session.id);

    const resumed = manager.tryResume(session.id);
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) {
      throw new Error("Expected interrupted session to resume successfully");
    }

    expect(resumed.session.status).toBe("active");
    expect(resumed.session.pendingPrompt).toBe("resume me later");
    expect(resumed.session.turns).toHaveLength(1);
  });

  it("persists workspace root mode and requested workspace metadata", () => {
    const manager = new SessionManager();
    const projectRoot = path.join(fakeHome, "repo-root");
    const requestedWorkspaceRoot = path.join(projectRoot, "packages", "app");
    const session = manager.createNew(projectRoot, {
      rootMode: "git-root",
      requestedWorkspaceRoot,
      targetPathBase: projectRoot,
      gitRoot: projectRoot,
    });

    const resumed = manager.resume(session.id);

    expect(resumed.projectRoot).toBe(projectRoot);
    expect(resumed.rootMode).toBe("git-root");
    expect(resumed.requestedWorkspaceRoot).toBe(requestedWorkspaceRoot);
    expect(resumed.targetPathBase).toBe(projectRoot);
    expect(resumed.gitRoot).toBe(projectRoot);
  });

  it("updates workspace binding metadata without changing the session id", () => {
    const manager = new SessionManager();
    const projectRoot = path.join(fakeHome, "workspace");
    const requestedWorkspaceRoot = path.join(fakeHome, "workspace");
    const session = manager.createNew(projectRoot);

    const updated = manager.updateSessionWorkspaceBinding(session.id, {
      projectRoot,
      rootMode: "direct",
      requestedWorkspaceRoot,
      targetPathBase: projectRoot,
      gitRoot: null,
    });
    const resumed = manager.resume(session.id);

    expect(updated.id).toBe(session.id);
    expect(resumed.id).toBe(session.id);
    expect(resumed.rootMode).toBe("direct");
    expect(resumed.requestedWorkspaceRoot).toBe(requestedWorkspaceRoot);
    expect(resumed.targetPathBase).toBe(projectRoot);
    expect(resumed.gitRoot).toBeNull();
  });

  it("preserves interrupted durable state for runtime seed construction after tryResume", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const transcriptPath = path.join(
      manager.getSessionDirPath(session.id),
      "transcript.jsonl",
    );
    const statePath = path.join(
      manager.getSessionDirPath(session.id),
      "state.json",
    );

    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          type: "lifecycle",
          event: "run-started",
          timestamp: "2026-01-01T00:00:00.000Z",
          detail: "repair after resume",
        }),
        JSON.stringify({
          type: "query-event",
          event: { type: "turn.started", role: "planner", turn: 1 },
          timestamp: "2026-01-01T00:00:01.000Z",
        }),
      ].join("\n") + "\n",
      "utf8",
    );
    fs.writeFileSync(
      statePath,
      JSON.stringify(
        {
          status: "interrupted",
          pendingPrompt: "repair after resume",
          runPhase: "turn-active",
          interruptedKind: "turn",
        },
        null,
        2,
      ),
      "utf8",
    );

    const resumed = manager.tryResume(session.id);
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) {
      throw new Error("Expected interrupted session to resume successfully");
    }

    const persistedState = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      status: string;
    };
    const seed = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 });

    expect(resumed.session.status).toBe("active");
    expect(persistedState.status).toBe("interrupted");
    expect(seed.truthBoundary.repairSummary.insertedRunInterrupted).toBe(true);
    expect(seed.truthBoundary.repairSummary.insertedPromptMessage).toBe(true);
    expect(seed.truthBoundary.policyEvidence.has("open-turn")).toBe(true);
    expect(seed.truthBoundary.policyEvidence.has("repair-drift")).toBe(false);
    expect(seed.truthBoundary.continuationSafety).toBe("mid-turn-safe");
    expect(seed.recoveryBoundary).toBe("mid-turn-reentry");
  });

  it("returns recovery guidance when a session file is corrupt", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const sessionPath = manager.getSessionFilePath(session.id);

    fs.writeFileSync(sessionPath, "{not valid json", "utf8");

    const result = manager.tryResume(session.id);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toContain("Failed to resume session");
      expect(result.recoveryHint).toContain("Start a fresh session");
      return;
    }

    throw new Error("Expected corrupt session resume to fail");
  });

  it("rebinds project root while preserving session identity and rebasing continuity anchors", () => {
    const manager = new SessionManager();
    const oldRoot = fs.mkdtempSync(path.join(fakeHome, "proj-old-"));
    const newRoot = fs.mkdtempSync(path.join(fakeHome, "proj-new-"));
    const session = manager.createNew(oldRoot);
    const statePath = path.join(manager.getSessionDirPath(session.id), "state.json");
    const oldTarget = path.join(oldRoot, "src", "feature.ts");
    const oldTarget2 = path.join(oldRoot, "src", "other.ts");

    fs.writeFileSync(
      statePath,
      JSON.stringify(
        {
          status: "completed",
          projectRoot: oldRoot,
          runPhase: "idle",
          durableStatus: "success",
          terminalReason: "completed",
          terminalClassification: "success",
          pendingLifecycle: {
            pendingApprovals: {},
            pendingTools: {},
            taskStates: {},
          },
          workingMemory: {
            schemaVersion: 1,
            updatedAt: new Date().toISOString(),
            sourceEventCount: 9,
            sourceTurnCount: 2,
            compacted: false,
            compactReason: "none",
            continuity: {
              sessionId: session.id,
              projectRoot: oldRoot,
              continuationFamilyId: `session:${session.id}`,
              continuationEpoch: 0,
              continuationFamilyAnchor: oldTarget,
              recentChangedFiles: [oldTarget2],
              recentTargetFiles: [oldTarget],
              recentFailedFiles: [{ path: oldTarget, reason: `failed at ${oldRoot}` }],
              recentVerifiedFiles: [oldTarget2],
              lastRepairNotes: [],
              lastContinuationEvidence: [`evidence rooted at ${oldRoot}`],
              lastTaskSatisfactionReasons: [],
              unresolvedItems: [`unresolved rooted at ${oldRoot}`],
            },
            summary: [`summary rooted at ${oldRoot}`],
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const rebound = manager.rebindSessionProjectRoot(session.id, newRoot);
    expect(rebound.id).toBe(session.id);
    expect(path.resolve(rebound.projectRoot)).toBe(path.resolve(newRoot));

    const afterState = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      workingMemory?: {
        continuity?: {
          projectRoot?: string;
          continuationFamilyAnchor?: string;
          recentTargetFiles?: string[];
          recentChangedFiles?: string[];
          recentVerifiedFiles?: string[];
          recentFailedFiles?: Array<{ path: string; reason: string }>;
          lastContinuationEvidence?: string[];
          unresolvedItems?: string[];
        };
        summary?: string[];
      };
    };
    const continuity = afterState.workingMemory?.continuity;
    expect(continuity?.projectRoot).toBe(newRoot);
    expect(continuity?.continuationFamilyAnchor?.startsWith(newRoot)).toBe(true);
    expect(continuity?.recentTargetFiles?.[0]?.startsWith(newRoot)).toBe(true);
    expect(continuity?.recentChangedFiles?.[0]?.startsWith(newRoot)).toBe(true);
    expect(continuity?.recentVerifiedFiles?.[0]?.startsWith(newRoot)).toBe(true);
    expect(continuity?.recentFailedFiles?.[0]?.path.startsWith(newRoot)).toBe(true);
    expect(continuity?.lastContinuationEvidence?.[0]?.includes(newRoot)).toBe(true);
    expect(continuity?.unresolvedItems?.[0]?.includes(newRoot)).toBe(true);
    expect(afterState.workingMemory?.summary?.[0]?.includes(newRoot)).toBe(true);
  });

  it("rebinds approval audit cache-key root during project-root migration", () => {
    const manager = new SessionManager();
    const oldRoot = fs.mkdtempSync(path.join(fakeHome, "approval-old-"));
    const newRoot = fs.mkdtempSync(path.join(fakeHome, "approval-new-"));
    const session = manager.createNew(oldRoot);
    const statePath = path.join(
      manager.getSessionDirPath(session.id),
      "state.json",
    );

    fs.writeFileSync(
      statePath,
      JSON.stringify(
        {
          status: "completed",
          projectRoot: oldRoot,
          runPhase: "idle",
          durableStatus: "success",
          terminalReason: "completed",
          terminalClassification: "success",
          pendingLifecycle: {
            pendingApprovals: {},
            pendingTools: {},
            taskStates: {},
          },
          workingMemory: {
            approvalAudit: {
              decision: "allow-once",
              decisionSource: "cli-policy",
              persistent: false,
              cacheEffect: "none",
              projectRoot: oldRoot,
              cacheKey: `${oldRoot.toLowerCase()}|bash:spawn:process:node`,
              scopeLabel: "bash/spawn/process(node)",
            },
            continuity: {
              lastApprovalCacheKey: `${oldRoot.toLowerCase()}|bash:spawn:process:node`,
              lastRequestScopeCacheKey: `${oldRoot.toLowerCase()}|bash:spawn:process:node`,
              lastPermissionRequestCacheKey: `${oldRoot.toLowerCase()}|bash:spawn:process:node`,
            },
            summary: [
              `- last-approval-cache-key: ${oldRoot.toLowerCase()}|bash:spawn:process:node`,
              `- last-request-scope-cache-key: ${oldRoot.toLowerCase()}|bash:spawn:process:node`,
              `- last-permission-request-cache-key: ${oldRoot.toLowerCase()}|bash:spawn:process:node`,
            ],
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    manager.rebindSessionProjectRoot(session.id, newRoot);
    const afterState = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      workingMemory?: {
        approvalAudit?: {
          projectRoot?: string;
          cacheKey?: string;
        };
        continuity?: {
          lastApprovalCacheKey?: string;
          lastRequestScopeCacheKey?: string;
          lastPermissionRequestCacheKey?: string;
        };
        summary?: unknown;
      };
    };

    expect(afterState.workingMemory?.approvalAudit?.projectRoot).toBe(newRoot);
    expect(afterState.workingMemory?.approvalAudit?.cacheKey).toBe(
      `${newRoot.toLowerCase()}|bash:spawn:process:node`,
    );
    expect(afterState.workingMemory?.continuity?.lastApprovalCacheKey).toBe(
      `${newRoot.toLowerCase()}|bash:spawn:process:node`,
    );
    expect(afterState.workingMemory?.continuity?.lastRequestScopeCacheKey).toBe(
      `${newRoot.toLowerCase()}|bash:spawn:process:node`,
    );
    expect(
      afterState.workingMemory?.continuity?.lastPermissionRequestCacheKey,
    ).toBe(`${newRoot.toLowerCase()}|bash:spawn:process:node`);
    const summary =
      afterState.workingMemory?.summary &&
      Array.isArray(afterState.workingMemory.summary)
        ? (afterState.workingMemory.summary as unknown[]).filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [];
    expect(summary).toContain(
      `- last-approval-cache-key: ${newRoot.toLowerCase()}|bash:spawn:process:node`,
    );
    expect(summary).toContain(
      `- last-request-scope-cache-key: ${newRoot.toLowerCase()}|bash:spawn:process:node`,
    );
    expect(summary).toContain(
      `- last-permission-request-cache-key: ${newRoot.toLowerCase()}|bash:spawn:process:node`,
    );
  });

  it("isolates unreadable session directories and emits one aggregated warning", () => {
    const manager = new SessionManager();
    const healthy = manager.createNew();
    manager.markRunStarted(healthy.id, "healthy prompt");
    manager.saveInterrupted(healthy.id);

    const sessionsRoot = path.join(fakeHome, ".private-agents", "sessions");
    const brokenA = path.join(sessionsRoot, "sess_broken_a");
    const brokenB = path.join(sessionsRoot, "sess_broken_b");
    fs.mkdirSync(brokenA, { recursive: true });
    fs.mkdirSync(brokenB, { recursive: true });
    fs.writeFileSync(path.join(brokenA, "metadata.json"), "{broken", "utf8");
    fs.writeFileSync(path.join(brokenA, "state.json"), "{}", "utf8");
    fs.writeFileSync(path.join(brokenA, "transcript.jsonl"), "", "utf8");
    fs.writeFileSync(path.join(brokenB, "metadata.json"), "{broken", "utf8");
    fs.writeFileSync(path.join(brokenB, "state.json"), "{}", "utf8");
    fs.writeFileSync(path.join(brokenB, "transcript.jsonl"), "", "utf8");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const firstScan = manager.listSessions();
    const secondScan = manager.listSessions();

    expect(firstScan.some((session) => session.id === healthy.id)).toBe(true);
    expect(secondScan.some((session) => session.id === healthy.id)).toBe(true);
    expect(firstScan.some((session) => session.id === "sess_broken_a")).toBe(
      false,
    );
    expect(firstScan.some((session) => session.id === "sess_broken_b")).toBe(
      false,
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain(
      "Skipped 2 unreadable session directories",
    );

    warnSpy.mockRestore();
  });

  it("creates directory substrate with metadata, transcript, and state files", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const sessionDir = manager.getSessionDirPath(session.id);

    expect(fs.existsSync(path.join(sessionDir, "metadata.json"))).toBe(true);
    expect(fs.existsSync(path.join(sessionDir, "transcript.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(sessionDir, "state.json"))).toBe(true);
  });

  it("normalizes legacy permission cache keys on snapshot build for old sessions", () => {
    const manager = new SessionManager();
    const projectRoot = path.join(fakeHome, "proj-current");
    fs.mkdirSync(projectRoot, { recursive: true });
    const session = manager.createNew(projectRoot);
    const statePath = path.join(
      fakeHome,
      ".private-agents",
      "sessions",
      session.id,
      "state.json",
    );
    const legacyRoot = "D:\\legacy-old";
    const legacyCacheKey = `${legacyRoot.toLowerCase()}|bash:spawn:process:npm`;
    const expectedCacheKey = `${projectRoot.toLowerCase()}|bash:spawn:process:npm`;
    fs.writeFileSync(
      statePath,
      JSON.stringify(
        {
          status: "completed",
          projectRoot,
          runPhase: "idle",
          durableStatus: "success",
          terminalReason: "completed",
          terminalClassification: "success",
          pendingLifecycle: {
            pendingApprovals: {},
            pendingTools: {},
            taskStates: {},
          },
          workingMemory: {
            approvalAudit: {
              decision: "allow-always",
              decisionSource: "cli-policy",
              persistent: true,
              cacheEffect: "allow-always-persisted",
              projectRoot,
              cacheKey: legacyCacheKey,
              scopeLabel: "bash/spawn/process(npm)",
            },
            continuity: {
              lastApprovalCacheKey: legacyCacheKey,
              lastRequestScopeCacheKey: legacyCacheKey,
              lastPermissionRequestCacheKey: legacyCacheKey,
              lastPermissionRequestToolName: "bash",
              lastPermissionRequestOperation: "spawn",
              lastPermissionRequestTarget: "npm test -- --help",
              lastPermissionRequestScopeLabel: "bash/spawn/process(npm)",
              lastPermissionRequestProjectRoot: projectRoot,
              lastPermissionRequestSource: "approval-request",
            },
            summary: [
              `- last-approval-cache-key: ${legacyCacheKey}`,
              `- last-request-scope-cache-key: ${legacyCacheKey}`,
              `- last-permission-request-cache-key: ${legacyCacheKey}`,
            ],
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const snapshot = manager.buildContinuitySnapshot(session.id);
    expect(snapshot.lastApprovalCacheKey).toBe(expectedCacheKey);
    expect(snapshot.lastRequestScopeCacheKey).toBe(expectedCacheKey);
    expect(snapshot.lastPermissionRequestCacheKey).toBe(expectedCacheKey);

    const afterState = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      workingMemory?: {
        approvalAudit?: { cacheKey?: string };
        continuity?: {
          lastApprovalCacheKey?: string;
          lastRequestScopeCacheKey?: string;
          lastPermissionRequestCacheKey?: string;
        };
        summary?: unknown;
      };
    };
    expect(afterState.workingMemory?.approvalAudit?.cacheKey).toBe(
      expectedCacheKey,
    );
    expect(afterState.workingMemory?.continuity?.lastApprovalCacheKey).toBe(
      expectedCacheKey,
    );
    expect(
      afterState.workingMemory?.continuity?.lastRequestScopeCacheKey,
    ).toBe(expectedCacheKey);
    expect(
      afterState.workingMemory?.continuity?.lastPermissionRequestCacheKey,
    ).toBe(expectedCacheKey);
    const summary =
      afterState.workingMemory?.summary &&
      Array.isArray(afterState.workingMemory.summary)
        ? (afterState.workingMemory.summary as unknown[]).filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [];
    expect(summary).toContain(`- last-approval-cache-key: ${expectedCacheKey}`);
    expect(summary).toContain(
      `- last-request-scope-cache-key: ${expectedCacheKey}`,
    );
    expect(summary).toContain(
      `- last-permission-request-cache-key: ${expectedCacheKey}`,
    );
  });

  it("hydrates missing lastPermissionRequest cache key from scoped legacy continuity", () => {
    const manager = new SessionManager();
    const projectRoot = path.join(fakeHome, "proj-current-hydrate");
    fs.mkdirSync(projectRoot, { recursive: true });
    const session = manager.createNew(projectRoot);
    const statePath = path.join(
      fakeHome,
      ".private-agents",
      "sessions",
      session.id,
      "state.json",
    );
    const legacyRoot = "D:\\legacy-old";
    const legacyCacheKey = `${legacyRoot.toLowerCase()}|bash:spawn:process:npm`;
    const expectedCacheKey = `${projectRoot.toLowerCase()}|bash:spawn:process:npm`;
    fs.writeFileSync(
      statePath,
      JSON.stringify(
        {
          status: "completed",
          projectRoot,
          runPhase: "idle",
          durableStatus: "success",
          terminalReason: "completed",
          terminalClassification: "success",
          pendingLifecycle: {
            pendingApprovals: {},
            pendingTools: {},
            taskStates: {},
          },
          workingMemory: {
            continuity: {
              lastApprovalDecision: "allow-always",
              lastApprovalCacheKey: legacyCacheKey,
              lastRequestScopeCacheKey: legacyCacheKey,
              lastRequestScopeLabel: "bash/spawn/process(npm)",
              lastRequestScopeProjectRoot: projectRoot,
              lastRequestScopeSource: "approval-request",
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const snapshot = manager.buildContinuitySnapshot(session.id);
    expect(snapshot.lastPermissionRequestCacheKey).toBe(expectedCacheKey);
    expect(snapshot.lastPermissionRequestScopeLabel).toBe(
      "bash/spawn/process(npm)",
    );
    expect(snapshot.lastPermissionRequestSource).toBe("approval-request");

    const afterState = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      workingMemory?: {
        continuity?: {
          lastPermissionRequestCacheKey?: string;
          lastPermissionRequestScopeLabel?: string;
          lastPermissionRequestSource?: string;
        };
      };
    };
    expect(
      afterState.workingMemory?.continuity?.lastPermissionRequestCacheKey,
    ).toBe(expectedCacheKey);
    expect(
      afterState.workingMemory?.continuity?.lastPermissionRequestScopeLabel,
    ).toBe("bash/spawn/process(npm)");
    expect(afterState.workingMemory?.continuity?.lastPermissionRequestSource).toBe(
      "approval-request",
    );
  });

  it("normalizes legacy permission project-root fields and rooted targets for old sessions", () => {
    const manager = new SessionManager();
    const projectRoot = path.join(fakeHome, "proj-current-root-rebase");
    fs.mkdirSync(projectRoot, { recursive: true });
    const session = manager.createNew(projectRoot);
    const statePath = path.join(
      fakeHome,
      ".private-agents",
      "sessions",
      session.id,
      "state.json",
    );
    const legacyRoot = "D:\\legacy-old-root";
    const legacyCacheKey = `${legacyRoot.toLowerCase()}|edit:write:target:d:\\legacy-old-root\\a.txt`;
    const expectedCacheKey = `${projectRoot.toLowerCase()}|edit:write:target:${projectRoot.toLowerCase()}\\a.txt`;
    const legacyScope = `edit/write/target(${legacyRoot}\\a.txt)`;
    const expectedScope = `edit/write/target(${projectRoot}\\a.txt)`;
    fs.writeFileSync(
      statePath,
      JSON.stringify(
        {
          status: "completed",
          projectRoot,
          runPhase: "idle",
          durableStatus: "success",
          terminalReason: "completed",
          terminalClassification: "success",
          pendingLifecycle: {
            pendingApprovals: {},
            pendingTools: {},
            taskStates: {},
          },
          workingMemory: {
            approvalAudit: {
              decision: "allow-always",
              decisionSource: "cli-policy",
              persistent: true,
              cacheEffect: "allow-always-persisted",
              projectRoot: legacyRoot,
              cacheKey: legacyCacheKey,
              scopeLabel: legacyScope,
              lineage: "edit-file-primary",
            },
            continuity: {
              lastApprovalProjectRoot: legacyRoot,
              lastApprovalCacheKey: legacyCacheKey,
              lastApprovalScope: legacyScope,
              lastRequestScopeProjectRoot: legacyRoot,
              lastRequestScopeCacheKey: legacyCacheKey,
              lastRequestScopeLabel: legacyScope,
              lastPermissionRequestProjectRoot: legacyRoot,
              lastPermissionRequestCacheKey: legacyCacheKey,
              lastPermissionRequestScopeLabel: legacyScope,
              lastPermissionRequestTarget: `${legacyRoot}\\a.txt`,
              lastPermissionRequestSource: "approval-request",
            },
            summary: [
              `- last-approval-project-root: ${legacyRoot}`,
              `- last-approval-cache-key: ${legacyCacheKey}`,
              `- last-permission-request-project-root: ${legacyRoot}`,
              `- last-permission-request-cache-key: ${legacyCacheKey}`,
              `- last-request-scope-project-root: ${legacyRoot}`,
              `- last-request-scope-cache-key: ${legacyCacheKey}`,
            ],
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const snapshot = manager.buildContinuitySnapshot(session.id);
    expect(snapshot.lastApprovalProjectRoot).toBe(projectRoot);
    expect(snapshot.lastRequestScopeProjectRoot).toBe(projectRoot);
    expect(snapshot.lastPermissionRequestProjectRoot).toBe(projectRoot);
    expect(snapshot.lastApprovalCacheKey).toBe(expectedCacheKey);
    expect(snapshot.lastPermissionRequestCacheKey).toBe(expectedCacheKey);
    expect(snapshot.lastRequestScopeCacheKey).toBe(expectedCacheKey);
    expect(snapshot.lastApprovalScope).toBe(expectedScope);
    expect(snapshot.lastPermissionRequestScopeLabel?.toLowerCase()).toBe(
      expectedScope.toLowerCase(),
    );
    expect(snapshot.lastPermissionRequestTarget?.toLowerCase()).toBe(
      `${projectRoot}\\a.txt`.toLowerCase(),
    );

    const afterState = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      workingMemory?: {
        approvalAudit?: {
          projectRoot?: string;
          cacheKey?: string;
          scopeLabel?: string;
        };
        continuity?: {
          lastApprovalProjectRoot?: string;
          lastRequestScopeProjectRoot?: string;
          lastPermissionRequestProjectRoot?: string;
          lastPermissionRequestTarget?: string;
        };
      };
    };
    expect(afterState.workingMemory?.approvalAudit?.projectRoot).toBe(projectRoot);
    expect(afterState.workingMemory?.approvalAudit?.cacheKey).toBe(expectedCacheKey);
    expect(afterState.workingMemory?.approvalAudit?.scopeLabel).toBe(expectedScope);
    expect(afterState.workingMemory?.continuity?.lastApprovalProjectRoot).toBe(
      projectRoot,
    );
    expect(afterState.workingMemory?.continuity?.lastRequestScopeProjectRoot).toBe(
      projectRoot,
    );
    expect(
      afterState.workingMemory?.continuity?.lastPermissionRequestProjectRoot,
    ).toBe(projectRoot);
    expect(
      afterState.workingMemory?.continuity?.lastPermissionRequestTarget?.toLowerCase(),
    ).toBe(`${projectRoot}\\a.txt`.toLowerCase());
  });

  it("normalizes lowercase legacy-root target residues during project-root migration", () => {
    const manager = new SessionManager();
    const projectRoot = path.join(fakeHome, "proj-current-root-rebase-lowercase");
    fs.mkdirSync(projectRoot, { recursive: true });
    const session = manager.createNew(projectRoot);
    const statePath = path.join(
      fakeHome,
      ".private-agents",
      "sessions",
      session.id,
      "state.json",
    );
    const legacyRoot = "D:\\legacy-old-root-lower";
    const legacyRootLower = legacyRoot.toLowerCase();
    const legacyTargetLower = `${legacyRootLower}\\a.txt`;
    const legacyCacheKey = `${legacyRootLower}|edit:write:target:${legacyTargetLower}`;
    const expectedCacheKey = `${projectRoot.toLowerCase()}|edit:write:target:${projectRoot.toLowerCase()}\\a.txt`;
    const legacyScope = `edit/write/target(${legacyTargetLower})`;
    const expectedScope = `edit/write/target(${projectRoot}\\a.txt)`;

    fs.writeFileSync(
      statePath,
      JSON.stringify(
        {
          status: "completed",
          projectRoot,
          runPhase: "idle",
          durableStatus: "success",
          terminalReason: "completed",
          terminalClassification: "success",
          pendingLifecycle: {
            pendingApprovals: {},
            pendingTools: {},
            taskStates: {},
          },
          workingMemory: {
            approvalAudit: {
              decision: "allow-always",
              decisionSource: "cli-policy",
              persistent: true,
              cacheEffect: "allow-always-persisted",
              projectRoot: legacyRoot,
              cacheKey: legacyCacheKey,
              scopeLabel: legacyScope,
            },
            continuity: {
              lastApprovalProjectRoot: legacyRoot,
              lastApprovalCacheKey: legacyCacheKey,
              lastApprovalScope: legacyScope,
              lastRequestScopeProjectRoot: legacyRoot,
              lastRequestScopeCacheKey: legacyCacheKey,
              lastRequestScopeLabel: legacyScope,
              lastPermissionRequestProjectRoot: legacyRoot,
              lastPermissionRequestCacheKey: legacyCacheKey,
              lastPermissionRequestScopeLabel: legacyScope,
              lastPermissionRequestTarget: legacyTargetLower,
            },
            summary: [
              `- last-approval-project-root: ${legacyRoot}`,
              `- last-approval-cache-key: ${legacyCacheKey}`,
              `- last-approval-scope: ${legacyScope}`,
              `- last-permission-request-target: ${legacyTargetLower}`,
            ],
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const snapshot = manager.buildContinuitySnapshot(session.id);
    expect(snapshot.lastPermissionRequestTarget?.toLowerCase()).toBe(
      `${projectRoot}\\a.txt`.toLowerCase(),
    );
    expect(snapshot.lastPermissionRequestScopeLabel?.toLowerCase()).toBe(
      expectedScope.toLowerCase(),
    );
    expect(snapshot.lastPermissionRequestCacheKey).toBe(expectedCacheKey);

    const afterState = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      workingMemory?: {
        continuity?: {
          lastPermissionRequestTarget?: string;
          lastPermissionRequestScopeLabel?: string;
          lastPermissionRequestCacheKey?: string;
        };
      };
    };
    expect(
      afterState.workingMemory?.continuity?.lastPermissionRequestTarget?.toLowerCase(),
    ).toBe(`${projectRoot}\\a.txt`.toLowerCase());
    expect(
      afterState.workingMemory?.continuity?.lastPermissionRequestScopeLabel?.toLowerCase(),
    ).toBe(expectedScope.toLowerCase());
    expect(afterState.workingMemory?.continuity?.lastPermissionRequestCacheKey).toBe(
      expectedCacheKey,
    );
  });

  it("does not rewrite legacy rooted permission fields when multiple legacy roots conflict", () => {
    const manager = new SessionManager();
    const projectRoot = path.join(fakeHome, "proj-current-multi-legacy");
    fs.mkdirSync(projectRoot, { recursive: true });
    const session = manager.createNew(projectRoot);
    const statePath = path.join(
      fakeHome,
      ".private-agents",
      "sessions",
      session.id,
      "state.json",
    );
    const legacyRootA = "D:\\legacy-a";
    const legacyRootB = "D:\\legacy-b";
    const legacyCacheKeyA = `${legacyRootA.toLowerCase()}|bash:spawn:process:npm`;
    const legacyCacheKeyB = `${legacyRootB.toLowerCase()}|bash:spawn:process:npm`;
    const expectedCacheKey = `${projectRoot.toLowerCase()}|bash:spawn:process:npm`;
    fs.writeFileSync(
      statePath,
      JSON.stringify(
        {
          status: "completed",
          projectRoot,
          runPhase: "idle",
          durableStatus: "success",
          terminalReason: "completed",
          terminalClassification: "success",
          pendingLifecycle: {
            pendingApprovals: {},
            pendingTools: {},
            taskStates: {},
          },
          workingMemory: {
            approvalAudit: {
              decision: "allow-always",
              decisionSource: "cli-policy",
              persistent: true,
              cacheEffect: "allow-always-persisted",
              projectRoot: legacyRootA,
              cacheKey: legacyCacheKeyA,
              scopeLabel: "bash/spawn/process(npm)",
            },
            approvalAuditHistory: [
              {
                decision: "allow-always",
                decisionSource: "cli-policy",
                persistent: true,
                cacheEffect: "allow-always-persisted",
                projectRoot: legacyRootB,
                cacheKey: legacyCacheKeyB,
                scopeLabel: "bash/spawn/process(npm)",
              },
            ],
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const snapshot = manager.buildContinuitySnapshot(session.id);
    expect(snapshot.lastApprovalCacheKey).toBe(expectedCacheKey);
    expect(snapshot.lastApprovalProjectRoot).toBe(legacyRootA);

    const afterState = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      workingMemory?: {
        approvalAudit?: { projectRoot?: string; cacheKey?: string };
        approvalAuditHistory?: Array<{ projectRoot?: string; cacheKey?: string }>;
      };
    };
    expect(afterState.workingMemory?.approvalAudit?.cacheKey).toBe(
      expectedCacheKey,
    );
    expect(afterState.workingMemory?.approvalAudit?.projectRoot).toBe(legacyRootA);
    expect(afterState.workingMemory?.approvalAuditHistory?.[0]?.cacheKey).toBe(
      expectedCacheKey,
    );
    expect(afterState.workingMemory?.approvalAuditHistory?.[0]?.projectRoot).toBe(
      legacyRootB,
    );
  });

  it("preserves approval memory across boundary-only continuity snapshots", () => {
    const manager = new SessionManager();
    const session = manager.createNew();

    manager.recordApprovalAuditDecision(session.id, {
      decision: "allow-once",
      decisionSource: "tty-keypress",
      persistent: false,
      cacheEffect: "none",
      projectRoot: session.projectRoot,
      cacheKey: `${session.projectRoot.toLowerCase()}|bash:spawn:process:node`,
      scopeLabel: "bash/spawn/process(node)",
      channel: "interactive",
      inputKey: "y",
    });
    manager.markRunStarted(session.id, "run node --version");
    manager.saveError(session.id, "approval denied by user", {
      terminalReason: "stopped_error",
      terminalClassification: "error",
    });

    const boundarySnapshot = manager.buildPromptContinuitySnapshot(
      session.id,
      "continue with another task",
    );

    expect(boundarySnapshot).toBeDefined();
    expect(boundarySnapshot?.lastApprovalDecision).toBe("allow-once");
    expect(boundarySnapshot?.lastApprovalPersistent).toBe(false);
    expect(boundarySnapshot?.lastApprovalCacheEffect).toBe("none");
    expect(boundarySnapshot?.lastApprovalProjectRoot).toBe(session.projectRoot);
    expect(boundarySnapshot?.lastApprovalChannel).toBe("interactive");
    expect(boundarySnapshot?.lastApprovalInputKey).toBe("y");
    expect((boundarySnapshot?.recentTargetFiles ?? []).length).toBe(0);
  });

  it("preserves task truth anchors across boundary-only continuity snapshots", () => {
    const manager = new SessionManager();
    const session = manager.createNew("D:/Test/task-continuity-real3");

    manager.addTurn(session.id, {
      role: "user",
      content: "TASK=ContinuityTruth3 continue from step1 and keep same task label",
    });
    manager.addTurn(session.id, {
      role: "assistant",
      content:
        "TASK=ContinuityTruth3\nDONE=step1 complete\nNEXT=step2",
    });
    manager.markRunStarted(session.id, "continue same task");
    manager.saveError(session.id, "verification stopped on step2", {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
    });

    const boundarySnapshot = manager.buildPromptContinuitySnapshot(
      session.id,
      "continue with another task",
    );

    expect(boundarySnapshot).toBeDefined();
    expect(boundarySnapshot?.lastUserIntent).toContain("TASK=ContinuityTruth3");
    expect(boundarySnapshot?.lastAssistantOutput).toContain(
      "DONE=step1 complete",
    );
    expect(boundarySnapshot?.lastFailure).toContain("verification stopped");
    expect((boundarySnapshot?.recentTargetFiles ?? []).length).toBe(0);
  });

  it("keeps approval memory available for reflective permission prompts", () => {
    const manager = new SessionManager();
    const session = manager.createNew();

    manager.recordApprovalAuditDecision(session.id, {
      decision: "allow-always",
      decisionSource: "cli-policy",
      persistent: true,
      cacheEffect: "allow-always-persisted",
      projectRoot: session.projectRoot,
      cacheKey: `${session.projectRoot.toLowerCase()}|bash:spawn:process:node`,
      scopeLabel: "bash/spawn/process(node)",
      lineage: "verify:blocked->resumed",
      channel: "non-interactive",
      inputKey: "a",
    });

    const reflectiveSnapshot = manager.buildPromptContinuitySnapshot(
      session.id,
      "what did I just approve",
    );

    expect(reflectiveSnapshot).toBeDefined();
    expect(reflectiveSnapshot?.lastApprovalDecision).toBe("allow-always");
    expect(reflectiveSnapshot?.lastApprovalPersistent).toBe(true);
    expect(reflectiveSnapshot?.lastApprovalCacheEffect).toBe(
      "allow-always-persisted",
    );
    expect(reflectiveSnapshot?.lastApprovalLineage).toBe(
      "verify:blocked->resumed",
    );
  });

  it("retains approval memory via continuity and summary after structured approvalAudit is dropped", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const statePath = path.join(manager.getSessionDirPath(session.id), "state.json");

    manager.recordApprovalAuditDecision(session.id, {
      decision: "allow-once",
      decisionSource: "tty-keypress",
      persistent: false,
      cacheEffect: "none",
      projectRoot: session.projectRoot,
      cacheKey: `${session.projectRoot.toLowerCase()}|bash:spawn:process:node`,
      scopeLabel: "bash/spawn/process(node)",
      lineage: "verify:blocked->resumed",
      channel: "interactive",
      inputKey: "y",
    });

    const stateWithAudit = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      workingMemory?: Record<string, unknown>;
    };
    const workingMemory = {
      ...(stateWithAudit.workingMemory ?? {}),
    };
    delete (workingMemory as Record<string, unknown>).approvalAudit;
    fs.writeFileSync(
      statePath,
      JSON.stringify(
        {
          ...JSON.parse(fs.readFileSync(statePath, "utf8")),
          workingMemory,
        },
        null,
        2,
      ),
      "utf8",
    );

    const reflectiveSnapshot = manager.buildPromptContinuitySnapshot(
      session.id,
      "what did I just approve",
    );
    expect(reflectiveSnapshot).toBeDefined();
    expect(reflectiveSnapshot?.lastApprovalDecision).toBe("allow-once");
    expect(reflectiveSnapshot?.lastApprovalDecisionSource).toBe("tty-keypress");
    expect(reflectiveSnapshot?.lastApprovalPersistent).toBe(false);
    expect(reflectiveSnapshot?.lastApprovalLineage).toBe(
      "verify:blocked->resumed",
    );
    expect(reflectiveSnapshot?.lastApprovalChannel).toBe("interactive");
    expect(reflectiveSnapshot?.lastApprovalInputKey).toBe("y");
  });

  it("retains permission memory after real auto-compact threshold crossing", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const statePath = path.join(manager.getSessionDirPath(session.id), "state.json");

    manager.recordApprovalAuditDecision(session.id, {
      decision: "allow-once",
      decisionSource: "cli-policy",
      persistent: false,
      cacheEffect: "none",
      projectRoot: session.projectRoot,
      cacheKey: `${session.projectRoot.toLowerCase()}|bash:spawn:process:node`,
      scopeLabel: "bash/spawn/process(node)",
      channel: "non-interactive",
      inputKey: "y",
    });

    const result = {
      status: "completed",
      terminalReason: "completed",
      terminalClassification: "success",
      transcript: [],
      sharedContext: {
        sessionId: session.id,
        initialPrompt: "noop",
        notes: [],
        handoffs: [],
      },
      finalOutput: "ok",
    } as const;

    for (let index = 0; index < 12; index += 1) {
      manager.appendQueryEvent(session.id, {
        type: "query.completed",
        result,
      });
    }

    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      workingMemory?: {
        compacted?: boolean;
        compactReason?: string;
        sourceTurnCount?: number;
        approvalAudit?: {
          decision?: string;
          cacheEffect?: string;
        };
      };
    };
    expect(state.workingMemory?.compacted).toBe(true);
    expect(state.workingMemory?.compactReason).toBe("auto-threshold");
    expect((state.workingMemory?.sourceTurnCount ?? 0) >= 12).toBe(true);
    expect(state.workingMemory?.approvalAudit?.decision).toBe("allow-once");
    expect(state.workingMemory?.approvalAudit?.cacheEffect).toBe("none");

    const reflectiveSnapshot = manager.buildPromptContinuitySnapshot(
      session.id,
      "what did I just approve",
    );
    expect(reflectiveSnapshot).toBeDefined();
    expect(reflectiveSnapshot?.lastApprovalDecision).toBe("allow-once");
    expect(reflectiveSnapshot?.lastApprovalCacheEffect).toBe("none");
    expect(reflectiveSnapshot?.lastApprovalProjectRoot).toBe(session.projectRoot);
  });

  it("retains approval audit history after real auto-compact threshold crossing", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const statePath = path.join(manager.getSessionDirPath(session.id), "state.json");
    const root = session.projectRoot;

    manager.recordApprovalAuditDecision(session.id, {
      decision: "allow-always",
      decisionSource: "tty-keypress",
      persistent: true,
      cacheEffect: "persisted",
      projectRoot: root,
      cacheKey: `${root.toLowerCase()}|bash:spawn:process:npm`,
      scopeLabel: "bash/spawn/process(npm)",
      recordedAt: "2026-04-23T12:00:00.000Z",
    });
    manager.recordApprovalAuditDecision(session.id, {
      decision: "deny",
      decisionSource: "tty-keypress",
      persistent: false,
      cacheEffect: "none",
      projectRoot: root,
      cacheKey: `${root.toLowerCase()}|bash:spawn:process:npm`,
      scopeLabel: "bash/spawn/process(npm)",
      stopReason: "user denied escalation",
      recordedAt: "2026-04-23T12:03:00.000Z",
    });

    const result = {
      status: "completed",
      terminalReason: "completed",
      terminalClassification: "success",
      transcript: [],
      sharedContext: {
        sessionId: session.id,
        initialPrompt: "noop",
        notes: [],
        handoffs: [],
      },
      finalOutput: "ok",
    } as const;

    for (let index = 0; index < 12; index += 1) {
      manager.appendQueryEvent(session.id, {
        type: "query.completed",
        result,
      });
    }

    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      workingMemory?: {
        compacted?: boolean;
        approvalAuditHistory?: Array<{ decision?: string }>;
        continuity?: {
          lastApprovalHistory?: Array<{ decision?: string }>;
        };
      };
    };
    expect(state.workingMemory?.compacted).toBe(true);
    expect(state.workingMemory?.approvalAuditHistory?.length).toBeGreaterThanOrEqual(
      2,
    );
    expect(
      state.workingMemory?.approvalAuditHistory?.[
        (state.workingMemory?.approvalAuditHistory?.length ?? 1) - 1
      ]?.decision,
    ).toBe("deny");
    expect(
      state.workingMemory?.continuity?.lastApprovalHistory?.[
        (state.workingMemory?.continuity?.lastApprovalHistory?.length ?? 1) - 1
      ]?.decision,
    ).toBe("deny");
  });

  it("keeps interrupted sessions recoverable while filtering durable errors without continuation evidence", () => {
    const manager = new SessionManager();
    const interrupted = manager.createNew();
    manager.markRunStarted(interrupted.id, "first prompt");
    manager.saveInterrupted(interrupted.id);

    const noEvidenceError = manager.createNew();
    manager.markRunStarted(noEvidenceError.id, "second prompt");
    manager.saveError(noEvidenceError.id, "daemon unavailable", {
      terminalReason: "stopped_error",
      terminalClassification: "error",
    });

    const suggestedWithNoEvidenceError = manager.getSuggestedRecoverySession();
    expect(suggestedWithNoEvidenceError?.id).toBe(interrupted.id);
    expect(suggestedWithNoEvidenceError?.status).toBe("interrupted");

    const evidenceError = manager.createNew();
    manager.markRunStarted(evidenceError.id, "third prompt");
    manager.appendQueryEvent(evidenceError.id, {
      type: "approval.requested",
      toolName: "bash",
      taskId: "task_recovery_candidate_evidence",
    });
    manager.saveError(evidenceError.id, "transport exploded", {
      terminalReason: "stopped_error",
      terminalClassification: "error",
    });

    const suggestedWithEvidenceError = manager.getSuggestedRecoverySession();
    expect(suggestedWithEvidenceError?.id).toBe(evidenceError.id);
    expect(suggestedWithEvidenceError?.status).toBe("error");
  });

  it("does not suggest durable-stopped sessions as recoverable errors", () => {
    const manager = new SessionManager();

    const stopped = manager.createNew();
    manager.markRunStarted(stopped.id, "stopped prompt");
    manager.saveError(stopped.id, "Retry budget exhausted", {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
    });

    const durableError = manager.createNew();
    manager.markRunStarted(durableError.id, "error prompt");
    manager.appendQueryEvent(durableError.id, {
      type: "approval.requested",
      toolName: "bash",
      taskId: "task_durable_error_recovery_evidence",
    });
    manager.saveError(durableError.id, "Transport exploded", {
      terminalReason: "stopped_error",
      terminalClassification: "error",
    });

    const suggested = manager.getSuggestedRecoverySession();
    expect(suggested?.id).toBe(durableError.id);
    expect(suggested?.status).toBe("error");
    expect(manager.getRecoverySnapshot(stopped.id).durableStatus).toBe(
      "stopped",
    );
    expect(manager.getRecoverySnapshot(durableError.id).durableStatus).toBe(
      "error",
    );
  });

  it("blocks indeterminate terminal evidence from recovery entry and keeps interrupted recovery semantics", () => {
    const manager = new SessionManager();

    const interrupted = manager.createNew();
    manager.markRunStarted(interrupted.id, "still recoverable prompt");
    manager.saveInterrupted(interrupted.id);

    const ambiguousError = manager.createNew();
    manager.markRunStarted(ambiguousError.id, "ambiguous error prompt");
    manager.saveError(ambiguousError.id, "unknown failure", {
      terminalReason: "stopped_error",
      terminalClassification: "error",
    });

    const ambiguousSessionDir = manager.getSessionDirPath(ambiguousError.id);
    fs.writeFileSync(
      path.join(ambiguousSessionDir, "state.json"),
      JSON.stringify(
        {
          status: "error",
          runPhase: "idle",
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(
      path.join(ambiguousSessionDir, "transcript.jsonl"),
      "",
      "utf8",
    );

    const suggested = manager.getSuggestedRecoverySession();
    expect(suggested?.id).toBe(interrupted.id);
    expect(suggested?.status).toBe("interrupted");

    const block = manager.getRecoveryTrustBoundaryBlock();
    expect(block?.sessionId).toBe(ambiguousError.id);
    expect(block?.reason).toBe("terminal-evidence-indeterminate");
    expect(block?.recoveryHint).toContain(
      "Start a fresh session or manually repair",
    );

    const resumeResult = manager.tryResume(ambiguousError.id);
    expect(resumeResult.ok).toBe(false);
    if (!resumeResult.ok) {
      expect(resumeResult.error).toContain("is not recoverable");
      expect(resumeResult.error).toContain(
        "terminal evidence is indeterminate",
      );
      expect(resumeResult.recoveryHint).toContain(
        "Start a fresh session or manually repair",
      );
    }
  });

  it("stores richer transcript events and exposes a recovery snapshot", () => {
    const manager = new SessionManager();
    const session = manager.createNew();

    manager.markRunStarted(session.id, "recover this prompt");
    manager.addTurn(session.id, {
      role: "user",
      content: "recover this prompt",
    });
    manager.appendQueryEvent(session.id, {
      type: "query.started",
      sessionId: session.id,
      prompt: "recover this prompt",
    });
    manager.appendQueryEvent(session.id, {
      type: "tool.started",
      toolName: "read",
      taskId: "task_1",
    });
    manager.saveInterrupted(session.id);

    const transcriptEvents = manager.getTranscriptEvents(session.id);
    expect(transcriptEvents.some((event) => event.type === "query-event")).toBe(
      true,
    );
    expect(transcriptEvents.some((event) => event.type === "lifecycle")).toBe(
      true,
    );

    const snapshot = manager.getRecoverySnapshot(session.id);
    expect(snapshot.pendingPrompt).toBe("recover this prompt");
    expect(snapshot.lastUserMessage?.content).toBe("recover this prompt");
    expect(snapshot.lastLifecycleEvent?.event).toBe("run-interrupted");
  });

  it("builds re-entry summaries ranked toward recoverable sessions in the current project", () => {
    const manager = new SessionManager();
    const projectA = path.join(fakeHome, "workspace-a");
    const projectB = path.join(fakeHome, "workspace-b");

    const recoverable = manager.createNew(projectA);
    manager.markRunStarted(recoverable.id, "continue feature work");
    manager.saveInterrupted(recoverable.id);

    const blocked = manager.createNew(projectA);
    manager.markRunStarted(blocked.id, "stopped by policy");
    manager.saveError(blocked.id, "policy", {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
    });

    const otherProject = manager.createNew(projectB);
    manager.markRunStarted(otherProject.id, "other project task");
    manager.saveInterrupted(otherProject.id);

    const summaries = manager.listReentrySummaries({
      preferredProjectRoot: projectA,
    });

    expect(summaries.length).toBeGreaterThanOrEqual(3);
    expect(summaries[0]?.id).toBe(recoverable.id);
    expect(summaries[0]?.recoverable).toBe(true);
    expect(summaries.find((item) => item.id === blocked.id)?.recoverable).toBe(
      false,
    );
    expect(
      summaries.find((item) => item.id === blocked.id)?.blockedReason,
    ).toBe("continuation-evidence-missing");
    expect(
      summaries.find((item) => item.id === otherProject.id)?.projectRoot,
    ).toBe(projectB);
  });

  it("aggregates recent project contexts for workspace control plane", () => {
    const manager = new SessionManager();
    const projectA = path.join(fakeHome, "workspace-a");
    const projectB = path.join(fakeHome, "workspace-b");

    const aRecoverable = manager.createNew(projectA);
    manager.markRunStarted(aRecoverable.id, "continue a");
    manager.saveInterrupted(aRecoverable.id);

    const aCompleted = manager.createNew(projectA);
    manager.markRunStarted(aCompleted.id, "done a");
    manager.saveCompleted(aCompleted.id, {
      terminalReason: "completed",
      terminalClassification: "success",
    });

    const bRecoverable = manager.createNew(projectB);
    manager.markRunStarted(bRecoverable.id, "continue b");
    manager.saveInterrupted(bRecoverable.id);

    const projectSummaries = manager.listRecentProjectContexts();
    const projectAContext = projectSummaries.find(
      (item) => item.projectRoot === projectA,
    );
    const projectBContext = projectSummaries.find(
      (item) => item.projectRoot === projectB,
    );

    expect(projectAContext?.sessionCount).toBe(2);
    expect(projectAContext?.recoverableCount).toBe(1);
    expect(projectAContext?.lastSessionId).toBe(aCompleted.id);
    expect(projectBContext?.sessionCount).toBe(1);
    expect(projectBContext?.recoverableCount).toBe(1);
    expect(projectBContext?.lastSessionId).toBe(bRecoverable.id);
  });

  it("tracks and restores current session selection per project", () => {
    const manager = new SessionManager();
    const projectA = path.join(fakeHome, "workspace-a-current");
    const projectB = path.join(fakeHome, "workspace-b-current");

    const a1 = manager.createNew(projectA);
    const a2 = manager.createNew(projectA);
    const b1 = manager.createNew(projectB);

    // Selecting an older session should override latest-created session.
    manager.resume(a1.id);

    expect(manager.getCurrentSessionForProject(projectA)?.id).toBe(a1.id);
    expect(manager.getCurrentSessionForProject(projectA)?.id).not.toBe(a2.id);
    expect(manager.getCurrentSessionForProject(projectB)?.id).toBe(b1.id);
  });

  it("restores current session evidence across manager instances after terminal turns", () => {
    const manager = new SessionManager();
    const completedProject = path.join(fakeHome, "workspace-completed-current");
    const completed = manager.createNew(completedProject);

    manager.persistUserPromptBarrier(completed.id, "fix src/app.ts and verify");
    manager.appendQueryEvent(completed.id, {
      type: "query.completed",
      result: {
        status: "completed",
        terminalReason: "completed",
        terminalClassification: "success",
        transcript: [],
        sharedContext: {
          sessionId: completed.id,
          initialPrompt: "fix src/app.ts and verify",
          notes: [
            "decision-trace: seed=action-result seedInfluence=target-carryover",
          ],
          handoffs: [],
        },
        finalOutput: "Fixed src/app.ts and verified it.",
        codingResult: {
          taskKind: "edit-file",
          changedFiles: ["src/app.ts"],
          failedFiles: [],
          patches: [],
          repair: {
            status: "not-needed",
            attempts: 1,
            recoveredItems: [],
            failedItems: [],
            notes: [],
          },
          continuation: {
            status: "first-pass-success",
            attempts: 1,
            evidence: [
              "inspect: read src/app.ts",
              "transform:src/app.ts:bug=>fix",
              "verify-command-hint:npm test -- src/app.test.ts",
            ],
          },
          changeSet: {
            gitAware: false,
            preExistingDirtyFiles: [],
            postRunDirtyFiles: [],
            attemptedFiles: ["src/app.ts"],
            changedFiles: ["src/app.ts"],
            unchangedAttemptedFiles: [],
          },
          taskSatisfaction: {
            verdict: "satisfied",
            reasons: ["Edit and verification completed."],
            requiredEvidence: ["changed-files", "verification"],
            observedEvidence: ["src/app.ts", "npm test -- src/app.test.ts"],
          },
          verifiedFiles: ["src/app.ts"],
          unverifiedFiles: [],
          verification: {
            status: "passed",
            command: "npm test -- src/app.test.ts",
            reason: "Focused test passed.",
            selectionScope: "focused",
            selectionSource: "auto-from-changes",
          },
          lastActionResultSeed: {
            actionKind: "edit-file",
            target: "src/app.ts",
            changedFiles: ["src/app.ts"],
            verifiedFiles: ["src/app.ts"],
            verification: {
              status: "passed",
              command: "npm test -- src/app.test.ts",
              reason: "Focused test passed.",
            },
          },
          evidence: ["transform:src/app.ts:bug=>fix"],
        },
      },
    });
    manager.addTurn(completed.id, {
      role: "assistant",
      content: "Fixed src/app.ts and verified it.",
    });
    manager.saveCompleted(completed.id, {
      terminalReason: "completed",
      terminalClassification: "success",
    });

    const failedProject = path.join(fakeHome, "workspace-error-current");
    const failed = manager.createNew(failedProject);
    manager.persistUserPromptBarrier(failed.id, "fix src/broken.ts and verify");
    manager.appendQueryEvent(failed.id, {
      type: "query.completed",
      result: {
        status: "stopped_error",
        terminalReason: "stopped_error",
        terminalClassification: "error",
        stopReason: "npm test failed with exit code 1",
        transcript: [],
        sharedContext: {
          sessionId: failed.id,
          initialPrompt: "fix src/broken.ts and verify",
          notes: [
            "decision-trace: seed=action-result seedInfluence=verify-signal",
          ],
          handoffs: [],
        },
        finalOutput: "Edited src/broken.ts, but verification failed.",
        codingResult: {
          taskKind: "edit-file",
          changedFiles: ["src/broken.ts"],
          failedFiles: [],
          patches: [],
          repair: {
            status: "not-needed",
            attempts: 1,
            recoveredItems: [],
            failedItems: [],
            notes: [],
          },
          continuation: {
            status: "failed-after-bounded-continuation",
            attempts: 1,
            evidence: [
              "inspect: read src/broken.ts",
              "transform:src/broken.ts:old=>new",
              "verify-command-hint:npm test -- src/broken.test.ts",
            ],
          },
          changeSet: {
            gitAware: false,
            preExistingDirtyFiles: [],
            postRunDirtyFiles: [],
            attemptedFiles: ["src/broken.ts"],
            changedFiles: ["src/broken.ts"],
            unchangedAttemptedFiles: [],
          },
          taskSatisfaction: {
            verdict: "completed-with-caveats",
            reasons: ["Verification failed after the edit."],
            requiredEvidence: ["changed-files", "verification"],
            observedEvidence: ["src/broken.ts"],
          },
          verifiedFiles: [],
          unverifiedFiles: [
            { path: "src/broken.ts", reason: "npm test failed" },
          ],
          verification: {
            status: "failed",
            command: "npm test -- src/broken.test.ts",
            reason: "npm test failed with exit code 1",
            selectionScope: "focused",
            selectionSource: "auto-from-changes",
            nextAction: "Inspect the failing test and continue the fix.",
          },
          lastActionResultSeed: {
            actionKind: "edit-file",
            target: "src/broken.ts",
            changedFiles: ["src/broken.ts"],
            verifiedFiles: [],
            verification: {
              status: "failed",
              command: "npm test -- src/broken.test.ts",
              reason: "npm test failed with exit code 1",
            },
          },
          evidence: ["transform:src/broken.ts:old=>new"],
          failureBoundary: "verification",
        },
      },
    });
    manager.addTurn(failed.id, {
      role: "assistant",
      content: "Edited src/broken.ts, but verification failed.",
    });
    manager.saveError(failed.id, "npm test failed with exit code 1", {
      terminalReason: "stopped_error",
      terminalClassification: "error",
    });

    const restoredManager = new SessionManager();

    expect(
      restoredManager.getCurrentSessionForProject(completedProject)?.id,
    ).toBe(completed.id);
    const completedSnapshot =
      restoredManager.buildContinuitySnapshot(completed.id);
    expect(completedSnapshot.recentChangedFiles).toEqual(["src/app.ts"]);
    expect(completedSnapshot.recentVerifiedFiles).toEqual(["src/app.ts"]);
    expect(completedSnapshot.lastVerificationStatus).toBe("passed");
    expect(completedSnapshot.lastVerificationCommand).toBe(
      "npm test -- src/app.test.ts",
    );
    expect(completedSnapshot.lastActionResultSeed).toMatchObject({
      actionKind: "edit-file",
      target: "src/app.ts",
      changedFiles: ["src/app.ts"],
      verifiedFiles: ["src/app.ts"],
      verification: {
        status: "passed",
        command: "npm test -- src/app.test.ts",
      },
    });
    expect(completedSnapshot.lastActionHandoffSummary).toBe(
      "Resumed from edit-file on src/app.ts; verification status: passed; next focus is the same target.",
    );
    expect(completedSnapshot.lastSeedInfluence).toBe("target-carryover");
    expect(completedSnapshot.lastSeedInfluenceHandoffSummary).toBe(
      "Seed influence: target-carryover from edit-file on src/app.ts.",
    );
    expect(completedSnapshot.lastSuccessHandoffDiagnostic).toBe(
      "Success handoff: status=passed; target=src/app.ts; command=npm test -- src/app.test.ts; verified=src/app.ts; reason=Focused test passed.; next=keep the next turn focused on the same target; do not repeat this verification unless the target changes.",
    );
    expect(
      restoredManager.buildPromptContinuitySnapshot(
        completed.id,
        "continue with the same task",
      )?.lastActionResultSeed,
    ).toMatchObject({
      actionKind: "edit-file",
      target: "src/app.ts",
      verification: {
        status: "passed",
        command: "npm test -- src/app.test.ts",
      },
    });
    expect(
      restoredManager.buildPromptContinuityContext(
        completed.id,
        "continue with the same task",
      ),
    ).toContain("- recent-changed-files: src/app.ts");
    expect(
      restoredManager.buildPromptContinuityContext(
        completed.id,
        "continue with the same task",
      ),
    ).toContain(
      "- last-action-handoff-summary: Resumed from edit-file on src/app.ts; verification status: passed; next focus is the same target.",
    );
    expect(
      restoredManager.buildPromptContinuityContext(
        completed.id,
        "continue with the same task",
      ),
    ).toContain(
      "- last-seed-influence-handoff-summary: Seed influence: target-carryover from edit-file on src/app.ts.",
    );
    expect(
      restoredManager.buildPromptContinuityContext(
        completed.id,
        "continue with the same task",
      ),
    ).toContain(
      "- last-success-handoff-diagnostic: Success handoff: status=passed; target=src/app.ts; command=npm test -- src/app.test.ts; verified=src/app.ts; reason=Focused test passed.;",
    );

    expect(restoredManager.getCurrentSessionForProject(failedProject)?.id).toBe(
      failed.id,
    );
    const failedSnapshot = restoredManager.buildContinuitySnapshot(failed.id);
    expect(failedSnapshot.lastTerminalClassification).toBe("error");
    expect(failedSnapshot.lastFailure).toBe("npm test failed with exit code 1");
    expect(failedSnapshot.recentChangedFiles).toEqual(["src/broken.ts"]);
    expect(failedSnapshot.lastVerificationStatus).toBe("failed");
    expect(failedSnapshot.lastVerificationReason).toBe(
      "npm test failed with exit code 1",
    );
    expect(failedSnapshot.lastActionResultSeed).toMatchObject({
      actionKind: "edit-file",
      target: "src/broken.ts",
      changedFiles: ["src/broken.ts"],
      verification: {
        status: "failed",
        command: "npm test -- src/broken.test.ts",
      },
    });
    expect(failedSnapshot.lastActionHandoffSummary).toBe(
      "Resumed from edit-file on src/broken.ts; verification status: failed; next focus is the same target.",
    );
    expect(failedSnapshot.lastSeedInfluence).toBe("verify-signal");
    expect(failedSnapshot.lastSeedInfluenceHandoffSummary).toBe(
      "Seed influence: verify-signal from edit-file on src/broken.ts.",
    );
    expect(failedSnapshot.lastFailureHandoffDiagnostic).toBe(
      "Failure handoff: status=failed; target=src/broken.ts; command=npm test -- src/broken.test.ts; reason=npm test failed with exit code 1; next=Inspect the failing test and continue the fix.",
    );
    expect(failedSnapshot.lastSuccessHandoffDiagnostic).toBeUndefined();
    expect(failedSnapshot.unresolvedItems).toContain("verify:failed");
    const failedContext = restoredManager.buildPromptContinuityContext(
      failed.id,
      "continue with the same task",
    );
    expect(failedContext).toContain("- recent-changed-files: src/broken.ts");
    expect(failedContext).toContain("- last-verification-status: failed");
    expect(failedContext).toContain(
      "- last-verification-command: npm test -- src/broken.test.ts",
    );
    expect(failedContext).toContain(
      "- unresolved-items: last-error:npm test failed with exit code 1",
    );
    expect(failedContext).toContain(
      "- last-failure-handoff-diagnostic: Failure handoff: status=failed; target=src/broken.ts; command=npm test -- src/broken.test.ts; reason=npm test failed with exit code 1; next=Inspect the failing test and continue the fix.",
    );
  });

  it("persists action result seed handoff summary through auto-compact continuity", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    manager.recordApprovalAuditDecision(session.id, {
      decision: "allow-once",
      decisionSource: "cli-policy",
      persistent: false,
      cacheEffect: "none",
      projectRoot: session.projectRoot,
      cacheKey: `${session.projectRoot.toLowerCase()}|bash:spawn:process:node`,
      scopeLabel: "bash/spawn/process(node)",
      channel: "non-interactive",
      inputKey: "y",
    });
    const statePath = path.join(manager.getSessionDirPath(session.id), "state.json");
    const result = {
      status: "completed",
      terminalReason: "completed",
      terminalClassification: "success",
      transcript: [],
      sharedContext: {
        sessionId: session.id,
        initialPrompt: "fix src/compact.ts and verify",
        notes: [
          "decision-trace: seed=action-result seedInfluence=ignored-explicit-target",
        ],
        handoffs: [],
      },
      finalOutput: "Fixed src/compact.ts and verified it.",
      codingResult: {
        taskKind: "edit-file",
        changedFiles: ["src/compact.ts"],
        failedFiles: [],
        patches: [],
        repair: {
          status: "not-needed",
          attempts: 0,
          recoveredItems: [],
          failedItems: [],
          notes: [],
        },
        continuation: {
          status: "first-pass-success",
          attempts: 0,
          evidence: [],
        },
        changeSet: {
          gitAware: false,
          preExistingDirtyFiles: [],
          postRunDirtyFiles: ["src/compact.ts"],
          attemptedFiles: ["src/compact.ts"],
          changedFiles: ["src/compact.ts"],
          unchangedAttemptedFiles: [],
        },
        taskSatisfaction: {
          verdict: "satisfied",
          reasons: [],
          requiredEvidence: ["changed-files", "verification"],
          observedEvidence: ["src/compact.ts"],
        },
        verifiedFiles: ["src/compact.ts"],
        unverifiedFiles: [],
        verification: {
          status: "passed",
          command: "npm test -- src/compact.test.ts",
        },
        lastActionResultSeed: {
          actionKind: "edit-file",
          target: "src/compact.ts",
          changedFiles: ["src/compact.ts"],
          verifiedFiles: ["src/compact.ts"],
          verification: {
            status: "passed",
            command: "npm test -- src/compact.test.ts",
          },
        },
        evidence: [],
      },
    } as const;

    for (let index = 0; index < 12; index += 1) {
      manager.appendQueryEvent(session.id, {
        type: "query.completed",
        result,
      });
    }

    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      workingMemory?: {
        compacted?: boolean;
        continuity?: {
          lastActionHandoffSummary?: string;
          lastSeedInfluence?: string;
          lastSeedInfluenceHandoffSummary?: string;
          lastFailureHandoffDiagnostic?: string;
          lastSuccessHandoffDiagnostic?: string;
        };
        summary?: string[];
      };
    };
    expect(state.workingMemory?.compacted).toBe(true);
    expect(state.workingMemory?.continuity?.lastActionHandoffSummary).toBe(
      "Resumed from edit-file on src/compact.ts; verification status: passed; next focus is the same target.",
    );
    expect(state.workingMemory?.summary).toContain(
      "- last-action-handoff-summary: Resumed from edit-file on src/compact.ts; verification status: passed; next focus is the same target.",
    );
    expect(state.workingMemory?.continuity?.lastSeedInfluence).toBe(
      "ignored-explicit-target",
    );
    expect(
      state.workingMemory?.continuity?.lastSeedInfluenceHandoffSummary,
    ).toBe(
      "Seed influence: ignored-explicit-target from edit-file on src/compact.ts.",
    );
    expect(state.workingMemory?.summary).toContain(
      "- last-seed-influence: ignored-explicit-target",
    );
    expect(state.workingMemory?.summary).toContain(
      "- last-seed-influence-handoff-summary: Seed influence: ignored-explicit-target from edit-file on src/compact.ts.",
    );
    expect(
      state.workingMemory?.continuity?.lastFailureHandoffDiagnostic,
    ).toBeUndefined();
    expect(
      state.workingMemory?.continuity?.lastSuccessHandoffDiagnostic,
    ).toBe(
      "Success handoff: status=passed; target=src/compact.ts; command=npm test -- src/compact.test.ts; verified=src/compact.ts; next=keep the next turn focused on the same target; do not repeat this verification unless the target changes.",
    );
    expect(state.workingMemory?.summary).toContain(
      "- last-success-handoff-diagnostic: Success handoff: status=passed; target=src/compact.ts; command=npm test -- src/compact.test.ts; verified=src/compact.ts; next=keep the next turn focused on the same target; do not repeat this verification unless the target changes.",
    );
  });

  it("builds reusable long-session compact continuity fixtures", () => {
    const manager = new SessionManager();
    const scenarios = [
      "stopped-edit-failure",
      "verification-failed",
      "approved-tool-failure",
    ] as const;

    for (const scenario of scenarios) {
      const fixture = createLongSessionContinuityFixture(manager, scenario);
      const memory = fixture.readWorkingMemory();
      const restoredManager = fixture.restoreManager();
      const snapshot = restoredManager.buildContinuitySnapshot(fixture.session.id);
      const context = restoredManager.buildPromptContinuityContext(
        fixture.session.id,
        "continue the same long session task",
      );

      expect(memory?.compacted).toBe(true);
      expect(memory?.compactReason).toBe("auto-threshold");
      expect(memory?.sourceTurnCount).toBe(12);
      expect(snapshot.lastTaskKind).toBe(
        scenario === "approved-tool-failure" ? "run-command" : "edit-file",
      );
      expect(snapshot.lastFailure).toBe(fixture.failureReason);
      expect(snapshot.lastVerificationNextAction).toBe(fixture.nextAction);
      expect(snapshot.recentTargetFiles).toContain(fixture.targetFile);
      expect(context).toContain(fixture.nextAction);
    }
  });

  it("preserves stopped edit patch recovery details across auto-compact reload", () => {
    const manager = new SessionManager();
    const fixture = createLongSessionContinuityFixture(
      manager,
      "stopped-edit-failure",
    );
    const restoredManager = fixture.restoreManager();
    const snapshot = restoredManager.buildContinuitySnapshot(fixture.session.id);
    const context = restoredManager.buildPromptContinuityContext(
      fixture.session.id,
      "continue the stopped edit",
    );

    expect(fixture.readWorkingMemory()?.compacted).toBe(true);
    expect(snapshot.lastTerminalClassification).toBe("stopped");
    expect(snapshot.lastFailure).toBe(fixture.failureReason);
    expect(snapshot.recentFailedFiles).toEqual([
      {
        path: fixture.targetFile,
        reason: fixture.failureReason,
      },
    ]);
    expect(snapshot.lastVerificationStatus).toBe("blocked");
    expect(snapshot.lastVerificationBlockerKind).toBe("patch-from-not-found");
    expect(snapshot.lastVerificationReason).toBe(fixture.failureReason);
    expect(snapshot.lastVerificationNextAction).toBe(fixture.nextAction);
    expect(snapshot.lastFailureHandoffDiagnostic).toContain(
      "blocker=patch-from-not-found",
    );
    expect(context).toContain(
      `- recent-failed-files: ${fixture.targetFile} (${fixture.failureReason})`,
    );
    expect(context).toContain(
      "- last-verification-blocker-kind: patch-from-not-found",
    );
    expect(context).toContain(
      `- last-verification-next-action: ${fixture.nextAction}`,
    );
  });

  it("derives non-write stopped blocker and next action from result evidence", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const stopReason =
      "stale-read: src/stale.ts changed since it was read for this edit.";
    const nextAction =
      "Re-read src/stale.ts, then rerun the edit against that current content.";

    manager.markRunStarted(session.id, "continue stale edit");
    manager.addTurn(session.id, {
      role: "user",
      content: "edit src/stale.ts",
    });
    manager.appendQueryEvent(session.id, {
      type: "query.completed",
      result: {
        status: "stopped_error",
        terminalReason: "stopped_error",
        terminalClassification: "stopped",
        stopReason,
        transcript: [],
        sharedContext: {
          sessionId: session.id,
          initialPrompt: "edit src/stale.ts",
          notes: [],
          handoffs: [],
        },
        finalOutput: "",
        codingResult: {
          taskKind: "edit-file",
          changedFiles: [],
          failedFiles: [{ path: "src/stale.ts", reason: stopReason }],
          patches: [
            {
              path: "src/stale.ts",
              operation: "replace",
              status: "failed",
              failureCode: "stale-read",
              reason: stopReason,
            },
          ],
          repair: {
            status: "not-needed",
            attempts: 0,
            recoveredItems: [],
            failedItems: ["src/stale.ts"],
            notes: [`Next action: ${nextAction}`],
          },
          continuation: {
            status: "first-pass-success",
            attempts: 0,
            evidence: [
              "actionable-blocker-kind:stale-read",
              `actionable-blocker-next:${nextAction}`,
            ],
          },
          changeSet: {
            gitAware: false,
            preExistingDirtyFiles: [],
            postRunDirtyFiles: [],
            attemptedFiles: ["src/stale.ts"],
            changedFiles: [],
            unchangedAttemptedFiles: ["src/stale.ts"],
          },
          taskSatisfaction: {
            verdict: "insufficient-evidence",
            reasons: [stopReason],
            requiredEvidence: ["no writer invocation", "no changed files"],
            observedEvidence: ["actionable-blocker-kind:stale-read"],
          },
          verifiedFiles: [],
          unverifiedFiles: [{ path: "src/stale.ts", reason: stopReason }],
          verification: {
            status: "blocked",
            reason: stopReason,
            blockerKind: "unknown",
          },
          lastActionResultSeed: {
            actionKind: "edit-file",
            target: "src/stale.ts",
            changedFiles: [],
            verifiedFiles: [],
            verification: {
              status: "blocked",
              reason: stopReason,
              blockerKind: "unknown",
            },
            blockerKind: "unknown",
            reason: stopReason,
          },
          evidence: [
            "actionable-blocker-kind:stale-read",
            `actionable-blocker-next:${nextAction}`,
          ],
          failureBoundary: stopReason,
        },
      },
    });
    manager.saveError(session.id, stopReason, {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
    });

    const snapshot = manager.buildContinuitySnapshot(session.id);
    expect(snapshot.lastVerificationBlockerKind).toBe("stale-read");
    expect(snapshot.lastVerificationNextAction).toBe(nextAction);
    expect(snapshot.lastFailureHandoffDiagnostic).toBe(
      `Failure handoff: status=blocked; target=src/stale.ts; reason=${stopReason}; blocker=stale-read; next=${nextAction.replace(/[.]+$/, "")}.`,
    );
    expect(snapshot.lastWriterStarted).toBeUndefined();
    expect(snapshot.lastWriteEffect).toBeUndefined();
    expect(snapshot.recentChangedFiles).toEqual([]);

    const context = manager.buildPromptContinuityContext(
      session.id,
      "continue stale edit",
    );
    expect(context).toContain("- last-verification-blocker-kind: stale-read");
    expect(context).toContain(`- last-verification-next-action: ${nextAction}`);
    expect(context).not.toContain("- last-write-effect:");
  });

  it("preserves verification failed repair context across auto-compact reload", () => {
    const manager = new SessionManager();
    const fixture = createLongSessionContinuityFixture(
      manager,
      "verification-failed",
    );
    const restoredManager = fixture.restoreManager();
    const snapshot = restoredManager.buildContinuitySnapshot(fixture.session.id);
    const context = restoredManager.buildPromptContinuityContext(
      fixture.session.id,
      "continue the verification failure",
    );

    expect(fixture.readWorkingMemory()?.compacted).toBe(true);
    expect(snapshot.lastTerminalClassification).toBe("error");
    expect(snapshot.lastFailure).toBe(fixture.failureReason);
    expect(snapshot.recentChangedFiles).toEqual([fixture.targetFile]);
    expect(snapshot.recentVerifiedFiles).toEqual([]);
    expect(snapshot.lastVerificationStatus).toBe("failed");
    expect(snapshot.lastVerificationCommand).toBe(
      "npm test -- src/long-session.test.ts",
    );
    expect(snapshot.lastVerificationReason).toBe(fixture.failureReason);
    expect(snapshot.lastVerificationNextAction).toBe(fixture.nextAction);
    expect(snapshot.lastFailureHandoffDiagnostic).toBe(
      `Failure handoff: status=failed; target=${fixture.targetFile}; command=npm test -- src/long-session.test.ts; reason=${fixture.failureReason}; next=${fixture.nextAction.replace(/[.]+$/, "")}.`,
    );
    expect(context).toContain(`- recent-changed-files: ${fixture.targetFile}`);
    expect(context).toContain("- last-verification-status: failed");
    expect(context).toContain(
      "- last-verification-command: npm test -- src/long-session.test.ts",
    );
    expect(context).toContain(
      `- last-verification-next-action: ${fixture.nextAction}`,
    );
  });

  it("preserves approved execution failure provenance across auto-compact reload", () => {
    const manager = new SessionManager();
    const fixture = createLongSessionContinuityFixture(
      manager,
      "approved-tool-failure",
    );
    const restoredManager = fixture.restoreManager();
    const snapshot = restoredManager.buildContinuitySnapshot(fixture.session.id);
    const context = restoredManager.buildPromptContinuityContext(
      fixture.session.id,
      "continue the approved tool failure",
    );

    expect(fixture.readWorkingMemory()?.compacted).toBe(true);
    expect(snapshot.lastTerminalClassification).toBe("stopped");
    expect(snapshot.lastTaskKind).toBe("run-command");
    expect(snapshot.lastFailure).toBe(fixture.failureReason);
    expect(snapshot.recentFailedFiles).toEqual([
      {
        path: fixture.targetFile,
        reason: fixture.failureReason,
      },
    ]);
    expect(snapshot.lastApprovalDecision).toBe("allow-once");
    expect(snapshot.lastApprovalPersistent).toBe(false);
    expect(snapshot.lastApprovalCacheEffect).toBe("none");
    expect(snapshot.lastApprovalChannel).toBe("non-interactive");
    expect(snapshot.lastApprovalInputKey).toBe("y");
    expect(snapshot.lastVerificationStatus).toBe("blocked");
    expect(snapshot.lastVerificationCommand).toBe(
      "npm test -- src/long-session.test.ts",
    );
    expect(snapshot.lastVerificationBlockerKind).toBe("unknown");
    expect(snapshot.lastVerificationReason).toBe(fixture.failureReason);
    expect(snapshot.lastVerificationNextAction).toBe(fixture.nextAction);
    expect(snapshot.lastApprovalDecision).not.toBe("deny");
    expect(snapshot.lastFailure).not.toBe("approval denied");
    expect(context).toContain("- last-approval-decision: allow-once");
    expect(context).toContain("- last-approval-persistent: no");
    expect(context).toContain("- last-approval-cache-effect: none");
    expect(context).toContain(
      `- recent-failed-files: ${fixture.targetFile} (${fixture.failureReason})`,
    );
    expect(context).toContain(
      `- last-verification-next-action: ${fixture.nextAction}`,
    );
  });

  it("persists append-before-model-call barrier before query events begin", () => {
    const manager = new SessionManager();
    const session = manager.createNew();

    manager.persistUserPromptBarrier(session.id, "barrier prompt");

    const transcriptEvents = manager.getTranscriptEvents(session.id);
    expect(transcriptEvents[0]).toMatchObject({
      type: "lifecycle",
      event: "run-started",
    });
    expect(transcriptEvents[1]).toMatchObject({
      type: "message",
      content: "barrier prompt",
    });

    const snapshot = manager.getRecoverySnapshot(session.id);
    expect(snapshot.pendingPrompt).toBe("barrier prompt");
    expect(snapshot.runPhase).toBe("prompt-persisted");
  });

  it("builds a replay plan for interrupted turns with continuation prompt", () => {
    const manager = new SessionManager();
    const session = manager.createNew();

    manager.persistUserPromptBarrier(session.id, "initial prompt");
    manager.markTurnActive(session.id);
    manager.appendQueryEvent(session.id, {
      type: "query.started",
      sessionId: session.id,
      prompt: "initial prompt",
    });
    manager.saveInterrupted(session.id, "turn");

    const replayPlan = manager.getReplayPlan(session.id);
    expect(replayPlan.continuationPrompt).toBe(
      "Continue from where you left off.",
    );
    expect(replayPlan.replayMessages[0].content).toBe("initial prompt");
    expect(replayPlan.requiresAssistantSentinel).toBe(true);
  });

  it("persists terminal classification into state.json for completed and error runs", () => {
    const manager = new SessionManager();
    const completed = manager.createNew();
    manager.markRunStarted(completed.id, "done prompt");
    manager.saveCompleted(completed.id, {
      terminalReason: "completed",
      terminalClassification: "success",
      lastContinuationReason: "handoff",
    });

    const completedState = JSON.parse(
      fs.readFileSync(
        path.join(manager.getSessionDirPath(completed.id), "state.json"),
        "utf8",
      ),
    ) as {
      terminalReason?: string;
      terminalClassification?: string;
      durableStatus?: string;
      lastContinuationReason?: string;
    };

    expect(completedState.terminalReason).toBe("completed");
    expect(completedState.terminalClassification).toBe("success");
    expect(completedState.durableStatus).toBe("success");
    expect(completedState.lastContinuationReason).toBe("handoff");

    const completedSnapshot = manager.getRecoverySnapshot(completed.id);
    expect(completedSnapshot.durableStatus).toBe("success");
    expect(completedSnapshot.terminalReason).toBe("completed");
    expect(completedSnapshot.terminalClassification).toBe("success");
    expect(completedSnapshot.lastContinuationReason).toBe("handoff");

    const errored = manager.createNew();
    manager.markRunStarted(errored.id, "retry prompt");
    manager.saveError(errored.id, "Retry budget exhausted", {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
      lastContinuationReason: "retryable-error",
    });

    const errorState = JSON.parse(
      fs.readFileSync(
        path.join(manager.getSessionDirPath(errored.id), "state.json"),
        "utf8",
      ),
    ) as {
      terminalReason?: string;
      terminalClassification?: string;
      durableStatus?: string;
      lastContinuationReason?: string;
      pendingPrompt?: string;
      lastError?: string;
    };

    expect(errorState.terminalReason).toBe("stopped_error");
    expect(errorState.terminalClassification).toBe("stopped");
    expect(errorState.durableStatus).toBe("stopped");
    expect(errorState.lastContinuationReason).toBe("retryable-error");
    expect(errorState.pendingPrompt).toBeUndefined();
    expect(errorState.lastError).toBeUndefined();

    const erroredSnapshot = manager.getRecoverySnapshot(errored.id);
    expect(erroredSnapshot.durableStatus).toBe("stopped");
    expect(erroredSnapshot.terminalReason).toBe("stopped_error");
    expect(erroredSnapshot.terminalClassification).toBe("stopped");

    manager.markRunStarted(errored.id, "fresh prompt");
    const resetState = JSON.parse(
      fs.readFileSync(
        path.join(manager.getSessionDirPath(errored.id), "state.json"),
        "utf8",
      ),
    ) as {
      terminalReason?: string;
      terminalClassification?: string;
      durableStatus?: string;
      lastContinuationReason?: string;
      lastError?: string;
    };

    expect(resetState.terminalReason).toBeUndefined();
    expect(resetState.terminalClassification).toBeUndefined();
    expect(resetState.durableStatus).toBeUndefined();
    expect(resetState.lastContinuationReason).toBeUndefined();
    expect(resetState.lastError).toBeUndefined();
  });

  it("preserves lastError only for true durable errors", () => {
    const manager = new SessionManager();
    const stopped = manager.createNew();
    manager.markRunStarted(stopped.id, "stop prompt");
    manager.saveError(stopped.id, "Retry budget exhausted", {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
    });

    const stoppedState = JSON.parse(
      fs.readFileSync(
        path.join(manager.getSessionDirPath(stopped.id), "state.json"),
        "utf8",
      ),
    ) as {
      status: string;
      lastError?: string;
      terminalClassification?: string;
      durableStatus?: string;
    };
    expect(stoppedState.status).toBe("error");
    expect(stoppedState.terminalClassification).toBe("stopped");
    expect(stoppedState.durableStatus).toBe("stopped");
    expect(stoppedState.lastError).toBeUndefined();

    const failed = manager.createNew();
    manager.markRunStarted(failed.id, "fail prompt");
    manager.saveError(failed.id, "Transport exploded", {
      terminalReason: "stopped_error",
      terminalClassification: "error",
    });

    const failedState = JSON.parse(
      fs.readFileSync(
        path.join(manager.getSessionDirPath(failed.id), "state.json"),
        "utf8",
      ),
    ) as {
      status: string;
      lastError?: string;
      terminalClassification?: string;
      durableStatus?: string;
    };
    expect(failedState.status).toBe("error");
    expect(failedState.terminalClassification).toBe("error");
    expect(failedState.durableStatus).toBe("error");
    expect(failedState.lastError).toBe("Transport exploded");
  });

  it("filters empty assistant messages from replay normalization", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const transcriptPath = path.join(
      manager.getSessionDirPath(session.id),
      "transcript.jsonl",
    );

    fs.appendFileSync(
      transcriptPath,
      `${JSON.stringify({ type: "message", role: "assistant", content: "   ", timestamp: new Date().toISOString() })}\n`,
      "utf8",
    );
    fs.appendFileSync(
      transcriptPath,
      `${JSON.stringify({ type: "message", role: "user", content: "real", timestamp: new Date().toISOString() })}\n`,
      "utf8",
    );

    const replayPlan = manager.getReplayPlan(session.id);
    expect(replayPlan.replayMessages).toHaveLength(1);
    expect(replayPlan.replayMessages[0].content).toBe("real");
  });

  it("repairs orphaned interrupted transcript state into a replayable plan", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const sessionDir = manager.getSessionDirPath(session.id);
    const transcriptPath = path.join(sessionDir, "transcript.jsonl");
    const statePath = path.join(sessionDir, "state.json");

    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          type: "lifecycle",
          event: "run-started",
          timestamp: new Date().toISOString(),
          detail: "repair me",
        }),
        JSON.stringify({
          type: "query-event",
          event: {
            type: "tool.started",
            toolName: "read",
            taskId: "task_orphan",
          },
          timestamp: new Date().toISOString(),
        }),
        JSON.stringify({
          type: "query-event",
          event: {
            type: "query.completed",
            result: {
              status: "completed",
              terminalReason: "completed",
              terminalClassification: "success",
              transcript: [],
              sharedContext: {
                sessionId: session.id,
                initialPrompt: "repair me",
                notes: [],
                handoffs: [],
              },
              finalOutput: "orphaned",
            },
          },
          timestamp: new Date().toISOString(),
        }),
      ].join("\n") + "\n",
      "utf8",
    );
    fs.writeFileSync(
      statePath,
      JSON.stringify(
        {
          status: "interrupted",
          pendingPrompt: "repair me",
          runPhase: "turn-active",
          interruptedKind: "turn",
        },
        null,
        2,
      ),
      "utf8",
    );

    const replayPlan = manager.getReplayPlan(session.id);

    expect(replayPlan.replayMessages[0]).toMatchObject({
      role: "user",
      content: "repair me",
    });
    expect(
      replayPlan.normalizedTranscriptEvents.some(
        (event) =>
          event.type === "query-event" && event.event.type === "query.started",
      ),
    ).toBe(true);
    expect(
      replayPlan.normalizedTranscriptEvents.some(
        (event) =>
          event.type === "query-event" &&
          event.event.type === "query.completed",
      ),
    ).toBe(false);
    expect(
      replayPlan.normalizedTranscriptEvents.some(
        (event) =>
          event.type === "lifecycle" && event.event === "run-interrupted",
      ),
    ).toBe(true);
  });

  it("repairs transcript state idempotently across repeated replay planning", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const sessionDir = manager.getSessionDirPath(session.id);
    const transcriptPath = path.join(sessionDir, "transcript.jsonl");
    const statePath = path.join(sessionDir, "state.json");

    fs.writeFileSync(
      transcriptPath,
      `${JSON.stringify({
        type: "query-event",
        event: {
          type: "tool.started",
          toolName: "read",
          taskId: "task_repeat",
        },
        timestamp: new Date().toISOString(),
      })}\n`,
      "utf8",
    );
    fs.writeFileSync(
      statePath,
      JSON.stringify(
        {
          status: "interrupted",
          pendingPrompt: "repeat me",
          runPhase: "turn-active",
          interruptedKind: "turn",
        },
        null,
        2,
      ),
      "utf8",
    );

    const first = manager.getReplayPlan(session.id);
    const second = manager.getReplayPlan(session.id);

    expect(second).toEqual(first);
    expect(
      first.normalizedTranscriptEvents.filter(
        (event) =>
          event.type === "query-event" && event.event.type === "query.started",
      ),
    ).toHaveLength(1);
    expect(
      first.normalizedTranscriptEvents.filter(
        (event) =>
          event.type === "message" &&
          event.role === "user" &&
          event.content === "repeat me",
      ),
    ).toHaveLength(1);
    expect(
      first.normalizedTranscriptEvents.filter(
        (event) =>
          event.type === "lifecycle" && event.event === "run-interrupted",
      ),
    ).toHaveLength(1);
    expect(second.repairSummary).toEqual(first.repairSummary);
  });

  it("builds a runtime state seed from durable replay state", () => {
    const manager = new SessionManager();
    const session = manager.createNew();

    manager.persistUserPromptBarrier(session.id, "recover feature");
    manager.markTurnActive(session.id);
    manager.appendQueryEvent(session.id, {
      type: "query.started",
      sessionId: session.id,
      prompt: "recover feature",
    });
    manager.appendQueryEvent(session.id, {
      type: "turn.started",
      role: "planner",
      turn: 1,
    });
    manager.appendQueryEvent(session.id, {
      type: "turn.completed",
      output: {
        role: "planner",
        content: "plan",
        handoffTo: "coder",
        handoffReason: "plan-ready",
        notes: ["planner-note"],
      },
    });
    manager.appendQueryEvent(session.id, {
      type: "turn.started",
      role: "coder",
      turn: 2,
    });
    manager.appendQueryEvent(session.id, {
      type: "approval.requested",
      toolName: "bash",
      taskId: "task_pending_approval",
    });
    manager.appendQueryEvent(session.id, {
      type: "tool.started",
      toolName: "read",
      taskId: "task_pending_tool",
    });
    manager.saveInterrupted(session.id, "turn");

    const seed = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 });

    expect(seed.recoveryBoundary).toBe("completed-turn-reentry");
    expect(seed.currentRole).toBe("coder");
    expect(seed.turn).toBe(2);
    expect(seed.derivedState.transcript).toHaveLength(1);
    expect(
      seed.pendingLifecycle.pendingApprovals.task_pending_approval?.toolName,
    ).toBe("bash");
    expect(seed.pendingLifecycle.pendingTools.task_pending_tool?.toolName).toBe(
      "read",
    );
    expect(seed.truthBoundary.source).toBe("durable-replay");
    expect(seed.truthBoundary.continuationSafety).toBe("completed-turn-only");
    expect(seed.truthBoundary.policyEvidence.has("open-turn")).toBe(true);
    expect(seed.truthBoundary.policyEvidence.has("paired-turns")).toBe(true);
    expect(seed.truthBoundary.policyEvidence.has("pending-lifecycle")).toBe(
      true,
    );
    expect(seed.truthBoundary.policyEvidence.has("repair-drift")).toBe(false);
    expect(Object.keys(seed.derivedState)).toEqual(["transcript"]);
  });

  it("classifies completed-turn re-entry from paired turn events without relying on turn counts", () => {
    const manager = new SessionManager();
    const session = manager.createNew();

    manager.persistUserPromptBarrier(session.id, "resume after completed turn");
    manager.markTurnActive(session.id);
    manager.appendQueryEvent(session.id, {
      type: "query.started",
      sessionId: session.id,
      prompt: "resume after completed turn",
    });
    manager.appendQueryEvent(session.id, {
      type: "turn.started",
      role: "planner",
      turn: 1,
    });
    manager.appendQueryEvent(session.id, {
      type: "turn.completed",
      output: {
        role: "planner",
        content: "plan",
        handoffTo: "coder",
        handoffReason: "ready-for-code",
      },
    });
    manager.saveInterrupted(session.id, "turn");

    const seed = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 });

    expect(seed.recoveryBoundary).toBe("completed-turn-reentry");
    expect(seed.currentRole).toBe("coder");
    expect(seed.turn).toBe(2);
    expect(seed.derivedState.transcript).toHaveLength(1);
    expect(seed.truthBoundary.continuationSafety).toBe("completed-turn-only");
    expect(seed.truthBoundary.policyEvidence.has("open-turn")).toBe(false);
    expect(seed.truthBoundary.policyEvidence.has("paired-turns")).toBe(true);
    expect(seed.truthBoundary.policyEvidence.has("pending-lifecycle")).toBe(
      false,
    );
    expect(seed.truthBoundary.policyEvidence.has("repair-drift")).toBe(false);
  });

  it("classifies fresh-entry when no turn has started yet", () => {
    const manager = new SessionManager();
    const session = manager.createNew();

    manager.persistUserPromptBarrier(session.id, "fresh prompt");
    manager.saveInterrupted(session.id, "prompt");

    const seed = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 });

    expect(seed.recoveryBoundary).toBe("fresh-entry");
    expect(seed.currentRole).toBe("planner");
    expect(seed.turn).toBe(1);
    expect(seed.derivedState.transcript).toHaveLength(0);
    expect(seed.truthBoundary.continuationSafety).toBe("fresh-only");
    expect(seed.truthBoundary.policyEvidence.has("open-turn")).toBe(false);
    expect(seed.truthBoundary.policyEvidence.has("paired-turns")).toBe(false);
    expect(seed.truthBoundary.policyEvidence.has("pending-lifecycle")).toBe(
      false,
    );
    expect(seed.truthBoundary.policyEvidence.has("repair-drift")).toBe(false);
  });

  it("keeps recovery boundary stable across repeated seed builds for the same open turn", () => {
    const manager = new SessionManager();
    const session = manager.createNew();

    manager.persistUserPromptBarrier(session.id, "repeat boundary");
    manager.markTurnActive(session.id);
    manager.appendQueryEvent(session.id, {
      type: "turn.started",
      role: "coder",
      turn: 2,
    });
    manager.saveInterrupted(session.id, "turn");

    const first = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 });
    const second = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 });

    expect(first.recoveryBoundary).toBe("mid-turn-reentry");
    expect(second.recoveryBoundary).toBe("mid-turn-reentry");
    expect(second.currentRole).toBe(first.currentRole);
    expect(second.turn).toBe(first.turn);
    expect(Array.from(second.truthBoundary.policyEvidence).sort()).toEqual(
      Array.from(first.truthBoundary.policyEvidence).sort(),
    );
    expect(second.truthBoundary.continuationSafety).toBe(
      first.truthBoundary.continuationSafety,
    );
    expect(second.truthBoundary.openTurn).toEqual(first.truthBoundary.openTurn);
    expect(second.truthBoundary.repairSummary).toEqual(
      first.truthBoundary.repairSummary,
    );
  });

  it("computes continuation safety from the shared policy table when unresolved lifecycle exists", () => {
    const manager = new SessionManager();
    const session = manager.createNew();

    manager.persistUserPromptBarrier(session.id, "policy pending prompt");
    manager.markTurnActive(session.id);
    manager.appendQueryEvent(session.id, {
      type: "turn.started",
      role: "planner",
      turn: 1,
    });
    manager.appendQueryEvent(session.id, {
      type: "approval.requested",
      toolName: "bash",
      taskId: "task_pending_policy",
    });
    manager.saveInterrupted(session.id, "turn");

    const seed = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 });

    expect(seed.truthBoundary.continuationSafety).toBe("fresh-only");
    expect(seed.truthBoundary.policyEvidence.has("open-turn")).toBe(true);
    expect(seed.truthBoundary.policyEvidence.has("paired-turns")).toBe(false);
    expect(seed.truthBoundary.policyEvidence.has("pending-lifecycle")).toBe(
      true,
    );
    expect(seed.truthBoundary.policyEvidence.has("repair-drift")).toBe(false);
    expect(seed.recoveryBoundary).toBe("fresh-entry");
    expect(seed.currentRole).toBe("planner");
    expect(seed.turn).toBe(1);
  });

  it("reports replay repair and drift summary deterministically without mutating transcript truth", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const sessionDir = manager.getSessionDirPath(session.id);
    const transcriptPath = path.join(sessionDir, "transcript.jsonl");
    const statePath = path.join(sessionDir, "state.json");

    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          type: "lifecycle",
          event: "run-started",
          timestamp: "2026-01-01T00:00:00.000Z",
          detail: "repair drift",
        }),
        JSON.stringify({
          type: "query-event",
          event: { type: "turn.started", role: "planner", turn: 1 },
          timestamp: "2026-01-01T00:00:01.000Z",
        }),
        JSON.stringify({
          type: "query-event",
          event: { type: "turn.started", role: "coder", turn: 2 },
          timestamp: "2026-01-01T00:00:02.000Z",
        }),
        JSON.stringify({
          type: "query-event",
          event: {
            type: "turn.completed",
            output: { role: "reviewer", content: "mismatch" },
          },
          timestamp: "2026-01-01T00:00:03.000Z",
        }),
      ].join("\n") + "\n",
      "utf8",
    );
    fs.writeFileSync(
      statePath,
      JSON.stringify(
        {
          status: "interrupted",
          pendingPrompt: "repair drift",
          runPhase: "turn-active",
          interruptedKind: "turn",
        },
        null,
        2,
      ),
      "utf8",
    );

    const first = manager.getReplayPlan(session.id);
    const second = manager.getReplayPlan(session.id);
    const seed = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 });

    expect(second).toEqual(first);
    expect(first.repairSummary).toEqual({
      insertedPromptMessage: true,
      insertedQueryStarted: true,
      strippedInterruptedTerminalEvents: 0,
      insertedRunInterrupted: true,
      ignoredDuplicateTurnStarts: 1,
      ignoredUnpairedTurnCompletions: 0,
      ignoredRoleMismatchedTurnCompletions: 1,
    });
    expect(seed.recoveryBoundary).toBe("fresh-entry");
    expect(seed.truthBoundary.source).toBe("durable-replay");
    expect(seed.truthBoundary.normalizedEventCount).toBe(
      first.normalizedTranscriptEvents.length,
    );
    expect(seed.truthBoundary.pairedTurnCount).toBe(0);
    expect(seed.truthBoundary.policyEvidence.has("open-turn")).toBe(true);
    expect(seed.truthBoundary.policyEvidence.has("paired-turns")).toBe(false);
    expect(seed.truthBoundary.policyEvidence.has("pending-lifecycle")).toBe(
      false,
    );
    expect(seed.truthBoundary.policyEvidence.has("repair-drift")).toBe(true);
    expect(seed.truthBoundary.repairSummary).toEqual(first.repairSummary);
    expect(seed.truthBoundary.continuationSafety).toBe("fresh-only");
    expect(seed.truthBoundary.openTurn).toBeUndefined();
    expect(seed.derivedState).toEqual({
      transcript: [],
    });
  });

  it("keeps stripped interrupted terminal counts aligned between replay plan and runtime seed truth boundary", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const sessionDir = manager.getSessionDirPath(session.id);
    const transcriptPath = path.join(sessionDir, "transcript.jsonl");
    const statePath = path.join(sessionDir, "state.json");

    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          type: "lifecycle",
          event: "run-started",
          timestamp: "2026-01-01T00:00:00.000Z",
          detail: "strip terminal event",
        }),
        JSON.stringify({
          type: "query-event",
          event: {
            type: "query.started",
            sessionId: session.id,
            prompt: "strip terminal event",
          },
          timestamp: "2026-01-01T00:00:01.000Z",
        }),
        JSON.stringify({
          type: "query-event",
          event: {
            type: "query.completed",
            result: {
              status: "completed",
              terminalReason: "completed",
              terminalClassification: "success",
              transcript: [],
              sharedContext: {
                sessionId: session.id,
                initialPrompt: "strip terminal event",
                notes: [],
                handoffs: [],
              },
              finalOutput: "done",
            },
          },
          timestamp: "2026-01-01T00:00:02.000Z",
        }),
      ].join("\n") + "\n",
      "utf8",
    );
    fs.writeFileSync(
      statePath,
      JSON.stringify(
        {
          status: "interrupted",
          pendingPrompt: "strip terminal event",
          runPhase: "turn-active",
          interruptedKind: "turn",
        },
        null,
        2,
      ),
      "utf8",
    );

    const replayPlan = manager.getReplayPlan(session.id);
    const seed = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 });

    expect(
      replayPlan.normalizedTranscriptEvents.some(
        (event) =>
          event.type === "query-event" &&
          (event.event.type === "query.completed" ||
            event.event.type === "query.failed"),
      ),
    ).toBe(false);
    expect(replayPlan.repairSummary.strippedInterruptedTerminalEvents).toBe(1);
    expect(
      seed.truthBoundary.repairSummary.strippedInterruptedTerminalEvents,
    ).toBe(1);
    expect(seed.truthBoundary.normalizedEventCount).toBe(
      replayPlan.normalizedTranscriptEvents.length,
    );
    expect(seed.truthBoundary.repairSummary).toEqual(replayPlan.repairSummary);
  });

  it("derives recovery snapshot and runtime seed pending lifecycle from transcript truth instead of stale state", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const transcriptPath = path.join(
      manager.getSessionDirPath(session.id),
      "transcript.jsonl",
    );
    const statePath = path.join(
      manager.getSessionDirPath(session.id),
      "state.json",
    );

    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          type: "message",
          role: "user",
          content: "repair read-model prompt",
          timestamp: "2026-01-01T00:00:00.000Z",
        }),
        JSON.stringify({
          type: "query-event",
          event: {
            type: "approval.requested",
            toolName: "bash",
            taskId: "task_read_approval",
          },
          timestamp: "2026-01-01T00:00:01.000Z",
        }),
        JSON.stringify({
          type: "query-event",
          event: {
            type: "approval.resolved",
            toolName: "bash",
            taskId: "task_read_approval",
            outcome: "approved",
          },
          timestamp: "2026-01-01T00:00:02.000Z",
        }),
        JSON.stringify({
          type: "query-event",
          event: {
            type: "tool.started",
            toolName: "read",
            taskId: "task_read_tool",
          },
          timestamp: "2026-01-01T00:00:03.000Z",
        }),
        JSON.stringify({
          type: "query-event",
          event: {
            type: "tool.result",
            toolName: "read",
            taskId: "task_read_tool",
            success: true,
          },
          timestamp: "2026-01-01T00:00:04.000Z",
        }),
      ].join("\n") + "\n",
      "utf8",
    );
    fs.writeFileSync(
      statePath,
      JSON.stringify(
        {
          status: "interrupted",
          pendingPrompt: "repair read-model prompt",
          runPhase: "turn-active",
          interruptedKind: "turn",
          pendingLifecycle: {
            pendingApprovals: {
              task_read_approval: {
                taskId: "task_read_approval",
                toolName: "bash",
              },
            },
            pendingTools: {
              task_read_tool: { taskId: "task_read_tool", toolName: "read" },
            },
            taskStates: {},
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const snapshot = manager.getRecoverySnapshot(session.id);
    const seed = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 });

    expect(snapshot.pendingLifecycle.pendingApprovals).toEqual({});
    expect(snapshot.pendingLifecycle.pendingTools).toEqual({});
    expect(
      snapshot.pendingLifecycle.taskStates.task_read_approval,
    ).toMatchObject({
      lastEvent: "approval.resolved",
      outcome: "approved",
      toolName: "bash",
      taskId: "task_read_approval",
    });
    expect(snapshot.pendingLifecycle.taskStates.task_read_tool).toMatchObject({
      lastEvent: "tool.result",
      success: true,
      toolName: "read",
      taskId: "task_read_tool",
    });
    expect(seed.pendingLifecycle).toEqual(snapshot.pendingLifecycle);
    expect(seed.truthBoundary.policyEvidence.has("pending-lifecycle")).toBe(
      false,
    );
  });

  it("tracks pending lifecycle durably and clears it when resolved or restarted", () => {
    const manager = new SessionManager();
    const session = manager.createNew();

    manager.persistUserPromptBarrier(session.id, "lifecycle prompt");
    manager.appendQueryEvent(session.id, {
      type: "approval.requested",
      toolName: "bash",
      taskId: "task_approval",
    });
    manager.appendQueryEvent(session.id, {
      type: "tool.started",
      toolName: "read",
      taskId: "task_tool",
    });

    let snapshot = manager.getRecoverySnapshot(session.id);
    expect(
      snapshot.pendingLifecycle.pendingApprovals.task_approval?.toolName,
    ).toBe("bash");
    expect(snapshot.pendingLifecycle.pendingTools.task_tool?.toolName).toBe(
      "read",
    );
    expect(snapshot.pendingLifecycle.taskStates.task_approval?.lastEvent).toBe(
      "approval.requested",
    );
    expect(snapshot.pendingLifecycle.taskStates.task_tool?.lastEvent).toBe(
      "tool.started",
    );

    manager.appendQueryEvent(session.id, {
      type: "approval.resolved",
      toolName: "bash",
      taskId: "task_approval",
      outcome: "denied",
      compensated: true,
    });
    manager.appendQueryEvent(session.id, {
      type: "tool.result",
      toolName: "read",
      taskId: "task_tool",
      success: false,
      compensated: true,
    });

    snapshot = manager.getRecoverySnapshot(session.id);
    expect(
      snapshot.pendingLifecycle.pendingApprovals.task_approval,
    ).toBeUndefined();
    expect(snapshot.pendingLifecycle.pendingTools.task_tool).toBeUndefined();
    expect(snapshot.pendingLifecycle.taskStates.task_approval?.lastEvent).toBe(
      "approval.resolved",
    );
    expect(snapshot.pendingLifecycle.taskStates.task_tool?.lastEvent).toBe(
      "tool.result",
    );

    manager.markRunStarted(session.id, "fresh run");
    snapshot = manager.getRecoverySnapshot(session.id);
    expect(snapshot.pendingLifecycle.pendingApprovals).toEqual({});
    expect(snapshot.pendingLifecycle.pendingTools).toEqual({});
    expect(snapshot.pendingLifecycle.taskStates.task_approval).toMatchObject({
      lastEvent: "approval.resolved",
      compensated: true,
      outcome: "denied",
    });
    expect(snapshot.pendingLifecycle.taskStates.task_tool).toMatchObject({
      lastEvent: "tool.result",
      compensated: true,
      success: false,
    });
  });

  it("reconcilePendingLifecycle is idempotent across repeated calls", () => {
    const manager = new SessionManager();
    const session = manager.createNew();

    manager.persistUserPromptBarrier(session.id, "reconcile prompt");
    manager.appendQueryEvent(session.id, {
      type: "approval.requested",
      toolName: "bash",
      taskId: "task_repeat_approval",
    });
    manager.appendQueryEvent(session.id, {
      type: "tool.started",
      toolName: "read",
      taskId: "task_repeat_tool",
    });

    const first = manager.reconcilePendingLifecycle(session.id);
    const second = manager.reconcilePendingLifecycle(session.id);

    expect(first).toEqual({
      pendingApprovals: {},
      pendingTools: {},
      taskStates: {
        task_repeat_approval: {
          taskId: "task_repeat_approval",
          toolName: "bash",
          lastEvent: "approval.resolved",
          outcome: "denied",
          compensated: true,
        },
        task_repeat_tool: {
          taskId: "task_repeat_tool",
          toolName: "read",
          lastEvent: "tool.result",
          success: false,
          compensated: true,
        },
      },
    });
    expect(second).toEqual(first);

    const transcriptEvents = manager.getTranscriptEvents(session.id);
    expect(
      transcriptEvents.filter(
        (event) =>
          event.type === "query-event" &&
          event.event.type === "approval.resolved" &&
          event.event.taskId === "task_repeat_approval",
      ),
    ).toHaveLength(1);
    expect(
      transcriptEvents.filter(
        (event) =>
          event.type === "query-event" &&
          event.event.type === "tool.result" &&
          event.event.taskId === "task_repeat_tool",
      ),
    ).toHaveLength(1);
  });

  it("reconcilePendingLifecycle reuses existing compensated transcript events without duplicating them", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const transcriptPath = path.join(
      manager.getSessionDirPath(session.id),
      "transcript.jsonl",
    );
    const statePath = path.join(
      manager.getSessionDirPath(session.id),
      "state.json",
    );

    manager.persistUserPromptBarrier(session.id, "drift reconcile prompt");
    manager.appendQueryEvent(session.id, {
      type: "approval.requested",
      toolName: "bash",
      taskId: "task_drift_approval",
    });
    manager.appendQueryEvent(session.id, {
      type: "tool.started",
      toolName: "read",
      taskId: "task_drift_tool",
    });

    fs.appendFileSync(
      transcriptPath,
      `${JSON.stringify({
        type: "query-event",
        event: {
          type: "approval.resolved",
          toolName: "bash",
          taskId: "task_drift_approval",
          outcome: "denied",
          compensated: true,
        },
        timestamp: new Date().toISOString(),
      })}\n`,
      "utf8",
    );
    fs.appendFileSync(
      transcriptPath,
      `${JSON.stringify({
        type: "query-event",
        event: {
          type: "tool.result",
          toolName: "read",
          taskId: "task_drift_tool",
          success: false,
          compensated: true,
        },
        timestamp: new Date().toISOString(),
      })}\n`,
      "utf8",
    );

    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      pendingLifecycle: {
        pendingApprovals: Record<string, { taskId: string; toolName: string }>;
        pendingTools: Record<string, { taskId: string; toolName: string }>;
        taskStates: Record<string, unknown>;
      };
    };

    expect(
      state.pendingLifecycle.pendingApprovals.task_drift_approval?.toolName,
    ).toBe("bash");
    expect(state.pendingLifecycle.pendingTools.task_drift_tool?.toolName).toBe(
      "read",
    );

    const reconciled = manager.reconcilePendingLifecycle(session.id);
    expect(reconciled.pendingApprovals).toEqual({});
    expect(reconciled.pendingTools).toEqual({});
    expect(reconciled.taskStates.task_drift_approval).toMatchObject({
      lastEvent: "approval.resolved",
      compensated: true,
      outcome: "denied",
    });
    expect(reconciled.taskStates.task_drift_tool).toMatchObject({
      lastEvent: "tool.result",
      compensated: true,
      success: false,
    });

    const transcriptEvents = manager.getTranscriptEvents(session.id);
    expect(
      transcriptEvents.filter(
        (event) =>
          event.type === "query-event" &&
          event.event.type === "approval.resolved" &&
          event.event.taskId === "task_drift_approval",
      ),
    ).toHaveLength(1);
    expect(
      transcriptEvents.filter(
        (event) =>
          event.type === "query-event" &&
          event.event.type === "tool.result" &&
          event.event.taskId === "task_drift_tool",
      ),
    ).toHaveLength(1);
  });

  it("reconcilePendingLifecycle does not append synthetic cleanup when direct tool.result already exists", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const transcriptPath = path.join(
      manager.getSessionDirPath(session.id),
      "transcript.jsonl",
    );
    const taskId = "task_direct_tool";

    manager.persistUserPromptBarrier(session.id, "duplication guard prompt");
    manager.appendQueryEvent(session.id, {
      type: "tool.started",
      toolName: "read",
      taskId,
    });

    const before = manager.getRecoverySnapshot(session.id);
    expect(before.pendingLifecycle.pendingTools[taskId]?.toolName).toBe("read");

    fs.appendFileSync(
      transcriptPath,
      `${JSON.stringify({
        type: "query-event",
        event: {
          type: "tool.result",
          toolName: "read",
          taskId,
          success: true,
        },
        timestamp: new Date().toISOString(),
      })}\n`,
      "utf8",
    );

    const transcriptBefore = manager.getTranscriptEvents(session.id);
    expect(
      transcriptBefore.filter(
        (event) =>
          event.type === "query-event" &&
          event.event.type === "tool.result" &&
          event.event.taskId === taskId,
      ),
    ).toHaveLength(1);

    const reconciled = manager.reconcilePendingLifecycle(session.id);
    expect(reconciled.pendingTools[taskId]).toBeUndefined();
    expect(reconciled.taskStates[taskId]).toMatchObject({
      lastEvent: "tool.result",
      success: true,
      toolName: "read",
      taskId,
    });

    const transcriptAfter = manager.getTranscriptEvents(session.id);
    expect(
      transcriptAfter.filter(
        (event) =>
          event.type === "query-event" &&
          event.event.type === "tool.result" &&
          event.event.taskId === taskId,
      ),
    ).toHaveLength(1);
  });

  it("reconcilePendingLifecycle does not append compensated denial when direct approval.resolved already exists", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const transcriptPath = path.join(
      manager.getSessionDirPath(session.id),
      "transcript.jsonl",
    );
    const taskId = "task_direct_approval";

    manager.persistUserPromptBarrier(session.id, "approval drift prompt");
    manager.appendQueryEvent(session.id, {
      type: "approval.requested",
      toolName: "bash",
      taskId,
    });

    const before = manager.getRecoverySnapshot(session.id);
    expect(before.pendingLifecycle.pendingApprovals[taskId]?.toolName).toBe(
      "bash",
    );

    fs.appendFileSync(
      transcriptPath,
      `${JSON.stringify({
        type: "query-event",
        event: {
          type: "approval.resolved",
          toolName: "bash",
          taskId,
          outcome: "approved",
        },
        timestamp: new Date().toISOString(),
      })}\n`,
      "utf8",
    );

    const transcriptBefore = manager.getTranscriptEvents(session.id);
    expect(
      transcriptBefore.filter(
        (event) =>
          event.type === "query-event" &&
          event.event.type === "approval.resolved" &&
          event.event.taskId === taskId,
      ),
    ).toHaveLength(1);

    const reconciled = manager.reconcilePendingLifecycle(session.id);
    expect(reconciled.pendingApprovals[taskId]).toBeUndefined();
    expect(reconciled.taskStates[taskId]).toMatchObject({
      lastEvent: "approval.resolved",
      outcome: "approved",
      toolName: "bash",
      taskId,
    });
    expect(reconciled.taskStates[taskId]?.compensated).toBeUndefined();

    const transcriptAfter = manager.getTranscriptEvents(session.id);
    expect(
      transcriptAfter.filter(
        (event) =>
          event.type === "query-event" &&
          event.event.type === "approval.resolved" &&
          event.event.taskId === taskId,
      ),
    ).toHaveLength(1);
  });

  it("appendQueryEvent is idempotent for identical direct resolution events", () => {
    const manager = new SessionManager();
    const session = manager.createNew();

    manager.appendQueryEvent(session.id, {
      type: "approval.resolved",
      toolName: "bash",
      taskId: "task_append_approval",
      outcome: "approved",
    });
    manager.appendQueryEvent(session.id, {
      type: "approval.resolved",
      toolName: "bash",
      taskId: "task_append_approval",
      outcome: "approved",
    });

    manager.appendQueryEvent(session.id, {
      type: "tool.result",
      toolName: "read",
      taskId: "task_append_tool",
      success: true,
    });
    manager.appendQueryEvent(session.id, {
      type: "tool.result",
      toolName: "read",
      taskId: "task_append_tool",
      success: true,
    });

    const transcriptEvents = manager.getTranscriptEvents(session.id);
    expect(
      transcriptEvents.filter(
        (event) =>
          event.type === "query-event" &&
          event.event.type === "approval.resolved" &&
          event.event.taskId === "task_append_approval",
      ),
    ).toHaveLength(1);
    expect(
      transcriptEvents.filter(
        (event) =>
          event.type === "query-event" &&
          event.event.type === "tool.result" &&
          event.event.taskId === "task_append_tool",
      ),
    ).toHaveLength(1);

    const snapshot = manager.getRecoverySnapshot(session.id);
    expect(
      snapshot.pendingLifecycle.taskStates.task_append_approval,
    ).toMatchObject({
      lastEvent: "approval.resolved",
      outcome: "approved",
      toolName: "bash",
      taskId: "task_append_approval",
    });
    expect(snapshot.pendingLifecycle.taskStates.task_append_tool).toMatchObject(
      {
        lastEvent: "tool.result",
        success: true,
        toolName: "read",
        taskId: "task_append_tool",
      },
    );
  });

  it("preserves edit patch stopped failure recovery details in continuity context", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const stopReason =
      "patch-from-not-found: Source text was not found in docs/failed-edit.md.";
    const nextAction =
      "Re-read docs/failed-edit.md, then rerun with the exact current text to replace.";

    manager.markRunStarted(session.id, "continue failed edit");
    manager.addTurn(session.id, {
      role: "user",
      content: "replace old text in docs/failed-edit.md",
    });
    manager.appendQueryEvent(session.id, {
      type: "query.completed",
      result: {
        status: "stopped_error",
        terminalReason: "stopped_error",
        terminalClassification: "stopped",
        stopReason,
        transcript: [],
        sharedContext: {
          sessionId: session.id,
          initialPrompt: "replace old text in docs/failed-edit.md",
          notes: [],
          handoffs: [],
        },
        finalOutput: "",
        codingResult: {
          taskKind: "edit-file",
          changedFiles: [],
          failedFiles: [
            {
              path: "docs/failed-edit.md",
              reason: stopReason,
            },
          ],
          patches: [
            {
              path: "docs/failed-edit.md",
              operation: "replace",
              status: "failed",
              failureCode: "patch-from-not-found",
              reason: stopReason,
            },
          ],
          repair: {
            status: "failed",
            attempts: 1,
            recoveredItems: [],
            failedItems: ["docs/failed-edit.md"],
            notes: [`${stopReason} Next action: ${nextAction}`],
          },
          continuation: {
            status: "failed-after-bounded-continuation",
            attempts: 1,
            evidence: ["actionable-blocker-kind:patch-from-not-found"],
          },
          changeSet: {
            gitAware: false,
            preExistingDirtyFiles: [],
            postRunDirtyFiles: [],
            attemptedFiles: ["docs/failed-edit.md"],
            changedFiles: [],
            unchangedAttemptedFiles: ["docs/failed-edit.md"],
          },
          taskSatisfaction: {
            verdict: "completed-with-caveats",
            reasons: [stopReason],
            requiredEvidence: ["inspect->edit->verify contract execution"],
            observedEvidence: ["actionable-blocker-kind:patch-from-not-found"],
          },
          verifiedFiles: [],
          unverifiedFiles: [
            {
              path: "docs/failed-edit.md",
              reason: stopReason,
            },
          ],
          verification: {
            status: "blocked",
            reason: stopReason,
            blockerKind: "patch-from-not-found",
            nextAction,
          },
          evidence: [
            "actionable-blocker-kind:patch-from-not-found",
            `mutation-summary-next-action:${nextAction}`,
          ],
          failureBoundary: stopReason,
        },
      },
    });
    manager.saveError(session.id, stopReason, {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
    });

    const snapshot = manager.buildContinuitySnapshot(session.id);
    expect(snapshot.lastTerminalClassification).toBe("stopped");
    expect(snapshot.lastFailure).toBe(stopReason);
    expect(snapshot.recentChangedFiles).toEqual([]);
    expect(snapshot.recentFailedFiles).toEqual([
      {
        path: "docs/failed-edit.md",
        reason: stopReason,
      },
    ]);
    expect(snapshot.lastVerificationStatus).toBe("blocked");
    expect(snapshot.lastVerificationBlockerKind).toBe("patch-from-not-found");
    expect(snapshot.lastVerificationReason).toBe(stopReason);
    expect(snapshot.lastVerificationNextAction).toBe(nextAction);
    expect(snapshot.lastFailureHandoffDiagnostic).toBe(
      `Failure handoff: status=blocked; target=docs/failed-edit.md; reason=${stopReason}; blocker=patch-from-not-found; next=${nextAction.replace(/[.]+$/, "")}.`,
    );

    const context = manager.buildPromptContinuityContext(
      session.id,
      "continue with the same task",
    );
    expect(context).toContain(
      "- last-failure-handoff-diagnostic: Failure handoff: status=blocked; target=docs/failed-edit.md;",
    );
    expect(context).toContain("blocker=patch-from-not-found");
    expect(context).toContain(
      `- recent-failed-files: docs/failed-edit.md (${stopReason})`,
    );
    expect(context).toContain(
      "- last-verification-blocker-kind: patch-from-not-found",
    );
    expect(context).toContain(`- last-verification-next-action: ${nextAction}`);
  });

  it("preserves structured approval tool provenance in continuity context", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const executionError = "npm run build failed with exit code 1";
    const stopReason = `Bash execution failed after approval: ${executionError}`;

    manager.markRunStarted(session.id, "continue failed command");
    manager.addTurn(session.id, {
      role: "user",
      content: "run npm build",
    });
    manager.appendQueryEvent(session.id, {
      type: "query.completed",
      result: {
        status: "stopped_error",
        terminalReason: "stopped_error",
        terminalClassification: "error",
        stopReason,
        transcript: [],
        sharedContext: {
          sessionId: session.id,
          initialPrompt: "run npm build",
          notes: [],
          handoffs: [],
        },
        finalOutput: "",
        codingResult: {
          taskKind: "run-command",
          changedFiles: [],
          failedFiles: [{ path: "(command)", reason: executionError }],
          patches: [],
          repair: {
            status: "failed",
            attempts: 1,
            recoveredItems: [],
            failedItems: ["(command)"],
            notes: [stopReason],
          },
          continuation: {
            status: "failed-after-bounded-continuation",
            attempts: 1,
            evidence: [],
          },
          changeSet: {
            gitAware: false,
            preExistingDirtyFiles: [],
            postRunDirtyFiles: [],
            attemptedFiles: ["(command)"],
            changedFiles: [],
            unchangedAttemptedFiles: ["(command)"],
          },
          taskSatisfaction: {
            verdict: "completed-with-caveats",
            reasons: [stopReason],
            requiredEvidence: ["approved tool execution result"],
            observedEvidence: [],
          },
          verifiedFiles: [],
          unverifiedFiles: [{ path: "(command)", reason: executionError }],
          verification: {
            status: "failed",
            reason: executionError,
            command: "npm run build",
          },
          evidence: [],
          failureBoundary: stopReason,
          provenance: {
            approvalDecisions: [
              {
                kind: "approved",
                source: "not-required",
                legacyOutcome: "approved",
                toolName: "bash",
                taskId: "task_command_bash",
              },
            ],
            toolExecutions: [
              {
                kind: "executed-failed",
                source: "tool-runtime",
                legacySuccess: false,
                toolName: "bash",
                taskId: "task_command_bash",
                failureBoundary: "tool-execution-failed",
              },
            ],
          },
        },
      },
    });
    manager.saveError(session.id, stopReason, {
      terminalReason: "stopped_error",
      terminalClassification: "error",
    });

    const snapshot = manager.buildContinuitySnapshot(session.id);
    expect(snapshot.lastApprovalProvenanceKind).toBe("approved");
    expect(snapshot.lastApprovalProvenanceSource).toBe("not-required");
    expect(snapshot.lastApprovalProvenanceToolName).toBe("bash");
    expect(snapshot.lastToolExecutionProvenanceKind).toBe("executed-failed");
    expect(snapshot.lastToolExecutionProvenanceSource).toBe("tool-runtime");
    expect(snapshot.lastToolExecutionProvenanceToolName).toBe("bash");
    expect(snapshot.lastToolExecutionFailureBoundary).toBe(
      "tool-execution-failed",
    );

    const context = manager.buildPromptContinuityContext(
      session.id,
      "continue after the failed command",
    );
    expect(context).toContain("- last-approval-provenance-kind: approved");
    expect(context).toContain("- last-approval-provenance-tool: bash");
    expect(context).toContain(
      "- last-tool-execution-provenance-kind: executed-failed",
    );
    expect(context).toContain("- last-tool-execution-provenance-tool: bash");
    expect(context).toContain(
      "- last-tool-execution-failure-boundary: tool-execution-failed",
    );
    expect(context).not.toContain("current-permission-request-tool:bash");
  });

  it("persists MCP unavailable tool provenance into next-turn continuity", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    const reason = "MCP server localSdk requires authentication";

    manager.markRunStarted(session.id, "use MCP search");
    manager.addTurn(session.id, { role: "user", content: "use MCP search" });
    manager.appendQueryEvent(session.id, {
      type: "query.completed",
      result: {
        status: "stopped_error",
        terminalReason: "stopped_error",
        terminalClassification: "stopped",
        stopReason: reason,
        transcript: [],
        sharedContext: {
          sessionId: session.id,
          initialPrompt: "use MCP search",
          notes: [],
          handoffs: [],
        },
        finalOutput: "MCP tool unavailable.",
        codingResult: {
          taskKind: "run-command",
          changedFiles: [],
          failedFiles: [],
          patches: [],
          repair: {
            status: "failed",
            attempts: 1,
            recoveredItems: [],
            failedItems: [],
            notes: [reason],
          },
          continuation: {
            status: "failed-after-bounded-continuation",
            attempts: 1,
            evidence: ["actionable-blocker-kind:mcp-unavailable"],
          },
          changeSet: {
            gitAware: false,
            preExistingDirtyFiles: [],
            postRunDirtyFiles: [],
            attemptedFiles: [],
            changedFiles: [],
            unchangedAttemptedFiles: [],
          },
          taskSatisfaction: {
            verdict: "insufficient-evidence",
            reasons: [reason],
            requiredEvidence: ["mcp tool execution result"],
            observedEvidence: ["actionable-blocker-kind:mcp-unavailable"],
          },
          verifiedFiles: [],
          unverifiedFiles: [],
          verification: {
            status: "blocked",
            reason,
            blockerKind: "unknown",
            nextAction:
              "Run /mcp status and /mcp refresh localSdk before retrying.",
          },
          evidence: ["actionable-blocker-kind:mcp-unavailable"],
          failureBoundary: "unavailable-tool",
          provenance: {
            toolExecutions: [
              {
                kind: "unavailable-tool",
                source: "mcp-registry",
                legacySuccess: false,
                toolName: "mcp__localSdk__search",
                taskId: "task_mcp_unavailable",
                failureBoundary: "unavailable-tool",
              },
            ],
          },
        },
      },
    });
    manager.saveError(session.id, reason, {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
    });

    const snapshot = manager.buildContinuitySnapshot(session.id);
    expect(snapshot.lastToolExecutionProvenanceKind).toBe("unavailable-tool");
    expect(snapshot.lastToolExecutionProvenanceSource).toBe("mcp-registry");
    expect(snapshot.lastToolExecutionProvenanceToolName).toBe(
      "mcp__localSdk__search",
    );
    expect(snapshot.lastToolExecutionFailureBoundary).toBe("unavailable-tool");
    expect(snapshot.lastVerificationBlockerKind).toBe("mcp-unavailable");
    expect(snapshot.recentChangedFiles).toEqual([]);
    expect(snapshot.recentFailedFiles).toEqual([]);

    const context = manager.buildPromptContinuityContext(
      session.id,
      "continue after MCP rejection",
    );
    expect(context).toContain(
      "- last-tool-execution-provenance-kind: unavailable-tool",
    );
    expect(context).toContain(
      "- last-tool-execution-provenance-tool: mcp__localSdk__search",
    );
    expect(context).toContain(
      "- last-tool-execution-failure-boundary: unavailable-tool",
    );
    expect(context).toContain("- last-verification-blocker-kind: mcp-unavailable");
    expect(context).not.toContain("- recent-changed-files:");
  });

  it("retains transform evidence in continuity snapshot for temporal multi-hop rollover", () => {
    const manager = new SessionManager();
    const session = manager.createNew();

    manager.markRunStarted(session.id, "next");
    manager.addTurn(session.id, { role: "user", content: "next" });
    manager.appendQueryEvent(session.id, {
      type: "query.completed",
      result: {
        status: "completed",
        terminalReason: "completed",
        terminalClassification: "success",
        transcript: [],
        sharedContext: {
          sessionId: session.id,
          initialPrompt: "next",
          notes: [],
          handoffs: [],
        },
        finalOutput: "Edit completed for src/temporal-target.txt.",
        codingResult: {
          taskKind: "edit-file",
          changedFiles: ["src/temporal-target.txt"],
          failedFiles: [],
          patches: [],
          repair: {
            status: "not-needed",
            attempts: 1,
            recoveredItems: [],
            failedItems: [],
            notes: [],
          },
          continuation: {
            status: "first-pass-success",
            attempts: 1,
            evidence: [
              "freshness-boundary:restored-session-state-consumed",
              "freshness-boundary:degraded-reopen",
              "freshness-boundary:last-terminal=success:completed",
              "freshness-retained:reopen-candidates=1",
              "reopen-reason:continuation reopen recovered single candidate target from remaining/failure evidence",
              "reopen-candidates:src/temporal-target.txt",
              "reopen-candidate-source:recent-failed=1",
              "reopen-candidate-pruned:(missing-target)::placeholder",
              "reopen-target:src/temporal-target.txt",
              "inspect: read src/temporal-target.txt",
              "rebind-transform:src/temporal-target.txt:status=done=>status=fixed->status=fixed=>status=modern",
              "transform:src/temporal-target.txt:status=fixed=>status=modern",
              "edit/write applied on src/temporal-target.txt",
            ],
          },
          changeSet: {
            gitAware: false,
            preExistingDirtyFiles: [],
            postRunDirtyFiles: [],
            attemptedFiles: ["src/temporal-target.txt"],
            changedFiles: ["src/temporal-target.txt"],
            unchangedAttemptedFiles: [],
          },
          taskSatisfaction: {
            verdict: "satisfied",
            reasons: ["Workflow completed under inspect/edit/verify contract."],
            requiredEvidence: ["inspect->edit->verify contract execution"],
            observedEvidence: ["transform:src/temporal-target.txt:status=fixed=>status=modern"],
          },
          verifiedFiles: [],
          unverifiedFiles: [],
          verification: {
            status: "not-requested",
            reason: "mutation completed without explicit verify intent",
            selectionScope: "none",
            selectionSource: "not-requested",
          },
          evidence: [
            "reopen-target:src/temporal-target.txt",
            "transform:src/temporal-target.txt:status=fixed=>status=modern",
          ],
        },
      },
    });

    const snapshot = manager.buildContinuitySnapshot(session.id);
    expect(snapshot.lastContinuationEvidence).toContain(
      "transform:src/temporal-target.txt:status=fixed=>status=modern",
    );
    expect(snapshot.lastContinuationEvidence).toContain(
      "reopen-target:src/temporal-target.txt",
    );
  });
});
