import type { StreamingRenderer } from '../../renderer/StreamingRenderer.js'
import type { ResumeResult, SessionManager } from '../../session/SessionManager.js'
import type { RuntimeConfig } from '../../config/runtimeConfig.js'
import type { WorkflowGitContext } from '../../workflow/gitContext.js'
import { createShellRuntimeContext, type ShellRuntimeContext } from './runtimeContext.js'

function isFailedResume(result: ResumeResult): result is Extract<ResumeResult, { ok: false }> {
  return result.ok === false
}

export type ShellBootstrapPhase =
  | 'fast-path-parse'
  | 'config-load'
  | 'workspace-session-resolution'
  | 'background-services-start'
  | 'interactive-shell-ready'

export interface ShellBootstrapResult {
  readonly phases: ShellBootstrapPhase[]
  readonly context: ShellRuntimeContext
}

export function bootstrapShellRuntime(input: {
  cwd: string
  runtimeConfig: RuntimeConfig
  gitContext: WorkflowGitContext
  sessionManager: SessionManager
  renderer: StreamingRenderer
  requestedSessionId?: string
}): ShellBootstrapResult {
  const phases: ShellBootstrapPhase[] = ['fast-path-parse', 'config-load']
  const originalCwd = input.cwd
  const projectRoot = input.gitContext.root ?? input.cwd

  const session = (() => {
    if (!input.requestedSessionId) {
      return input.sessionManager.createNew()
    }

    const resumeResult = input.sessionManager.tryResume(input.requestedSessionId)
    if (resumeResult.ok) {
      input.renderer.renderLine(`♻️  Resumed session ${resumeResult.session.id}`)
      return resumeResult.session
    }

    if (isFailedResume(resumeResult)) {
      input.renderer.renderLine(`⚠️  ${resumeResult.error}`)
      input.renderer.renderLine(`ℹ️  ${resumeResult.recoveryHint}`)
      input.renderer.renderLine('↪ Starting a fresh session instead.\n')
    }
    return input.sessionManager.createNew()
  })()

  phases.push('workspace-session-resolution', 'background-services-start', 'interactive-shell-ready')

  return {
    phases,
    context: createShellRuntimeContext({
      cwd: input.cwd,
      originalCwd,
      projectRoot,
      runtimeConfig: input.runtimeConfig,
      gitContext: input.gitContext,
      session,
    }),
  }
}
