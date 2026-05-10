import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  CodingResultSummary,
  OrchestrationResult,
} from "../../orchestration/types.js";
import { SessionManager, type Session } from "../../session/SessionManager.js";
import {
  runResumeLikeShellAction,
  type ResumeLikePromptTurnInput,
} from "./continueShellActionRuntime.js";
import type { ShellRuntimeContext } from "./runtimeContext.js";

function createRuntimeContext(session: Session): ShellRuntimeContext {
  return {
    cwd: "D:/repo",
    originalCwd: "D:/repo",
    projectRoot: "D:/repo",
    rootMode: "git-root",
    requestedWorkspaceRoot: "D:/repo",
    targetPathBase: "D:/repo",
    gitRoot: "D:/repo",
    rootBindingDiagnostics: [],
    runtimeConfig: {
      provider: "openai",
      daemonEnabled: true,
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
    session,
    activeSession: { sessionId: session.id, sessionProjectDir: "D:/repo" },
  } as never;
}

function withFakeHome<T>(prefix: string, run: () => Promise<T>): Promise<T> {
  const originalUserProfile = process.env.USERPROFILE;
  const originalHome = process.env.HOME;
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.env.USERPROFILE = fakeHome;
  process.env.HOME = fakeHome;

  return run().finally(() => {
    process.env.USERPROFILE = originalUserProfile;
    process.env.HOME = originalHome;
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });
}

describe("runResumeLikeShellAction", () => {
  it("executes returned auto-resume payload with runtime seed and continuity state", async () =>
    withFakeHome("private-agents-resume-action-", async () => {
      const manager = new SessionManager();
      const session = manager.createNew();
      manager.persistUserPromptBarrier(session.id, "resume action prompt");
      manager.saveInterrupted(session.id, "prompt");

      const turns: ResumeLikePromptTurnInput[] = [];
      const result = await runResumeLikeShellAction({
        slashResult: {
          kind: "shell-action",
          action: "resume-session",
          sessionId: session.id,
        },
        source: "interactive",
        printMode: false,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(session),
        renderer: { renderLine() {} } as never,
        turnNumber: 7,
        normalizePromptForExecution: (prompt) => prompt.trim(),
        switchRuntimeSessionProjectContext: (runtimeContext, nextSession) => {
          runtimeContext.session = nextSession;
        },
        renderSessionCommandMap: () => undefined,
        executeResolvedPromptTurn: async (input) => {
          turns.push(input);
        },
      });

      expect(result.turnNumber).toBe(8);
      expect(turns).toHaveLength(1);
      expect(turns[0].turnOrigin).toBe("resumed");
      expect(turns[0].turnNumber).toBe(8);
      expect(turns[0].effectivePrompt).toContain(
        "Continue the interrupted task using the recovery evidence below.",
      );
      expect(turns[0].runtimeSeed?.config.sessionId).toBe(session.id);
      expect(turns[0].runtimeSeed?.recoveryBoundary).toBe("fresh-entry");
      expect(turns[0].continuityState?.sessionId).toBe(session.id);
    }));

  it("continues completed sessions with a follow-up prompt and continuity snapshot", async () =>
    withFakeHome("private-agents-completed-continue-action-", async () => {
      const manager = new SessionManager();
      const session = manager.createNew();
      manager.persistUserPromptBarrier(session.id, "completed prompt");
      manager.saveCompleted(session.id);

      const turns: ResumeLikePromptTurnInput[] = [];
      const switched: string[] = [];
      const result = await runResumeLikeShellAction({
        slashResult: {
          kind: "shell-action",
          action: "continue-session",
          sessionId: session.id,
          continuationPrompt: " follow up ",
        },
        source: "interactive",
        printMode: false,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(session),
        renderer: { renderLine() {} } as never,
        turnNumber: 2,
        normalizePromptForExecution: (prompt) => `normalized:${prompt}`,
        switchRuntimeSessionProjectContext: (runtimeContext, nextSession) => {
          switched.push(nextSession.id);
          runtimeContext.session = nextSession;
        },
        renderSessionCommandMap: () => undefined,
        executeResolvedPromptTurn: async (input) => {
          turns.push(input);
        },
      });

      expect(result.turnNumber).toBe(3);
      expect(switched).toEqual([session.id]);
      expect(turns).toHaveLength(1);
      expect(turns[0]).toMatchObject({
        effectivePrompt: "normalized:follow up",
        turnNumber: 3,
        turnOrigin: "continued",
      });
      expect(turns[0].runtimeSeed).toBeUndefined();
      expect(turns[0].continuityState?.sessionId).toBe(session.id);
    }));

  it("renders stopped guidance before a stopped-session follow-up prompt", async () =>
    withFakeHome("private-agents-stopped-continue-action-", async () => {
      const manager = new SessionManager();
      const session = manager.createNew();
      manager.addTurn(session.id, {
        role: "user",
        content: "run failing verification",
      });
      manager.markRunStarted(session.id, "run failing verification");
      manager.saveError(session.id, "verification failed with exit code 1", {
        terminalReason: "stopped_error",
        terminalClassification: "stopped",
      });

      const lines: string[] = [];
      const turns: ResumeLikePromptTurnInput[] = [];
      const result = await runResumeLikeShellAction({
        slashResult: {
          kind: "shell-action",
          action: "continue-session",
          sessionId: session.id,
          continuationPrompt: "what should I do next after the failed command",
        },
        source: "interactive",
        printMode: false,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(session),
        renderer: {
          renderLine(line: string) {
            lines.push(line);
          },
        } as never,
        turnNumber: 4,
        normalizePromptForExecution: (prompt) => prompt.trim(),
        switchRuntimeSessionProjectContext: (runtimeContext, nextSession) => {
          runtimeContext.session = nextSession;
        },
        renderSessionCommandMap: () => undefined,
        executeResolvedPromptTurn: async (input) => {
          lines.push("EXECUTE_FOLLOWUP");
          turns.push(input);
        },
      });

      expect(result.turnNumber).toBe(5);
      expect(turns).toHaveLength(1);
      expect(turns[0]).toMatchObject({
        effectivePrompt: "what should I do next after the failed command",
        turnNumber: 5,
        turnOrigin: "continued",
      });
      expect(turns[0].continuityState?.lastTerminalClassification).toBe(
        "stopped",
      );
      expect(lines).toContain("Result");
      expect(lines).toContain("- Outcome: stopped");
      expect(lines).toContain("- TerminalState: stopped");
      expect(lines).toContain("- Reason: verification failed with exit code 1");
      expect(lines).toContain(
        `- Next action: Use /continue <follow-up prompt> or provide a concrete repair instruction to continue session ${session.id}.`,
      );
      expect(lines.indexOf("- Outcome: stopped")).toBeLessThan(
        lines.indexOf("EXECUTE_FOLLOWUP"),
      );
    }));

  it("renders partial mutation recovery details before a stopped-session follow-up prompt", async () =>
    withFakeHome("private-agents-partial-mutation-followup-", async () => {
      const manager = new SessionManager();
      const session = manager.createNew();
      const stopReason =
        "apply_patch multi-file workspace write stopped before success: src/b.ts failed after src/a.ts was verified.";
      manager.addTurn(session.id, {
        role: "user",
        content: "update two files",
      });
      manager.markRunStarted(session.id, "update two files");
      manager.appendQueryEvent(session.id, {
        type: "query.completed",
        result: makePartialMutationFailureResult(session.id, stopReason),
      });
      manager.saveError(session.id, stopReason, {
        terminalReason: "stopped_error",
        terminalClassification: "stopped",
      });

      const lines: string[] = [];
      const turns: ResumeLikePromptTurnInput[] = [];
      const result = await runResumeLikeShellAction({
        slashResult: {
          kind: "shell-action",
          action: "continue-session",
          sessionId: session.id,
          continuationPrompt: "what changed and what failed?",
        },
        source: "interactive",
        printMode: false,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(session),
        renderer: {
          renderLine(line: string) {
            lines.push(line);
          },
        } as never,
        turnNumber: 1,
        normalizePromptForExecution: (prompt) => prompt.trim(),
        switchRuntimeSessionProjectContext: (runtimeContext, nextSession) => {
          runtimeContext.session = nextSession;
        },
        renderSessionCommandMap: () => undefined,
        executeResolvedPromptTurn: async (input) => {
          lines.push("EXECUTE_FOLLOWUP");
          turns.push(input);
        },
      });

      const rendered = lines.join("\n");
      expect(result.turnNumber).toBe(2);
      expect(turns).toHaveLength(1);
      expect(turns[0].continuityState?.lastTerminalClassification).toBe(
        "stopped",
      );
      expect(turns[0].continuityState?.recentChangedFiles).toEqual(["src/a.ts"]);
      expect(turns[0].continuityState?.recentFailedFiles).toEqual([
        { path: "src/b.ts", reason: "write failed: EACCES" },
      ]);
      expect(rendered).toContain("- Outcome: stopped");
      expect(rendered).toContain("- BlockerKind: partial-mutation-failed");
      expect(rendered).toContain("- Changed files: src/a.ts");
      expect(rendered).toContain("- Verified files: src/a.ts");
      expect(rendered).toContain("- Failed files: src/b.ts (write failed: EACCES)");
      expect(rendered).toContain("- Writer started: yes");
      expect(rendered).toContain("- Write effect: unknown");
      expect(rendered).toContain("- Requires inspection: yes");
      expect(rendered).toContain(
        "- DoNext: Inspect/re-read both attempted files before retrying.",
      );
      expect(rendered).toContain("- Rollback: not attempted");
      expect(rendered).not.toContain("- Outcome: success");
      expect(rendered).not.toContain("Changed files: src/a.ts, src/b.ts");
      expect(rendered).not.toContain("rollback succeeded");
      expect(rendered).not.toContain("atomic rollback");
      expect(lines.indexOf("- Outcome: stopped")).toBeLessThan(
        lines.indexOf("EXECUTE_FOLLOWUP"),
      );
    }));
});

function makePartialMutationFailureResult(
  sessionId: string,
  stopReason: string,
): OrchestrationResult {
  const nextAction = "Inspect/re-read both attempted files before retrying.";
  const codingResult: CodingResultSummary = {
    taskKind: "edit-file",
    changedFiles: ["src/a.ts"],
    failedFiles: [{ path: "src/b.ts", reason: "write failed: EACCES" }],
    patches: [
      { path: "src/a.ts", operation: "replace", status: "applied" },
      {
        path: "src/b.ts",
        operation: "replace",
        status: "failed",
        reason: "write failed: EACCES",
      },
    ],
    repair: {
      status: "failed",
      attempts: 1,
      recoveredItems: [],
      failedItems: ["src/b.ts"],
      notes: [
        "Writer started in the multi-file route. Inspect/re-read both attempted files before retrying; no rollback was attempted.",
      ],
    },
    continuation: {
      status: "failed-after-bounded-continuation",
      attempts: 1,
      evidence: [
        "apply-patch-multi-file-write-result:writer-started-stopped",
        "apply-patch-multi-file-write-result:write-effect:unknown",
      ],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: ["src/a.ts"],
      attemptedFiles: ["src/a.ts", "src/b.ts"],
      changedFiles: ["src/a.ts"],
      unchangedAttemptedFiles: ["src/b.ts"],
    },
    taskSatisfaction: {
      verdict: "completed-with-caveats",
      reasons: [stopReason],
      requiredEvidence: ["per-file readback verification"],
      observedEvidence: [
        "actionable-blocker-kind:partial-mutation-failed",
        `actionable-blocker-next:${nextAction}`,
      ],
    },
    verifiedFiles: ["src/a.ts"],
    unverifiedFiles: [{ path: "src/b.ts", reason: "write failed: EACCES" }],
    verification: {
      status: "blocked",
      reason: stopReason,
      blockerKind: "unknown",
      nextAction,
    },
    evidence: [
      "actionable-blocker-kind:partial-mutation-failed",
      `actionable-blocker-next:${nextAction}`,
      "apply-patch-multi-file-write-result:writer-started-no-success",
      "apply-patch-multi-file-write-result:write-effect:unknown",
      "apply-patch-multi-file-write-result:user-inspection-required",
      "apply-patch-multi-file-write-result:no-rollback",
      "write-effect:unknown",
    ],
    failureBoundary: stopReason,
    lastActionResultSeed: {
      actionKind: "edit-file",
      target: "src/a.ts, src/b.ts",
      changedFiles: ["src/a.ts"],
      verifiedFiles: ["src/a.ts"],
      writerStarted: true,
      writeEffect: "unknown",
      requiresUserInspection: true,
      verification: {
        status: "blocked",
        reason: stopReason,
        blockerKind: "unknown",
      },
      reason: stopReason,
      blockerKind: "unknown",
    },
  };

  return {
    status: "stopped_error",
    terminalReason: "stopped_error",
    terminalClassification: "stopped",
    stopReason,
    transcript: [],
    sharedContext: {
      sessionId,
      initialPrompt: "update two files",
      notes: [],
      handoffs: [],
    },
    finalOutput: "",
    codingResult,
  };
}
