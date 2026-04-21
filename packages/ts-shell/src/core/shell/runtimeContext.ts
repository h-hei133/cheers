import type { RuntimeConfig } from '../../config/runtimeConfig.js'
import type { Session } from '../../session/SessionManager.js'
import type { WorkflowGitContext } from '../../workflow/gitContext.js'

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
  readonly runtimeConfig: RuntimeConfig
  gitContext: WorkflowGitContext
  session: Session
  activeSession: ActiveSessionIdentity
  resumeProvenance?: SessionResumeProvenance;
}

export interface ShellSubstrateTransition {
  readonly cwd?: string
  readonly originalCwd?: string
  readonly projectRoot?: string
  readonly gitContext?: WorkflowGitContext
  readonly session?: Session
  readonly sessionProjectDir?: string
  readonly resumeProvenance?: SessionResumeProvenance
}

export function createShellRuntimeContext(input: {
  cwd: string
  originalCwd: string
  projectRoot: string
  runtimeConfig: RuntimeConfig
  gitContext: WorkflowGitContext
  session: Session
  resumeProvenance?: SessionResumeProvenance;
}): ShellRuntimeContext {
  return {
    cwd: input.cwd,
    originalCwd: input.originalCwd,
    projectRoot: input.projectRoot,
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
  transition?: Pick<ShellSubstrateTransition, "cwd" | "originalCwd" | "projectRoot" | "gitContext">,
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
  const nextGitContext = transition.gitContext ?? context.gitContext
  const nextSession = transition.session ?? context.session

  context.cwd = nextCwd
  context.originalCwd = nextOriginalCwd
  context.projectRoot = nextProjectRoot
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
