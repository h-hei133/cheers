import type { OrchestrationResult, TerminalReason } from '../../orchestration/types.js'
import type { QueryRuntimeState } from './runtimeState.js'
import type { QueryTerminal } from './transitions.js'

export function mapTerminalToOrchestrationResult(
  state: QueryRuntimeState,
  terminal: QueryTerminal,
): OrchestrationResult {
  return {
    status: terminal.terminalReason,
    terminalReason: terminal.terminalReason,
    terminalClassification: classifyTerminalReason(terminal.terminalReason),
    lastContinuationReason: state.lastContinuationReason,
    stopReason: terminal.stopReason,
    transcript: state.transcript,
    sharedContext: state.sharedContext,
    finalOutput: state.transcript[state.transcript.length - 1]?.content ?? '',
  }
}

export function classifyTerminalReason(reason: TerminalReason): OrchestrationResult['terminalClassification'] {
  return reason === 'completed' ? 'success' : 'stopped'
}
