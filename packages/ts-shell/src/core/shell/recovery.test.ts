import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentRunner } from "../../result/types.js";
import { SessionManager } from "../../session/SessionManager.js";
import { createQueryRuntimeStateFromSeed } from "../query/runtime/state.js";
import { resolveSessionReference, resumeShellSession } from "./recovery.js";
import type { ShellRuntimeContext } from "./runtimeContext.js";
import { ShellSessionRuntime } from "./sessionRuntime.js";

function createRuntimeContext(): ShellRuntimeContext {
  return {
    cwd: "D:/repo",
    originalCwd: "D:/repo",
    projectRoot: "D:/repo",
    rootMode: "git-root",
    requestedWorkspaceRoot: "D:/repo",
    targetPathBase: "D:/repo",
    gitRoot: "D:/repo",
    runtimeConfig: {
      provider: "openai",
      maxTurns: 6,
      disabledTools: [],
      hiddenToolPrefixes: [],
      enableMcpTools: true,
      configSources: [],
    },
    gitContext: {
      insideGit: true,
      branch: "main",
      isClean: true,
      root: "D:/repo",
    },
    session: { id: "sess_current" },
    activeSession: { sessionId: "sess_current", sessionProjectDir: "D:/repo" },
  } as never;
}

type ResumeShellSessionResult = Awaited<ReturnType<typeof resumeShellSession>>;
type ResumedShellSessionResult = Extract<
  ResumeShellSessionResult,
  { resumed: true }
>;
type AutoResumePayload = NonNullable<ResumedShellSessionResult["autoResume"]>;

function expectResumedResult(
  result: ResumeShellSessionResult,
): ResumedShellSessionResult {
  expect(result.resumed).toBe(true);
  if (!result.resumed) {
    throw new Error("Expected resumed session result");
  }
  return result;
}

function expectAutoResumePayload(
  result: ResumeShellSessionResult,
): AutoResumePayload {
  const resumed = expectResumedResult(result);
  expect(resumed.autoResume).toBeTruthy();
  if (!resumed.autoResume) {
    throw new Error("Expected auto-resume payload");
  }
  return resumed.autoResume;
}

async function executeAutoResumePrompt(
  sessionId: string,
  result: ResumeShellSessionResult,
  runtime: Pick<ShellSessionRuntime, "executePrompt">,
): Promise<string> {
  const autoResume = expectAutoResumePayload(result);
  return runtime.executePrompt(sessionId, autoResume.prompt, {
    runtimeSeed: autoResume.runtimeSeed,
    continuityState: autoResume.continuityState,
  });
}

describe("shell recovery helpers", () => {
  it("does not use raw session pending text rejected by the recovery snapshot", async () => {
    let builtSeed = false;
    const result = await resumeShellSession({
      requestedSessionId: "sess_resume",
      runtimeContext: createRuntimeContext(),
      renderer: { renderLine() {} } as never,
      sessionManager: {
        sessionExists: () => true,
        tryResume: () => ({ ok: true, session: { id: "sess_resume", projectRoot: "D:/repo",
          status: "interrupted", turns: [], pendingPrompt: "discarded request" } }),
        getSessionResumeEligibility: () => ({ autoResumeReady: true }),
        getRecoverySnapshot: () => ({ pendingLifecycle: { pendingApprovals: {}, pendingTools: {}, taskStates: {} } }),
        buildRuntimeStateSeed: () => { builtSeed = true; throw new Error("unowned pending prompt reached runtime"); },
      } as never,
    });
    expect(result).toEqual({ resumed: true, autoResume: null, disposition: "partially-resumable" });
    expect(builtSeed).toBe(false);
  });

  it("resolves session reference by unique id prefix", () => {
    const resolved = resolveSessionReference({
      reference: "sess_fix_auth",
      preferredProjectRoot: "D:/repo",
      sessionManager: {
        listReentrySummaries: () => [
          {
            id: "sess_fix_auth_123",
            title: "Fix auth flow",
            status: "interrupted",
            projectRoot: "D:/repo",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T01:00:00.000Z",
            recoverable: true,
          },
        ],
        sessionExists: () => false,
      } as never,
    });

    expect(resolved).toEqual({
      ok: true,
      sessionId: "sess_fix_auth_123",
    });
  });

  it("returns ambiguous when reference matches multiple sessions", () => {
    const resolved = resolveSessionReference({
      reference: "fix",
      preferredProjectRoot: "D:/repo",
      sessionManager: {
        listReentrySummaries: () => [
          {
            id: "sess_a",
            title: "Fix auth flow",
            status: "interrupted",
            projectRoot: "D:/repo",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T01:00:00.000Z",
            recoverable: true,
          },
          {
            id: "sess_b",
            title: "Fix lint warnings",
            status: "interrupted",
            projectRoot: "D:/repo",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T01:00:00.000Z",
            recoverable: true,
          },
        ],
        sessionExists: () => false,
      } as never,
    });

    expect(resolved.ok).toBe(false);
    expect(resolved.reason).toBe("ambiguous");
    expect(resolved.candidates?.length).toBe(2);
  });

  it("returns resumed false when no recoverable session exists", async () => {
    const lines: string[] = [];
    const result = await resumeShellSession({
      sessionManager: {
        getSuggestedRecoverySession: () => null,
        getRecoveryTrustBoundaryBlock: () => null,
      } as never,
      runtimeContext: {} as never,
      sessionRuntime: {} as never,
      renderer: { renderLine: (line: string) => lines.push(line) } as never,
    });

    expect(result).toEqual({ resumed: false });
    expect(lines.join("\n")).toContain("No recoverable session found");
  });

  it("prints resume candidates context before auto-selecting recovery target", async () => {
    const lines: string[] = [];

    const result = await resumeShellSession({
      sessionManager: {
        listReentrySummaries: () => [
          {
            id: "sess_candidate",
            title: "Fix flaky test",
            status: "interrupted",
            projectRoot: "D:/repo",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T01:00:00.000Z",
            recoverable: true,
          },
        ],
        tryResume: () => ({
          ok: true,
          session: {
            id: "sess_candidate",
            projectRoot: "D:/repo",
            status: "active",
            updatedAt: "2026-01-01T01:00:00.000Z",
            turns: [],
          },
        }),
        getRecoverySnapshot: () => ({
          pendingLifecycle: {
            pendingApprovals: {},
            pendingTools: {},
            taskStates: {},
          },
          repairSummary: {
            insertedPromptMessage: false,
            insertedQueryStarted: false,
            strippedInterruptedTerminalEvents: 0,
            insertedRunInterrupted: false,
            ignoredDuplicateTurnStarts: 0,
            ignoredUnpairedTurnCompletions: 0,
            ignoredRoleMismatchedTurnCompletions: 0,
          },
          transcriptEvents: [],
        }),
        describeSessionReentry: () => ({
          id: "sess_candidate",
          title: "Fix flaky test",
          status: "active",
          projectRoot: "D:/repo",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T01:00:00.000Z",
          recoverable: true,
          lastUserMessage: "continue where you left off",
        }),
      } as never,
      runtimeContext: createRuntimeContext(),
      sessionRuntime: {
        executePrompt: async () => "ok",
      } as never,
      renderer: { renderLine: (line: string) => lines.push(line) } as never,
    });

    const resumed = expectResumedResult(result);
    expect(resumed.autoResume).toBeNull();
    expect(resumed.disposition).toBe("partially-resumable");
    expect(lines.join("\n")).toContain("Resume candidates:");
    expect(lines.join("\n")).toContain("sess_candidate");
    expect(lines.join("\n")).toContain("Last user request");
  });

  it("surfaces trust-boundary guidance when a blocked session exists", async () => {
    const lines: string[] = [];

    const result = await resumeShellSession({
      sessionManager: {
        getSuggestedRecoverySession: () => null,
        getRecoveryTrustBoundaryBlock: () => ({
          sessionId: "sess_blocked",
          reason: "terminal-evidence-indeterminate",
          detail: "terminal evidence is indeterminate",
          recoveryHint:
            "Session sess_blocked is not recoverable. Start a fresh session or manually repair D:/home/.cheers/sessions/sess_blocked.",
        }),
      } as never,
      runtimeContext: {} as never,
      sessionRuntime: {} as never,
      renderer: { renderLine: (line: string) => lines.push(line) } as never,
    });

    expect(result).toEqual({ resumed: false });
    expect(lines.join("\n")).toContain(
      "Recovery blocked for session sess_blocked",
    );
    expect(lines.join("\n")).toContain(
      "Start a fresh session or manually repair",
    );
  });

  it("does not partially mutate runtime context when resume fails", async () => {
    const lines: string[] = [];
    const runtimeContext: ShellRuntimeContext = {
      cwd: "D:/repo",
      originalCwd: "D:/repo",
      projectRoot: "D:/repo",
      rootMode: "git-root",
      requestedWorkspaceRoot: "D:/repo",
      targetPathBase: "D:/repo",
      gitRoot: "D:/repo",
      runtimeConfig: {
        provider: "openai",
        maxTurns: 6,
        disabledTools: [],
        hiddenToolPrefixes: [],
        enableMcpTools: true,
        configSources: [],
      },
      gitContext: {
        insideGit: true,
        branch: "main",
        isClean: true,
        root: "D:/repo",
      },
      session: { id: "sess_current" },
      activeSession: {
        sessionId: "sess_current",
        sessionProjectDir: "D:/repo",
      },
    } as never;

    const result = await resumeShellSession({
      requestedSessionId: "sess_missing",
      sessionManager: {
        sessionExists: () => true,
        tryResume: () => ({
          ok: false,
          error: "resume failed",
          recoveryHint: "inspect the session directory",
        }),
      } as never,
      runtimeContext,
      sessionRuntime: {} as never,
      renderer: { renderLine: (line: string) => lines.push(line) } as never,
    });

    expect(result).toEqual({ resumed: false });
    expect(runtimeContext.session.id).toBe("sess_current");
    expect(runtimeContext.projectRoot).toBe("D:/repo");
    expect(runtimeContext.activeSession).toEqual({
      sessionId: "sess_current",
      sessionProjectDir: "D:/repo",
    });
    expect(lines.join("\n")).toContain("resume failed");
  });

  it("prints disambiguation guidance when requested resume target is ambiguous", async () => {
    const lines: string[] = [];
    const result = await resumeShellSession({
      requestedSessionId: "fix",
      sessionManager: {
        listReentrySummaries: () => [
          {
            id: "sess_fix_auth_1",
            title: "Fix auth flow",
            status: "interrupted",
            projectRoot: "D:/repo",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T01:00:00.000Z",
            recoverable: true,
            resumeDisposition: "fully-resumable",
            autoResumeReady: true,
            resumeDetail: "ready",
          },
          {
            id: "sess_fix_lint_2",
            title: "Fix lint",
            status: "interrupted",
            projectRoot: "D:/repo",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T01:00:00.000Z",
            recoverable: true,
            resumeDisposition: "fully-resumable",
            autoResumeReady: true,
            resumeDetail: "ready",
          },
        ],
        sessionExists: () => false,
      } as never,
      runtimeContext: createRuntimeContext(),
      sessionRuntime: {} as never,
      renderer: { renderLine: (line: string) => lines.push(line) } as never,
    });

    expect(result).toEqual({ resumed: false });
    expect(lines.join("\n")).toContain("ambiguous");
    expect(lines.join("\n")).toContain("sess_fix_auth_1");
    expect(lines.join("\n")).toContain("Hint: use a longer session id prefix");
  });

  it("passes a replay-built runtime seed into resumed prompt execution", async () => {
    const lines: string[] = [];
    const runtimeContext: ShellRuntimeContext = {
      cwd: "D:/repo",
      originalCwd: "D:/repo",
      projectRoot: "D:/repo",
      rootMode: "git-root",
      requestedWorkspaceRoot: "D:/repo",
      targetPathBase: "D:/repo",
      gitRoot: "D:/repo",
      runtimeConfig: {
        provider: "openai",
        maxTurns: 6,
        disabledTools: [],
        hiddenToolPrefixes: [],
        enableMcpTools: true,
        configSources: [],
      },
      gitContext: {
        insideGit: true,
        branch: "main",
        isClean: true,
        root: "D:/repo",
      },
      session: { id: "sess_current" },
      activeSession: {
        sessionId: "sess_current",
        sessionProjectDir: "D:/repo",
      },
    } as never;

    const result = await resumeShellSession({
      requestedSessionId: "sess_resume",
      sessionManager: {
        sessionExists: () => true,
        tryResume: () => ({
          ok: true,
          session: {
            id: "sess_resume",
            turns: [],
            projectRoot: "D:/repo",
            status: "active",
            pendingPrompt: "continue me",
          },
        }),
        buildRuntimeStateSeed: () => ({
          config: {
            sessionId: "sess_resume",
            initialPrompt: "continue me",
            maxTurns: 6,
            startingRole: "planner",
          },
          currentRole: "coder",
          turn: 2,
          lastContinuationReason: "handoff",
          pendingLifecycle: {
            pendingApprovals: {},
            pendingTools: {},
            taskStates: {},
          },
          recoveryBoundary: "mid-turn-reentry",
          truthBoundary: {
            source: "durable-replay",
            normalizedEventCount: 0,
            pairedTurnCount: 0,
            policyEvidence: new Set(["open-turn"]),
            repairSummary: {
              insertedPromptMessage: false,
              insertedQueryStarted: false,
              strippedInterruptedTerminalEvents: 0,
              insertedRunInterrupted: false,
              ignoredDuplicateTurnStarts: 0,
              ignoredUnpairedTurnCompletions: 0,
              ignoredRoleMismatchedTurnCompletions: 0,
            },
            continuationSafety: "mid-turn-safe",
            openTurn: { role: "coder", turn: 2 },
          },
          derivedState: {
            transcript: [
              {
                role: "planner",
                content: "Identified src/app.ts as the likely edit target.",
                notes: ["target selected"],
              },
            ],
          },
        }),
        getRecoverySnapshot: () => ({
          pendingPrompt: "continue me",
          runPhase: "turn-active",
          interruptedKind: "turn",
          pendingLifecycle: {
            pendingApprovals: {},
            pendingTools: {},
            taskStates: {},
          },
          repairSummary: {
            insertedPromptMessage: false,
            insertedQueryStarted: false,
            strippedInterruptedTerminalEvents: 0,
            insertedRunInterrupted: false,
            ignoredDuplicateTurnStarts: 0,
            ignoredUnpairedTurnCompletions: 0,
            ignoredRoleMismatchedTurnCompletions: 0,
          },
          transcriptEvents: [
            {
              type: "query-event",
              event: {
                type: "lifecycle.cancelled",
                reason: "AbortSignal triggered during shell session runtime",
              },
              timestamp: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
        buildContinuitySnapshot: () => ({
          sessionId: "sess_resume",
          projectRoot: "D:/repo",
          lastUserIntent: "continue me",
          lastTaskKind: "edit-file",
          lastActionResultSeed: {
            actionKind: "edit-file",
            target: "src/app.ts",
            changedFiles: ["src/app.ts"],
            verifiedFiles: [],
            verification: {
              status: "failed",
              command: "npm test -- src/app.test.ts",
              reason: "expected true to be false",
            },
          },
          lastActionHandoffSummary:
            "Resumed from edit-file on src/app.ts; verification status: failed; next focus is the same target.",
          recentChangedFiles: ["src/app.ts"],
          recentTargetFiles: ["src/app.ts"],
          recentFailedFiles: [],
          recentVerifiedFiles: [],
          lastVerificationStatus: "failed",
          lastVerificationCommand: "npm test -- src/app.test.ts",
          lastVerificationReason: "expected true to be false",
          lastVerificationNextAction:
            "Fix src/app.ts and rerun npm test -- src/app.test.ts",
          lastRepairNotes: [],
          lastContinuationStatus: "needs-follow-up",
          lastContinuationEvidence: ["transform:src/app.ts:false=>true"],
          lastTaskSatisfactionReasons: [],
          unresolvedItems: ["verify:failed"],
        }),
        getSessionResumeEligibility: () => ({
          disposition: "fully-resumable",
          autoResumeReady: true,
          reason: "pending-prompt",
          detail: "pending prompt is ready to resume",
          blocked: false,
        }),
        reconcilePendingLifecycle: () => ({
          pendingApprovals: {},
          pendingTools: {},
          taskStates: {},
        }),
      } as never,
      runtimeContext,
      renderer: { renderLine: (line: string) => lines.push(line) } as never,
    });

    expect(result.resumed).toBe(true);
    if (!result.resumed || !result.autoResume) {
      throw new Error("Expected auto-resume payload");
    }
    expect(result.autoResume.runtimeSeed.recoveryBoundary).toBe(
      "mid-turn-reentry",
    );
    expect(
      result.autoResume.runtimeSeed.truthBoundary.repairSummary
        .insertedPromptMessage,
    ).toBe(false);
    expect(result.autoResume.prompt).toContain(
      "Continue the interrupted task using the recovery evidence below.",
    );
    expect(result.autoResume.prompt).toContain(
      "Original user request: continue me",
    );
    expect(result.autoResume.prompt).toContain(
      "- interruption-reason: AbortSignal triggered during shell session runtime",
    );
    expect(result.autoResume.prompt).toContain(
      "- planner: Identified src/app.ts as the likely edit target.",
    );
    expect(result.autoResume.prompt).toContain("- changed-files: src/app.ts");
    expect(result.autoResume.prompt).toContain(
      "- action-result-seed: seed=action-result action=edit-file target=src/app.ts verifyStatus=failed verifyCommandInherited=yes changedFiles=1",
    );
    expect(result.autoResume.prompt).toContain(
      "- action-handoff-summary: Resumed from edit-file on src/app.ts; verification status: failed; next focus is the same target.",
    );
    expect(result.autoResume.prompt).toContain(
      "- verification-status: failed",
    );
    expect(result.autoResume.prompt).toContain(
      "- verification-command: npm test -- src/app.test.ts",
    );
    expect(result.autoResume.prompt).toContain(
      "- Fix src/app.ts and rerun npm test -- src/app.test.ts",
    );
    expect(result.autoResume.prompt).toContain(
      "do not restart with a generic summary or read-only inspection",
    );
    expect(lines.join("\n")).toContain("Resumed session sess_resume");
  });

  it("includes success provenance in interrupted recovery prompt", async () => {
    const lines: string[] = [];
    const runtimeContext = createRuntimeContext();
    const result = await resumeShellSession({
      fallbackSessionId: "sess_success_resume",
      sessionManager: {
        listReentrySummaries: () => [],
        tryResume: () => ({
          ok: true,
          session: {
            id: "sess_success_resume",
            turns: [],
            projectRoot: "D:/repo",
            status: "active",
            pendingPrompt: "continue verified task",
          },
        }),
        describeSessionReentry: () => undefined,
        getRecoverySnapshot: () => ({
          pendingPrompt: "continue verified task",
          runPhase: "turn-active",
          interruptedKind: "turn",
          pendingLifecycle: {
            pendingApprovals: {},
            pendingTools: {},
            taskStates: {},
          },
          repairSummary: {
            insertedPromptMessage: false,
            insertedQueryStarted: false,
            strippedInterruptedTerminalEvents: 0,
            insertedRunInterrupted: false,
            ignoredDuplicateTurnStarts: 0,
            ignoredUnpairedTurnCompletions: 0,
            ignoredRoleMismatchedTurnCompletions: 0,
          },
          transcriptEvents: [],
        }),
        buildContinuitySnapshot: () => ({
          sessionId: "sess_success_resume",
          projectRoot: "D:/repo",
          lastTaskKind: "edit-file",
          lastSuccessHandoffDiagnostic:
            "Success handoff: status=passed; target=src/app.ts; command=npm test -- src/app.test.ts; verified=src/app.ts; next=keep the next turn focused on the same target; do not repeat this verification unless the target changes.",
          recentChangedFiles: ["src/app.ts"],
          recentTargetFiles: ["src/app.ts"],
          recentFailedFiles: [],
          recentVerifiedFiles: ["src/app.ts"],
          lastVerificationStatus: "passed",
          lastVerificationCommand: "npm test -- src/app.test.ts",
          lastRepairNotes: [],
          lastContinuationEvidence: [],
          lastTaskSatisfactionReasons: [],
          unresolvedItems: [],
        }),
        getSessionResumeEligibility: () => ({
          disposition: "fully-resumable",
          autoResumeReady: true,
          detail: "pending prompt is ready to resume",
        }),
        reconcilePendingLifecycle: () => ({
          pendingApprovals: {},
          pendingTools: {},
          taskStates: {},
        }),
        buildRuntimeStateSeed: () => ({
          config: {
            sessionId: "sess_success_resume",
            initialPrompt: "continue verified task",
            maxTurns: 6,
            startingRole: "planner",
          },
          currentRole: "planner",
          turn: 1,
          pendingLifecycle: {
            pendingApprovals: {},
            pendingTools: {},
            taskStates: {},
          },
          recoveryBoundary: "mid-turn-reentry",
          truthBoundary: {
            source: "durable-replay",
            normalizedEventCount: 0,
            pairedTurnCount: 0,
            policyEvidence: new Set(),
            repairSummary: {
              insertedPromptMessage: false,
              insertedQueryStarted: false,
              strippedInterruptedTerminalEvents: 0,
              insertedRunInterrupted: false,
              ignoredDuplicateTurnStarts: 0,
              ignoredUnpairedTurnCompletions: 0,
              ignoredRoleMismatchedTurnCompletions: 0,
            },
            continuationSafety: "mid-turn-safe",
          },
          derivedState: { transcript: [] },
        }),
      } as never,
      runtimeContext,
      renderer: { renderLine: (line: string) => lines.push(line) } as never,
    });

    expect(result.resumed).toBe(true);
    if (!result.resumed || !result.autoResume) {
      throw new Error("Expected auto-resume payload");
    }
    expect(result.autoResume.prompt).toContain(
      "- success-handoff-diagnostic: Success handoff: status=passed; target=src/app.ts; command=npm test -- src/app.test.ts; verified=src/app.ts; next=keep the next turn focused on the same target; do not repeat this verification unless the target changes.",
    );
  });

  it("does not duplicate persisted prompt barrier when resuming with an existing runtime seed", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-no-dup-resume-barrier-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    try {
      const manager = new SessionManager();
      const session = manager.createNew();
      manager.persistUserPromptBarrier(session.id, "no-dup prompt");
      manager.saveInterrupted(session.id, "prompt");

      const runtime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (_prompt, _signal, _runtimeSeed) {
          yield {
            type: "query.completed",
            result: {
              status: "completed",
              terminalReason: "completed",
              terminalClassification: "success",
              transcript: [],
              sharedContext: {
                sessionId: session.id,
                initialPrompt: "no-dup prompt",
                notes: [],
                handoffs: [],
              },
              finalOutput: "ok",
            },
          };
        },
      });

      await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: runtime,
        renderer: { renderLine() {} } as never,
      });

      const transcript = manager.getTranscriptEvents(session.id);
      expect(
        transcript.filter(
          (event) =>
            event.type === "lifecycle" && event.event === "run-started",
        ),
      ).toHaveLength(1);
      expect(
        transcript.filter(
          (event) =>
            event.type === "message" &&
            event.role === "user" &&
            event.content === "no-dup prompt",
        ),
      ).toHaveLength(1);
    } finally {
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("reconciles pending lifecycle before resuming a mid-turn interrupted session", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-recovery-lifecycle-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    try {
      const lines: string[] = [];
      const manager = new SessionManager();
      const session = manager.createNew();
      manager.persistUserPromptBarrier(session.id, "resume prompt");
      manager.markTurnActive(session.id);
      manager.appendQueryEvent(session.id, {
        type: "query.started",
        sessionId: session.id,
        prompt: "resume prompt",
      });
      manager.appendQueryEvent(session.id, {
        type: "turn.started",
        role: "planner",
        turn: 1,
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

      const result = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        renderer: { renderLine: (line: string) => lines.push(line) } as never,
      });

      const autoResume = expectAutoResumePayload(result);
      expect({
        recoveryBoundary: autoResume.runtimeSeed.recoveryBoundary,
        pendingApprovals: Object.keys(
          autoResume.runtimeSeed.pendingLifecycle.pendingApprovals,
        ),
        pendingTools: Object.keys(
          autoResume.runtimeSeed.pendingLifecycle.pendingTools,
        ),
      }).toEqual({
        recoveryBoundary: "mid-turn-reentry",
        pendingApprovals: [],
        pendingTools: [],
      });

      const snapshot = manager.getRecoverySnapshot(session.id);
      expect(snapshot.pendingLifecycle.pendingApprovals).toEqual({});
      expect(snapshot.pendingLifecycle.pendingTools).toEqual({});
      expect(
        snapshot.pendingLifecycle.taskStates.task_pending_approval?.lastEvent,
      ).toBe("approval.resolved");
      expect(
        snapshot.pendingLifecycle.taskStates.task_pending_tool?.lastEvent,
      ).toBe("tool.result");
      expect(lines.join("\n")).toContain(`Resumed session ${session.id}`);
    } finally {
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("passes repairSummary into recovery runtime seed when transcript drift was repaired", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-recovery-repair-summary-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    try {
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

      const result = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        renderer: { renderLine() {} } as never,
      });

      expect(
        expectAutoResumePayload(result).runtimeSeed.truthBoundary.repairSummary,
      ).toEqual({
        insertedPromptMessage: true,
        insertedQueryStarted: true,
        strippedInterruptedTerminalEvents: 0,
        insertedRunInterrupted: true,
        ignoredDuplicateTurnStarts: 1,
        ignoredUnpairedTurnCompletions: 0,
        ignoredRoleMismatchedTurnCompletions: 1,
      });
    } finally {
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("downgrades unsafe mid-turn recovery seeds when drift summary indicates unreliable open turn", async () => {
    const lines: string[] = [];
    const result = await resumeShellSession({
      requestedSessionId: "sess_guarded",
      sessionManager: {
        sessionExists: () => true,
        tryResume: () => ({
          ok: true,
          session: {
            id: "sess_guarded",
            turns: [],
            projectRoot: "D:/repo",
            pendingPrompt: "continue me",
          },
        }),
        buildRuntimeStateSeed: () => ({
          config: {
            sessionId: "sess_guarded",
            initialPrompt: "continue me",
            maxTurns: 6,
            startingRole: "planner",
          },
          currentRole: "coder",
          turn: 2,
          lastContinuationReason: "handoff",
          pendingLifecycle: {
            pendingApprovals: {},
            pendingTools: {},
            taskStates: {},
          },
          recoveryBoundary: "mid-turn-reentry",
          truthBoundary: {
            source: "durable-replay",
            normalizedEventCount: 5,
            pairedTurnCount: 0,
            policyEvidence: new Set(["open-turn", "repair-drift"]),
            repairSummary: {
              insertedPromptMessage: false,
              insertedQueryStarted: false,
              strippedInterruptedTerminalEvents: 0,
              insertedRunInterrupted: false,
              ignoredDuplicateTurnStarts: 1,
              ignoredUnpairedTurnCompletions: 0,
              ignoredRoleMismatchedTurnCompletions: 0,
            },
            continuationSafety: "fresh-only",
          },
          derivedState: {
            transcript: [],
          },
        }),
        getRecoverySnapshot: () => ({
          pendingPrompt: "continue me",
          runPhase: "turn-active",
          interruptedKind: "turn",
          pendingLifecycle: {
            pendingApprovals: {},
            pendingTools: {},
            taskStates: {},
          },
          repairSummary: {
            insertedPromptMessage: false,
            insertedQueryStarted: false,
            strippedInterruptedTerminalEvents: 0,
            insertedRunInterrupted: false,
            ignoredDuplicateTurnStarts: 1,
            ignoredUnpairedTurnCompletions: 0,
            ignoredRoleMismatchedTurnCompletions: 0,
          },
          transcriptEvents: [],
        }),
        reconcilePendingLifecycle: () => ({
          pendingApprovals: {},
          pendingTools: {},
          taskStates: {},
        }),
        getSessionResumeEligibility: () => ({
          disposition: "fully-resumable",
          autoResumeReady: true,
          detail: "pending prompt is ready to resume",
        }),
      } as never,
      runtimeContext: createRuntimeContext(),
      renderer: { renderLine: (line: string) => lines.push(line) } as never,
    });

    const autoResume = expectAutoResumePayload(result);
    expect({
      recoveryBoundary: autoResume.runtimeSeed.recoveryBoundary,
      currentRole: autoResume.runtimeSeed.currentRole,
      turn: autoResume.runtimeSeed.turn,
    }).toEqual({
      recoveryBoundary: "fresh-entry",
      currentRole: "planner",
      turn: 1,
    });
    expect(lines.join("\n")).toContain("Resumed session sess_guarded");
    expect(lines.join("\n")).toContain(
      "Recovery guardrail downgraded continuation to fresh-entry",
    );
  });

  it("keeps fresh-only, completed-turn-only, and mid-turn-safe stable across repeated resumes", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-repeated-resume-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    try {
      const freshManager = new SessionManager();
      const freshSession = freshManager.createNew();
      freshManager.persistUserPromptBarrier(freshSession.id, "fresh prompt");
      freshManager.saveInterrupted(freshSession.id, "prompt");

      const freshBoundaries: string[] = [];
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await resumeShellSession({
          requestedSessionId: freshSession.id,
          sessionManager: freshManager,
          runtimeContext: createRuntimeContext(),
          renderer: { renderLine() {} } as never,
        });
        const autoResume = expectAutoResumePayload(result);
        freshBoundaries.push(
          `${autoResume.runtimeSeed.truthBoundary.continuationSafety}:${autoResume.runtimeSeed.recoveryBoundary}`,
        );
        freshManager.saveInterrupted(freshSession.id, "prompt");
      }
      expect(freshBoundaries).toEqual([
        "fresh-only:fresh-entry",
        "fresh-only:fresh-entry",
      ]);

      const completedManager = new SessionManager();
      const completedSession = completedManager.createNew();
      completedManager.persistUserPromptBarrier(
        completedSession.id,
        "completed prompt",
      );
      completedManager.markTurnActive(completedSession.id);
      completedManager.appendQueryEvent(completedSession.id, {
        type: "turn.started",
        role: "planner",
        turn: 1,
      });
      completedManager.appendQueryEvent(completedSession.id, {
        type: "turn.completed",
        output: {
          role: "planner",
          content: "plan",
          handoffTo: "coder",
          handoffReason: "ready-for-code",
        },
      });
      completedManager.saveInterrupted(completedSession.id, "turn");

      const completedBoundaries: string[] = [];
      let completedResumeCount = 0;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await resumeShellSession({
          requestedSessionId: completedSession.id,
          sessionManager: completedManager,
          runtimeContext: createRuntimeContext(),
          renderer: { renderLine() {} } as never,
        });
        const autoResume = expectAutoResumePayload(result);
        completedBoundaries.push(
          `${autoResume.runtimeSeed.truthBoundary.continuationSafety}:${autoResume.runtimeSeed.recoveryBoundary}`,
        );
        completedResumeCount += 1;
        if (completedResumeCount === 1) {
          completedManager.appendQueryEvent(completedSession.id, {
            type: "turn.started",
            role: "coder",
            turn: 2,
          });
          completedManager.appendQueryEvent(completedSession.id, {
            type: "turn.completed",
            output: {
              role: "coder",
              content: "code",
              handoffTo: "reviewer",
              handoffReason: "review",
            },
          });
          completedManager.saveInterrupted(completedSession.id, "turn");
        }
      }
      expect(completedBoundaries).toEqual([
        "completed-turn-only:completed-turn-reentry",
        "completed-turn-only:completed-turn-reentry",
      ]);

      const midTurnManager = new SessionManager();
      const midTurnSession = midTurnManager.createNew();
      midTurnManager.persistUserPromptBarrier(
        midTurnSession.id,
        "mid-turn prompt",
      );
      midTurnManager.markTurnActive(midTurnSession.id);
      midTurnManager.appendQueryEvent(midTurnSession.id, {
        type: "turn.started",
        role: "planner",
        turn: 1,
      });
      midTurnManager.saveInterrupted(midTurnSession.id, "turn");

      const midTurnBoundaries: string[] = [];
      let midTurnResumeCount = 0;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await resumeShellSession({
          requestedSessionId: midTurnSession.id,
          sessionManager: midTurnManager,
          runtimeContext: createRuntimeContext(),
          renderer: { renderLine() {} } as never,
        });
        const autoResume = expectAutoResumePayload(result);
        midTurnBoundaries.push(
          `${autoResume.runtimeSeed.truthBoundary.continuationSafety}:${autoResume.runtimeSeed.recoveryBoundary}`,
        );
        midTurnResumeCount += 1;
        if (midTurnResumeCount === 1) {
          midTurnManager.appendQueryEvent(midTurnSession.id, {
            type: "turn.completed",
            output: {
              role: "planner",
              content: "plan complete",
              handoffTo: "coder",
              handoffReason: "continue",
            },
          });
          midTurnManager.appendQueryEvent(midTurnSession.id, {
            type: "turn.started",
            role: "coder",
            turn: 2,
          });
          midTurnManager.saveInterrupted(midTurnSession.id, "turn");
        }
      }
      expect(midTurnBoundaries).toEqual([
        "mid-turn-safe:mid-turn-reentry",
        "mid-turn-safe:mid-turn-reentry",
      ]);
    } finally {
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("keeps contract values aligned with mixed-boundary recovery behavior across transitions", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-mixed-boundary-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    try {
      const manager = new SessionManager();
      const session = manager.createNew();
      const observations: Array<{
        contract: string;
        boundary: string;
        role: string;
        turn: number;
      }> = [];

      manager.persistUserPromptBarrier(session.id, "mixed prompt");
      manager.saveInterrupted(session.id, "prompt");

      const recordObservation = (autoResume: AutoResumePayload) => {
        observations.push({
          contract: autoResume.runtimeSeed.truthBoundary.continuationSafety,
          boundary: autoResume.runtimeSeed.recoveryBoundary,
          role: autoResume.runtimeSeed.currentRole,
          turn: autoResume.runtimeSeed.turn,
        });
      };

      const firstResult = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        renderer: { renderLine() {} } as never,
      });
      recordObservation(expectAutoResumePayload(firstResult));
      manager.markTurnActive(session.id);
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
          handoffReason: "ready",
        },
      });
      manager.saveInterrupted(session.id, "turn");

      const secondResult = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        renderer: { renderLine() {} } as never,
      });
      recordObservation(expectAutoResumePayload(secondResult));
      manager.appendQueryEvent(session.id, {
        type: "turn.started",
        role: "coder",
        turn: 2,
      });
      manager.saveInterrupted(session.id, "turn");

      const thirdResult = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        renderer: { renderLine() {} } as never,
      });
      recordObservation(expectAutoResumePayload(thirdResult));

      expect(observations).toEqual([
        {
          contract: "fresh-only",
          boundary: "fresh-entry",
          role: "planner",
          turn: 1,
        },
        {
          contract: "completed-turn-only",
          boundary: "completed-turn-reentry",
          role: "coder",
          turn: 2,
        },
        {
          contract: "mid-turn-safe",
          boundary: "mid-turn-reentry",
          role: "coder",
          turn: 2,
        },
      ]);
    } finally {
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("integrates interrupt recovery with pending lifecycle repair and stopped terminal durability", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-cross-interrupt-runtime-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    try {
      const manager = new SessionManager();
      const session = manager.createNew();
      const transcriptPath = path.join(
        manager.getSessionDirPath(session.id),
        "transcript.jsonl",
      );

      manager.persistUserPromptBarrier(session.id, "recover integrated prompt");
      manager.markTurnActive(session.id);
      manager.appendQueryEvent(session.id, {
        type: "turn.started",
        role: "planner",
        turn: 1,
      });
      manager.appendQueryEvent(session.id, {
        type: "approval.requested",
        toolName: "bash",
        taskId: "task_integrated_approval",
      });
      manager.appendQueryEvent(session.id, {
        type: "tool.started",
        toolName: "read",
        taskId: "task_integrated_tool",
      });
      manager.saveInterrupted(session.id, "turn");

      const transcriptEvents = manager
        .getTranscriptEvents(session.id)
        .filter(
          (event) =>
            !(event.type === "lifecycle" && event.event === "run-interrupted"),
        );
      fs.writeFileSync(
        transcriptPath,
        `${transcriptEvents.map((event) => JSON.stringify(event)).join("\n")}\n`,
        "utf8",
      );

      let capturedRuntimeSeed:
        | Awaited<ReturnType<SessionManager["buildRuntimeStateSeed"]>>
        | undefined;
      const runtime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (_prompt, _signal, runtimeSeed) {
          capturedRuntimeSeed = runtimeSeed;
          yield {
            type: "query.completed",
            result: {
              status: "stopped_error",
              terminalReason: "stopped_error",
              terminalClassification: "stopped",
              lastContinuationReason: "retryable-error",
              stopReason: "Retry budget exhausted",
              transcript: [],
              sharedContext: {
                sessionId: session.id,
                initialPrompt: "recover integrated prompt",
                notes: [],
                handoffs: [],
              },
              finalOutput: "partial recovery output",
            },
          };
        },
      });

      const result = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: runtime,
        renderer: { renderLine() {} } as never,
      });

      await executeAutoResumePrompt(session.id, result, runtime);
      expect(capturedRuntimeSeed).toBeDefined();
      expect(capturedRuntimeSeed?.recoveryBoundary).toBe("mid-turn-reentry");
      expect(
        capturedRuntimeSeed?.truthBoundary.repairSummary.insertedRunInterrupted,
      ).toBe(true);
      expect(capturedRuntimeSeed?.pendingLifecycle.pendingApprovals).toEqual(
        {},
      );
      expect(capturedRuntimeSeed?.pendingLifecycle.pendingTools).toEqual({});
      expect(
        capturedRuntimeSeed?.pendingLifecycle.taskStates
          .task_integrated_approval,
      ).toMatchObject({
        lastEvent: "approval.resolved",
        compensated: true,
        outcome: "denied",
      });
      expect(
        capturedRuntimeSeed?.pendingLifecycle.taskStates.task_integrated_tool,
      ).toMatchObject({
        lastEvent: "tool.result",
        compensated: true,
        success: false,
      });

      const state = JSON.parse(
        fs.readFileSync(
          path.join(manager.getSessionDirPath(session.id), "state.json"),
          "utf8",
        ),
      ) as {
        status: string;
        terminalReason?: string;
        terminalClassification?: string;
        lastError?: string;
      };
      expect(state.status).toBe("error");
      expect(state.terminalReason).toBe("stopped_error");
      expect(state.terminalClassification).toBe("stopped");
      expect(state.lastError).toBeUndefined();

      const snapshot = manager.getRecoverySnapshot(session.id);
      expect(snapshot.pendingLifecycle.pendingApprovals).toEqual({});
      expect(snapshot.pendingLifecycle.pendingTools).toEqual({});
      expect(snapshot.terminalClassification).toBe("stopped");
    } finally {
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("reuses direct approval resolution during recovery without appending compensated denial", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-approval-drift-recovery-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    try {
      const manager = new SessionManager();
      const session = manager.createNew();
      const transcriptPath = path.join(
        manager.getSessionDirPath(session.id),
        "transcript.jsonl",
      );
      const taskId = "task_direct_approval";

      manager.persistUserPromptBarrier(session.id, "approval recovery prompt");
      manager.markTurnActive(session.id);
      manager.appendQueryEvent(session.id, {
        type: "turn.started",
        role: "planner",
        turn: 1,
      });
      manager.appendQueryEvent(session.id, {
        type: "approval.requested",
        toolName: "bash",
        taskId,
      });
      manager.saveInterrupted(session.id, "turn");

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

      let capturedRuntimeSeed:
        | Awaited<ReturnType<SessionManager["buildRuntimeStateSeed"]>>
        | undefined;
      const runtime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (_prompt, _signal, runtimeSeed) {
          capturedRuntimeSeed = runtimeSeed;
          yield {
            type: "query.completed",
            result: {
              status: "completed",
              terminalReason: "completed",
              terminalClassification: "success",
              transcript: [],
              sharedContext: {
                sessionId: session.id,
                initialPrompt: "approval recovery prompt",
                notes: [],
                handoffs: [],
              },
              finalOutput: "approval recovered",
            },
          };
        },
      });

      const result = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: runtime,
        renderer: { renderLine() {} } as never,
      });

      await executeAutoResumePrompt(session.id, result, runtime);
      expect(capturedRuntimeSeed?.pendingLifecycle.pendingApprovals).toEqual(
        {},
      );
      expect(
        capturedRuntimeSeed?.pendingLifecycle.taskStates[taskId],
      ).toMatchObject({
        lastEvent: "approval.resolved",
        outcome: "approved",
        toolName: "bash",
        taskId,
      });
      expect(
        capturedRuntimeSeed?.pendingLifecycle.taskStates[taskId]?.compensated,
      ).toBeUndefined();

      const transcriptEvents = manager.getTranscriptEvents(session.id);
      expect(
        transcriptEvents.filter(
          (event) =>
            event.type === "query-event" &&
            event.event.type === "approval.resolved" &&
            event.event.taskId === taskId,
        ),
      ).toHaveLength(1);

      const snapshot = manager.getRecoverySnapshot(session.id);
      expect(snapshot.pendingLifecycle.pendingApprovals).toEqual({});
      expect(snapshot.pendingLifecycle.taskStates[taskId]).toMatchObject({
        lastEvent: "approval.resolved",
        outcome: "approved",
        taskId,
        toolName: "bash",
      });
    } finally {
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("reconciles approval drift before prompt-level resume when transcript already contains direct resolution", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-approval-prompt-recovery-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    try {
      const manager = new SessionManager();
      const session = manager.createNew();
      const transcriptPath = path.join(
        manager.getSessionDirPath(session.id),
        "transcript.jsonl",
      );
      const taskId = "task_prompt_approval";

      manager.persistUserPromptBarrier(session.id, "approval prompt resume");
      manager.appendQueryEvent(session.id, {
        type: "approval.requested",
        toolName: "bash",
        taskId,
      });
      manager.saveInterrupted(session.id, "prompt");

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

      let capturedRuntimeSeed:
        | Awaited<ReturnType<SessionManager["buildRuntimeStateSeed"]>>
        | undefined;
      const runtime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (_prompt, _signal, runtimeSeed) {
          capturedRuntimeSeed = runtimeSeed;
          yield {
            type: "query.completed",
            result: {
              status: "completed",
              terminalReason: "completed",
              terminalClassification: "success",
              transcript: [],
              sharedContext: {
                sessionId: session.id,
                initialPrompt: "approval prompt resume",
                notes: [],
                handoffs: [],
              },
              finalOutput: "approval prompt recovered",
            },
          };
        },
      });

      const result = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: runtime,
        renderer: { renderLine() {} } as never,
      });

      await executeAutoResumePrompt(session.id, result, runtime);
      expect(capturedRuntimeSeed?.pendingLifecycle.pendingApprovals).toEqual(
        {},
      );
      expect(
        capturedRuntimeSeed?.pendingLifecycle.taskStates[taskId],
      ).toMatchObject({
        lastEvent: "approval.resolved",
        outcome: "approved",
        taskId,
        toolName: "bash",
      });
      expect(
        capturedRuntimeSeed?.pendingLifecycle.taskStates[taskId]?.compensated,
      ).toBeUndefined();

      const transcriptEvents = manager.getTranscriptEvents(session.id);
      expect(
        transcriptEvents.filter(
          (event) =>
            event.type === "query-event" &&
            event.event.type === "approval.resolved" &&
            event.event.taskId === taskId,
        ),
      ).toHaveLength(1);

      const snapshot = manager.getRecoverySnapshot(session.id);
      expect(snapshot.pendingLifecycle.pendingApprovals).toEqual({});
    } finally {
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("keeps replay plan, runtime seed, cleanup semantics, and stopped terminal state aligned across prompt recovery", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-recovery-bundle-audit-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    try {
      const manager = new SessionManager();
      const session = manager.createNew();
      const sessionDir = manager.getSessionDirPath(session.id);
      const transcriptPath = path.join(sessionDir, "transcript.jsonl");
      const statePath = path.join(sessionDir, "state.json");

      manager.persistUserPromptBarrier(session.id, "bundle audit prompt");
      manager.appendQueryEvent(session.id, {
        type: "approval.requested",
        toolName: "bash",
        taskId: "task_bundle_approval",
      });
      manager.appendQueryEvent(session.id, {
        type: "approval.resolved",
        toolName: "bash",
        taskId: "task_bundle_approval",
        outcome: "approved",
      });
      manager.appendQueryEvent(session.id, {
        type: "tool.started",
        toolName: "bash",
        taskId: "task_bundle_direct_tool",
      });
      manager.appendQueryEvent(session.id, {
        type: "tool.result",
        toolName: "bash",
        taskId: "task_bundle_direct_tool",
        success: true,
      });
      manager.appendQueryEvent(session.id, {
        type: "tool.started",
        toolName: "read",
        taskId: "task_bundle_orphan_tool",
      });
      manager.saveInterrupted(session.id, "prompt");

      const transcriptWithoutInterrupted = manager
        .getTranscriptEvents(session.id)
        .filter(
          (event) =>
            !(event.type === "lifecycle" && event.event === "run-interrupted"),
        );
      fs.writeFileSync(
        transcriptPath,
        `${transcriptWithoutInterrupted.map((event) => JSON.stringify(event)).join("\n")}\n`,
        "utf8",
      );

      const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
        status: string;
        pendingPrompt?: string;
        runPhase?: string;
        interruptedKind?: string;
        pendingLifecycle?: {
          pendingApprovals: Record<
            string,
            { taskId: string; toolName: string }
          >;
          pendingTools: Record<string, { taskId: string; toolName: string }>;
          taskStates: Record<string, unknown>;
        };
      };
      state.pendingLifecycle = {
        pendingApprovals: {
          task_bundle_approval: {
            taskId: "task_bundle_approval",
            toolName: "bash",
          },
        },
        pendingTools: {
          task_bundle_direct_tool: {
            taskId: "task_bundle_direct_tool",
            toolName: "bash",
          },
          task_bundle_orphan_tool: {
            taskId: "task_bundle_orphan_tool",
            toolName: "read",
          },
        },
        taskStates: {},
      };
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");

      const replayPlan = manager.getReplayPlan(session.id);
      expect(replayPlan.repairSummary.insertedRunInterrupted).toBe(true);
      expect(replayPlan.repairSummary.insertedPromptMessage).toBe(false);
      expect(replayPlan.replayMessages).toHaveLength(1);
      expect(replayPlan.replayMessages[0]).toMatchObject({
        role: "user",
        content: "bundle audit prompt",
      });

      let capturedRuntimeSeed:
        | Awaited<ReturnType<SessionManager["buildRuntimeStateSeed"]>>
        | undefined;
      const runtime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (_prompt, _signal, runtimeSeed) {
          capturedRuntimeSeed = runtimeSeed;
          yield {
            type: "query.completed",
            result: {
              status: "stopped_error",
              terminalReason: "stopped_error",
              terminalClassification: "stopped",
              lastContinuationReason: "retryable-error",
              stopReason: "Bundle audit stop",
              transcript: [],
              sharedContext: {
                sessionId: session.id,
                initialPrompt: "bundle audit prompt",
                notes: [],
                handoffs: [],
              },
              finalOutput: "partial bundle output",
            },
          };
        },
      });

      const result = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: runtime,
        renderer: { renderLine() {} } as never,
      });

      await executeAutoResumePrompt(session.id, result, runtime);
      expect(capturedRuntimeSeed?.recoveryBoundary).toBe("fresh-entry");
      expect(
        capturedRuntimeSeed?.truthBoundary.repairSummary.insertedRunInterrupted,
      ).toBe(true);
      expect(capturedRuntimeSeed?.pendingLifecycle.pendingApprovals).toEqual(
        {},
      );
      expect(capturedRuntimeSeed?.pendingLifecycle.pendingTools).toEqual({});
      expect(
        capturedRuntimeSeed?.pendingLifecycle.taskStates.task_bundle_approval,
      ).toMatchObject({
        lastEvent: "approval.resolved",
        outcome: "approved",
        taskId: "task_bundle_approval",
        toolName: "bash",
      });
      expect(
        capturedRuntimeSeed?.pendingLifecycle.taskStates.task_bundle_approval
          ?.compensated,
      ).toBeUndefined();
      expect(
        capturedRuntimeSeed?.pendingLifecycle.taskStates
          .task_bundle_direct_tool,
      ).toMatchObject({
        lastEvent: "tool.result",
        success: true,
        taskId: "task_bundle_direct_tool",
        toolName: "bash",
      });
      expect(
        capturedRuntimeSeed?.pendingLifecycle.taskStates.task_bundle_direct_tool
          ?.compensated,
      ).toBeUndefined();
      expect(
        capturedRuntimeSeed?.pendingLifecycle.taskStates
          .task_bundle_orphan_tool,
      ).toMatchObject({
        lastEvent: "tool.result",
        success: false,
        compensated: true,
        taskId: "task_bundle_orphan_tool",
        toolName: "read",
      });

      const transcript = manager.getTranscriptEvents(session.id);
      expect(
        transcript.filter(
          (event) =>
            event.type === "lifecycle" && event.event === "run-started",
        ),
      ).toHaveLength(1);
      expect(
        transcript.filter(
          (event) =>
            event.type === "message" &&
            event.role === "user" &&
            event.content === "bundle audit prompt",
        ),
      ).toHaveLength(1);
      expect(
        transcript.filter(
          (event) =>
            event.type === "query-event" &&
            event.event.type === "approval.resolved" &&
            event.event.taskId === "task_bundle_approval",
        ),
      ).toHaveLength(1);
      expect(
        transcript.filter(
          (event) =>
            event.type === "query-event" &&
            event.event.type === "tool.result" &&
            event.event.taskId === "task_bundle_direct_tool",
        ),
      ).toHaveLength(1);
      expect(
        transcript.filter(
          (event) =>
            event.type === "query-event" &&
            event.event.type === "tool.result" &&
            event.event.taskId === "task_bundle_orphan_tool",
        ),
      ).toHaveLength(1);

      const finalState = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
        status: string;
        terminalReason?: string;
        terminalClassification?: string;
        lastError?: string;
      };
      expect(finalState.status).toBe("error");
      expect(finalState.terminalReason).toBe("stopped_error");
      expect(finalState.terminalClassification).toBe("stopped");
      expect(finalState.lastError).toBeUndefined();

      const snapshot = manager.getRecoverySnapshot(session.id);
      expect(snapshot.pendingLifecycle).toEqual(
        capturedRuntimeSeed?.pendingLifecycle,
      );
      expect(snapshot.terminalClassification).toBe("stopped");
      expect(snapshot.lastContinuationReason).toBe("retryable-error");
    } finally {
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("keeps replay plan, runtime seed, cleanup semantics, and true-error terminal state aligned across prompt recovery", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-recovery-error-audit-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    try {
      const manager = new SessionManager();
      const session = manager.createNew();
      const sessionDir = manager.getSessionDirPath(session.id);
      const transcriptPath = path.join(sessionDir, "transcript.jsonl");
      const statePath = path.join(sessionDir, "state.json");

      manager.persistUserPromptBarrier(session.id, "bundle error prompt");
      manager.appendQueryEvent(session.id, {
        type: "approval.requested",
        toolName: "bash",
        taskId: "task_error_approval",
      });
      manager.appendQueryEvent(session.id, {
        type: "approval.resolved",
        toolName: "bash",
        taskId: "task_error_approval",
        outcome: "approved",
      });
      manager.appendQueryEvent(session.id, {
        type: "tool.started",
        toolName: "read",
        taskId: "task_error_tool",
      });
      manager.saveInterrupted(session.id, "prompt");

      const transcriptWithoutInterrupted = manager
        .getTranscriptEvents(session.id)
        .filter(
          (event) =>
            !(event.type === "lifecycle" && event.event === "run-interrupted"),
        );
      fs.writeFileSync(
        transcriptPath,
        `${transcriptWithoutInterrupted.map((event) => JSON.stringify(event)).join("\n")}\n`,
        "utf8",
      );

      const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
        pendingLifecycle?: {
          pendingApprovals: Record<
            string,
            { taskId: string; toolName: string }
          >;
          pendingTools: Record<string, { taskId: string; toolName: string }>;
          taskStates: Record<string, unknown>;
        };
      };
      state.pendingLifecycle = {
        pendingApprovals: {
          task_error_approval: {
            taskId: "task_error_approval",
            toolName: "bash",
          },
        },
        pendingTools: {
          task_error_tool: { taskId: "task_error_tool", toolName: "read" },
        },
        taskStates: {},
      };
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");

      const replayPlan = manager.getReplayPlan(session.id);
      expect(replayPlan.repairSummary.insertedRunInterrupted).toBe(true);
      expect(replayPlan.replayMessages).toHaveLength(1);
      expect(replayPlan.replayMessages[0]).toMatchObject({
        role: "user",
        content: "bundle error prompt",
      });

      let capturedRuntimeSeed:
        | Awaited<ReturnType<SessionManager["buildRuntimeStateSeed"]>>
        | undefined;
      const runtime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (_prompt, _signal, runtimeSeed) {
          capturedRuntimeSeed = runtimeSeed;
          yield {
            type: "query.failed",
            error: "daemon exploded",
          };
        },
      });

      const result = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: runtime,
        renderer: { renderLine() {} } as never,
      });

      await expect(
        executeAutoResumePrompt(session.id, result, runtime),
      ).rejects.toThrow("daemon exploded");

      expect(capturedRuntimeSeed?.recoveryBoundary).toBe("fresh-entry");
      expect(
        capturedRuntimeSeed?.truthBoundary.repairSummary.insertedRunInterrupted,
      ).toBe(true);
      expect(
        capturedRuntimeSeed?.truthBoundary.repairSummary
          .strippedInterruptedTerminalEvents,
      ).toBe(replayPlan.repairSummary.strippedInterruptedTerminalEvents);
      expect(capturedRuntimeSeed?.pendingLifecycle.pendingApprovals).toEqual(
        {},
      );
      expect(capturedRuntimeSeed?.pendingLifecycle.pendingTools).toEqual({});
      expect(
        capturedRuntimeSeed?.pendingLifecycle.taskStates.task_error_approval,
      ).toMatchObject({
        lastEvent: "approval.resolved",
        outcome: "approved",
        taskId: "task_error_approval",
      });
      expect(
        capturedRuntimeSeed?.pendingLifecycle.taskStates.task_error_tool,
      ).toMatchObject({
        lastEvent: "tool.result",
        success: false,
        compensated: true,
        taskId: "task_error_tool",
      });

      const finalState = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
        status: string;
        terminalReason?: string;
        terminalClassification?: string;
        lastError?: string;
      };
      expect(finalState.status).toBe("error");
      expect(finalState.terminalReason).toBe("stopped_error");
      expect(finalState.terminalClassification).toBe("error");
      expect(finalState.lastError).toBe("daemon exploded");

      const snapshot = manager.getRecoverySnapshot(session.id);
      expect(snapshot.pendingLifecycle).toEqual(
        capturedRuntimeSeed?.pendingLifecycle,
      );
      expect(snapshot.terminalClassification).toBe("error");
      expect(snapshot.lastContinuationReason).toBeUndefined();

      const transcript = manager.getTranscriptEvents(session.id);
      expect(
        transcript.filter(
          (event) =>
            event.type === "lifecycle" && event.event === "run-started",
        ),
      ).toHaveLength(1);
      expect(
        transcript.filter(
          (event) =>
            event.type === "message" &&
            event.role === "user" &&
            event.content === "bundle error prompt",
        ),
      ).toHaveLength(1);
      expect(
        transcript.filter(
          (event) =>
            event.type === "query-event" &&
            event.event.type === "approval.resolved" &&
            event.event.taskId === "task_error_approval",
        ),
      ).toHaveLength(1);
      expect(
        transcript.filter(
          (event) =>
            event.type === "query-event" &&
            event.event.type === "tool.result" &&
            event.event.taskId === "task_error_tool",
        ),
      ).toHaveLength(1);
    } finally {
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("keeps pending lifecycle cleanup and replay repair stable across repeated resumes", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-repeated-resume-bundle-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    try {
      const manager = new SessionManager();
      const session = manager.createNew();
      const sessionDir = manager.getSessionDirPath(session.id);
      const transcriptPath = path.join(sessionDir, "transcript.jsonl");
      const statePath = path.join(sessionDir, "state.json");

      manager.persistUserPromptBarrier(session.id, "repeated resume prompt");
      manager.appendQueryEvent(session.id, {
        type: "approval.requested",
        toolName: "bash",
        taskId: "task_repeat_approval",
      });
      manager.appendQueryEvent(session.id, {
        type: "approval.resolved",
        toolName: "bash",
        taskId: "task_repeat_approval",
        outcome: "approved",
      });
      manager.appendQueryEvent(session.id, {
        type: "tool.started",
        toolName: "read",
        taskId: "task_repeat_tool",
      });
      manager.saveInterrupted(session.id, "prompt");

      const transcriptWithoutInterrupted = manager
        .getTranscriptEvents(session.id)
        .filter(
          (event) =>
            !(event.type === "lifecycle" && event.event === "run-interrupted"),
        );
      fs.writeFileSync(
        transcriptPath,
        `${transcriptWithoutInterrupted.map((event) => JSON.stringify(event)).join("\n")}\n`,
        "utf8",
      );

      const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
        pendingLifecycle?: {
          pendingApprovals: Record<
            string,
            { taskId: string; toolName: string }
          >;
          pendingTools: Record<string, { taskId: string; toolName: string }>;
          taskStates: Record<string, unknown>;
        };
      };
      state.pendingLifecycle = {
        pendingApprovals: {
          task_repeat_approval: {
            taskId: "task_repeat_approval",
            toolName: "bash",
          },
        },
        pendingTools: {
          task_repeat_tool: { taskId: "task_repeat_tool", toolName: "read" },
        },
        taskStates: {},
      };
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");

      let firstSeed:
        | Awaited<ReturnType<SessionManager["buildRuntimeStateSeed"]>>
        | undefined;
      const firstRuntime = {
        getState: () => "idle",
        executePrompt: async (
          _sessionId: string,
          _prompt: string,
          options?: {
            runtimeSeed?: Awaited<
              ReturnType<SessionManager["buildRuntimeStateSeed"]>
            >;
          },
        ) => {
          firstSeed = options?.runtimeSeed;
          manager.appendQueryEvent(session.id, {
            type: "turn.started",
            role: "coder",
            turn: 2,
          });
          manager.saveInterrupted(session.id, "turn");
          return "interrupted once";
        },
      } as never;

      const firstResult = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: firstRuntime,
        renderer: { renderLine() {} } as never,
      });

      await executeAutoResumePrompt(session.id, firstResult, firstRuntime);
      expect(firstSeed?.recoveryBoundary).toBe("fresh-entry");
      expect(
        firstSeed?.truthBoundary.repairSummary.insertedRunInterrupted,
      ).toBe(true);
      expect(firstSeed?.pendingLifecycle.pendingApprovals).toEqual({});
      expect(firstSeed?.pendingLifecycle.pendingTools).toEqual({});
      expect(
        firstSeed?.pendingLifecycle.taskStates.task_repeat_approval,
      ).toMatchObject({
        lastEvent: "approval.resolved",
        outcome: "approved",
        taskId: "task_repeat_approval",
      });
      expect(
        firstSeed?.pendingLifecycle.taskStates.task_repeat_tool,
      ).toMatchObject({
        lastEvent: "tool.result",
        success: false,
        compensated: true,
        taskId: "task_repeat_tool",
      });

      let secondSeed:
        | Awaited<ReturnType<SessionManager["buildRuntimeStateSeed"]>>
        | undefined;
      const secondRuntime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (_prompt, _signal, runtimeSeed) {
          secondSeed = runtimeSeed;
          yield {
            type: "query.completed",
            result: {
              status: "stopped_error",
              terminalReason: "stopped_error",
              terminalClassification: "stopped",
              lastContinuationReason: "retryable-error",
              stopReason: "Repeated resume stop",
              transcript: [],
              sharedContext: {
                sessionId: session.id,
                initialPrompt: "repeated resume prompt",
                notes: [],
                handoffs: [],
              },
              finalOutput: "partial repeated output",
            },
          };
        },
      });

      const secondResult = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: secondRuntime,
        renderer: { renderLine() {} } as never,
      });

      await executeAutoResumePrompt(session.id, secondResult, secondRuntime);
      expect(secondSeed?.recoveryBoundary).toBe("mid-turn-reentry");
      expect(
        secondSeed?.truthBoundary.repairSummary.insertedRunInterrupted,
      ).toBe(false);
      expect(secondSeed?.pendingLifecycle.pendingApprovals).toEqual({});
      expect(secondSeed?.pendingLifecycle.pendingTools).toEqual({});
      expect(
        secondSeed?.pendingLifecycle.taskStates.task_repeat_approval,
      ).toMatchObject({
        lastEvent: "approval.resolved",
        outcome: "approved",
      });
      expect(
        secondSeed?.pendingLifecycle.taskStates.task_repeat_tool,
      ).toMatchObject({
        lastEvent: "tool.result",
        success: false,
        compensated: true,
      });

      const transcript = manager.getTranscriptEvents(session.id);
      expect(
        transcript.filter(
          (event) =>
            event.type === "lifecycle" && event.event === "run-started",
        ),
      ).toHaveLength(1);
      expect(
        transcript.filter(
          (event) =>
            event.type === "message" &&
            event.role === "user" &&
            event.content === "repeated resume prompt",
        ),
      ).toHaveLength(1);
      expect(
        transcript.filter(
          (event) =>
            event.type === "query-event" &&
            event.event.type === "approval.resolved" &&
            event.event.taskId === "task_repeat_approval",
        ),
      ).toHaveLength(1);
      expect(
        transcript.filter(
          (event) =>
            event.type === "query-event" &&
            event.event.type === "tool.result" &&
            event.event.taskId === "task_repeat_tool",
        ),
      ).toHaveLength(1);

      const finalState = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
        status: string;
        terminalReason?: string;
        terminalClassification?: string;
        lastError?: string;
      };
      expect(finalState.status).toBe("error");
      expect(finalState.terminalReason).toBe("stopped_error");
      expect(finalState.terminalClassification).toBe("stopped");
      expect(finalState.lastError).toBeUndefined();
    } finally {
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("keeps multi-turn handoff projection and stopped terminal durability aligned through completed-turn recovery", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-handoff-recovery-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    try {
      const manager = new SessionManager();
      const session = manager.createNew();
      const plannerOutput = {
        role: "planner" as const,
        content: "plan",
        handoffTo: "coder" as const,
        handoffReason: "plan-ready",
        notes: ["planner-note"],
      };
      const coderOutput = {
        role: "coder" as const,
        content: "code",
        handoffTo: "reviewer" as const,
        handoffReason: "ready-for-review",
        notes: ["coder-note"],
      };

      manager.persistUserPromptBarrier(session.id, "handoff recovery prompt");
      manager.markTurnActive(session.id);
      manager.appendQueryEvent(session.id, {
        type: "query.started",
        sessionId: session.id,
        prompt: "handoff recovery prompt",
      });
      manager.appendQueryEvent(session.id, {
        type: "turn.started",
        role: "planner",
        turn: 1,
      });
      manager.appendQueryEvent(session.id, {
        type: "turn.completed",
        output: plannerOutput,
      });
      manager.appendQueryEvent(session.id, {
        type: "turn.started",
        role: "coder",
        turn: 2,
      });
      manager.appendQueryEvent(session.id, {
        type: "turn.completed",
        output: coderOutput,
      });
      manager.saveInterrupted(session.id, "turn");

      let capturedRuntimeSeed:
        | Awaited<ReturnType<SessionManager["buildRuntimeStateSeed"]>>
        | undefined;
      let reconstructedState:
        | ReturnType<typeof createQueryRuntimeStateFromSeed>
        | undefined;
      const runtime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (_prompt, _signal, runtimeSeed) {
          capturedRuntimeSeed = runtimeSeed;
          reconstructedState = runtimeSeed
            ? createQueryRuntimeStateFromSeed(runtimeSeed)
            : undefined;
          yield {
            type: "query.completed",
            result: {
              status: "stopped_error",
              terminalReason: "stopped_error",
              terminalClassification: "stopped",
              lastContinuationReason: "handoff",
              stopReason: "Reviewer stopped after recovery",
              transcript: [
                plannerOutput,
                coderOutput,
                {
                  role: "reviewer" as const,
                  content: "review paused",
                  notes: ["reviewer-note"],
                },
              ],
              sharedContext: {
                sessionId: session.id,
                initialPrompt: "handoff recovery prompt",
                notes: ["planner-note", "coder-note", "reviewer-note"],
                handoffs: [
                  {
                    from: "planner",
                    to: "coder",
                    reason: "plan-ready",
                    turn: 1,
                  },
                  {
                    from: "coder",
                    to: "reviewer",
                    reason: "ready-for-review",
                    turn: 2,
                  },
                ],
              },
              finalOutput: "review paused",
            },
          };
        },
      });

      const result = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: runtime,
        renderer: { renderLine() {} } as never,
      });

      await executeAutoResumePrompt(session.id, result, runtime);
      expect(capturedRuntimeSeed?.recoveryBoundary).toBe(
        "completed-turn-reentry",
      );
      expect(capturedRuntimeSeed?.truthBoundary.continuationSafety).toBe(
        "completed-turn-only",
      );
      expect(capturedRuntimeSeed?.currentRole).toBe("reviewer");
      expect(capturedRuntimeSeed?.turn).toBe(3);
      expect(capturedRuntimeSeed?.derivedState.transcript).toEqual([
        plannerOutput,
        coderOutput,
      ]);

      expect(reconstructedState?.sharedContext.notes).toEqual([
        "planner-note",
        "coder-note",
      ]);
      expect(reconstructedState?.sharedContext.handoffs).toEqual([
        { from: "planner", to: "coder", reason: "plan-ready", turn: 1 },
        { from: "coder", to: "reviewer", reason: "ready-for-review", turn: 2 },
      ]);
      expect(Array.from(reconstructedState?.visitedTransitions ?? [])).toEqual([
        "planner->coder:plan-ready",
        "coder->reviewer:ready-for-review",
      ]);
      expect(reconstructedState?.transcript).toEqual([
        plannerOutput,
        coderOutput,
      ]);

      const state = JSON.parse(
        fs.readFileSync(
          path.join(manager.getSessionDirPath(session.id), "state.json"),
          "utf8",
        ),
      ) as {
        status: string;
        terminalReason?: string;
        terminalClassification?: string;
        durableStatus?: string;
        lastContinuationReason?: string;
        lastError?: string;
      };
      expect(state.status).toBe("error");
      expect(state.terminalReason).toBe("stopped_error");
      expect(state.terminalClassification).toBe("stopped");
      expect(state.durableStatus).toBe("stopped");
      expect(state.lastContinuationReason).toBe("handoff");
      expect(state.lastError).toBeUndefined();

      const snapshot = manager.getRecoverySnapshot(session.id);
      expect(snapshot.durableStatus).toBe("stopped");
      expect(snapshot.terminalClassification).toBe("stopped");
      expect(snapshot.lastContinuationReason).toBe("handoff");
      expect(snapshot.pendingLifecycle.pendingApprovals).toEqual({});
      expect(snapshot.pendingLifecycle.pendingTools).toEqual({});
    } finally {
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("keeps prior handoff projection and stopped terminal durability aligned through mid-turn recovery", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-midturn-handoff-recovery-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    try {
      const manager = new SessionManager();
      const session = manager.createNew();
      const plannerOutput = {
        role: "planner" as const,
        content: "plan",
        handoffTo: "coder" as const,
        handoffReason: "plan-ready",
        notes: ["planner-note"],
      };
      const coderOutput = {
        role: "coder" as const,
        content: "code",
        handoffTo: "reviewer" as const,
        handoffReason: "ready-for-review",
        notes: ["coder-note"],
      };

      manager.persistUserPromptBarrier(
        session.id,
        "mid-turn handoff recovery prompt",
      );
      manager.markTurnActive(session.id);
      manager.appendQueryEvent(session.id, {
        type: "query.started",
        sessionId: session.id,
        prompt: "mid-turn handoff recovery prompt",
      });
      manager.appendQueryEvent(session.id, {
        type: "turn.started",
        role: "planner",
        turn: 1,
      });
      manager.appendQueryEvent(session.id, {
        type: "turn.completed",
        output: plannerOutput,
      });
      manager.appendQueryEvent(session.id, {
        type: "turn.started",
        role: "coder",
        turn: 2,
      });
      manager.appendQueryEvent(session.id, {
        type: "turn.completed",
        output: coderOutput,
      });
      manager.appendQueryEvent(session.id, {
        type: "turn.started",
        role: "reviewer",
        turn: 3,
      });
      manager.saveInterrupted(session.id, "turn");

      let capturedRuntimeSeed:
        | Awaited<ReturnType<SessionManager["buildRuntimeStateSeed"]>>
        | undefined;
      let reconstructedState:
        | ReturnType<typeof createQueryRuntimeStateFromSeed>
        | undefined;
      const runtime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (_prompt, _signal, runtimeSeed) {
          capturedRuntimeSeed = runtimeSeed;
          reconstructedState = runtimeSeed
            ? createQueryRuntimeStateFromSeed(runtimeSeed)
            : undefined;
          yield {
            type: "query.completed",
            result: {
              status: "stopped_error",
              terminalReason: "stopped_error",
              terminalClassification: "stopped",
              lastContinuationReason: "handoff",
              stopReason: "Reviewer stopped during resumed open turn",
              transcript: [
                plannerOutput,
                coderOutput,
                {
                  role: "reviewer" as const,
                  content: "review in progress",
                  notes: ["reviewer-note"],
                },
              ],
              sharedContext: {
                sessionId: session.id,
                initialPrompt: "mid-turn handoff recovery prompt",
                notes: ["planner-note", "coder-note", "reviewer-note"],
                handoffs: [
                  {
                    from: "planner",
                    to: "coder",
                    reason: "plan-ready",
                    turn: 1,
                  },
                  {
                    from: "coder",
                    to: "reviewer",
                    reason: "ready-for-review",
                    turn: 2,
                  },
                ],
              },
              finalOutput: "review in progress",
            },
          };
        },
      });

      const result = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: runtime,
        renderer: { renderLine() {} } as never,
      });

      await executeAutoResumePrompt(session.id, result, runtime);
      expect(capturedRuntimeSeed?.recoveryBoundary).toBe("mid-turn-reentry");
      expect(capturedRuntimeSeed?.truthBoundary.continuationSafety).toBe(
        "mid-turn-safe",
      );
      expect(capturedRuntimeSeed?.truthBoundary.openTurn).toEqual({
        role: "reviewer",
        turn: 3,
      });
      expect(capturedRuntimeSeed?.currentRole).toBe("reviewer");
      expect(capturedRuntimeSeed?.turn).toBe(3);
      expect(capturedRuntimeSeed?.derivedState.transcript).toEqual([
        plannerOutput,
        coderOutput,
      ]);

      expect(reconstructedState?.sharedContext.notes).toEqual([
        "planner-note",
        "coder-note",
      ]);
      expect(reconstructedState?.sharedContext.handoffs).toEqual([
        { from: "planner", to: "coder", reason: "plan-ready", turn: 1 },
        { from: "coder", to: "reviewer", reason: "ready-for-review", turn: 2 },
      ]);
      expect(Array.from(reconstructedState?.visitedTransitions ?? [])).toEqual([
        "planner->coder:plan-ready",
        "coder->reviewer:ready-for-review",
      ]);
      expect(reconstructedState?.transcript).toEqual([
        plannerOutput,
        coderOutput,
      ]);

      const state = JSON.parse(
        fs.readFileSync(
          path.join(manager.getSessionDirPath(session.id), "state.json"),
          "utf8",
        ),
      ) as {
        status: string;
        terminalReason?: string;
        terminalClassification?: string;
        durableStatus?: string;
        lastContinuationReason?: string;
        lastError?: string;
      };
      expect(state.status).toBe("error");
      expect(state.terminalReason).toBe("stopped_error");
      expect(state.terminalClassification).toBe("stopped");
      expect(state.durableStatus).toBe("stopped");
      expect(state.lastContinuationReason).toBe("handoff");
      expect(state.lastError).toBeUndefined();

      const snapshot = manager.getRecoverySnapshot(session.id);
      expect(snapshot.durableStatus).toBe("stopped");
      expect(snapshot.terminalClassification).toBe("stopped");
      expect(snapshot.lastContinuationReason).toBe("handoff");
      expect(snapshot.pendingLifecycle.pendingApprovals).toEqual({});
      expect(snapshot.pendingLifecycle.pendingTools).toEqual({});
    } finally {
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

});
