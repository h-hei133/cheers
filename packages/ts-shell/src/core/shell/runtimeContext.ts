import type { RuntimeConfig } from '../../config/runtimeConfig.js'
import type { Session, WorkspaceRootMode } from '../../session/SessionManager.js'
import type { WorkflowGitContext } from '../../workflow/gitContext.js'
import path from 'node:path'

export interface ActiveSessionIdentity {
  readonly sessionId: string
  readonly sessionProjectDir: string
}

export interface SessionResumeProvenance {
  readonly source:
    | "fresh-start"
    | "normal-resume"
    | "explicit-switch"
    | "explicit-rebind"
    | "rebind-required"
    | "restart-required";
  readonly requestedSessionId?: string;
  readonly resolvedSessionId?: string;
  readonly rebindFromMissingSessionId?: string;
}

export interface ShellRuntimeContext {
  cwd: string
  originalCwd: string
  projectRoot: string
  rootMode: WorkspaceRootMode
  requestedWorkspaceRoot?: string
  targetPathBase: string
  gitRoot: string | null
  rootBindingDiagnostics: readonly RootBindingDiagnostic[]
  /**
   * The settings in force for this session.
   *
   * Mutable because it is read once at startup and a long session outlives the
   * file it came from: editing `config.json` mid-session would otherwise change
   * nothing until restart, with no indication why. `/reload` re-reads it in place.
   * Everything else this context holds is fixed for the session.
   */
  runtimeConfig: RuntimeConfig
  gitContext: WorkflowGitContext
  session: Session
  activeSession: ActiveSessionIdentity
  resumeProvenance?: SessionResumeProvenance;
}

export interface ShellSubstrateTransition {
  readonly cwd?: string
  readonly originalCwd?: string
  readonly projectRoot?: string
  readonly rootMode?: WorkspaceRootMode
  readonly requestedWorkspaceRoot?: string
  readonly targetPathBase?: string
  readonly gitRoot?: string | null
  readonly rootBindingDiagnostics?: readonly RootBindingDiagnostic[]
  readonly gitContext?: WorkflowGitContext
  readonly session?: Session
  readonly sessionProjectDir?: string
  readonly resumeProvenance?: SessionResumeProvenance
}

export function createShellRuntimeContext(input: {
  cwd: string
  originalCwd: string
  projectRoot: string
  rootMode: WorkspaceRootMode
  requestedWorkspaceRoot?: string
  targetPathBase: string
  gitRoot: string | null
  rootBindingDiagnostics?: readonly RootBindingDiagnostic[]
  runtimeConfig: RuntimeConfig
  gitContext: WorkflowGitContext
  session: Session
  resumeProvenance?: SessionResumeProvenance;
}): ShellRuntimeContext {
  return {
    cwd: input.cwd,
    originalCwd: input.originalCwd,
    projectRoot: input.projectRoot,
    rootMode: input.rootMode,
    ...(input.requestedWorkspaceRoot
      ? { requestedWorkspaceRoot: input.requestedWorkspaceRoot }
      : {}),
    targetPathBase: input.targetPathBase,
    gitRoot: input.gitRoot,
    rootBindingDiagnostics:
      input.rootBindingDiagnostics ??
      resolveRootBindingDiagnostics({
        projectRoot: input.projectRoot,
        rootMode: input.rootMode,
        requestedWorkspaceRoot: input.requestedWorkspaceRoot,
        targetPathBase: input.targetPathBase,
        gitRoot: input.gitRoot,
        gitContext: input.gitContext,
      }),
    runtimeConfig: input.runtimeConfig,
    gitContext: input.gitContext,
    session: input.session,
    activeSession: {
      sessionId: input.session.id,
      sessionProjectDir: input.projectRoot,
    },
    ...(input.resumeProvenance
      ? { resumeProvenance: input.resumeProvenance }
      : {}),
  }
}

export function switchActiveSession(
  context: ShellRuntimeContext,
  session: Session,
  sessionProjectDir: string = context.projectRoot,
  transition?: Pick<
    ShellSubstrateTransition,
    "cwd" | "originalCwd" | "projectRoot" | "rootMode" | "requestedWorkspaceRoot" | "targetPathBase" | "gitRoot" | "rootBindingDiagnostics" | "gitContext"
  >,
): void {
  applyShellSubstrateTransition(context, {
    ...transition,
    session,
    sessionProjectDir,
  })
}

export function applyShellSubstrateTransition(
  context: ShellRuntimeContext,
  transition: ShellSubstrateTransition,
): void {
  const nextCwd = transition.cwd ?? context.cwd
  const nextOriginalCwd = transition.originalCwd ?? context.originalCwd
  const nextProjectRoot = transition.projectRoot ?? context.projectRoot
  const nextRootMode = transition.rootMode ?? context.rootMode
  const nextRequestedWorkspaceRoot =
    transition.requestedWorkspaceRoot ?? context.requestedWorkspaceRoot
  const nextTargetPathBase =
    transition.targetPathBase ?? context.targetPathBase ?? nextProjectRoot
  const nextGitRoot =
    Object.prototype.hasOwnProperty.call(transition, "gitRoot")
      ? (transition.gitRoot ?? null)
      : context.gitRoot
  const nextGitContext = transition.gitContext ?? context.gitContext
  const nextSession = transition.session ?? context.session
  const nextRootBindingDiagnostics =
    transition.rootBindingDiagnostics ??
    resolveRootBindingDiagnostics({
      projectRoot: nextProjectRoot,
      rootMode: nextRootMode,
      requestedWorkspaceRoot: nextRequestedWorkspaceRoot,
      targetPathBase: nextTargetPathBase,
      gitRoot: nextGitRoot,
      gitContext: nextGitContext,
    })

  context.cwd = nextCwd
  context.originalCwd = nextOriginalCwd
  context.projectRoot = nextProjectRoot
  context.rootMode = nextRootMode
  if (nextRequestedWorkspaceRoot) {
    context.requestedWorkspaceRoot = nextRequestedWorkspaceRoot
  }
  context.targetPathBase = nextTargetPathBase
  context.gitRoot = nextGitRoot
  context.rootBindingDiagnostics = nextRootBindingDiagnostics
  context.gitContext = nextGitContext
  context.session = nextSession
  context.activeSession = {
    sessionId: nextSession.id,
    sessionProjectDir: transition.sessionProjectDir ?? nextProjectRoot,
  }
  if (Object.prototype.hasOwnProperty.call(transition, "resumeProvenance")) {
    context.resumeProvenance = transition.resumeProvenance
  }
}

export type RootBindingDiagnosticSeverity = "info" | "warning" | "blocked"

export interface RootBindingDiagnostic {
  readonly code:
    | "root-binding-git-auto-upgrade"
    | "root-binding-legacy-backfilled"
    | "root-binding-direct-gitroot-mismatch"
    | "root-binding-gitroot-missing"
    | "root-binding-target-base-mismatch"
    | "root-binding-session-mismatch"
    | "root-binding-workspace-switch"
  readonly severity: RootBindingDiagnosticSeverity
  readonly explanation: string
  readonly nextAction: string
}

export function createSessionRootMismatchDiagnostic(input: {
  readonly sessionId: string
  readonly sessionProjectRoot: string
  readonly requestedWorkspaceRoot?: string
  readonly resolvedProjectRoot: string
}): RootBindingDiagnostic {
  const requested = input.requestedWorkspaceRoot?.trim() || input.resolvedProjectRoot
  return {
    code: "root-binding-session-mismatch",
    severity: "blocked",
    explanation:
      `Session ${input.sessionId} is bound to ${input.sessionProjectRoot}, but the current requested workspace ${requested} resolves to ${input.resolvedProjectRoot}.`,
    nextAction:
      "Start a new session for this workspace, resume from the original session project root, or rerun with --migrate-session-root to explicitly rebind this session.",
  }
}

export function createWorkspaceAttachSwitchDiagnostic(input: {
  readonly currentProjectRoot: string
  readonly requestedWorkspaceRoot: string
  readonly resolvedProjectRoot: string
}): RootBindingDiagnostic {
  return {
    code: "root-binding-workspace-switch",
    severity: "warning",
    explanation:
      `Workspace attach requested ${input.requestedWorkspaceRoot}, which resolves to ${input.resolvedProjectRoot}; the current session is bound to ${input.currentProjectRoot}.`,
    nextAction:
      "Confirm this project switch is intended. Use /resume current after attach to inspect the new active session, or stay in the current project and use paths relative to its Target path base.",
  }
}

export function resolveRootBindingDiagnostics(input: {
  readonly projectRoot: string
  readonly rootMode: WorkspaceRootMode
  readonly requestedWorkspaceRoot?: string
  readonly targetPathBase: string
  readonly gitRoot: string | null
  readonly gitContext: WorkflowGitContext
  readonly legacyFieldsBackfilled?: boolean
}): readonly RootBindingDiagnostic[] {
  const diagnostics: RootBindingDiagnostic[] = []
  const requested = input.requestedWorkspaceRoot?.trim()

  if (
    requested &&
    input.rootMode === "git-root" &&
    input.gitContext.insideGit &&
    input.gitContext.root &&
    normalizePathForCompare(requested) !== normalizePathForCompare(input.projectRoot)
  ) {
    diagnostics.push({
      code: "root-binding-git-auto-upgrade",
      severity: "info",
      explanation:
        "Requested workspace is inside a git repo, so the active project root is the resolved git root.",
      nextAction:
        "Use paths relative to Target path base, or attach a directory outside this git repo for an independent workspace.",
    })
  }

  if (input.legacyFieldsBackfilled) {
    diagnostics.push({
      code: "root-binding-legacy-backfilled",
      severity: "info",
      explanation:
        "This session was missing one or more root binding fields and they were backfilled from the current project context.",
      nextAction:
        "Run /workspace status to confirm the restored root binding before editing files.",
    })
  }

  if (input.rootMode === "direct" && input.gitRoot !== null) {
    diagnostics.push({
      code: "root-binding-direct-gitroot-mismatch",
      severity: "warning",
      explanation:
        "Root mode is direct, but the session still has a gitRoot binding.",
      nextAction:
        "Run /workspace attach <path> again for the intended workspace, or start a fresh session if this binding is stale.",
    })
  }

  if (input.rootMode === "git-root" && !input.gitRoot) {
    diagnostics.push({
      code: "root-binding-gitroot-missing",
      severity: "warning",
      explanation:
        "Root mode is git-root, but no gitRoot binding is recorded.",
      nextAction:
        "Run /workspace status from the intended repo root or re-attach the project path.",
    })
  }

  if (
    normalizePathForCompare(input.targetPathBase) !==
    normalizePathForCompare(input.projectRoot)
  ) {
    diagnostics.push({
      code: "root-binding-target-base-mismatch",
      severity: "warning",
      explanation:
        "Target path base differs from projectRoot, but subdir-root mode is not implemented.",
      nextAction:
        "Re-attach the project root or start a fresh session before editing files.",
    })
  }

  return diagnostics
}

function normalizePathForCompare(value: string): string {
  return path.resolve(value).toLowerCase()
}
