import type { QueryEvent } from '../core/query/events.js'

export type AgentRole = 'planner' | 'coder' | 'reviewer'
export type ContinuationReason = 'handoff' | 'retryable-error'
export type TerminalReason =
  | 'completed'
  | 'stopped_cycle'
  | 'stopped_max_turns'
  | 'stopped_invalid_handoff'
  | 'stopped_error'
export type TerminalClassification = 'success' | 'stopped' | 'error'

export interface HandoffRecord {
  readonly from: AgentRole
  readonly to: AgentRole
  readonly reason: string
  readonly turn: number
}

export interface SharedContext {
  readonly sessionId: string
  readonly initialPrompt: string
  notes: string[]
  handoffs: HandoffRecord[]
}

export interface AgentExecutionInput {
  readonly role: AgentRole
  readonly rolePrompt: string
  readonly turn: number
  readonly maxTurns: number
  readonly sharedContext: Readonly<SharedContext>
  readonly transcript: readonly AgentExecutionOutput[]
}

export interface AgentExecutionOutput {
  readonly role: AgentRole
  readonly content: string
  readonly handoffTo?: AgentRole
  readonly handoffReason?: string
  readonly notes?: readonly string[]
  readonly events?: readonly QueryEvent[]
}

export type OrchestrationStatus = TerminalReason

export interface OrchestrationResult {
  readonly status: OrchestrationStatus
  readonly terminalReason: TerminalReason
  readonly terminalClassification: TerminalClassification
  readonly lastContinuationReason?: ContinuationReason
  readonly stopReason?: string
  readonly transcript: readonly AgentExecutionOutput[]
  readonly sharedContext: Readonly<SharedContext>
  readonly finalOutput: string
}

export interface OrchestratorOptions {
  readonly startingRole?: AgentRole
  readonly maxTurns?: number
}

export type AgentRunner = (
  input: AgentExecutionInput,
) => Promise<AgentExecutionOutput>
