import type { AgentExecutionOutput, AgentRole, OrchestrationResult } from '../../../orchestration/types.js'
import type { QueryRuntimeActionDecision } from './decision.js'

export type QueryEvent =
  | { readonly type: 'query.started'; readonly sessionId: string; readonly prompt: string }
  | { readonly type: 'runtime.next-action'; readonly turn: number; readonly role: AgentRole; readonly decision: QueryRuntimeActionDecision }
  | { readonly type: 'turn.started'; readonly role: AgentRole; readonly turn: number }
  | { readonly type: 'query.retrying'; readonly role: AgentRole; readonly turn: number; readonly attempt: number; readonly reason: string }
  | { readonly type: 'mcp.snapshot'; readonly clients: number; readonly tools: number }
  | { readonly type: 'tool.started'; readonly toolName: string; readonly taskId: string }
  | { readonly type: 'approval.requested'; readonly toolName: string; readonly taskId: string }
  | { readonly type: 'approval.resolved'; readonly toolName: string; readonly taskId: string; readonly outcome: 'approved' | 'denied'; readonly compensated?: boolean }
  | { readonly type: 'tool.result'; readonly toolName: string; readonly taskId: string; readonly success: boolean; readonly compensated?: boolean }
  | { readonly type: 'message.delta'; readonly role: AgentRole; readonly delta: string }
  | { readonly type: 'turn.completed'; readonly output: AgentExecutionOutput }
  | { readonly type: 'lifecycle.cancelled'; readonly reason: string }
  | { readonly type: 'lifecycle.error'; readonly error: string }
  | { readonly type: 'query.completed'; readonly result: OrchestrationResult }
  | { readonly type: 'query.failed'; readonly error: string }
