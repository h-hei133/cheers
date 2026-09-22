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


import {
  classifyOutputClaims,
  hasSourceFact,
  pendingActionForHarness,
  repairForResult,
} from "./harnessClaims.js";
import {
  coversTargets,
  overlapsTargets,
  pendingTrajectoryTargets,
  removeCoveredRepair,
  removeCoveredVerification,
  removeSatisfiedArtifact,
  sameTargets,
  settleArtifactVerification,
  settleRepairContext,
  upsertPendingArtifact,
  upsertPendingRepair,
  upsertPendingVerification,
  upsertPendingWrite,
} from "./harnessPendingState.js";
import {
  appendTrajectory,
  freezeHarness,
  safeText,
  uniqueStrings,
} from "./harnessSupport.js";

import type {
  QueryRuntimeHarnessSeed,
  QueryRuntimeHarnessState,
  QueryRuntimeLedgerEntry,
  QueryRuntimePendingArtifact,
  QueryRuntimePendingRepair,
  QueryRuntimePendingVerification,
  QueryRuntimePendingWrite,
  QueryRuntimeSavePoint,
  QueryRuntimeTrajectoryEntry,
  QueryRuntimeTrajectoryPhase,
  QueryRuntimeTurnSnapshot,
} from "./harnessState.js";

export type {
  QueryRuntimePendingWrite,
  QueryRuntimePendingVerification,
  QueryRuntimePendingRepair,
  QueryRuntimePendingArtifact,
  QueryRuntimeTrajectoryPhase,
  QueryRuntimeTrajectoryEntry,
  QueryRuntimeLedgerEntry,
  QueryRuntimeTurnSnapshot,
  QueryRuntimeSavePoint,
  QueryRuntimeHarnessState,
  QueryRuntimeHarnessSeed,
} from "./harnessState.js";

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

