import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { Session } from "../../session/schema/sessionRecord.js";
import type { ResumeResult } from "../../session/SessionManager.js";
import type { WorkspaceRootMode } from "../../session/SessionManager.js";
import type { RuntimeConfig } from "../../config/runtimeConfig.js";
import type { WorkflowGitContext } from "../../workflow/gitContext.js";
import {
  createShellRuntimeContext,
  createSessionRootMismatchDiagnostic,
  resolveRootBindingDiagnostics,
  type RootBindingDiagnostic,
  type ShellRuntimeContext,
} from "./runtimeContext.js";
import { getWorkflowGitContext } from "../../workflow/gitContext.js";
import path from "node:path";
import { replayTodosFromMessages } from "../commands/todoCommandRuntime.js";

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
  readonly rootBindingDiagnostics: readonly RootBindingDiagnostic[];

  constructor(input: {
    code: "session-not-found" | "session-root-mismatch";
    message: string;
    recoveryHint: string;
    rootBindingDiagnostics?: readonly RootBindingDiagnostic[];
  }) {
    super(input.message);
    this.name = "SessionBootstrapError";
    this.code = input.code;
    this.recoveryHint = input.recoveryHint;
    this.rootBindingDiagnostics = input.rootBindingDiagnostics ?? [];
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

function resolveWorkspaceRootMode(gitContext: WorkflowGitContext): WorkspaceRootMode {
  return gitContext.insideGit && gitContext.root ? "git-root" : "direct";
}

export function bootstrapShellRuntime(input: {
  cwd: string;
  launchCwd?: string;
  runtimeConfig: RuntimeConfig;
  /** How this run was asked to load skills; carried into the runtime context. */
  skillOptions?: {
    readonly skillPaths?: readonly string[];
    readonly noSkills?: boolean;
  };
  /** Theme paths this run was started with; carried into the runtime context. */
  themePaths?: readonly string[];
  gitContext: WorkflowGitContext;
  requestedWorkspaceRoot?: string;
  sessionManager: SessionManager;
  renderer: StreamingRenderer;
  requestedSessionId?: string;
  allowSessionRootMigration?: boolean;
  emitLifecycleMessages?: boolean;
  /**
   * Step into the stored current-session pointer instead of starting a new
   * session. True for one-shot `--print` runs, which continue what the user was
   * last doing; false for an interactive launch, which is a new sitting.
   */
  adoptCurrentSession?: boolean;
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
  const requestedRootMode = resolveWorkspaceRootMode(input.gitContext);

  // Said before anything else, because a config file that could not be read
  // explains everything that follows: the settings it held are simply not in
  // effect, and without this line the only symptom is a product that ignores
  // what the user wrote.
  for (const diagnostic of input.runtimeConfig.configDiagnostics) {
    emitLifecycleMessage(`Warning: ${diagnostic}`);
  }

  const session = (() => {
    if (!input.requestedSessionId) {
      // Two kinds of run, two answers.
      //
      // A one-shot `--print` invocation is a continuation of whatever the user was
      // last doing — that is what makes `/continue` and `/resume current` mean
      // anything from a script — so it steps into the stored pointer.
      //
      // An interactive launch is a new sitting and gets its own session. Adopting
      // the pointer there meant every launch landed in the same session, with one
      // ever-growing history and no way to tell two days of work apart. The pointer
      // is still evaluated, because "why was it ignored" is worth saying, and it is
      // still what `/resume` and `/continue` fall back to.
      const currentSelection = input.sessionManager.resolveCurrentSessionForProject(
        requestedProjectRoot,
      );
      // A session with unfinished business is stepped back into whatever the run
      // kind: an interruption, an error, a prompt that never ran, or a write whose
      // outcome was never established. That is recovery, and it is what anyone
      // expects after a crash. A session the user simply closed is left closed, and
      // only a one-shot run steps into it.
      const unfinished =
        currentSelection.ok &&
        hasUnfinishedBusiness(input.sessionManager, currentSelection.session);
      if (currentSelection.ok && (input.adoptCurrentSession === true || unfinished)) {
        try {
          const resumed = input.sessionManager.resume(
            currentSelection.session.id,
            requestedProjectRoot,
          );
          emitLifecycleMessage(`Resumed session ${resumed.id}`);
          return resumed;
        } catch {
          input.sessionManager.clearCurrentSessionForProject(requestedProjectRoot);
          emitLifecycleMessage(
            `Current session pointer ${currentSelection.session.id} could not be resumed for ${requestedProjectRoot}; starting a fresh session.`,
          );
        }
      } else if (currentSelection.ok === false && currentSelection.reason !== "none") {
        emitLifecycleMessage(
          `Current session pointer ignored: ${currentSelection.detail} Starting a fresh session.`,
        );
      }
      return input.sessionManager.createNew(requestedProjectRoot, {
        rootMode: requestedRootMode,
        requestedWorkspaceRoot: input.requestedWorkspaceRoot ?? input.cwd,
        targetPathBase: requestedProjectRoot,
        gitRoot: input.gitContext.root ?? null,
      });
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
      const diagnostic = createSessionRootMismatchDiagnostic({
        sessionId: resumedSession.id,
        sessionProjectRoot,
        requestedWorkspaceRoot: input.requestedWorkspaceRoot ?? input.cwd,
        resolvedProjectRoot: requestedProjectRoot,
      });
      throw new SessionBootstrapError({
        code: "session-root-mismatch",
        message: diagnostic.explanation,
        recoveryHint: diagnostic.nextAction,
        rootBindingDiagnostics: [diagnostic],
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
  replayTodosFromMessages(session.id, session.turns);
  const boundProjectRoot = session.projectRoot || requestedProjectRoot;
  const boundGitContext = getWorkflowGitContext(boundProjectRoot);
  const boundRootMode = session.rootMode ?? resolveWorkspaceRootMode(boundGitContext);
  const boundRequestedWorkspaceRoot =
    input.requestedWorkspaceRoot ?? session.requestedWorkspaceRoot ?? input.cwd;
  const boundTargetPathBase = session.targetPathBase ?? boundProjectRoot;
  const boundGitRoot =
    Object.prototype.hasOwnProperty.call(session, "gitRoot")
      ? (session.gitRoot ?? null)
      : (boundGitContext.root ?? null);
  const legacyFieldsBackfilled =
    !session.rootMode ||
    !session.requestedWorkspaceRoot ||
    !session.targetPathBase ||
    !Object.prototype.hasOwnProperty.call(session, "gitRoot");
  if (
    legacyFieldsBackfilled
  ) {
    input.sessionManager.updateSessionWorkspaceBinding(session.id, {
      projectRoot: boundProjectRoot,
      rootMode: boundRootMode,
      requestedWorkspaceRoot: boundRequestedWorkspaceRoot,
      targetPathBase: boundTargetPathBase,
      gitRoot: boundGitRoot,
    });
  }
  session.rootMode = boundRootMode;
  session.requestedWorkspaceRoot = boundRequestedWorkspaceRoot;
  session.targetPathBase = boundTargetPathBase;
  session.gitRoot = boundGitRoot;
  const rootBindingDiagnostics = resolveRootBindingDiagnostics({
    projectRoot: boundProjectRoot,
    rootMode: boundRootMode,
    requestedWorkspaceRoot: boundRequestedWorkspaceRoot,
    targetPathBase: boundTargetPathBase,
    gitRoot: boundGitRoot,
    gitContext: boundGitContext,
    legacyFieldsBackfilled,
  });

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
      rootMode: boundRootMode,
      requestedWorkspaceRoot: boundRequestedWorkspaceRoot,
      targetPathBase: boundTargetPathBase,
      gitRoot: boundGitRoot,
      rootBindingDiagnostics,
      runtimeConfig: input.runtimeConfig,
      ...(input.skillOptions ? { skillOptions: input.skillOptions } : {}),
      ...(input.themePaths ? { themePaths: input.themePaths } : {}),
      gitContext: boundGitContext,
      session,
    }),
  };
}

/**
 * Whether a session was left mid-work rather than closed.
 *
 * Any of: it never reached a terminal state, a prompt is still pending, or a write
 * was started and its outcome never established. Each is a reason the user would
 * expect to land back in it rather than somewhere new.
 */
function hasUnfinishedBusiness(
  sessionManager: SessionManager,
  session: Session,
): boolean {
  if (session.status !== "terminated" && session.status !== "completed") return true;
  if (session.pendingPrompt?.trim()) return true;
  const summary = sessionManager.describeSessionReentry?.(session.id);
  return summary?.durableStatus === "stopped" || summary?.runPhase === "turn-active";
}
