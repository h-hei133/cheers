import { safeText, uniqueStrings } from "./harnessSupport.js";
import {
  coversTargets,
  pendingTrajectoryTargets,
} from "./harnessPendingState.js";
import type {
  QueryRuntimeHarnessState,
  QueryRuntimePendingArtifact,
  QueryRuntimePendingRepair,
  QueryRuntimePendingVerification,
  QueryRuntimeTrajectoryPhase,
} from "./harness.js";
import type { ToolActionKind } from "../../../tools/policy/strategy.js";
import type { CodingResultSummary } from "../../../result/types.js";

/**
 * Output claim classification.
 *
 * Reads a completed tool result and decides what it proves: verification,
 * repair, artifact, or context claims. It mutates nothing; the pending-state
 * layer applies what this classifies.
 */

export function pendingActionForHarness(harness: QueryRuntimeHarnessState): ToolActionKind | undefined {
  if (harness.pendingRepair.some((item) =>
    item.contextNeed &&
    !hasSourceFact(harness, item.contextNeed) &&
    hasContextAttempt(harness, item.contextNeed)
  )) return 'stop-not-proven'
  if (harness.pendingRepair.some((item) => item.contextNeed && !hasSourceFact(harness, item.contextNeed))) return 'read'
  if (harness.pendingVerification.length > 0) return 'verify'
  const repair = harness.pendingRepair[0]
  if (repair) return 'repair'
  if (pendingTrajectoryTargets(harness.trajectory, [
    'verification:targeted',
    'verification:started',
    'verification:wrong-target-ignored',
    'verification:failed',
    'write:verification-queued',
  ], [
    'verification:settled',
    'verification:passed',
    'write:verification-settled',
  ]).length > 0) return 'verify'
  if (pendingTrajectoryTargets(harness.trajectory, [
    'repair:classified',
    'repair:hypothesis',
    'repair:next-hypothesis',
  ], ['repair:settled']).length > 0) return 'repair'
  if (harness.pendingWrite.length > 0) return 'verify'
  return undefined
}

export function repairForResult(result: CodingResultSummary): QueryRuntimePendingRepair {
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

export function classifyOutputClaims(input: {
  readonly content: string
  readonly result: CodingResultSummary
  readonly pendingVerification: readonly QueryRuntimePendingVerification[]
  readonly pendingArtifact: readonly QueryRuntimePendingArtifact[]
  readonly changedFiles: readonly string[]
}): readonly {
  readonly phase: Extract<QueryRuntimeTrajectoryPhase, 'output:completion-claim-unproven' | 'output:verification-claim-unsettled' | 'output:artifact-claim-incomplete'>
  readonly actionKind?: ToolActionKind
  readonly targetFiles: readonly string[]
  readonly detail: string
}[] {
  const text = input.content.toLowerCase()
  const claimsCompletion = /\b(done|complete|completed|finished|fixed|all set|no more work)\b/.test(text)
  const claimsVerification = /\b(tests? pass|verification (?:is )?green|everything is green|green now|quick check|verified)\b/.test(text)
  const claimsArtifact = /\b(artifact|receipt|proof)\b/.test(text)
  const pendingTargets = uniqueStrings(input.pendingVerification.flatMap((item) => item.targetFiles))
  const expectedVerificationTargets = pendingTargets.length > 0
    ? pendingTargets
    : uniqueStrings([...input.changedFiles, ...input.result.changedFiles, ...input.result.changeSet.changedFiles])
  const verifiedTargets = uniqueStrings(input.result.verifiedFiles)
  const targetedVerificationSettled = input.result.verification.status === 'passed' &&
    expectedVerificationTargets.length > 0 &&
    coversTargets(expectedVerificationTargets, verifiedTargets) &&
    input.result.verification.selectionScope !== 'broader'
  const proofSatisfied = input.result.taskSatisfaction.verdict === 'satisfied' &&
    input.result.verifiedFiles.length > 0 &&
    input.result.taskSatisfaction.requiredEvidence.every((claim) =>
      input.result.taskSatisfaction.observedEvidence.includes(claim)
    )
  const claims: {
    phase: Extract<QueryRuntimeTrajectoryPhase, 'output:completion-claim-unproven' | 'output:verification-claim-unsettled' | 'output:artifact-claim-incomplete'>
    actionKind?: ToolActionKind
    targetFiles: readonly string[]
    detail: string
  }[] = []

  if (claimsCompletion && !proofSatisfied) {
    claims.push({
      phase: 'output:completion-claim-unproven',
      actionKind: toToolActionKind(input.result.lastActionResultSeed?.actionKind),
      targetFiles: uniqueStrings([...expectedVerificationTargets, ...input.result.unverifiedFiles.map((file) => file.path)]),
      detail: 'completion claim lacks required proof',
    })
  }

  if (claimsVerification && !targetedVerificationSettled) {
    claims.push({
      phase: 'output:verification-claim-unsettled',
      actionKind: 'verify',
      targetFiles: expectedVerificationTargets.length > 0 ? expectedVerificationTargets : verifiedTargets,
      detail: input.result.verification.reason ?? input.result.verification.command ?? 'verification claim did not settle target',
    })
  }

  const artifactTargets = uniqueStrings(input.pendingArtifact.flatMap((item) => item.targetFiles))
  if (claimsArtifact && input.pendingArtifact.length > 0 && input.result.taskSatisfaction.verdict !== 'satisfied') {
    claims.push({
      phase: 'output:artifact-claim-incomplete',
      actionKind: 'artifact',
      targetFiles: artifactTargets,
      detail: 'artifact claim lacks source or verification evidence',
    })
  }

  return Object.freeze(claims)
}

function toToolActionKind(value: string | undefined): ToolActionKind | undefined {
  if (
    value === 'read' ||
    value === 'search' ||
    value === 'edit' ||
    value === 'repair' ||
    value === 'verify' ||
    value === 'artifact' ||
    value === 'continue' ||
    value === 'stop-not-proven'
  ) {
    return value
  }
  return undefined
}

export function hasSourceFact(harness: QueryRuntimeHarnessState, path: string): boolean {
  return harness.sourceFacts.some((fact) => fact.path === path)
}

function hasContextAttempt(harness: QueryRuntimeHarnessState, path: string): boolean {
  return harness.ledger.some((entry) =>
    (entry.actionKind === 'read' || entry.actionKind === 'search') &&
    entry.exitStatusClass === 'success' &&
    [...entry.targetFiles, ...entry.affectedPaths].includes(path)
  )
}

