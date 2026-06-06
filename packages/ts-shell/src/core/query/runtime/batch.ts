import type { AgentRole } from '../../../orchestration/types.js'
import type { ToolActionKind } from '../../../tools/policy/strategy.js'
import type { QueryRuntimeActionDecision } from './decision.js'
import type { RuntimeActionBlock } from './actionAuthority.js'

export type QueryRuntimeExecutionExitStatusClass = 'success' | 'failed' | 'blocked' | 'not-run'
export type QueryRuntimeExecutionFailureClass = string
export type QueryRuntimeExecutionRedactionStatus = 'report-safe' | 'redacted'

export interface QueryRuntimeExecutionBatchItem {
  readonly order: number
  readonly toolId: string
  readonly actionKind: ToolActionKind
  readonly targetPaths: readonly string[]
  readonly coveredFiles: readonly string[]
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
  readonly redactionStatus: QueryRuntimeExecutionRedactionStatus
  readonly truncated: boolean
  readonly commandCoverage?: QueryRuntimeCommandCoverage
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

export function buildQueryRuntimeExecutionBatch(input: {
  readonly role: AgentRole
  readonly turn: number
  readonly decision: QueryRuntimeActionDecision
}): QueryRuntimeExecutionBatch {
  const actionKind = input.decision.nextAction
  const targetPaths = targetPathsFor(input.decision)
  return Object.freeze({
    batchId: `runtime-batch:${input.turn}:${actionKind}`,
    turn: input.turn,
    role: input.role,
    actionKind,
    items: actionKind === 'stop-not-proven'
      ? []
      : [Object.freeze({
          order: 1,
          toolId: `runtime-${actionKind}`,
          actionKind,
          targetPaths,
          coveredFiles: actionKind === 'verify' ? input.decision.verificationTargets : [],
          terminalSuccessClaim: false as const,
        })],
    terminalSuccessClaim: false as const,
  })
}

export function blockedRuntimeExecutionBatchResult(input: {
  readonly batch: QueryRuntimeExecutionBatch
  readonly block: RuntimeActionBlock
}): QueryRuntimeExecutionBatchResult {
  return Object.freeze({
    batchId: input.batch.batchId,
    results: [Object.freeze({
      toolId: `runtime-${input.block.action}`,
      actionKind: input.block.action,
      coveredFiles: [],
      affectedPaths: [...input.block.targetFiles],
      exitStatusClass: 'blocked' as const,
      failureClass: 'authority-blocked',
      redactionStatus: 'report-safe' as const,
      truncated: false,
      terminalSuccessClaim: false as const,
    })],
    terminalSuccessClaim: false as const,
  })
}

export function hasUnsafeRuntimeExecutionFailure(
  result: QueryRuntimeExecutionBatchResult | undefined,
): boolean {
  return Boolean(result?.results.some((item) =>
    item.exitStatusClass === 'blocked' ||
    item.failureClass === 'authority-blocked' ||
    item.failureClass === 'unsafe-output'
  ))
}

function targetPathsFor(decision: QueryRuntimeActionDecision): readonly string[] {
  if (decision.nextAction === 'verify') {
    return unique([...decision.verificationTargets, ...decision.changedFiles])
  }
  if (decision.nextAction === 'artifact') {
    return unique([...decision.selectedPaths, ...decision.changedFiles, 'artifact'])
  }
  return unique([
    ...decision.selectedPaths,
    ...decision.ownerPaths,
    ...decision.changedFiles,
  ])
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}
