import type { AgentRole, ContinuationReason, TerminalClassification, TerminalReason } from '../../../orchestration/types.js'

export type QueryContinue = {
  readonly action: 'continue'
  readonly nextRole: AgentRole
  readonly signature: string
  readonly continuationReason: ContinuationReason
  readonly reason: string
}

export type QueryTerminal = {
  readonly action: 'terminal'
  readonly terminalReason: TerminalReason
  readonly terminalClassification?: TerminalClassification
  readonly stopReason?: string
}

export const ALLOWED_HANDOFFS: Record<AgentRole, readonly AgentRole[]> = {
  planner: ['coder'],
  coder: ['reviewer'],
  reviewer: ['coder'],
}

export function continueQuery(
  from: AgentRole,
  to: AgentRole,
  reason: string,
  continuationReason: ContinuationReason = 'handoff',
): QueryContinue {
  return {
    action: 'continue',
    nextRole: to,
    signature: `${from}->${to}`,
    continuationReason,
    reason,
  }
}

export function terminalQuery(
  terminalReason: QueryTerminal['terminalReason'],
  stopReason?: string,
  terminalClassification?: QueryTerminal['terminalClassification'],
): QueryTerminal {
  return {
    action: 'terminal',
    terminalReason,
    stopReason,
    terminalClassification,
  }
}
