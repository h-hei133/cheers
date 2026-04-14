import type { OrchestrationResult, TerminalReason } from '../../orchestration/types.js'
import type { QueryRuntimeState } from './runtimeState.js'
import type { QueryTerminal } from './transitions.js'

export function mapTerminalToOrchestrationResult(
  state: QueryRuntimeState,
  terminal: QueryTerminal,
): OrchestrationResult {
  const terminalClassification = terminal.terminalClassification
    ?? classifyTerminalReason(terminal.terminalReason, state.lastContinuationReason)

  return {
    status: terminal.terminalReason,
    terminalReason: terminal.terminalReason,
    terminalClassification,
    lastContinuationReason: state.lastContinuationReason,
    stopReason: terminal.stopReason,
    transcript: state.transcript,
    sharedContext: state.sharedContext,
    finalOutput: state.transcript[state.transcript.length - 1]?.content ?? '',
  }
}

export function classifyTerminalReason(
  reason: TerminalReason,
  lastContinuationReason?: QueryRuntimeState['lastContinuationReason'],
): OrchestrationResult['terminalClassification'] {
  if (reason === 'stopped_error') {
    return lastContinuationReason === 'retryable-error' ? 'stopped' : 'error'
  }

  return reason === 'completed' ? 'success' : 'stopped'
}
