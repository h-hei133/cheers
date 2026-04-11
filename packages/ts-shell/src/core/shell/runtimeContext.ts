import type { RuntimeConfig } from '../../config/runtimeConfig.js'
import type { Session } from '../../session/SessionManager.js'
import type { WorkflowGitContext } from '../../workflow/gitContext.js'

export interface ActiveSessionIdentity {
  readonly sessionId: string
  readonly sessionProjectDir: string
}

export interface ShellRuntimeContext {
  cwd: string
  originalCwd: string
  projectRoot: string
  readonly runtimeConfig: RuntimeConfig
  readonly gitContext: WorkflowGitContext
  session: Session
  activeSession: ActiveSessionIdentity
}

export interface ShellSubstrateTransition {
  readonly cwd?: string
  readonly originalCwd?: string
  readonly projectRoot?: string
  readonly session?: Session
  readonly sessionProjectDir?: string
}

export function createShellRuntimeContext(input: {
  cwd: string
  originalCwd: string
  projectRoot: string
  runtimeConfig: RuntimeConfig
  gitContext: WorkflowGitContext
  session: Session
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
  }
}

export function switchActiveSession(
  context: ShellRuntimeContext,
  session: Session,
  sessionProjectDir: string = context.projectRoot,
): void {
  applyShellSubstrateTransition(context, {
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
  const nextSession = transition.session ?? context.session

  context.cwd = nextCwd
  context.originalCwd = nextOriginalCwd
  context.projectRoot = nextProjectRoot
  context.session = nextSession
  context.activeSession = {
    sessionId: nextSession.id,
    sessionProjectDir: transition.sessionProjectDir ?? nextProjectRoot,
  }
}
