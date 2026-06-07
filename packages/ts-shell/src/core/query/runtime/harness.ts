import type { AgentExecutionOutput, AgentRole, CodingResultSummary } from '../../../orchestration/types.js'
import { selectRepairFailureStrategy } from '../../../repair/flow/strategy.js'
import type { ToolActionKind } from '../../../tools/policy/strategy.js'
import type { QueryRuntimeExecutionBatch, QueryRuntimeExecutionBatchResult } from './batch.js'
import type { QueryRuntimeActionDecision } from './decision.js'
import type { QueryRuntimeObservationState } from './observation.js'

export interface QueryRuntimePendingWrite {
  readonly queueId: string
  readonly actionKind: ToolActionKind
  readonly targetFiles: readonly string[]
  readonly status: 'pending' | 'accounted'
}

export interface QueryRuntimePendingVerification {
  readonly queueId: string
  readonly targetFiles: readonly string[]
  readonly command?: string
  readonly reason?: string
}

export interface QueryRuntimePendingRepair {
  readonly queueId: string
  readonly failureClass: string
  readonly failureSummary: string
  readonly hypothesis: string
  readonly priorAttempt?: string
  readonly contextNeed?: string
  readonly targetFiles: readonly string[]
}

export interface QueryRuntimeLedgerEntry {
  readonly sequence: number
  readonly turn: number
  readonly role: AgentRole
  readonly actionKind: ToolActionKind
  readonly toolId: string
  readonly targetFiles: readonly string[]
  readonly affectedPaths: readonly string[]
  readonly exitStatusClass: string
  readonly failureClass: string
  readonly truncated: boolean
  readonly redactionStatus: string
  readonly diagnosticSummary?: string
}

export interface QueryRuntimeTurnSnapshot {
  readonly snapshotId: string
  readonly turn: number
  readonly role: AgentRole
  readonly runtimeAction: ToolActionKind
  readonly actionBatch: QueryRuntimeExecutionBatch
  readonly pendingWrite: readonly QueryRuntimePendingWrite[]
  readonly pendingVerification: readonly QueryRuntimePendingVerification[]
  readonly pendingRepair: readonly QueryRuntimePendingRepair[]
  readonly changedFiles: readonly string[]
  readonly failureState: readonly string[]
  readonly verificationPlan: readonly QueryRuntimePendingVerification[]
  readonly repairAttempts: readonly string[]
  readonly artifactPendingState: {
    readonly claims: readonly string[]
    readonly evidenceIds: readonly string[]
    readonly missingClaims: readonly string[]
  }
  readonly taskStateVersion: number
}

export interface QueryRuntimeSavePoint {
  readonly savePointId: string
  readonly phase: 'restore' | 'before-batch' | 'after-batch' | 'after-output'
  readonly turn: number
  readonly role: AgentRole
  readonly ledgerLength: number
  readonly snapshot?: QueryRuntimeTurnSnapshot
  readonly pendingWrite: readonly QueryRuntimePendingWrite[]
  readonly pendingVerification: readonly QueryRuntimePendingVerification[]
  readonly pendingRepair: readonly QueryRuntimePendingRepair[]
}

export interface QueryRuntimeHarnessState {
  readonly taskStateVersion: number
  readonly snapshots: readonly QueryRuntimeTurnSnapshot[]
  readonly savePoints: readonly QueryRuntimeSavePoint[]
  readonly ledger: readonly QueryRuntimeLedgerEntry[]
  readonly pendingWrite: readonly QueryRuntimePendingWrite[]
  readonly pendingVerification: readonly QueryRuntimePendingVerification[]
  readonly pendingRepair: readonly QueryRuntimePendingRepair[]
}

export interface QueryRuntimeHarnessSeed {
  readonly taskStateVersion?: number
  readonly snapshots?: readonly QueryRuntimeTurnSnapshot[]
  readonly savePoints?: readonly QueryRuntimeSavePoint[]
  readonly ledger?: readonly QueryRuntimeLedgerEntry[]
  readonly pendingWrite?: readonly QueryRuntimePendingWrite[]
  readonly pendingVerification?: readonly QueryRuntimePendingVerification[]
  readonly pendingRepair?: readonly QueryRuntimePendingRepair[]
}

export function createQueryRuntimeHarnessState(seed: QueryRuntimeHarnessSeed = {}): QueryRuntimeHarnessState {
  const state = freezeHarness({
    taskStateVersion: seed.taskStateVersion ?? 1,
    snapshots: [...(seed.snapshots ?? [])],
    savePoints: [...(seed.savePoints ?? [])],
    ledger: [...(seed.ledger ?? [])],
    pendingWrite: [...(seed.pendingWrite ?? [])],
    pendingVerification: [...(seed.pendingVerification ?? [])],
    pendingRepair: [...(seed.pendingRepair ?? [])],
  })
  return state.savePoints.length > 0
    ? state
    : appendHarnessSavePoint(state, {
        phase: 'restore',
        turn: 0,
        role: 'planner',
      })
}

export function captureHarnessTurnSnapshot(input: {
  readonly harness: QueryRuntimeHarnessState
  readonly turn: number
  readonly role: AgentRole
  readonly decision: QueryRuntimeActionDecision
  readonly batch: QueryRuntimeExecutionBatch
  readonly observations: QueryRuntimeObservationState
}): QueryRuntimeTurnSnapshot {
  return Object.freeze({
    snapshotId: `runtime-snapshot:${input.turn}:${input.decision.nextAction}:${input.harness.snapshots.length + 1}`,
    turn: input.turn,
    role: input.role,
    runtimeAction: input.decision.nextAction,
    actionBatch: input.batch,
    pendingWrite: input.harness.pendingWrite,
    pendingVerification: input.harness.pendingVerification,
    pendingRepair: input.harness.pendingRepair,
    changedFiles: uniqueStrings([
      ...input.observations.changedFiles,
      ...input.harness.pendingWrite.flatMap((item) => item.targetFiles),
    ]),
    failureState: uniqueStrings([
      ...input.observations.failureCategories,
      ...input.harness.pendingRepair.map((item) => item.failureClass),
    ]),
    verificationPlan: input.harness.pendingVerification,
    repairAttempts: uniqueStrings([
      ...input.observations.repairAttempts.map((item) => item.signature),
      ...input.harness.pendingRepair.flatMap((item) => item.priorAttempt ? [item.priorAttempt] : []),
    ]),
    artifactPendingState: {
      claims: input.observations.artifactClaims,
      evidenceIds: input.observations.artifactClaimEvidence.flatMap((item) => item.evidenceId ? [item.evidenceId] : []),
      missingClaims: input.observations.artifactClaims.filter((claim) =>
        !input.observations.artifactClaimEvidence.some((item) => item.claim === claim && item.evidenceId)
      ),
    },
    taskStateVersion: input.harness.taskStateVersion,
  })
}

export function recordHarnessSnapshot(
  harness: QueryRuntimeHarnessState,
  snapshot: QueryRuntimeTurnSnapshot,
): QueryRuntimeHarnessState {
  return freezeHarness({
    ...harness,
    snapshots: [...harness.snapshots, snapshot],
  })
}

export function appendHarnessSavePoint(
  harness: QueryRuntimeHarnessState,
  input: {
    readonly phase: QueryRuntimeSavePoint['phase']
    readonly turn: number
    readonly role: AgentRole
    readonly snapshot?: QueryRuntimeTurnSnapshot
  },
): QueryRuntimeHarnessState {
  return freezeHarness({
    ...harness,
    savePoints: [
      ...harness.savePoints,
      Object.freeze({
        savePointId: `runtime-save-point:${input.turn}:${input.phase}:${harness.savePoints.length + 1}`,
        phase: input.phase,
        turn: input.turn,
        role: input.role,
        ledgerLength: harness.ledger.length,
        ...(input.snapshot ? { snapshot: input.snapshot } : {}),
        pendingWrite: harness.pendingWrite,
        pendingVerification: harness.pendingVerification,
        pendingRepair: harness.pendingRepair,
      }),
    ],
  })
}

export function settleHarnessBatch(input: {
  readonly harness: QueryRuntimeHarnessState
  readonly batch: QueryRuntimeExecutionBatch
  readonly result: QueryRuntimeExecutionBatchResult
}): QueryRuntimeHarnessState {
  let pendingWrite = [...input.harness.pendingWrite]
  let pendingVerification = [...input.harness.pendingVerification]
  let pendingRepair = [...input.harness.pendingRepair]
  const nextLedger = [...input.harness.ledger]

  for (const result of input.result.results) {
    const sequence = nextLedger.length + 1
    nextLedger.push(Object.freeze({
      sequence,
      turn: input.batch.turn,
      role: input.batch.role,
      actionKind: result.actionKind,
      toolId: result.toolId,
      targetFiles: uniqueStrings(result.coveredFiles),
      affectedPaths: uniqueStrings(result.affectedPaths),
      exitStatusClass: result.exitStatusClass,
      failureClass: result.failureClass,
      truncated: result.truncated,
      redactionStatus: result.redactionStatus,
      ...(result.diagnosticSummary ? { diagnosticSummary: safeText(result.diagnosticSummary) } : {}),
    }))

    if ((result.actionKind === 'edit' || result.actionKind === 'repair') &&
      result.exitStatusClass === 'success' &&
      result.affectedPaths.length > 0) {
      pendingWrite = upsertPendingWrite(pendingWrite, {
        queueId: `write:${sequence}`,
        actionKind: result.actionKind,
        targetFiles: uniqueStrings(result.affectedPaths),
        status: 'pending',
      })
    }

    if (result.actionKind === 'verify' && result.exitStatusClass === 'success') {
      pendingVerification = removeCoveredVerification(pendingVerification, [
        ...result.coveredFiles,
        ...result.affectedPaths,
      ])
    }

    if (result.actionKind === 'verify' && result.exitStatusClass !== 'success') {
      pendingVerification = removeCoveredVerification(pendingVerification, [
        ...result.coveredFiles,
        ...result.affectedPaths,
      ])
      const failureSummary = safeText(result.diagnosticSummary ?? result.failureClass)
      pendingRepair = upsertPendingRepair(pendingRepair, {
        queueId: `repair:${sequence}`,
        failureClass: result.failureClass,
        failureSummary,
        hypothesis: 'repair failed verification target',
        priorAttempt: result.toolId,
        ...(needsContext(result.failureClass, failureSummary)
          ? { contextNeed: result.affectedPaths[0] ?? result.coveredFiles[0] }
          : {}),
        targetFiles: uniqueStrings([...result.affectedPaths, ...result.coveredFiles]),
      })
    }

    if (result.actionKind === 'repair' && result.exitStatusClass !== 'success') {
      const failureSummary = safeText(result.diagnosticSummary ?? result.failureClass)
      const targetFiles = uniqueStrings([...result.affectedPaths, ...result.coveredFiles])
      const strategy = selectRepairFailureStrategy({
        failureClass: result.failureClass,
        failureSummary,
        targetFiles,
      })
      pendingRepair = upsertPendingRepair(pendingRepair, {
        queueId: `repair:${sequence}`,
        failureClass: result.failureClass,
        failureSummary,
        hypothesis: strategy.hypothesis,
        priorAttempt: result.toolId,
        ...(strategy.contextNeed ? { contextNeed: strategy.contextNeed } : {}),
        targetFiles,
      })
    }
  }

  return freezeHarness({
    ...input.harness,
    ledger: nextLedger,
    pendingWrite,
    pendingVerification,
    pendingRepair,
  })
}

export function settleHarnessOutput(input: {
  readonly harness: QueryRuntimeHarnessState
  readonly output: AgentExecutionOutput
}): QueryRuntimeHarnessState {
  const result = input.output.codingResult
  if (!result) return input.harness

  let pendingWrite = [...input.harness.pendingWrite]
  let pendingVerification = [...input.harness.pendingVerification]
  let pendingRepair = [...input.harness.pendingRepair]
  const changedFiles = uniqueStrings([
    ...result.changedFiles,
    ...result.changeSet.changedFiles,
    ...(result.lastActionResultSeed?.changedFiles ?? []),
  ])

  if (changedFiles.length > 0) {
    for (const write of input.harness.pendingWrite) {
      if (write.targetFiles.every((path) => changedFiles.includes(path))) {
        if (result.verification.status !== 'failed' && result.repair.status !== 'failed') {
          pendingVerification = upsertPendingVerification(pendingVerification, {
            queueId: `verify-after:${write.queueId}`,
            targetFiles: write.targetFiles,
            command: result.verification.command,
            reason: result.verification.reason ?? 'changed files require verification',
          })
        }
        pendingWrite = pendingWrite.filter((item) => item.queueId !== write.queueId)
      }
    }
  }

  if (result.verification.status === 'passed') {
    pendingVerification = removeCoveredVerification(pendingVerification, result.verifiedFiles)
  }

  if (result.verification.status === 'failed' || result.repair.status === 'failed') {
    pendingRepair = upsertPendingRepair(pendingRepair, repairForResult(result))
  }

  if (result.repair.status === 'recovered') {
    const repairedTargets = uniqueStrings([...result.repair.recoveredItems, ...changedFiles])
    pendingRepair = pendingRepair.filter((item) =>
      !item.targetFiles.some((path) => repairedTargets.includes(path))
    )
    if (result.verification.status !== 'passed' && repairedTargets.length > 0) {
      pendingVerification = upsertPendingVerification(pendingVerification, {
        queueId: `verify-after-repair:${input.harness.ledger.length + 1}`,
        targetFiles: repairedTargets,
        command: result.verification.command,
        reason: result.verification.reason ?? 'repair requires targeted verification',
      })
    }
  }

  return freezeHarness({
    ...input.harness,
    pendingWrite,
    pendingVerification,
    pendingRepair,
  })
}

export function harnessObservationPatch(harness: QueryRuntimeHarnessState): Partial<QueryRuntimeObservationState> {
  return {
    changedFiles: uniqueStrings(harness.pendingWrite.flatMap((item) => item.targetFiles)),
    verificationTargets: uniqueStrings(harness.pendingVerification.flatMap((item) => item.targetFiles)),
    failedVerificationTargets: uniqueStrings([
      ...harness.pendingVerification.flatMap((item) => item.targetFiles),
      ...harness.pendingRepair.flatMap((item) => item.targetFiles),
    ]),
    failureCategories: uniqueStrings(harness.pendingRepair.map((item) => item.failureClass)),
    repairAttempts: [],
    toolFailures: harness.ledger
      .filter((item) => item.exitStatusClass !== 'success')
      .map((item) => ({
        action: item.actionKind,
        signature: item.toolId,
        reason: item.diagnosticSummary ?? item.failureClass,
      })),
    toolFeedback: harness.ledger.map((item) => ({
      toolId: item.toolId,
      actionKind: item.actionKind,
      coveredFiles: item.targetFiles,
      truncated: item.truncated,
      exitStatusClass: item.exitStatusClass,
      failureClass: item.failureClass,
      ...(item.diagnosticSummary ? { diagnosticSummary: item.diagnosticSummary } : {}),
      affectedPaths: item.affectedPaths,
      redactionStatus: item.redactionStatus,
    })),
    continuationFacts: harness.savePoints.length > 0 || harness.ledger.length > 0
      ? ['runtime harness state restored']
      : [],
    pendingAction: pendingActionForHarness(harness),
  }
}

export function restoreHarnessSavePoint(
  harness: QueryRuntimeHarnessState,
  savePointId: string,
): QueryRuntimeHarnessState {
  const savePoint = harness.savePoints.find((item) => item.savePointId === savePointId)
  if (!savePoint) return harness
  return freezeHarness({
    ...harness,
    ledger: harness.ledger.slice(0, savePoint.ledgerLength),
    pendingWrite: [...savePoint.pendingWrite],
    pendingVerification: [...savePoint.pendingVerification],
    pendingRepair: [...savePoint.pendingRepair],
  })
}

function pendingActionForHarness(harness: QueryRuntimeHarnessState): ToolActionKind | undefined {
  if (harness.pendingVerification.length > 0) return 'verify'
  const repair = harness.pendingRepair[0]
  if (repair?.contextNeed) return 'read'
  if (repair) return 'repair'
  if (harness.pendingWrite.length > 0) return 'verify'
  return undefined
}

function repairForResult(result: CodingResultSummary): QueryRuntimePendingRepair {
  const targetFiles = uniqueStrings([
    ...result.failedFiles.map((file) => file.path),
    ...result.changedFiles,
    ...result.unverifiedFiles.map((file) => file.path),
  ])
  return {
    queueId: `repair:${targetFiles.join(',') || 'result'}`,
    failureClass: result.verification.status === 'failed' ? 'verification-failed' : 'repair-failed',
    failureSummary: safeText(result.verification.reason ?? result.repair.notes.join(' ') ?? 'repair needed'),
    hypothesis: result.verification.nextAction ?? 'repair failed target',
    priorAttempt: result.repair.notes[0],
    ...(needsContext(
      result.verification.status === 'failed' ? 'verification-failed' : 'repair-failed',
      result.verification.reason ?? result.repair.notes.join(' ') ?? '',
    )
      ? { contextNeed: targetFiles[0] }
      : {}),
    targetFiles,
  }
}

function needsContext(failureClass: string, summary: string): boolean {
  const value = `${failureClass} ${summary}`.toLowerCase()
  return value.includes('missing context') ||
    (value.includes('missing') && value.includes('context'))
}

function upsertPendingWrite(
  queue: readonly QueryRuntimePendingWrite[],
  next: QueryRuntimePendingWrite,
): QueryRuntimePendingWrite[] {
  return [...queue.filter((item) => item.queueId !== next.queueId), Object.freeze(next)]
}

function upsertPendingVerification(
  queue: readonly QueryRuntimePendingVerification[],
  next: QueryRuntimePendingVerification,
): QueryRuntimePendingVerification[] {
  return [
    ...queue.filter((item) => !sameTargets(item.targetFiles, next.targetFiles)),
    Object.freeze(next),
  ]
}

function upsertPendingRepair(
  queue: readonly QueryRuntimePendingRepair[],
  next: QueryRuntimePendingRepair,
): QueryRuntimePendingRepair[] {
  return [
    ...queue.filter((item) => item.queueId !== next.queueId),
    Object.freeze(next),
  ]
}

function removeCoveredVerification(
  queue: readonly QueryRuntimePendingVerification[],
  covered: readonly string[],
): QueryRuntimePendingVerification[] {
  const coveredSet = new Set(covered)
  return queue.filter((item) => !item.targetFiles.every((path) => coveredSet.has(path)))
}

function sameTargets(left: readonly string[], right: readonly string[]): boolean {
  const normalizedLeft = uniqueStrings(left)
  const normalizedRight = uniqueStrings(right)
  return normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value) => normalizedRight.includes(value))
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function safeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 180)
}

function freezeHarness(state: {
  readonly taskStateVersion: number
  readonly snapshots: readonly QueryRuntimeTurnSnapshot[]
  readonly savePoints: readonly QueryRuntimeSavePoint[]
  readonly ledger: readonly QueryRuntimeLedgerEntry[]
  readonly pendingWrite: readonly QueryRuntimePendingWrite[]
  readonly pendingVerification: readonly QueryRuntimePendingVerification[]
  readonly pendingRepair: readonly QueryRuntimePendingRepair[]
}): QueryRuntimeHarnessState {
  return Object.freeze({
    taskStateVersion: state.taskStateVersion,
    snapshots: Object.freeze([...state.snapshots]),
    savePoints: Object.freeze([...state.savePoints]),
    ledger: Object.freeze([...state.ledger]),
    pendingWrite: Object.freeze([...state.pendingWrite]),
    pendingVerification: Object.freeze([...state.pendingVerification]),
    pendingRepair: Object.freeze([...state.pendingRepair]),
  })
}
