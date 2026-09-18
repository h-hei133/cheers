import type { AgentExecutionOutput, AgentRole, CodingResultSummary } from '../../../result/types.js'
import { projectArtifactLifecycle } from '../../../artifacts/workflow/model.js'
import { contextResultSourceFacts, normalizeRuntimeSourceFacts, sourceFactsForTargets, type RuntimeSourceFact } from '../../../context/acquisition/code/source.js'
import { classifyRepairHypothesis, rejectRepairHypothesis, type RepairHypothesisState } from '../../../repair/flow/hypothesis.js'
import { describeRepairFailureLifecycle, selectRepairFailureStrategy } from '../../../repair/flow/strategy.js'
import type { ToolActionKind } from '../../../tools/policy/strategy.js'
import { classifyVerificationTargetCoverage } from '../../../verification/execution/model.js'
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
  readonly hypothesisState?: RepairHypothesisState
  readonly priorAttempt?: string
  readonly contextNeed?: string
  readonly sourceFactIds?: readonly string[]
  readonly rejectedCause?: string
  readonly targetFiles: readonly string[]
}

export interface QueryRuntimePendingArtifact {
  readonly queueId: string
  readonly claims: readonly string[]
  readonly evidenceIds: readonly string[]
  readonly targetFiles: readonly string[]
}

export type QueryRuntimeTrajectoryPhase =
  | 'tool:planned'
  | 'tool:started'
  | 'tool:completed'
  | 'tool:failed'
  | 'tool:retried'
  | 'tool:settled'
  | 'output:completion-claim-unproven'
  | 'output:verification-claim-unsettled'
  | 'output:artifact-claim-incomplete'
  | 'write:intended'
  | 'write:applied'
  | 'write:changed-file-accounted'
  | 'write:verification-queued'
  | 'write:verification-settled'
  | 'verification:targeted'
  | 'verification:started'
  | 'verification:passed'
  | 'verification:failed'
  | 'verification:wrong-target-ignored'
  | 'verification:settled'
  | 'context:source-fact-recorded'
  | 'repair:failure-classified'
  | 'repair:classified'
  | 'repair:hypothesis'
  | 'repair:hypothesis-rejected'
  | 'repair:context-needed'
  | 'repair:attempt'
  | 'repair:repeat-blocked'
  | 'repair:rerun'
  | 'repair:next-hypothesis'
  | 'repair:settled'
  | 'artifact:requested'
  | 'artifact:written'
  | 'artifact:source-missing'
  | 'artifact:verification-missing'
  | 'artifact:completed'
  | 'artifact:pending'

export interface QueryRuntimeTrajectoryEntry {
  readonly sequence: number
  readonly turn: number
  readonly role: AgentRole
  readonly phase: QueryRuntimeTrajectoryPhase
  readonly actionKind?: ToolActionKind
  readonly toolId?: string
  readonly targetFiles: readonly string[]
  readonly detail?: string
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
  readonly trajectory: readonly QueryRuntimeTrajectoryEntry[]
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
  readonly pendingArtifact: readonly QueryRuntimePendingArtifact[]
  readonly sourceFacts?: readonly RuntimeSourceFact[]
  readonly trajectory: readonly QueryRuntimeTrajectoryEntry[]
}

export interface QueryRuntimeHarnessState {
  readonly taskStateVersion: number
  readonly snapshots: readonly QueryRuntimeTurnSnapshot[]
  readonly savePoints: readonly QueryRuntimeSavePoint[]
  readonly ledger: readonly QueryRuntimeLedgerEntry[]
  readonly pendingWrite: readonly QueryRuntimePendingWrite[]
  readonly pendingVerification: readonly QueryRuntimePendingVerification[]
  readonly pendingRepair: readonly QueryRuntimePendingRepair[]
  readonly pendingArtifact: readonly QueryRuntimePendingArtifact[]
  readonly sourceFacts: readonly RuntimeSourceFact[]
  readonly trajectory: readonly QueryRuntimeTrajectoryEntry[]
}

export interface QueryRuntimeHarnessSeed {
  readonly taskStateVersion?: number
  readonly snapshots?: readonly QueryRuntimeTurnSnapshot[]
  readonly savePoints?: readonly QueryRuntimeSavePoint[]
  readonly ledger?: readonly QueryRuntimeLedgerEntry[]
  readonly pendingWrite?: readonly QueryRuntimePendingWrite[]
  readonly pendingVerification?: readonly QueryRuntimePendingVerification[]
  readonly pendingRepair?: readonly QueryRuntimePendingRepair[]
  readonly pendingArtifact?: readonly QueryRuntimePendingArtifact[]
  readonly sourceFacts?: readonly RuntimeSourceFact[]
  readonly trajectory?: readonly QueryRuntimeTrajectoryEntry[]
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
    pendingArtifact: [...(seed.pendingArtifact ?? [])],
    sourceFacts: normalizeRuntimeSourceFacts(seed.sourceFacts ?? []),
    trajectory: [...(seed.trajectory ?? [])],
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
    trajectory: input.harness.trajectory,
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
      claims: uniqueStrings([
        ...input.observations.artifactClaims,
        ...input.harness.pendingArtifact.flatMap((item) => item.claims),
      ]),
      evidenceIds: uniqueStrings([
        ...input.observations.artifactClaimEvidence.flatMap((item) => item.evidenceId ? [item.evidenceId] : []),
        ...input.harness.pendingArtifact.flatMap((item) => item.evidenceIds),
      ]),
      missingClaims: uniqueStrings([
        ...input.observations.artifactClaims,
        ...input.harness.pendingArtifact.flatMap((item) => item.claims),
      ]).filter((claim) =>
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
        pendingArtifact: harness.pendingArtifact,
        sourceFacts: harness.sourceFacts,
        trajectory: harness.trajectory,
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
  let pendingArtifact = [...input.harness.pendingArtifact]
  let sourceFacts = [...input.harness.sourceFacts]
  let trajectory = [...input.harness.trajectory]
  const nextLedger = [...input.harness.ledger]

  for (const item of input.batch.items) {
    trajectory = appendTrajectory(trajectory, {
      turn: input.batch.turn,
      role: input.batch.role,
      phase: 'tool:planned',
      actionKind: item.actionKind,
      toolId: item.toolId,
      targetFiles: item.targetPaths,
    })
    trajectory = appendTrajectory(trajectory, {
      turn: input.batch.turn,
      role: input.batch.role,
      phase: 'tool:started',
      actionKind: item.actionKind,
      toolId: item.toolId,
      targetFiles: item.targetPaths,
    })
    if (item.actionKind === 'verify') {
      trajectory = appendTrajectory(trajectory, {
        turn: input.batch.turn,
        role: input.batch.role,
        phase: 'verification:targeted',
        actionKind: item.actionKind,
        toolId: item.toolId,
        targetFiles: item.coveredFiles,
      })
      trajectory = appendTrajectory(trajectory, {
        turn: input.batch.turn,
        role: input.batch.role,
        phase: 'verification:started',
        actionKind: item.actionKind,
        toolId: item.toolId,
        targetFiles: item.coveredFiles,
      })
    }
    if (item.actionKind === 'edit' || item.actionKind === 'repair' || item.actionKind === 'artifact') {
      trajectory = appendTrajectory(trajectory, {
        turn: input.batch.turn,
        role: input.batch.role,
        phase: 'write:intended',
        actionKind: item.actionKind,
        toolId: item.toolId,
        targetFiles: item.targetPaths,
      })
    }
    if (item.actionKind === 'repair') {
      trajectory = appendTrajectory(trajectory, {
        turn: input.batch.turn,
        role: input.batch.role,
        phase: 'repair:attempt',
        actionKind: item.actionKind,
        toolId: item.toolId,
        targetFiles: item.targetPaths,
      })
    }
    if (item.actionKind === 'artifact') {
      trajectory = appendTrajectory(trajectory, {
        turn: input.batch.turn,
        role: input.batch.role,
        phase: 'artifact:requested',
        actionKind: item.actionKind,
        toolId: item.toolId,
        targetFiles: item.targetPaths,
      })
    }
  }

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

    trajectory = appendTrajectory(trajectory, {
      turn: input.batch.turn,
      role: input.batch.role,
      phase: result.exitStatusClass === 'success' ? 'tool:completed' : 'tool:failed',
      actionKind: result.actionKind,
      toolId: result.toolId,
      targetFiles: uniqueStrings([...result.coveredFiles, ...result.affectedPaths]),
      detail: result.diagnosticSummary ?? result.failureClass,
    })

    if ((result.actionKind === 'read' || result.actionKind === 'search') && result.exitStatusClass === 'success') {
      const facts = contextResultSourceFacts({
        toolId: result.toolId,
        paths: uniqueStrings([...result.coveredFiles, ...result.affectedPaths]),
        diagnosticSummary: result.diagnosticSummary,
        sourceFacts: result.sourceFacts,
      })
      for (const fact of facts) {
        trajectory = appendTrajectory(trajectory, {
          turn: input.batch.turn,
          role: input.batch.role,
          phase: 'context:source-fact-recorded',
          actionKind: result.actionKind,
          toolId: result.toolId,
          targetFiles: [fact.path],
          detail: fact.factId,
        })
      }
      sourceFacts = [...normalizeRuntimeSourceFacts([...sourceFacts, ...facts])]
    }

    if ((result.actionKind === 'edit' || result.actionKind === 'repair' || result.actionKind === 'artifact') &&
      result.exitStatusClass === 'success' &&
      result.affectedPaths.length > 0) {
      pendingWrite = upsertPendingWrite(pendingWrite, {
        queueId: `write:${sequence}`,
        actionKind: result.actionKind,
        targetFiles: uniqueStrings(result.affectedPaths),
        status: 'pending',
      })
      trajectory = appendTrajectory(trajectory, {
        turn: input.batch.turn,
        role: input.batch.role,
        phase: 'write:applied',
        actionKind: result.actionKind,
        toolId: result.toolId,
        targetFiles: uniqueStrings(result.affectedPaths),
      })
    }

    if (result.actionKind === 'repair') {
      const repairPlan = input.batch.items.find((item) => item.toolId === result.toolId)?.repairPlan
      if (repairPlan) {
        pendingRepair = pendingRepair.map((item) =>
          sameTargets(item.targetFiles, repairPlan.hypothesis.targetFiles)
            ? Object.freeze({
                ...item,
                hypothesis: repairPlan.hypothesis.summary,
                hypothesisState: repairPlan.hypothesis,
                sourceFactIds: repairPlan.hypothesis.sourceFactIds,
              })
            : item
        )
      } else {
        pendingRepair = removeCoveredRepair(pendingRepair, [
          ...result.affectedPaths,
          ...result.coveredFiles,
        ])
      }
      trajectory = appendTrajectory(trajectory, {
        turn: input.batch.turn,
        role: input.batch.role,
        phase: 'repair:rerun',
        actionKind: result.actionKind,
        toolId: result.toolId,
        targetFiles: uniqueStrings([...result.affectedPaths, ...result.coveredFiles]),
      })
    }

    if (result.actionKind === 'verify' && result.exitStatusClass === 'success') {
      const coverage = classifyVerificationTargetCoverage({
        pendingTargets: input.harness.pendingVerification.map((item) => item.targetFiles),
        coveredFiles: result.coveredFiles,
        affectedPaths: result.affectedPaths,
      })
      if (coverage.wrongTargetIgnored) {
        trajectory = appendTrajectory(trajectory, {
          turn: input.batch.turn,
          role: input.batch.role,
          phase: 'verification:wrong-target-ignored',
          actionKind: result.actionKind,
          toolId: result.toolId,
          targetFiles: uniqueStrings([...result.coveredFiles, ...result.affectedPaths]),
        })
      }
      if (coverage.settled) {
        trajectory = appendTrajectory(trajectory, {
          turn: input.batch.turn,
          role: input.batch.role,
          phase: 'verification:settled',
          actionKind: result.actionKind,
          toolId: result.toolId,
          targetFiles: coverage.coveredTargets,
        })
      }
      trajectory = appendTrajectory(trajectory, {
        turn: input.batch.turn,
        role: input.batch.role,
        phase: 'verification:passed',
        actionKind: result.actionKind,
        toolId: result.toolId,
        targetFiles: uniqueStrings([...result.coveredFiles, ...result.affectedPaths]),
      })
      pendingVerification = removeCoveredVerification(pendingVerification, [
        ...result.coveredFiles,
        ...result.affectedPaths,
      ])
      pendingRepair = removeCoveredRepair(pendingRepair, [
        ...result.coveredFiles,
        ...result.affectedPaths,
      ])
      pendingArtifact = settleArtifactVerification(pendingArtifact, [
        ...result.coveredFiles,
        ...result.affectedPaths,
      ])
    }

    if ((result.actionKind === 'read' || result.actionKind === 'search') && result.exitStatusClass === 'success') {
      if (pendingRepair.some((item) => item.contextNeed && coversTargets([item.contextNeed], [...result.coveredFiles, ...result.affectedPaths]))) {
        const coveredFacts = sourceFactsForTargets({
          facts: sourceFacts,
          targetFiles: uniqueStrings([...result.coveredFiles, ...result.affectedPaths]),
        })
        if (coveredFacts.length > 0) {
          trajectory = appendTrajectory(trajectory, {
            turn: input.batch.turn,
            role: input.batch.role,
            phase: 'repair:settled',
            actionKind: 'repair',
            toolId: result.toolId,
            targetFiles: uniqueStrings([...result.coveredFiles, ...result.affectedPaths]),
            detail: 'repair context covered',
          })
          pendingRepair = settleRepairContext(
            pendingRepair,
            [
              ...result.coveredFiles,
              ...result.affectedPaths,
            ],
            coveredFacts.map((fact) => fact.factId),
          )
        }
      } else {
        pendingRepair = settleRepairContext(pendingRepair, [
          ...result.coveredFiles,
          ...result.affectedPaths,
        ])
      }
    }

    if (result.actionKind === 'verify' && result.exitStatusClass !== 'success') {
      trajectory = appendTrajectory(trajectory, {
        turn: input.batch.turn,
        role: input.batch.role,
        phase: 'verification:failed',
        actionKind: result.actionKind,
        toolId: result.toolId,
        targetFiles: uniqueStrings([...result.affectedPaths, ...result.coveredFiles]),
        detail: result.diagnosticSummary ?? result.failureClass,
      })
      pendingVerification = removeCoveredVerification(pendingVerification, [
        ...result.coveredFiles,
        ...result.affectedPaths,
      ])
      const failureSummary = safeText(result.diagnosticSummary ?? result.failureClass)
      const targetFiles = uniqueStrings([...result.affectedPaths, ...result.coveredFiles])
      const currentRepair = pendingRepair.find((item) => overlapsTargets(item.targetFiles, targetFiles))
      const rejectedHypothesis = currentRepair?.hypothesisState
        ? rejectRepairHypothesis({ hypothesis: currentRepair.hypothesisState, cause: failureSummary })
        : undefined
      if (rejectedHypothesis) {
        trajectory = appendTrajectory(trajectory, {
          turn: input.batch.turn,
          role: input.batch.role,
          phase: 'repair:hypothesis-rejected',
          actionKind: 'repair',
          toolId: result.toolId,
          targetFiles,
          detail: rejectedHypothesis.summary,
        })
      }
      const facts = sourceFactsForTargets({
        facts: sourceFacts,
        targetFiles,
        sourceFactIds: currentRepair?.sourceFactIds,
      })
      const hypothesis = classifyRepairHypothesis({
        failureClass: result.failureClass,
        failureSummary,
        targetFiles,
        sourceFactIds: facts.map((fact) => fact.factId),
        rejected: rejectedHypothesis ? [rejectedHypothesis] : [],
      })
      trajectory = appendTrajectory(trajectory, {
        turn: input.batch.turn,
        role: input.batch.role,
        phase: 'repair:classified',
        actionKind: 'repair',
        toolId: result.toolId,
        targetFiles,
        detail: result.failureClass,
      })
      trajectory = appendTrajectory(trajectory, {
        turn: input.batch.turn,
        role: input.batch.role,
        phase: 'repair:hypothesis',
        actionKind: 'repair',
        toolId: result.toolId,
        targetFiles,
        detail: hypothesis.summary,
      })
      if (hypothesis.contextNeed) {
        trajectory = appendTrajectory(trajectory, {
          turn: input.batch.turn,
          role: input.batch.role,
          phase: 'repair:context-needed',
          actionKind: 'repair',
          toolId: result.toolId,
          targetFiles: [hypothesis.contextNeed],
        })
      }
      pendingRepair = upsertPendingRepair(pendingRepair, {
        queueId: `repair:${sequence}`,
        failureClass: result.failureClass,
        failureSummary,
        hypothesis: hypothesis.summary,
        hypothesisState: hypothesis,
        priorAttempt: result.toolId,
        sourceFactIds: hypothesis.sourceFactIds,
        ...(hypothesis.rejectedCause ? { rejectedCause: hypothesis.rejectedCause } : {}),
        ...(hypothesis.contextNeed
          ? { contextNeed: hypothesis.contextNeed }
          : {}),
        targetFiles,
      })
    }

    if (result.actionKind === 'repair' && result.exitStatusClass !== 'success') {
      const failureSummary = safeText(result.diagnosticSummary ?? result.failureClass)
      const targetFiles = uniqueStrings([...result.affectedPaths, ...result.coveredFiles])
      pendingVerification = removeCoveredVerification(pendingVerification, targetFiles)
      const currentRepair = pendingRepair.find((item) => overlapsTargets(item.targetFiles, targetFiles))
      const rejectedHypothesis = currentRepair?.hypothesisState
        ? rejectRepairHypothesis({ hypothesis: currentRepair.hypothesisState, cause: failureSummary })
        : undefined
      if (rejectedHypothesis) {
        trajectory = appendTrajectory(trajectory, {
          turn: input.batch.turn,
          role: input.batch.role,
          phase: 'repair:hypothesis-rejected',
          actionKind: 'repair',
          toolId: result.toolId,
          targetFiles,
          detail: rejectedHypothesis.summary,
        })
      }
      const facts = sourceFactsForTargets({
        facts: sourceFacts,
        targetFiles,
        sourceFactIds: currentRepair?.sourceFactIds,
      })
      const nextHypothesis = classifyRepairHypothesis({
        failureClass: result.failureClass,
        failureSummary,
        targetFiles,
        sourceFactIds: facts.map((fact) => fact.factId),
        rejected: rejectedHypothesis ? [rejectedHypothesis] : [],
      })
      const strategy = selectRepairFailureStrategy({
        failureClass: result.failureClass,
        failureSummary,
        targetFiles,
      })
      const repairLifecycle = describeRepairFailureLifecycle(strategy)
      trajectory = appendTrajectory(trajectory, {
        turn: input.batch.turn,
        role: input.batch.role,
        phase: 'repair:failure-classified',
        actionKind: result.actionKind,
        toolId: result.toolId,
        targetFiles,
        detail: result.failureClass,
      })
      trajectory = appendTrajectory(trajectory, {
        turn: input.batch.turn,
        role: input.batch.role,
        phase: 'repair:next-hypothesis',
        actionKind: result.actionKind,
        toolId: result.toolId,
        targetFiles,
        detail: nextHypothesis.summary,
      })
      const contextNeed = nextHypothesis.contextNeed ?? repairLifecycle.contextNeed
      if ((repairLifecycle.contextNeeded || nextHypothesis.contextNeed) && contextNeed) {
        trajectory = appendTrajectory(trajectory, {
          turn: input.batch.turn,
          role: input.batch.role,
          phase: 'repair:context-needed',
          actionKind: result.actionKind,
          toolId: result.toolId,
          targetFiles: [contextNeed],
        })
      }
      pendingRepair = upsertPendingRepair(pendingRepair, {
        queueId: `repair:${sequence}`,
        failureClass: result.failureClass,
        failureSummary,
        hypothesis: nextHypothesis.summary,
        hypothesisState: nextHypothesis,
        priorAttempt: result.toolId,
        sourceFactIds: nextHypothesis.sourceFactIds,
        ...(nextHypothesis.rejectedCause ? { rejectedCause: nextHypothesis.rejectedCause } : {}),
        ...(contextNeed ? { contextNeed } : {}),
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
    pendingArtifact,
    sourceFacts,
    trajectory,
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
  let pendingArtifact = [...input.harness.pendingArtifact]
  let trajectory = [...input.harness.trajectory]
  const changedFiles = uniqueStrings([
    ...result.changedFiles,
    ...result.changeSet.changedFiles,
    ...(result.lastActionResultSeed?.changedFiles ?? []),
  ])
  for (const claim of classifyOutputClaims({
    content: input.output.content,
    result,
    pendingVerification: input.harness.pendingVerification,
    pendingArtifact: input.harness.pendingArtifact,
    changedFiles,
  })) {
    trajectory = appendTrajectory(trajectory, {
      turn: input.harness.ledger.length + 1,
      role: input.output.role,
      phase: claim.phase,
      actionKind: claim.actionKind,
      targetFiles: claim.targetFiles,
      detail: claim.detail,
    })
  }

  if (changedFiles.length > 0) {
    for (const write of input.harness.pendingWrite) {
      if (write.targetFiles.every((path) => changedFiles.includes(path))) {
        trajectory = appendTrajectory(trajectory, {
          turn: input.harness.ledger.length + 1,
          role: input.output.role,
          phase: 'write:changed-file-accounted',
          actionKind: write.actionKind,
          targetFiles: write.targetFiles,
        })
        if (result.verification.status !== 'failed' && result.repair.status !== 'failed') {
          pendingVerification = upsertPendingVerification(pendingVerification, {
            queueId: `verify-after:${write.queueId}`,
            targetFiles: write.targetFiles,
            command: result.verification.command,
            reason: result.verification.reason ?? 'changed files require verification',
          })
          trajectory = appendTrajectory(trajectory, {
            turn: input.harness.ledger.length + 1,
            role: input.output.role,
            phase: 'write:verification-queued',
            actionKind: write.actionKind,
            targetFiles: write.targetFiles,
            detail: result.verification.reason ?? 'changed files require verification',
          })
        }
        pendingWrite = pendingWrite.filter((item) => item.queueId !== write.queueId)
      }
    }
  }

  if (result.verification.status === 'passed') {
    if (pendingVerification.some((item) => coversTargets(item.targetFiles, result.verifiedFiles))) {
      trajectory = appendTrajectory(trajectory, {
        turn: input.harness.ledger.length + 1,
        role: input.output.role,
        phase: 'verification:settled',
        actionKind: 'verify',
        targetFiles: result.verifiedFiles,
        detail: result.verification.command,
      })
      trajectory = appendTrajectory(trajectory, {
        turn: input.harness.ledger.length + 1,
        role: input.output.role,
        phase: 'write:verification-settled',
        actionKind: 'verify',
        targetFiles: result.verifiedFiles,
        detail: result.verification.command,
      })
    }
    const writeVerificationTargets = pendingTrajectoryTargets(trajectory, [
      'write:verification-queued',
    ], [
      'write:verification-settled',
    ]).filter((target) => result.verifiedFiles.includes(target))
    if (writeVerificationTargets.length > 0) {
      trajectory = appendTrajectory(trajectory, {
        turn: input.harness.ledger.length + 1,
        role: input.output.role,
        phase: 'write:verification-settled',
        actionKind: 'verify',
        targetFiles: writeVerificationTargets,
        detail: result.verification.command,
      })
    }
    pendingVerification = removeCoveredVerification(pendingVerification, result.verifiedFiles)
  }

  if (result.verification.status === 'failed' || result.repair.status === 'failed') {
    const repair = repairForResult(result)
    const existingRepair = pendingRepair.find((item) => sameTargets(item.targetFiles, repair.targetFiles))
    const nextRepair = existingRepair?.hypothesisState
      ? Object.freeze({
          ...repair,
          hypothesis: existingRepair.hypothesis,
          hypothesisState: existingRepair.hypothesisState,
          sourceFactIds: existingRepair.sourceFactIds,
          ...(existingRepair.rejectedCause ? { rejectedCause: existingRepair.rejectedCause } : {}),
          ...(existingRepair.contextNeed ? { contextNeed: existingRepair.contextNeed } : repair.contextNeed ? { contextNeed: repair.contextNeed } : {}),
        })
      : repair
    trajectory = appendTrajectory(trajectory, {
      turn: input.harness.ledger.length + 1,
      role: input.output.role,
      phase: 'repair:classified',
      actionKind: 'repair',
      targetFiles: nextRepair.targetFiles,
      detail: nextRepair.failureClass,
    })
    trajectory = appendTrajectory(trajectory, {
      turn: input.harness.ledger.length + 1,
      role: input.output.role,
      phase: 'repair:hypothesis',
      actionKind: 'repair',
      targetFiles: nextRepair.targetFiles,
      detail: nextRepair.hypothesis,
    })
    if (nextRepair.contextNeed) {
      trajectory = appendTrajectory(trajectory, {
        turn: input.harness.ledger.length + 1,
        role: input.output.role,
        phase: 'repair:context-needed',
        actionKind: 'repair',
        targetFiles: [nextRepair.contextNeed],
      })
    }
    pendingRepair = upsertPendingRepair(pendingRepair, nextRepair)
  }

  if (result.repair.status === 'recovered') {
    const repairedTargets = uniqueStrings([...result.repair.recoveredItems, ...changedFiles])
    if (repairedTargets.length > 0) {
      trajectory = appendTrajectory(trajectory, {
        turn: input.harness.ledger.length + 1,
        role: input.output.role,
        phase: 'repair:settled',
        actionKind: 'repair',
        targetFiles: repairedTargets,
      })
    }
    pendingRepair = pendingRepair.filter((item) =>
      item.hypothesisState || !item.targetFiles.some((path) => repairedTargets.includes(path))
    )
    if (result.verification.status !== 'passed' && repairedTargets.length > 0) {
      pendingVerification = upsertPendingVerification(pendingVerification, {
        queueId: `verify-after-repair:${input.harness.ledger.length + 1}`,
        targetFiles: repairedTargets,
        command: result.verification.command,
        reason: result.verification.reason ?? 'repair requires targeted verification',
      })
      trajectory = appendTrajectory(trajectory, {
        turn: input.harness.ledger.length + 1,
        role: input.output.role,
        phase: 'write:verification-queued',
        actionKind: 'repair',
        targetFiles: repairedTargets,
        detail: result.verification.reason ?? 'repair requires targeted verification',
      })
    }
  }

  const artifactClaims = uniqueStrings(result.taskSatisfaction.requiredEvidence)
  if (artifactClaims.length > 0) {
    const evidenceIds = uniqueStrings(result.taskSatisfaction.observedEvidence)
    const hasArtifactIntent = result.lastActionResultSeed?.actionKind === 'artifact' ||
      artifactClaims.some((claim) => claim.toLowerCase().includes('artifact') || claim.toLowerCase().includes('source'))
    const completeArtifactProof = result.taskSatisfaction.verdict === 'satisfied' &&
      result.verifiedFiles.length > 0 &&
      (result.diagnosis?.evidenceFiles.length ?? 0) > 0
    const artifactLifecycle = projectArtifactLifecycle({
      hasArtifactIntent,
      changedFiles,
      verifiedFiles: result.verifiedFiles,
      evidenceFiles: result.diagnosis?.evidenceFiles ?? [],
      completeArtifactProof,
    })
    if (artifactLifecycle.pending) {
      if (artifactLifecycle.written && result.lastActionResultSeed?.actionKind === 'artifact') {
        trajectory = appendTrajectory(trajectory, {
          turn: input.harness.ledger.length + 1,
          role: input.output.role,
          phase: 'artifact:written',
          actionKind: 'artifact',
          targetFiles: changedFiles,
        })
      }
      if (artifactLifecycle.sourceMissing || artifactLifecycle.verificationMissing) {
        trajectory = appendTrajectory(trajectory, {
          turn: input.harness.ledger.length + 1,
          role: input.output.role,
          phase: artifactLifecycle.verificationMissing ? 'artifact:verification-missing' : 'artifact:source-missing',
          actionKind: 'artifact',
          targetFiles: artifactLifecycle.targetFiles,
        })
      }
      trajectory = appendTrajectory(trajectory, {
        turn: input.harness.ledger.length + 1,
        role: input.output.role,
        phase: 'artifact:pending',
        actionKind: 'artifact',
        targetFiles: artifactLifecycle.targetFiles,
        detail: artifactClaims.join(','),
      })
      pendingArtifact = upsertPendingArtifact(pendingArtifact, {
        queueId: `artifact:${artifactClaims.join(',')}`,
        claims: artifactClaims,
        evidenceIds,
        targetFiles: artifactLifecycle.targetFiles,
      })
    }
    if (artifactLifecycle.completed) {
      trajectory = appendTrajectory(trajectory, {
        turn: input.harness.ledger.length + 1,
        role: input.output.role,
        phase: 'artifact:completed',
        actionKind: 'artifact',
        targetFiles: artifactLifecycle.targetFiles,
        detail: artifactClaims.join(','),
      })
      pendingArtifact = removeSatisfiedArtifact(pendingArtifact, artifactClaims)
    }
  }

  return freezeHarness({
    ...input.harness,
    pendingWrite,
    pendingVerification,
    pendingRepair,
    pendingArtifact,
    sourceFacts: input.harness.sourceFacts,
    trajectory,
  })
}

export function harnessObservationPatch(harness: QueryRuntimeHarnessState): Partial<QueryRuntimeObservationState> {
  const trajectoryVerificationTargets = pendingTrajectoryTargets(harness.trajectory, [
    'verification:targeted',
    'verification:started',
    'verification:wrong-target-ignored',
    'verification:failed',
    'write:verification-queued',
  ], [
    'verification:settled',
    'verification:passed',
    'write:verification-settled',
  ])
  const trajectoryRepairTargets = pendingTrajectoryTargets(harness.trajectory, [
    'repair:classified',
    'repair:hypothesis',
    'repair:context-needed',
    'repair:next-hypothesis',
  ], [
    'repair:settled',
  ])
  const trajectoryArtifactClaims = pendingTrajectoryTargets(harness.trajectory, [
    'artifact:requested',
    'artifact:written',
    'artifact:source-missing',
    'artifact:verification-missing',
    'artifact:pending',
  ], [
    'artifact:completed',
  ])
  return {
    contextPaths: uniqueStrings([
      ...harness.sourceFacts.map((fact) => fact.path),
      ...harness.pendingRepair.flatMap((item) => item.contextNeed && hasSourceFact(harness, item.contextNeed) ? [item.contextNeed] : []),
    ]),
    changedFiles: uniqueStrings(harness.pendingWrite.flatMap((item) => item.targetFiles)),
    verificationTargets: uniqueStrings([
      ...harness.pendingVerification.flatMap((item) => item.targetFiles),
      ...trajectoryVerificationTargets,
    ]),
    failedVerificationTargets: uniqueStrings([
      ...harness.pendingVerification.flatMap((item) => item.targetFiles),
      ...harness.pendingRepair.flatMap((item) => item.targetFiles),
      ...trajectoryVerificationTargets,
      ...trajectoryRepairTargets,
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
    continuationFacts: harness.savePoints.length > 0 || harness.ledger.length > 0 || harness.trajectory.length > 0
      ? ['runtime harness state restored']
      : [],
    artifactClaims: uniqueStrings([
      ...harness.pendingArtifact.flatMap((item) => item.claims),
      ...trajectoryArtifactClaims,
    ]),
    artifactClaimEvidence: harness.pendingArtifact.flatMap((item) =>
      item.claims.map((claim, index) => ({
        claim,
        ...(item.evidenceIds[index] ? { evidenceId: item.evidenceIds[index] } : {}),
      }))
    ),
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
    pendingArtifact: [...savePoint.pendingArtifact],
    sourceFacts: [...(savePoint.sourceFacts ?? [])],
    trajectory: [...savePoint.trajectory],
  })
}

function pendingActionForHarness(harness: QueryRuntimeHarnessState): ToolActionKind | undefined {
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

function classifyOutputClaims(input: {
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

function hasSourceFact(harness: QueryRuntimeHarnessState, path: string): boolean {
  return harness.sourceFacts.some((fact) => fact.path === path)
}

function hasContextAttempt(harness: QueryRuntimeHarnessState, path: string): boolean {
  return harness.ledger.some((entry) =>
    (entry.actionKind === 'read' || entry.actionKind === 'search') &&
    entry.exitStatusClass === 'success' &&
    [...entry.targetFiles, ...entry.affectedPaths].includes(path)
  )
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
    ...queue.filter((item) => item.queueId !== next.queueId && !overlapsTargets(item.targetFiles, next.targetFiles)),
    Object.freeze(next),
  ]
}

function upsertPendingArtifact(
  queue: readonly QueryRuntimePendingArtifact[],
  next: QueryRuntimePendingArtifact,
): QueryRuntimePendingArtifact[] {
  const current = queue.find((item) => sameTargets(item.claims, next.claims))
  const merged = current
    ? {
        ...next,
        evidenceIds: uniqueStrings([...current.evidenceIds, ...next.evidenceIds]),
        targetFiles: uniqueStrings([...current.targetFiles, ...next.targetFiles]),
      }
    : next
  return [
    ...queue.filter((item) => !sameTargets(item.claims, next.claims)),
    Object.freeze(merged),
  ]
}

function removeSatisfiedArtifact(
  queue: readonly QueryRuntimePendingArtifact[],
  claims: readonly string[],
): QueryRuntimePendingArtifact[] {
  return queue.filter((item) => !sameTargets(item.claims, claims))
}

function settleArtifactVerification(
  queue: readonly QueryRuntimePendingArtifact[],
  covered: readonly string[],
): QueryRuntimePendingArtifact[] {
  const coveredSet = new Set(covered)
  return queue.map((item) => {
    if (item.targetFiles.length === 0 || !item.targetFiles.every((path) => coveredSet.has(path))) {
      return item
    }
    return Object.freeze({
      ...item,
      evidenceIds: uniqueStrings([...item.evidenceIds, ...covered]),
    })
  })
}

function settleRepairContext(
  queue: readonly QueryRuntimePendingRepair[],
  covered: readonly string[],
  sourceFactIds: readonly string[] = [],
): QueryRuntimePendingRepair[] {
  const coveredSet = new Set(covered)
  return queue.map((item) => {
    if (!item.contextNeed || !coveredSet.has(item.contextNeed)) {
      return item
    }
    const { contextNeed: _contextNeed, ...rest } = item
    return Object.freeze({
      ...rest,
      sourceFactIds: uniqueStrings([...(rest.sourceFactIds ?? []), ...sourceFactIds]),
    })
  })
}

function removeCoveredVerification(
  queue: readonly QueryRuntimePendingVerification[],
  covered: readonly string[],
): QueryRuntimePendingVerification[] {
  const coveredSet = new Set(covered)
  return queue.filter((item) => !item.targetFiles.every((path) => coveredSet.has(path)))
}

function removeCoveredRepair(
  queue: readonly QueryRuntimePendingRepair[],
  covered: readonly string[],
): QueryRuntimePendingRepair[] {
  const coveredSet = new Set(covered)
  return queue.filter((item) => !item.targetFiles.every((path) => coveredSet.has(path)))
}

function sameTargets(left: readonly string[], right: readonly string[]): boolean {
  const normalizedLeft = uniqueStrings(left)
  const normalizedRight = uniqueStrings(right)
  return normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value) => normalizedRight.includes(value))
}

function overlapsTargets(left: readonly string[], right: readonly string[]): boolean {
  const normalizedRight = new Set(uniqueStrings(right))
  return uniqueStrings(left).some((value) => normalizedRight.has(value))
}

function coversTargets(targets: readonly string[], covered: readonly string[]): boolean {
  const coveredSet = new Set(covered)
  return targets.length > 0 && targets.every((path) => coveredSet.has(path))
}

function pendingTrajectoryTargets(
  trajectory: readonly QueryRuntimeTrajectoryEntry[],
  openPhases: readonly QueryRuntimeTrajectoryPhase[],
  closePhases: readonly QueryRuntimeTrajectoryPhase[],
): string[] {
  const pending = new Set<string>()
  for (const entry of trajectory) {
    if (openPhases.includes(entry.phase)) {
      for (const target of entry.targetFiles) pending.add(target)
    }
    if (closePhases.includes(entry.phase)) {
      for (const target of entry.targetFiles) pending.delete(target)
    }
  }
  return [...pending]
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function safeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 180)
}

function appendTrajectory(
  trajectory: readonly QueryRuntimeTrajectoryEntry[],
  entry: Omit<QueryRuntimeTrajectoryEntry, 'sequence'>,
): QueryRuntimeTrajectoryEntry[] {
  return [
    ...trajectory,
    Object.freeze({
      sequence: trajectory.length + 1,
      turn: entry.turn,
      role: entry.role,
      phase: entry.phase,
      ...(entry.actionKind ? { actionKind: entry.actionKind } : {}),
      ...(entry.toolId ? { toolId: entry.toolId } : {}),
      targetFiles: uniqueStrings(entry.targetFiles),
      ...(entry.detail ? { detail: safeText(entry.detail) } : {}),
    }),
  ]
}

function freezeHarness(state: {
  readonly taskStateVersion: number
  readonly snapshots: readonly QueryRuntimeTurnSnapshot[]
  readonly savePoints: readonly QueryRuntimeSavePoint[]
  readonly ledger: readonly QueryRuntimeLedgerEntry[]
  readonly pendingWrite: readonly QueryRuntimePendingWrite[]
  readonly pendingVerification: readonly QueryRuntimePendingVerification[]
  readonly pendingRepair: readonly QueryRuntimePendingRepair[]
  readonly pendingArtifact: readonly QueryRuntimePendingArtifact[]
  readonly sourceFacts: readonly RuntimeSourceFact[]
  readonly trajectory: readonly QueryRuntimeTrajectoryEntry[]
}): QueryRuntimeHarnessState {
  return Object.freeze({
    taskStateVersion: state.taskStateVersion,
    snapshots: Object.freeze([...state.snapshots]),
    savePoints: Object.freeze([...state.savePoints]),
    ledger: Object.freeze([...state.ledger]),
    pendingWrite: Object.freeze([...state.pendingWrite]),
    pendingVerification: Object.freeze([...state.pendingVerification]),
    pendingRepair: Object.freeze([...state.pendingRepair]),
    pendingArtifact: Object.freeze([...state.pendingArtifact]),
    sourceFacts: normalizeRuntimeSourceFacts(state.sourceFacts),
    trajectory: Object.freeze([...state.trajectory]),
  })
}
