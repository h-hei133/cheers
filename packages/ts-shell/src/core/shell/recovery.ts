import type { StreamingRenderer } from '../../renderer/StreamingRenderer.js'
import { CONTINUATION_SAFETY_POLICY } from '../query/runtimeState.js'
import type { ResumeResult, SessionManager } from '../../session/SessionManager.js'
import { applyShellSubstrateTransition, type ShellRuntimeContext } from './runtimeContext.js'
import type { ShellSessionRuntime } from './sessionRuntime.js'

function isFailedResume(result: ResumeResult): result is Extract<ResumeResult, { ok: false }> {
  return result.ok === false
}

function guardRuntimeSeedForRecovery<T extends {
  config: { startingRole: string }
  recoveryBoundary: 'fresh-entry' | 'completed-turn-reentry' | 'mid-turn-reentry'
  currentRole: string
  turn: number
  truthBoundary: {
    pairedTurnCount: number
    continuationSafety: keyof typeof CONTINUATION_SAFETY_POLICY
  }
}> (runtimeSeed: T): T {
  const policy = CONTINUATION_SAFETY_POLICY[runtimeSeed.truthBoundary.continuationSafety]

  if (runtimeSeed.recoveryBoundary === policy.runtimeRecoveryBoundary) {
    return runtimeSeed
  }

  if (policy.resetToStartingRole) {
    return {
      ...runtimeSeed,
      recoveryBoundary: policy.runtimeRecoveryBoundary,
      currentRole: runtimeSeed.config.startingRole,
      turn: 1,
    }
  }

  return {
    ...runtimeSeed,
    recoveryBoundary: policy.runtimeRecoveryBoundary,
  }
}

export async function resumeShellSession(input: {
  requestedSessionId?: string
  fallbackSessionId?: string
  sessionManager: SessionManager
  runtimeContext: ShellRuntimeContext
  sessionRuntime: ShellSessionRuntime
  renderer: StreamingRenderer
}): Promise<{ resumed: boolean }> {
  const requestedSessionId =
    input.requestedSessionId ?? input.fallbackSessionId ?? input.sessionManager.getSuggestedRecoverySession()?.id

  if (!requestedSessionId) {
    input.renderer.renderLine('\nNo recoverable session found.\n')
    return { resumed: false }
  }

  const resumeResult = input.sessionManager.tryResume(requestedSessionId)
  if (isFailedResume(resumeResult)) {
    input.renderer.renderLine(`\n⚠️  ${resumeResult.error}`)
    input.renderer.renderLine(`ℹ️  ${resumeResult.recoveryHint}\n`)
    return { resumed: false }
  }

  applyShellSubstrateTransition(input.runtimeContext, {
    session: resumeResult.session,
    sessionProjectDir: input.runtimeContext.projectRoot,
  })
  input.renderer.renderLine(`\n♻️  Resumed session ${input.runtimeContext.session.id}`)

  const recoverySnapshot = input.sessionManager.getRecoverySnapshot(input.runtimeContext.session.id)
  const pendingPrompt = input.runtimeContext.session.pendingPrompt ?? recoverySnapshot.pendingPrompt

  if (
    recoverySnapshot.interruptedKind === 'turn'
    || recoverySnapshot.interruptedKind === 'prompt'
    || Object.keys(recoverySnapshot.pendingLifecycle.pendingApprovals).length > 0
    || Object.keys(recoverySnapshot.pendingLifecycle.pendingTools).length > 0
  ) {
    input.sessionManager.reconcilePendingLifecycle(input.runtimeContext.session.id)
  }

  if (pendingPrompt || recoverySnapshot.runPhase === 'turn-active') {
    if (pendingPrompt) {
      input.renderer.renderLine(`↪ Continuing pending prompt: ${pendingPrompt}\n`)
    }
    try {
      const runtimeSeed = input.sessionManager.buildRuntimeStateSeed(
        input.runtimeContext.session.id,
        { maxTurns: input.runtimeContext.runtimeConfig.maxTurns },
      )
      const guardedRuntimeSeed = guardRuntimeSeedForRecovery(runtimeSeed)
      if (guardedRuntimeSeed.recoveryBoundary !== runtimeSeed.recoveryBoundary) {
        input.renderer.renderLine(`\n⚠️  Recovery guardrail downgraded continuation to ${guardedRuntimeSeed.recoveryBoundary}.`)
      }
      await input.sessionRuntime.executePrompt(
        input.runtimeContext.session.id,
        pendingPrompt ?? guardedRuntimeSeed.config.initialPrompt,
        { runtimeSeed: guardedRuntimeSeed },
      )
    } catch (error) {
      if (input.sessionRuntime.getState() !== 'interrupted') {
        input.renderer.renderLine(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  return { resumed: true }
}
