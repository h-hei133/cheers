import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { ResumeResult } from "../../session/SessionManager.js";
import type { RuntimeConfig } from "../../config/runtimeConfig.js";
import type { WorkflowGitContext } from "../../workflow/gitContext.js";
import { createShellRuntimeContext, type ShellRuntimeContext } from "./runtimeContext.js";
import { getWorkflowGitContext } from "../../workflow/gitContext.js";
import path from "node:path";

export type ShellBootstrapPhase =
  | "fast-path-parse"
  | "config-load"
  | "workspace-session-resolution"
  | "background-services-start"
  | "interactive-shell-ready";

export interface ShellBootstrapResult {
  readonly phases: ShellBootstrapPhase[];
  readonly context: ShellRuntimeContext;
  readonly lifecycleNotices: readonly string[];
}

export class SessionBootstrapError extends Error {
  readonly code:
    | "session-not-found"
    | "session-root-mismatch";
  readonly recoveryHint: string;

  constructor(input: {
    code: "session-not-found" | "session-root-mismatch";
    message: string;
    recoveryHint: string;
  }) {
    super(input.message);
    this.name = "SessionBootstrapError";
    this.code = input.code;
    this.recoveryHint = input.recoveryHint;
  }
}

function isFailedResume(
  result: ResumeResult,
): result is Extract<ResumeResult, { ok: false }> {
  return result.ok === false;
}

function normalizePathForCompare(value: string): string {
  return path.resolve(value).toLowerCase();
}

function isEquivalentOrNestedProjectRoot(
  requestedProjectRoot: string,
  sessionProjectRoot: string,
): boolean {
  const requested = normalizePathForCompare(requestedProjectRoot);
  const session = normalizePathForCompare(sessionProjectRoot);
  if (requested === session) {
    return true;
  }
  return (
    requested.startsWith(`${session}${path.sep.toLowerCase()}`) ||
    session.startsWith(`${requested}${path.sep.toLowerCase()}`)
  );
}

function areProjectRootsEqual(
  requestedProjectRoot: string,
  sessionProjectRoot: string,
): boolean {
  return (
    normalizePathForCompare(requestedProjectRoot) ===
    normalizePathForCompare(sessionProjectRoot)
  );
}

export function bootstrapShellRuntime(input: {
  cwd: string;
  launchCwd?: string;
  runtimeConfig: RuntimeConfig;
  gitContext: WorkflowGitContext;
  sessionManager: SessionManager;
  renderer: StreamingRenderer;
  requestedSessionId?: string;
  allowSessionRootMigration?: boolean;
  emitLifecycleMessages?: boolean;
}): ShellBootstrapResult {
  const phases: ShellBootstrapPhase[] = ["fast-path-parse", "config-load"];
  const lifecycleNotices: string[] = [];
  const emitLifecycleMessage = (message: string): void => {
    lifecycleNotices.push(message);
    if (input.emitLifecycleMessages !== false) {
      input.renderer.renderLine(message);
    }
  };
  const originalCwd = input.launchCwd ?? input.cwd;
  const requestedProjectRoot = input.gitContext.root ?? input.cwd;

  const session = (() => {
    if (!input.requestedSessionId) {
      const currentSession = input.sessionManager.getCurrentSessionForProject(
        requestedProjectRoot,
      );
      if (currentSession) {
        try {
          const resumed = input.sessionManager.resume(
            currentSession.id,
            requestedProjectRoot,
          );
          emitLifecycleMessage(`Resumed session ${resumed.id}`);
          return resumed;
        } catch {
          input.sessionManager.clearCurrentSessionForProject(requestedProjectRoot);
          emitLifecycleMessage(
            `Current session pointer stale for ${requestedProjectRoot}; starting a fresh session.`,
          );
        }
      }
      return input.sessionManager.createNew(requestedProjectRoot);
    }

    if (!input.sessionManager.sessionExists(input.requestedSessionId)) {
      throw new SessionBootstrapError({
        code: "session-not-found",
        message: `Session ${input.requestedSessionId} not found.`,
        recoveryHint:
          `Use an existing --session-id, or omit --session-id to start a new session in ${requestedProjectRoot}.`,
      });
    }

    const resumeResult = input.sessionManager.tryResume(input.requestedSessionId, undefined, {
      mode: "continuity-only",
    });
    if (isFailedResume(resumeResult)) {
      throw new SessionBootstrapError({
        code: "session-not-found",
        message: `Failed to resume session ${input.requestedSessionId}: ${resumeResult.error}`,
        recoveryHint: resumeResult.recoveryHint,
      });
    }

    const resumedSession = resumeResult.session;
    const sessionProjectRoot = resumedSession.projectRoot || requestedProjectRoot;
    const rootsEqual = areProjectRootsEqual(
      requestedProjectRoot,
      sessionProjectRoot,
    );
    const rootsCompatible = isEquivalentOrNestedProjectRoot(
      requestedProjectRoot,
      sessionProjectRoot,
    );

    if (
      input.allowSessionRootMigration &&
      !rootsEqual
    ) {
      const reboundSession = input.sessionManager.rebindSessionProjectRoot(
        resumedSession.id,
        requestedProjectRoot,
      );
      emitLifecycleMessage(
        `Resumed session ${reboundSession.id} with migrated project root ${sessionProjectRoot} -> ${requestedProjectRoot}`,
      );
      return reboundSession;
    }

    if (rootsCompatible) {
      emitLifecycleMessage(`Resumed session ${resumedSession.id}`);
      return resumedSession;
    }

    if (!input.allowSessionRootMigration) {
      throw new SessionBootstrapError({
        code: "session-root-mismatch",
        message:
          `Session ${resumedSession.id} is bound to ${sessionProjectRoot}, but current project root is ${requestedProjectRoot}.`,
        recoveryHint:
          "Rerun with --migrate-session-root to explicitly rebind this session, or omit --session-id to start a fresh session.",
      });
    }

    const reboundSession = input.sessionManager.rebindSessionProjectRoot(
      resumedSession.id,
      requestedProjectRoot,
    );
    emitLifecycleMessage(
      `Resumed session ${reboundSession.id} with migrated project root ${sessionProjectRoot} -> ${requestedProjectRoot}`,
    );
    return reboundSession;
  })();
  const boundProjectRoot = session.projectRoot || requestedProjectRoot;
  const boundGitContext = getWorkflowGitContext(boundProjectRoot);

  phases.push(
    "workspace-session-resolution",
    "background-services-start",
    "interactive-shell-ready",
  );

  return {
    phases,
    lifecycleNotices,
    context: createShellRuntimeContext({
      cwd: boundProjectRoot,
      originalCwd,
      projectRoot: boundProjectRoot,
      runtimeConfig: input.runtimeConfig,
      gitContext: boundGitContext,
      session,
    }),
  };
}
