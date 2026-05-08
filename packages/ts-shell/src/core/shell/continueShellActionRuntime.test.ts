import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
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
});
