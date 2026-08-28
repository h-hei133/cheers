import type { AgentExecutionOutput, AgentRunner, AgentRole } from '../../../orchestration/types.js'
import type { QueryEvent } from './events.js'
import { ensureQueryRuntimeHarnessState, ensureQueryRuntimeObservationState, type QueryRuntimeState } from './state.js'
import { applyLifecycleEventToIndex } from '../../tools/toolResultLifecycle.js'
import type { QueryRuntimeActionDecision } from './decision.js'
import { decideQueryRuntimeAction, hasOpenRuntimeProofGap } from './policy.js'
import { observeQueryRuntimeExecutionResults, observeQueryRuntimeOutput } from './observation.js'
import { projectQueryRuntimeProof } from './proof.js'
import {
  blockedRuntimeActionOutput,
  blockUnsafeRuntimeAction,
  constrainRuntimeActionOutput,
} from './actionAuthority.js'
import {
  blockedRuntimeExecutionBatchResult,
  buildQueryRuntimeExecutionBatch,
  hasUnsafeRuntimeExecutionFailure,
  type QueryRuntimeExecutionBatchExecutor,
  type QueryRuntimeExecutionBatchResult,
  type QueryRuntimeExecutionResult,
} from './batch.js'
import {
  ALLOWED_HANDOFFS,
  continueQuery,
  terminalQuery,
  type QueryTerminal,
} from './transitions.js'
import {
  appendHarnessSavePoint,
  captureHarnessTurnSnapshot,
  harnessObservationPatch,
  recordHarnessSnapshot,
  settleHarnessBatch,
  settleHarnessOutput,
} from './harness.js'

export interface QueryLoopDependencies {
  readonly runAgent: AgentRunner
  readonly executeRuntimeBatch?: QueryRuntimeExecutionBatchExecutor
  readonly getRolePrompt: (role: QueryRuntimeState['currentRole']) => string
  readonly onEvent?: (event: QueryEvent) => void | Promise<void>
}

const DEFAULT_MAX_RETRIES_PER_TURN = 2

interface QueryRuntimeErrorLike {
  readonly message?: string
  readonly retryable?: boolean
  readonly events?: readonly QueryEvent[]
}

export async function runQueryLoop(
  state: QueryRuntimeState,
  deps: QueryLoopDependencies,
): Promise<QueryTerminal> {
  while (state.turn <= state.config.maxTurns) {
    const runtimeAction = decideQueryRuntimeAction(state)
    await deps.onEvent?.({
      type: 'runtime.next-action',
      role: state.currentRole,
      turn: state.turn,
      decision: runtimeAction,
    })
    if (runtimeAction.nextAction === 'stop-not-proven') {
      return terminalQuery('stopped_not_proven', runtimeAction.reason)
    }

    await deps.onEvent?.({ type: 'turn.started', role: state.currentRole, turn: state.turn })

    const execution = await executeTurn(state, deps, runtimeAction)
    if (execution.action === 'terminal') {
      return execution.terminal
    }

    const output = execution.output

    state.transcript.push(output)
    appendNotes(state, output)
    observeQueryRuntimeOutput(ensureQueryRuntimeObservationState(state), output)
    await emitOutputEvents(state, output, deps)
    await emitMessageDeltas(output, deps)
    const proofProjection = projectQueryRuntimeProof({ state, decision: runtimeAction, output })
    await deps.onEvent?.({
      type: 'runtime.task-proof',
      role: state.currentRole,
      turn: state.turn,
      projection: proofProjection,
    })
    await deps.onEvent?.({ type: 'turn.completed', output })

    const transition = getTransition(state, output)
    if (transition.action === 'terminal') {
      const proofBlocker = terminalProofBlocker(output, proofProjection)
      if (proofBlocker) {
        return terminalQuery('stopped_not_proven', proofBlocker)
      }
      return transition
    }
    if (state.turn >= state.config.maxTurns && hasOpenRuntimeProofGap(output)) {
      return terminalQuery('stopped_not_proven', 'no safe action remains for the current proof gap')
    }

    state.sharedContext.handoffs.push({
      from: state.currentRole,
      to: transition.nextRole,
      reason: transition.reason,
      turn: state.turn,
    })
    state.lastContinuationReason = transition.continuationReason
    state.visitedTransitions.add(transition.signature)
    state.currentRole = transition.nextRole
    state.turn += 1
  }

  return terminalQuery(
    'stopped_max_turns',
    `Maximum turns reached (${state.config.maxTurns})`,
  )
}

function terminalProofBlocker(
  output: AgentExecutionOutput,
  projection: ReturnType<typeof projectQueryRuntimeProof>,
): string | undefined {
  const outputEvents = output.events as readonly QueryEvent[] | undefined
  if (outputEvents?.some((event) => event.type === 'tool.result' && event.success === false)) {
    return 'failed tool output has no task proof'
  }
  if (!output.codingResult) {
    const hasExecutionFeedback =
      projection.observationState.commandCoverageCount > 0 ||
      projection.observationState.toolFeedbackCount > 0
    if (hasExecutionFeedback && !projection.verdict.completeProof) {
      const missingProof = projection.verdict.missingProof[0]
      return missingProof
        ? `execution feedback missing task proof: ${missingProof}`
        : 'execution feedback has no task proof'
    }
    return undefined
  }
  if (projection.artifactReceipt && projection.artifactReceipt.validationState !== 'validation-passed') {
    return projection.artifactReceipt.blockers[0] ?? 'artifact proof gap remains'
  }
  if (
    output.codingResult.repair.status !== 'not-needed' &&
    output.codingResult.repair.attempts > 0 &&
    !projection.verdict.completeProof
  ) {
    return projection.verdict.missingProof.find((item) => item.includes('repair') || item.includes('original-failure')) ??
      projection.verdict.missingProof[0] ??
      'repair proof gap remains'
  }
  const stagedActionBlocker = projection.verdict.missingProof.find((item) => item.includes('staged-action'))
  if (stagedActionBlocker) {
    return 'staged action proof missing'
  }
  if (hasOpenRuntimeProofGap(output)) {
    return 'proof gap remains'
  }
  return undefined
}

async function emitHarnessSettlement(
  state: QueryRuntimeState,
  deps: QueryLoopDependencies,
): Promise<void> {
  const harness = ensureQueryRuntimeHarnessState(state)
  await deps.onEvent?.({
    type: 'runtime.ledger-settled',
    role: state.currentRole,
    turn: state.turn,
    ledger: harness.ledger,
  })
  await deps.onEvent?.({
    type: 'runtime.queue-settled',
    role: state.currentRole,
    turn: state.turn,
    pendingWrite: harness.pendingWrite,
    pendingVerification: harness.pendingVerification,
    pendingRepair: harness.pendingRepair,
  })
  await deps.onEvent?.({
    type: 'runtime.save-point',
    role: state.currentRole,
    turn: state.turn,
    savePoint: harness.savePoints[harness.savePoints.length - 1],
  })
}

async function executeTurn(
  state: QueryRuntimeState,
  deps: QueryLoopDependencies,
  runtimeAction: QueryRuntimeActionDecision,
): Promise<{ action: 'completed'; output: AgentExecutionOutput } | { action: 'terminal'; terminal: QueryTerminal }> {
  const runtimeBatch = buildQueryRuntimeExecutionBatch({
    role: state.currentRole,
    turn: state.turn,
    decision: runtimeAction,
  })
  state.harness = ensureQueryRuntimeHarnessState(state)
  const snapshot = captureHarnessTurnSnapshot({
    harness: state.harness,
    turn: state.turn,
    role: state.currentRole,
    decision: runtimeAction,
    batch: runtimeBatch,
    observations: ensureQueryRuntimeObservationState(state),
  })
  state.harness = recordHarnessSnapshot(state.harness, snapshot)
  state.harness = appendHarnessSavePoint(state.harness, {
    phase: 'before-batch',
    turn: state.turn,
    role: state.currentRole,
    snapshot,
  })
  await deps.onEvent?.({
    type: 'runtime.turn-snapshot',
    role: state.currentRole,
    turn: state.turn,
    snapshot,
  })
  await deps.onEvent?.({
    type: 'runtime.save-point',
    role: state.currentRole,
    turn: state.turn,
    savePoint: state.harness.savePoints[state.harness.savePoints.length - 1],
  })
  const blockedAction = blockUnsafeRuntimeAction(runtimeAction)
  if (blockedAction) {
    const blockedBatch = blockedRuntimeExecutionBatchResult({
      batch: runtimeBatch,
      block: blockedAction,
    })
    state.harness = settleHarnessBatch({
      harness: state.harness,
      batch: runtimeBatch,
      result: blockedBatch,
    })
    state.harness = appendHarnessSavePoint(state.harness, {
      phase: 'after-batch',
      turn: state.turn,
      role: state.currentRole,
      snapshot,
    })
    observeQueryRuntimeExecutionResults(
      ensureQueryRuntimeObservationState(state),
      blockedBatch.results,
    )
    await emitRuntimeToolFeedback(state, deps, blockedBatch)
    await emitHarnessSettlement(state, deps)
    return {
      action: 'completed',
      output: blockedRuntimeActionOutput({
        role: state.currentRole,
        block: blockedAction,
        changedFiles: runtimeAction.changedFiles,
        evidenceFiles: runtimeAction.verificationTargets,
      }),
    }
  }

  if (deps.executeRuntimeBatch && runtimeBatch.items.length > 0) {
    const batchResult = await deps.executeRuntimeBatch({
      batch: runtimeBatch,
      decision: runtimeAction,
    })
    state.harness = settleHarnessBatch({
      harness: state.harness,
      batch: runtimeBatch,
      result: batchResult,
    })
    state.harness = appendHarnessSavePoint(state.harness, {
      phase: 'after-batch',
      turn: state.turn,
      role: state.currentRole,
      snapshot,
    })
    observeQueryRuntimeExecutionResults(
      ensureQueryRuntimeObservationState(state),
      batchResult.results,
    )
    await emitRuntimeToolFeedback(state, deps, batchResult)
    await emitHarnessSettlement(state, deps)
    const failedRuntimeOutput = failedRuntimeBatchOutput({
      role: state.currentRole,
      result: batchResult,
    })
    if (failedRuntimeOutput) {
      return {
        action: 'completed',
        output: failedRuntimeOutput,
      }
    }
    if (hasUnsafeRuntimeExecutionFailure(batchResult) && state.turn >= state.config.maxTurns) {
      return {
        action: 'terminal',
        terminal: terminalQuery(
          'stopped_not_proven',
          'no safe action remains after execution batch failure',
        ),
      }
    }
  }

  for (let attempt = 1; attempt <= DEFAULT_MAX_RETRIES_PER_TURN + 1; attempt += 1) {
    try {
      const output = await deps.runAgent({
        role: state.currentRole,
        rolePrompt: deps.getRolePrompt(state.currentRole),
        turn: state.turn,
        maxTurns: state.config.maxTurns,
        runtimeAction,
        sharedContext: state.sharedContext,
        transcript: state.transcript,
      })

      const constrainedOutput = constrainRuntimeActionOutput(runtimeAction, output)
      state.harness = settleHarnessOutput({
        harness: state.harness,
        output: constrainedOutput === output
          ? constrainedOutput
          : { ...constrainedOutput, content: output.content },
      })
      state.harness = appendHarnessSavePoint(state.harness, {
        phase: 'after-output',
        turn: state.turn,
        role: state.currentRole,
        snapshot,
      })
      await deps.onEvent?.({
        type: 'runtime.queue-settled',
        role: state.currentRole,
        turn: state.turn,
          pendingWrite: state.harness.pendingWrite,
          pendingVerification: state.harness.pendingVerification,
          pendingRepair: state.harness.pendingRepair,
      })
      await deps.onEvent?.({
        type: 'runtime.save-point',
        role: state.currentRole,
        turn: state.turn,
        savePoint: state.harness.savePoints[state.harness.savePoints.length - 1],
      })

      return { action: 'completed', output: constrainedOutput }
    } catch (error) {
      const queryError = toQueryRuntimeError(error)
      const compensationEvents = compensateToolLifecycle(queryError.events ?? [])

      for (const event of queryError.events ?? []) {
        state.pendingLifecycle = applyLifecycleEventToIndex(state.pendingLifecycle, event)
        await deps.onEvent?.(event)
      }
      for (const event of compensationEvents) {
        state.pendingLifecycle = applyLifecycleEventToIndex(state.pendingLifecycle, event)
        await deps.onEvent?.(event)
      }

      if (queryError.retryable === true && attempt <= DEFAULT_MAX_RETRIES_PER_TURN) {
        state.lastContinuationReason = 'retryable-error'
        await deps.onEvent?.({
          type: 'query.retrying',
          role: state.currentRole,
          turn: state.turn,
          attempt,
          reason: queryError.message ?? 'Retryable query runtime error',
        })
        continue
      }

      return {
        action: 'terminal',
        terminal: terminalQuery(
          'stopped_error',
          queryError.message ?? (error instanceof Error ? error.message : String(error)),
        ),
      }
    }
  }

  return {
    action: 'terminal',
    terminal: terminalQuery('stopped_error', 'Retry budget exhausted'),
  }
}

function failedRuntimeBatchOutput(input: {
  readonly role: AgentRole
  readonly result: QueryRuntimeExecutionBatchResult
}): AgentExecutionOutput | undefined {
  const failed = input.result.results.find((item) => item.exitStatusClass !== 'success')
  if (!failed || failed.failureClass === 'none') return undefined
  const targetFiles = [...new Set([...failed.affectedPaths, ...failed.coveredFiles])]
  const reason = failed.diagnosticSummary ?? failed.failureClass
  return {
    role: input.role,
    content: reason,
    handoffTo: ALLOWED_HANDOFFS[input.role][0],
    handoffReason: `runtime ${failed.actionKind} requires follow-up`,
    codingResult: {
      taskKind: 'run-command',
      changedFiles: [],
      verifiedFiles: [],
      unverifiedFiles: targetFiles.map((path) => ({ path, reason })),
      failedFiles: targetFiles.map((path) => ({ path, reason })),
      evidence: [reason],
      diagnosis: {
        disposition: 'needs-edit',
        candidateFiles: targetFiles,
        evidenceFiles: targetFiles,
        searchPattern: failed.actionKind,
        reason,
        evidenceNodes: [],
        evidenceLinks: [],
      },
      changeSet: {
        gitAware: false,
        preExistingDirtyFiles: [],
        postRunDirtyFiles: [],
        attemptedFiles: targetFiles,
        changedFiles: [],
        unchangedAttemptedFiles: targetFiles,
      },
      patches: [],
      verification: {
        status: failed.actionKind === 'verify' ? 'failed' : 'not-requested',
        reason,
        nextAction: failed.actionKind === 'verify' ? 'repair' : undefined,
      },
      repair: {
        status: failed.actionKind === 'repair' ? 'failed' : 'not-needed',
        attempts: failed.actionKind === 'repair' ? 1 : 0,
        recoveredItems: [],
        failedItems: failed.actionKind === 'repair' ? targetFiles : [],
        notes: failed.actionKind === 'repair' ? [reason] : [],
      },
      continuation: {
        status: 'first-pass-success',
        attempts: 0,
        evidence: [],
      },
      taskSatisfaction: {
        verdict: 'insufficient-evidence',
        reasons: [reason],
        requiredEvidence: ['targeted verification proof'],
        observedEvidence: [],
      },
      lastActionResultSeed: {
        actionKind: failed.actionKind,
        target: targetFiles[0] ?? 'runtime',
      },
    },
  }
}

async function emitRuntimeToolFeedback(
  state: QueryRuntimeState,
  deps: QueryLoopDependencies,
  batchResult: QueryRuntimeExecutionBatchResult,
): Promise<void> {
  for (const result of batchResult.results) {
    await emitRuntimeToolFeedbackResult(state, deps, result)
  }
}

async function emitRuntimeToolFeedbackResult(
  state: QueryRuntimeState,
  deps: QueryLoopDependencies,
  result: QueryRuntimeExecutionResult,
): Promise<void> {
  await deps.onEvent?.({
    type: 'runtime.tool-feedback',
    role: state.currentRole,
    turn: state.turn,
    toolId: result.toolId,
    actionKind: result.actionKind,
    coveredFiles: result.coveredFiles,
    affectedPaths: result.affectedPaths,
    exitStatusClass: result.exitStatusClass,
    failureClass: result.failureClass,
    redactionStatus: result.redactionStatus,
    truncated: result.truncated,
    ...(result.commandCoverage ? { commandCoverage: result.commandCoverage } : {}),
    terminalSuccessClaim: false,
  })
}

async function emitOutputEvents(
  state: QueryRuntimeState,
  output: AgentExecutionOutput,
  deps: QueryLoopDependencies,
): Promise<void> {
  const outputEvents = (output.events ?? []) as readonly QueryEvent[]
  for (const event of outputEvents) {
    state.pendingLifecycle = applyLifecycleEventToIndex(state.pendingLifecycle, event)
    await deps.onEvent?.(event)
  }

  for (const event of compensateToolLifecycle(outputEvents)) {
    state.pendingLifecycle = applyLifecycleEventToIndex(state.pendingLifecycle, event)
    await deps.onEvent?.(event)
  }
}

async function emitMessageDeltas(output: AgentExecutionOutput, deps: QueryLoopDependencies): Promise<void> {
  for (const word of output.content.split(' ')) {
    if (word.length > 0) {
      await deps.onEvent?.({ type: 'message.delta', role: output.role, delta: `${word} ` })
    }
  }
}

function toQueryRuntimeError(error: unknown): QueryRuntimeErrorLike {
  if (typeof error === 'object' && error !== null) {
    return error as QueryRuntimeErrorLike
  }

  return { message: String(error) }
}

function compensateToolLifecycle(events: readonly QueryEvent[]): QueryEvent[] {
  const pendingToolStarts = new Map<string, Extract<QueryEvent, { type: 'tool.started' }>>()
  const pendingApprovals = new Map<string, Extract<QueryEvent, { type: 'approval.requested' }>>()

  for (const event of events) {
    switch (event.type) {
      case 'tool.started':
        pendingToolStarts.set(event.taskId, event)
        break
      case 'approval.requested':
        pendingApprovals.set(event.taskId, event)
        break
      case 'approval.resolved':
        pendingApprovals.delete(event.taskId)
        break
      case 'tool.result':
        pendingToolStarts.delete(event.taskId)
        break
      default:
        break
    }
  }

  const compensated: QueryEvent[] = []
  for (const pendingApproval of pendingApprovals.values()) {
    compensated.push({
      type: 'approval.resolved',
      toolName: pendingApproval.toolName,
      taskId: pendingApproval.taskId,
      outcome: 'denied',
      compensated: true,
    })
  }
  for (const pendingTool of pendingToolStarts.values()) {
    compensated.push({
      type: 'tool.result',
      toolName: pendingTool.toolName,
      taskId: pendingTool.taskId,
      success: false,
      compensated: true,
    })
  }

  return compensated
}

function appendNotes(state: QueryRuntimeState, output: AgentExecutionOutput): void {
  if (!output.notes?.length) {
    return
  }

  state.sharedContext.notes.push(...output.notes)
}

function getTransition(
  state: QueryRuntimeState,
  output: AgentExecutionOutput,
) {
  const handoffTo = output.handoffTo
  const pendingAction = harnessObservationPatch(ensureQueryRuntimeHarnessState(state)).pendingAction
  const nextRole = ALLOWED_HANDOFFS[state.currentRole][0]
  const canContinuePendingAction = Boolean(
    pendingAction &&
    nextRole &&
    state.turn < state.config.maxTurns,
  )
  if (!handoffTo) {
    if (canContinuePendingAction && pendingAction && nextRole) {
      return continueQuery(
        state.currentRole,
        nextRole,
        `pending runtime action: ${pendingAction}`,
      )
    }
    if (hasOpenRuntimeProofGap(output)) {
      return terminalQuery(
        'stopped_not_proven',
        'terminal turn still has an open proof gap',
      )
    }
    return terminalQuery('completed')
  }

  if (!ALLOWED_HANDOFFS[state.currentRole].includes(handoffTo)) {
    if (canContinuePendingAction && pendingAction && nextRole) {
      return continueQuery(
        state.currentRole,
        nextRole,
        `pending runtime action: ${pendingAction}`,
      )
    }
    return terminalQuery(
      'stopped_invalid_handoff',
      `Invalid handoff ${state.currentRole} -> ${handoffTo}`,
    )
  }

  const transition = continueQuery(
    state.currentRole,
    handoffTo,
    output.handoffReason ?? 'unspecified',
  )

  if (state.visitedTransitions.has(transition.signature)) {
    if (canContinuePendingAction && pendingAction && nextRole) {
      return continueQuery(
        state.currentRole,
        nextRole,
        `pending runtime action: ${pendingAction}`,
      )
    }
    return terminalQuery(
      'stopped_cycle',
      `Cycle detected at ${transition.signature}`,
    )
  }

  return transition
}
