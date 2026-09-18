import type {
  AgentExecutionOutput,
  CodingResultSummary,
} from '../../../result/types.js'
import type { ToolActionKind } from '../../../tools/policy/strategy.js'
import type { QueryRuntimeExecutionResult } from './batch.js'

export type RuntimeObservationEvent =
  | {
      readonly type: 'tool.result'
      readonly toolName: string
      readonly taskId: string
      readonly success?: boolean
      readonly failureReason?: string
      readonly coveredFiles?: readonly string[]
    }
  | {
      readonly type: 'tool.started'
      readonly toolName: string
      readonly taskId?: string
    }
export interface QueryRuntimeFailureObservation {
  readonly action: ToolActionKind
  readonly signature: string
  readonly reason: string
}

export interface QueryRuntimeArtifactClaimObservation {
  readonly claim: string
  readonly evidenceId?: string
}

export interface QueryRuntimeCommandCoverageObservation {
  readonly taskId: string
  readonly coveredFiles: readonly string[]
}

export interface QueryRuntimeToolFeedbackObservation {
  readonly toolId: string
  readonly actionKind: ToolActionKind
  readonly coveredFiles: readonly string[]
  readonly truncated: boolean
  readonly exitStatusClass: string
  readonly failureClass: string
  readonly diagnosticSummary?: string
  readonly affectedPaths: readonly string[]
  readonly redactionStatus: string
}

export interface QueryRuntimeObservationState {
  readonly contextPaths: string[]
  readonly changedFiles: string[]
  readonly verificationTargets: string[]
  readonly failedVerificationTargets: string[]
  readonly restoredProofGap: string[]
  readonly failureCategories: string[]
  readonly repairAttempts: QueryRuntimeFailureObservation[]
  readonly toolFailures: QueryRuntimeFailureObservation[]
  readonly artifactEvidence: string[]
  readonly artifactClaims: string[]
  readonly artifactClaimEvidence: QueryRuntimeArtifactClaimObservation[]
  readonly commandCoverage: QueryRuntimeCommandCoverageObservation[]
  readonly toolFeedback: QueryRuntimeToolFeedbackObservation[]
  readonly continuationFacts: string[]
  readonly completedActions: ToolActionKind[]
  pendingAction?: ToolActionKind
}

export function createEmptyQueryRuntimeObservationState(): QueryRuntimeObservationState {
  return {
    contextPaths: [],
    changedFiles: [],
    verificationTargets: [],
    failedVerificationTargets: [],
    restoredProofGap: [],
    failureCategories: [],
    repairAttempts: [],
    toolFailures: [],
    artifactEvidence: [],
    artifactClaims: [],
    artifactClaimEvidence: [],
    commandCoverage: [],
    toolFeedback: [],
    continuationFacts: [],
    completedActions: [],
    pendingAction: undefined,
  }
}

export function deriveQueryRuntimeObservationState(
  transcript: readonly AgentExecutionOutput[],
): QueryRuntimeObservationState {
  const state = createEmptyQueryRuntimeObservationState()
  for (const output of transcript) {
    observeQueryRuntimeOutput(state, output)
  }
  return state
}

export function observeQueryRuntimeOutput(
  state: QueryRuntimeObservationState,
  output: AgentExecutionOutput,
): void {
  const result = output.codingResult
  observeRuntimeEvents(state, (output.events ?? []) as readonly RuntimeObservationEvent[])
  if (!result) {
    return
  }

  pushUnique(state.changedFiles, [
    ...result.changedFiles,
    ...result.changeSet.changedFiles,
  ])
  pushUnique(state.verificationTargets, [
    ...result.changedFiles,
    ...result.verifiedFiles,
    ...result.unverifiedFiles.map((file) => file.path),
  ])
  pushUnique(state.failedVerificationTargets, result.failedFiles.map((file) => file.path))
  pushUnique(state.contextPaths, [
    ...(result.diagnosis?.candidateFiles ?? []),
    ...(result.diagnosis?.evidenceFiles ?? []),
  ])
  pushUnique(state.artifactEvidence, result.evidence)
  pushUnique(state.artifactClaims, result.taskSatisfaction.requiredEvidence)
  pushUniqueClaimEvidence(state.artifactClaimEvidence, claimEvidenceFor(result))

  observeVerification(state, result)
  observeRepair(state, result)
  observeContinuation(state, result)
  observeLastAction(state, result)
}

export function observeQueryRuntimeExecutionResults(
  state: QueryRuntimeObservationState,
  results: readonly QueryRuntimeExecutionResult[],
): void {
  if (results.length === 0) {
    return
  }
  for (const result of results) {
    state.toolFeedback.push({
      toolId: result.toolId,
      actionKind: result.actionKind,
      coveredFiles: uniqueValues(result.coveredFiles),
      truncated: result.truncated,
      exitStatusClass: result.exitStatusClass,
      failureClass: result.failureClass,
      ...(result.diagnosticSummary ? { diagnosticSummary: result.diagnosticSummary } : {}),
      affectedPaths: uniqueValues(result.affectedPaths),
      redactionStatus: result.redactionStatus,
    })

    if (result.exitStatusClass === 'success') {
      pushUniqueAction(state.completedActions, [result.actionKind])
      if (result.actionKind === 'verify') {
        removeValues(state.failedVerificationTargets, [
          ...result.coveredFiles,
          ...result.affectedPaths,
        ])
      }
    } else {
      const affectedPaths = uniqueValues(result.affectedPaths)
      state.toolFailures.push({
        action: result.actionKind,
        signature: result.toolId,
        reason: failureReasonForExecutionResult(result, affectedPaths),
      })
      if (result.actionKind === 'verify') {
        pushUnique(state.failedVerificationTargets, affectedPaths)
      }
    }

    if (result.actionKind === 'read' || result.actionKind === 'search') {
      pushUnique(state.contextPaths, [
        ...result.coveredFiles,
        ...result.affectedPaths,
      ])
    }

    if (result.actionKind === 'verify') {
      pushUnique(state.verificationTargets, [
        ...result.coveredFiles,
        ...result.affectedPaths,
      ])
      const coveredFiles = uniqueValues(result.commandCoverage?.coveredFiles ?? result.coveredFiles)
      if (coveredFiles.length > 0) {
        state.commandCoverage.push({
          taskId: result.commandCoverage?.taskId ?? result.toolId,
          coveredFiles,
        })
      }
    }

    if (result.actionKind === 'artifact' && result.exitStatusClass === 'success') {
      pushUnique(state.artifactEvidence, [
        ...result.coveredFiles,
        ...result.affectedPaths,
      ])
    }
  }
  state.pendingAction = undefined
}

function claimEvidenceFor(result: CodingResultSummary): QueryRuntimeArtifactClaimObservation[] {
  return result.taskSatisfaction.requiredEvidence.map((claim, index) => ({
    claim,
    ...(result.taskSatisfaction.observedEvidence[index]
      ? { evidenceId: result.taskSatisfaction.observedEvidence[index] }
      : {}),
  }))
}

function observeRuntimeEvents(
  state: QueryRuntimeObservationState,
  events: readonly RuntimeObservationEvent[],
): void {
  for (const event of events) {
    if (event.type === 'tool.result' && event.success === false) {
      state.toolFailures.push({
        action: actionForTool(event.toolName),
        signature: event.taskId,
        reason: sanitizeFailureReason(event.failureReason ?? 'tool result failed'),
      })
    }
    if (event.type === 'tool.result' && event.success === true && actionForTool(event.toolName) === 'verify') {
      const coveredFiles = uniqueValues(event.coveredFiles ?? [])
      if (coveredFiles.length > 0) {
        state.commandCoverage.push({
          taskId: event.taskId,
          coveredFiles,
        })
      }
    }
    if (event.type === 'tool.started') {
      state.pendingAction = actionForTool(event.toolName)
    }
    if (event.type === 'tool.result') {
      state.pendingAction = undefined
    }
  }
}

function failureReasonForExecutionResult(
  result: QueryRuntimeExecutionResult,
  affectedPaths: readonly string[],
): string {
  if (result.actionKind === 'verify' && affectedPaths.length > 0) {
    return sanitizeFailureReason(
      result.diagnosticSummary
        ? `verification failed for ${affectedPaths.join(',')}: ${result.diagnosticSummary}`
        : `verification failed for ${affectedPaths.join(',')}`,
    )
  }
  return sanitizeFailureReason(
    affectedPaths.length > 0
      ? `${result.failureClass} for ${affectedPaths.join(',')}`
      : result.failureClass,
  )
}

function observeVerification(
  state: QueryRuntimeObservationState,
  result: CodingResultSummary,
): void {
  if (result.verification.status === 'passed') {
    const failedBatchTargets = new Set(state.toolFeedback
      .filter((feedback) =>
        feedback.actionKind === 'verify' &&
        feedback.exitStatusClass !== 'success'
      )
      .flatMap((feedback) => feedback.affectedPaths))
    removeValues(
      state.failedVerificationTargets,
      result.verifiedFiles.filter((file) => !failedBatchTargets.has(file)),
    )
    if (state.pendingAction === 'verify') {
      state.pendingAction = undefined
    }
    return
  }

  if (result.verification.status === 'failed') {
    const targets = result.failedFiles.length > 0
      ? result.failedFiles.map((file) => file.path)
      : result.unverifiedFiles.map((file) => file.path)
    pushUnique(state.failedVerificationTargets, targets)
    state.toolFailures.push({
      action: 'verify',
      signature: targets.join(',') || result.verification.command || 'verification',
      reason: result.verification.reason ?? 'verification failed',
    })
  }
}

function observeRepair(
  state: QueryRuntimeObservationState,
  result: CodingResultSummary,
): void {
  if (result.repair.attempts <= 0) {
    return
  }

  const signature = [
    ...result.failedFiles.map((file) => file.path),
    ...result.changedFiles,
  ].join(',') || result.repair.notes.join(' ') || 'repair'
  const reason = result.repair.notes.join(' ') || result.verification.reason || result.repair.status
  state.repairAttempts.push({
    action: 'repair',
    signature,
    reason,
  })
  if (result.repair.status === 'failed') {
    state.pendingAction = 'search'
  }
  if (result.repair.status === 'recovered' && result.verification.status !== 'passed') {
    state.pendingAction = 'verify'
  }
}

function observeContinuation(
  state: QueryRuntimeObservationState,
  result: CodingResultSummary,
): void {
  pushUnique(state.continuationFacts, result.continuation.evidence)
  if (result.continuation.status === 'failed-after-bounded-continuation') {
    state.pendingAction = 'continue'
  }
}

function observeLastAction(
  state: QueryRuntimeObservationState,
  result: CodingResultSummary,
): void {
  const seed = result.lastActionResultSeed
  if (!seed) {
    return
  }

  const action = actionForSeed(seed.actionKind)
  pushUniqueAction(state.completedActions, [action])
  if (seed.target) {
    pushUnique(state.contextPaths, [seed.target])
  }
  if (seed.changedFiles) {
    pushUnique(state.changedFiles, seed.changedFiles)
    pushUnique(state.verificationTargets, seed.changedFiles)
  }
  if (seed.verification?.status === 'failed') {
    state.toolFailures.push({
      action,
      signature: seed.target ?? seed.actionKind ?? action,
      reason: seed.reason ?? 'action failed',
    })
  } else if (seed.reason && failureReason(seed.reason)) {
    state.toolFailures.push({
      action,
      signature: seed.target ?? seed.actionKind ?? action,
      reason: sanitizeFailureReason(seed.reason),
    })
  }
}

function sanitizeFailureReason(reason: string): string {
  return reason.replace(/\s+/g, ' ').trim().slice(0, 160) || 'tool result failed'
}

function failureReason(reason: string): boolean {
  const normalized = reason.toLowerCase()
  return normalized.includes('failed') ||
    normalized.includes('missing') ||
    normalized.includes('stale') ||
    normalized.includes('mismatch') ||
    normalized.includes('conflict') ||
    normalized.includes('blocked')
}

function actionForSeed(action: string | undefined): ToolActionKind {
  if (action === 'repo-explain') {
    return 'search'
  }
  return actionForTool(action ?? 'read')
}

function actionForTool(toolName: string): ToolActionKind {
  const normalized = toolName.toLowerCase()
  if (normalized.includes('grep') || normalized.includes('find') || normalized.includes('search')) {
    return 'search'
  }
  if (normalized.includes('read') || normalized.includes('ls')) {
    return 'read'
  }
  if (normalized.includes('edit') || normalized.includes('write') || normalized.includes('apply')) {
    return 'edit'
  }
  if (normalized.includes('verify') || normalized.includes('test') || normalized.includes('check')) {
    return 'verify'
  }
  if (normalized.includes('repair')) {
    return 'repair'
  }
  if (normalized.includes('artifact')) {
    return 'artifact'
  }
  if (normalized.includes('continu')) {
    return 'continue'
  }
  return 'read'
}

function pushUnique(target: string[], values: readonly string[]): void {
  for (const value of values) {
    const normalized = value.trim()
    if (normalized.length > 0 && !target.includes(normalized)) {
      target.push(normalized)
    }
  }
}

function uniqueValues(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function pushUniqueAction(target: ToolActionKind[], values: readonly ToolActionKind[]): void {
  for (const value of values) {
    if (!target.includes(value)) {
      target.push(value)
    }
  }
}

function pushUniqueClaimEvidence(
  target: QueryRuntimeArtifactClaimObservation[],
  values: readonly QueryRuntimeArtifactClaimObservation[],
): void {
  for (const value of values) {
    const claim = value.claim.replace(/\s+/g, ' ').trim()
    const evidenceId = value.evidenceId?.replace(/\s+/g, ' ').trim()
    if (!claim) {
      continue
    }
    const duplicate = target.some((item) =>
      item.claim === claim && (item.evidenceId ?? '') === (evidenceId ?? '')
    )
    if (!duplicate) {
      target.push({
        claim,
        ...(evidenceId ? { evidenceId } : {}),
      })
    }
  }
}

function removeValues(target: string[], values: readonly string[]): void {
  for (const value of values) {
    const index = target.indexOf(value)
    if (index >= 0) {
      target.splice(index, 1)
    }
  }
}
