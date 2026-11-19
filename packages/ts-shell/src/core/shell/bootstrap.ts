import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { Session } from "../../session/schema/sessionRecord.js";
import type { ResumeResult } from "../../session/SessionManager.js";
import type { WorkspaceRootMode } from "../../session/SessionManager.js";
import type { RuntimeConfigOverrides, RuntimeConfig } from "../../config/runtimeConfig.js";
import type { ProviderCredentialResolution } from './providerCredentials.js';
import type { WorkflowGitContext } from "../workspace/git.js";
import {
  createShellRuntimeContext,
  createSessionRootMismatchDiagnostic,
  resolveRootBindingDiagnostics,
  type RootBindingDiagnostic,
  type ShellRuntimeContext,
} from "./runtimeContext.js";
import { getWorkflowGitContext } from "../workspace/git.js";
import path from "node:path";
import { createSessionId, projectSessionFileLayout, validateSessionId } from "../../session/store/sessionFileLayout.js";
import { readSessionFileVersion } from '../../session/store/version.js';
import { sameValue } from '../../config/values.js';
import type { WorkspaceRoot } from '../workspace/model.js';
import { validateWorkspaceRoots } from '../workspace/roots.js';
import { normalizePathIdentity } from '../../session/continuation/roots.js';
import { replayTodosFromMessages } from "../commands/todoCommandRuntime.js";
import { hasUnfinishedSessionWork } from '../../session/recovery/work.js';

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
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
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

interface ShellBootstrapInput {
  cwd: string;
  launchCwd?: string;
  runtimeConfig: RuntimeConfig;
  runtimeConfigOverrides?: RuntimeConfigOverrides;
  resolveConfigTarget?: (config: RuntimeConfig, sessionId?: string) => ProviderCredentialResolution;
  deferredModel?: () => boolean;
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
  /** A validated new-process profile handoff always starts a fresh native identity. */
  freshSessionId?: string;
  forkSource?: string;
  allowSessionRootMigration?: boolean;
  emitLifecycleMessages?: boolean;
  /**
   * session. True for one-shot `--print` runs, which continue what the user was
   * last doing; false for an interactive launch, which is a new sitting.
   */
  adoptCurrentSession?: boolean;
}

export interface ShellStartupBinding {
  readonly projectRoot: string;
  readonly sessionId: string;
  readonly workspaceRoots?: readonly WorkspaceRoot[];
  readonly assertCurrent: () => void;
}

export function bootstrapShellRuntime(input: ShellBootstrapInput): ShellBootstrapResult {
  const result = bootstrapShell(input, false).next();
  if (!result.done) throw new Error('Unexpected startup admission request.');
  return result.value;
}

export function prepareShellStartup(input: ShellBootstrapInput) {
  const startup = bootstrapShell(input, true);
  const pending = startup.next();
  if (pending.done) throw new Error('Startup session could not be staged.');
  let used = false;
  return { binding: pending.value, activate: (): ShellBootstrapResult => {
    if (used) throw new Error('Startup session has already settled.');
    used = true;
    pending.value.assertCurrent();
    const result = startup.next();
    if (!result.done) throw new Error('Unexpected startup admission request.');
    return result.value;
  } };
}

function* bootstrapShell(input: ShellBootstrapInput, staged: boolean): Generator<ShellStartupBinding, ShellBootstrapResult, void> {
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

  const session = yield* selectStartupSession(input, requestedProjectRoot, requestedRootMode, emitLifecycleMessage, staged);
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
  if (legacyFieldsBackfilled) {
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
  phases.push("workspace-session-resolution", "background-services-start", "interactive-shell-ready");
  const context = createShellRuntimeContext({
    cwd: boundProjectRoot,
    originalCwd,
    projectRoot: boundProjectRoot,
    rootMode: boundRootMode,
    requestedWorkspaceRoot: boundRequestedWorkspaceRoot,
    targetPathBase: boundTargetPathBase,
    gitRoot: boundGitRoot,
    rootBindingDiagnostics,
    runtimeConfig: input.runtimeConfig,
    runtimeConfigOverrides: input.runtimeConfigOverrides,
    resolveConfigTarget: input.resolveConfigTarget,
    deferredModel: input.deferredModel,
    ...(input.skillOptions ? { skillOptions: input.skillOptions } : {}),
    ...(input.themePaths ? { themePaths: input.themePaths } : {}),
    gitContext: boundGitContext,
    session,
  });
  if (input.emitLifecycleMessages !== false) {
    for (const diagnostic of context.runtimeConfig.configDiagnostics) input.renderer.renderLine(`Warning: ${diagnostic}`);
  }
  return { phases, lifecycleNotices, context };
}

function* selectStartupSession(input: ShellBootstrapInput, requestedProjectRoot: string, requestedRootMode: WorkspaceRootMode,
  emitLifecycleMessage: (message: string) => void, staged: boolean): Generator<ShellStartupBinding, Session, void> {
    const manager = input.sessionManager;
    const createOptions = { rootMode: requestedRootMode, requestedWorkspaceRoot: input.requestedWorkspaceRoot ?? input.cwd,
      targetPathBase: requestedProjectRoot, gitRoot: input.gitContext.root ?? null };
    const readOnly = staged ? { readOnly: true } : undefined;
    if (input.freshSessionId) {
      if (input.requestedSessionId) throw new Error('A fresh profile session cannot also resume an existing session.');
      if (staged) yield captureStartupBinding(manager, input.freshSessionId, requestedProjectRoot);
      return manager.createNewWithId(input.freshSessionId, requestedProjectRoot, createOptions);
    }
    if (input.forkSource) {
      const sourceId = resolveForkSourceId(manager, input.forkSource, requestedProjectRoot, readOnly);
      let forkOptions: Parameters<SessionManager['fork']>[2] = { activate: true };
      if (staged) {
        const source = captureStartupSource(manager, sourceId);
        const id = createSessionId();
        const roots = source.session.projectRoot === requestedProjectRoot ? source.session.workspaceRoots : undefined;
        yield captureStartupBinding(manager, id, requestedProjectRoot, roots, source.assertCurrent);
        forkOptions = { activate: true, sessionId: id, expectedVersion: source.version };
      }
      const forked = manager.fork(sourceId, requestedProjectRoot, forkOptions);
      emitLifecycleMessage(`Forked session ${sourceId} into ${forked.id}`);
      return forked;
    }
    if (!input.requestedSessionId) {
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
        readOnly,
      );
      // A session with unfinished business is stepped back into whatever the run
      // kind: an interruption, an error, a prompt that never ran, or a write whose
      // outcome was never established. That is recovery, and it is what anyone
      // expects after a crash. A session the user simply closed is left closed, and
      // only a one-shot run steps into it.
      let unfinished = false;
      if (currentSelection.ok && input.adoptCurrentSession !== true) {
        try { unfinished = hasUnfinishedBusiness(input.sessionManager, currentSelection.session); }
        catch {
          emitLifecycleMessage('Current session recovery could not be verified; starting a fresh session. The saved session was retained.');
        }
      }
      if (currentSelection.ok && (input.adoptCurrentSession === true || unfinished)) {
        if (staged) {
          const source = captureStartupSource(manager, currentSelection.session.id);
          const root = source.session.projectRoot || requestedProjectRoot;
          yield captureStartupBinding(manager, source.session.id, root, source.session.workspaceRoots, source.assertCurrent);
          const resumed = requireResume(manager.tryResume(source.session.id, requestedProjectRoot,
            { mode: 'continuity-only', expectedVersion: source.version }), source.session.id);
          emitLifecycleMessage(`Resumed session ${resumed.id}`);
          return resumed;
        }
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
      if (staged) {
        const id = createSessionId();
        yield captureStartupBinding(manager, id, requestedProjectRoot);
        return manager.createNewWithId(id, requestedProjectRoot, createOptions);
      }
      return manager.createNew(requestedProjectRoot, createOptions);
    }

    if (!input.sessionManager.sessionExists(input.requestedSessionId)) {
      throw new SessionBootstrapError({
        code: "session-not-found",
        message: `Session ${input.requestedSessionId} not found.`,
        recoveryHint:
          `Use an existing --session-id, or omit --session-id to start a new session in ${requestedProjectRoot}.`,
      });
    }

    const source = staged ? captureStartupSource(manager, input.requestedSessionId) : undefined;
    const resumedSession = source?.session ?? requireResume(manager.tryResume(input.requestedSessionId, undefined,
      { mode: 'continuity-only' }), input.requestedSessionId);
    const sessionProjectRoot = resumedSession.projectRoot || requestedProjectRoot;
    const rootsEqual = areProjectRootsEqual(
      requestedProjectRoot,
      sessionProjectRoot,
    );
    const rootsCompatible = isEquivalentOrNestedProjectRoot(
      requestedProjectRoot,
      sessionProjectRoot,
    );

    if (input.allowSessionRootMigration && !rootsEqual) {
      let roots: readonly WorkspaceRoot[] | undefined;
      if (source) {
        roots = source.session.workspaceRoots?.filter(root => normalizePathIdentity(root.path) !== normalizePathIdentity(requestedProjectRoot));
        if (roots?.length) validateWorkspaceRoots(requestedProjectRoot, roots);
        yield captureStartupBinding(manager, resumedSession.id, requestedProjectRoot, roots, source.assertCurrent);
      }
      const reboundSession = input.sessionManager.rebindSessionProjectRoot(
        resumedSession.id,
        requestedProjectRoot,
        source ? { beforeCommit: source.assertCurrent, workspaceRoots: roots } : undefined,
      );
      emitLifecycleMessage(
        `Resumed session ${reboundSession.id} with migrated project root ${sessionProjectRoot} -> ${requestedProjectRoot}`,
      );
      return reboundSession;
    }

    if (rootsCompatible) {
      if (source) {
        yield captureStartupBinding(manager, resumedSession.id, sessionProjectRoot, resumedSession.workspaceRoots, source.assertCurrent);
      }
      const session = source ? requireResume(manager.tryResume(resumedSession.id, undefined,
        { mode: 'continuity-only', expectedVersion: source.version }), resumedSession.id) : resumedSession;
      emitLifecycleMessage(`Resumed session ${session.id}`);
      return session;
    }

    {
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

}

function requireResume(result: ResumeResult, id: string): Session {
  if (!isFailedResume(result)) return result.session;
  throw new SessionBootstrapError({ code: 'session-not-found', message: `Failed to resume session ${id}: ${result.error}`,
    recoveryHint: result.recoveryHint });
}

function captureStartupSource(manager: SessionManager, sessionId: string) {
  const directory = manager.getSessionDirPath(sessionId);
  const layout = projectSessionFileLayout({ sessionsDir: path.dirname(directory), sessionId });
  const version = readSessionFileVersion(layout);
  const assertCurrent = () => {
    if (manager.getSessionDirPath(sessionId) !== directory || readSessionFileVersion(layout) !== version) {
      throw new Error('The saved session changed while preparing startup.');
    }
  };
  const session = manager.getSession(sessionId);
  if (!session || session.id !== sessionId) throw new Error('The selected startup session is unavailable.');
  assertCurrent();
  return { session, version, assertCurrent };
}

function captureStartupBinding(manager: SessionManager, sessionId: string, projectRoot: string,
  workspaceRoots?: readonly WorkspaceRoot[], checkSource?: () => void): ShellStartupBinding {
  const selection = manager.readCurrentSessionSelection(projectRoot);
  return { projectRoot, sessionId, workspaceRoots, assertCurrent: () => {
    checkSource?.();
    if (!sameValue(manager.readCurrentSessionSelection(projectRoot), selection)) {
      throw new Error('Current session selection changed while preparing startup.');
    }
  } };
}

/**
 * Whether a session was left mid-work rather than closed.
 *
 * Active metadata is also used by idle sessions. Only their actual recovery
 * evidence distinguishes interrupted work from an ordinary previous sitting.
 */
const FORK_ARTIFACT_FILES = new Set(["metadata", "state", "transcript"]);

function resolveForkSourceId(
  sessionManager: SessionManager,
  rawSource: string,
  projectRoot: string,
  options?: { readonly readOnly?: boolean },
): string {
  const source = rawSource.trim();
  if (source === "current") {
    const current = sessionManager.resolveCurrentSessionForProject(projectRoot, options);
    if (!current.ok) {
      throw new SessionBootstrapError({
        code: "session-not-found",
        message: `No current session found to fork for ${projectRoot}.`,
        recoveryHint: `Start a session first or pass an existing session id to --fork.`,
      });
    }
    return current.session.id;
  }
  const isPath = source.includes("/") || source.includes("\\") || /\.(?:jsonl|json)$/i.test(source);
  let candidate = source;
  if (isPath) {
    const cleaned = source.replace(/[\\/]+$/, "");
    const base = path.basename(cleaned, path.extname(cleaned));
    candidate = FORK_ARTIFACT_FILES.has(base) ? (path.basename(path.dirname(cleaned)) || base) : base;
  }
  let validCandidate: string;
  try {
    validCandidate = validateSessionId(candidate);
    if (validCandidate === "." || validCandidate === ".." || validCandidate.includes("..")) {
      throw new Error("Invalid session id");
    }
  } catch (err) {
    throw new SessionBootstrapError({
      code: "session-not-found",
      message: err instanceof Error ? err.message : `Invalid --fork session '${rawSource}'.`,
      recoveryHint: "Pass a valid session id or session file path to --fork.",
    });
  }
  if (sessionManager.sessionExists(validCandidate)) return validCandidate;
  if (!isPath) {
    const prefixMatches = sessionManager.listSessions().filter((entry) => entry.projectRoot === projectRoot && entry.id.startsWith(validCandidate));
    if (prefixMatches.length === 1) return prefixMatches[0]!.id;
    if (prefixMatches.length > 1) {
      throw new SessionBootstrapError({
        code: "session-not-found",
        message: `Ambiguous --fork session prefix '${source}'.`,
        recoveryHint: "Pass a longer session id prefix to --fork.",
      });
    }
  }
  throw new SessionBootstrapError({
    code: "session-not-found",
    message: `Session '${rawSource}' not found for --fork.`,
    recoveryHint: "Check available sessions with /resume and pass a valid id to --fork.",
  });
}
function hasUnfinishedBusiness(
  sessionManager: SessionManager,
  session: Session,
): boolean {
  if (session.pendingPrompt?.trim()) return true;
  return hasUnfinishedSessionWork(sessionManager.getRecoverySnapshot(session.id));
}
