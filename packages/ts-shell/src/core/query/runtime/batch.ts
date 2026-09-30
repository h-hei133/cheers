import type { AgentRole } from '../../../result/types.js';
import type { RuntimeSourceFact } from '../../../context/acquisition/code/source.js';
import type { ToolActionKind } from '../../../tools/policy/strategy.js';
import type { QueryRuntimeActionDecision, QueryRuntimeRepairPlan } from './decision.js';

export type QueryRuntimeExecutionExitStatusClass = 'success' | 'failed' | 'blocked' | 'not-run'

export type QueryRuntimeExecutionFailureClass = string

export type QueryRuntimeExecutionRedactionStatus = 'report-safe' | 'redacted'

export interface QueryRuntimeExecutionBatchItem {
  readonly order: number
  readonly toolId: string
  readonly actionKind: ToolActionKind
  readonly targetPaths: readonly string[]
  readonly coveredFiles: readonly string[]
  readonly repairPlan?: QueryRuntimeRepairPlan
  readonly terminalSuccessClaim: false
}

export interface QueryRuntimeExecutionBatch {
  readonly batchId: string
  readonly turn: number
  readonly role: AgentRole
  readonly actionKind: ToolActionKind
  readonly items: readonly QueryRuntimeExecutionBatchItem[]
  readonly terminalSuccessClaim: false
}

export interface QueryRuntimeCommandCoverage {
  readonly taskId: string
  readonly coveredFiles: readonly string[]
  readonly uncoveredFiles?: readonly string[]
  readonly coverageStatus?: string
}

export interface QueryRuntimeExecutionResult {
  readonly toolId: string
  readonly actionKind: ToolActionKind
  readonly coveredFiles: readonly string[]
  readonly affectedPaths: readonly string[]
  readonly exitStatusClass: QueryRuntimeExecutionExitStatusClass
  readonly failureClass: QueryRuntimeExecutionFailureClass
  readonly diagnosticSummary?: string
  readonly redactionStatus: QueryRuntimeExecutionRedactionStatus
  readonly truncated: boolean
  readonly commandCoverage?: QueryRuntimeCommandCoverage
  readonly sourceFacts?: readonly RuntimeSourceFact[]
  readonly terminalSuccessClaim?: false
}

export interface QueryRuntimeExecutionBatchResult {
  readonly batchId: string
  readonly results: readonly QueryRuntimeExecutionResult[]
  readonly terminalSuccessClaim?: false
}

export interface QueryRuntimeExecutionBatchInput {
  readonly batch: QueryRuntimeExecutionBatch
  readonly decision: QueryRuntimeActionDecision
}

export type QueryRuntimeExecutionBatchExecutor = (
  input: QueryRuntimeExecutionBatchInput,
) => Promise<QueryRuntimeExecutionBatchResult>
