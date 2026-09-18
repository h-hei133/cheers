import type { AgentExecutionOutput, AgentRole, OrchestrationResult } from '../../../result/types.js'
import type { QueryRuntimeActionDecision } from './decision.js'
import type { QueryRuntimeExecutionResult } from './batch.js'
import type {
  QueryRuntimeLedgerEntry,
  QueryRuntimePendingRepair,
  QueryRuntimePendingVerification,
  QueryRuntimePendingWrite,
  QueryRuntimeSavePoint,
  QueryRuntimeTurnSnapshot,
} from './harness.js'
import type { QueryRuntimeProofProjection } from './proof.js'

export type QueryEvent =
  | { readonly type: 'query.started'; readonly sessionId: string; readonly prompt: string }
  | { readonly type: 'runtime.next-action'; readonly turn: number; readonly role: AgentRole; readonly decision: QueryRuntimeActionDecision }
  | { readonly type: 'runtime.turn-snapshot'; readonly turn: number; readonly role: AgentRole; readonly snapshot: QueryRuntimeTurnSnapshot }
  | { readonly type: 'runtime.save-point'; readonly turn: number; readonly role: AgentRole; readonly savePoint: QueryRuntimeSavePoint }
  | { readonly type: 'runtime.ledger-settled'; readonly turn: number; readonly role: AgentRole; readonly ledger: readonly QueryRuntimeLedgerEntry[] }
  | {
    readonly type: 'runtime.queue-settled';
    readonly turn: number;
    readonly role: AgentRole;
    readonly pendingWrite: readonly QueryRuntimePendingWrite[];
    readonly pendingVerification: readonly QueryRuntimePendingVerification[];
    readonly pendingRepair: readonly QueryRuntimePendingRepair[];
  }
  | ({
    readonly type: 'runtime.tool-feedback';
    readonly turn: number;
    readonly role: AgentRole;
  } & QueryRuntimeExecutionResult)
  | { readonly type: 'runtime.task-proof'; readonly turn: number; readonly role: AgentRole; readonly projection: QueryRuntimeProofProjection }
  | { readonly type: 'turn.started'; readonly role: AgentRole; readonly turn: number }
  | { readonly type: 'query.retrying'; readonly role: AgentRole; readonly turn: number; readonly attempt: number; readonly reason: string }
  | { readonly type: 'mcp.snapshot'; readonly clients: number; readonly tools: number }
  | {
    readonly type: 'tool.started'
    readonly toolName: string
    readonly taskId: string
    /** Arguments the call was made with, so a card can say what it is doing. */
    readonly args?: Readonly<Record<string, unknown>>
  }
  | { readonly type: 'approval.requested'; readonly toolName: string; readonly taskId: string }
  | { readonly type: 'approval.resolved'; readonly toolName: string; readonly taskId: string; readonly outcome: 'approved' | 'denied'; readonly compensated?: boolean }
  | {
    readonly type: 'tool.result';
    readonly toolName: string;
    readonly taskId: string;
    readonly success: boolean;
    readonly compensated?: boolean;
    readonly failureReason?: string;
    readonly coveredFiles?: readonly string[];
    /** What the tool printed, bounded, so its card can be opened and read. */
    readonly output?: string;
  }
  | { readonly type: 'message.delta'; readonly role: AgentRole; readonly delta: string }
  /**
   * What the model said while working the answer out. A separate channel because
   * it is not the answer: a reasoning model's working can run longer than its
   * conclusion, and merging the two buries the part that was asked for.
   */
  | { readonly type: 'reasoning.delta'; readonly role: AgentRole; readonly delta: string }
  /**
   * Replace what has been streamed so far for this message. Sent only when the
   * assembled text differs from the concatenated deltas — which happens when tool
   * calls were embedded in the prose and had to be lifted out of it.
   */
  | { readonly type: 'message.replace'; readonly role: AgentRole; readonly text: string }
  | { readonly type: 'turn.completed'; readonly output: AgentExecutionOutput }
  | { readonly type: 'lifecycle.cancelled'; readonly reason: string }
  | { readonly type: 'lifecycle.error'; readonly error: string }
  | { readonly type: 'query.completed'; readonly result: OrchestrationResult }
  | { readonly type: 'query.failed'; readonly error: string }
