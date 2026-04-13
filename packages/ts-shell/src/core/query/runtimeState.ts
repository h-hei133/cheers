import type {
  AgentExecutionOutput,
  AgentRole,
  ContinuationReason,
  SharedContext,
} from '../../orchestration/types.js'
import {
  createEmptyLifecycleIndex,
  type DurableLifecycleIndex,
} from '../tools/toolResultLifecycle.js'

export interface QueryRuntimeConfig {
  readonly sessionId: string
  readonly initialPrompt: string
  readonly maxTurns: number
  readonly startingRole: AgentRole
}

export interface QueryRuntimeState {
  readonly config: QueryRuntimeConfig
  currentRole: AgentRole
  turn: number
  lastContinuationReason?: ContinuationReason
  pendingLifecycle: DurableLifecycleIndex
  readonly sharedContext: SharedContext
  readonly transcript: AgentExecutionOutput[]
  readonly visitedTransitions: Set<string>
}

export type QueryRuntimeRecoveryBoundary =
  | 'fresh-entry'
  | 'completed-turn-reentry'
  | 'mid-turn-reentry'

export interface QueryRuntimeRepairSummary {
  readonly insertedPromptMessage: boolean
  readonly insertedQueryStarted: boolean
  readonly strippedInterruptedTerminalEvents: number
  readonly insertedRunInterrupted: boolean
  readonly ignoredDuplicateTurnStarts: number
  readonly ignoredUnpairedTurnCompletions: number
  readonly ignoredRoleMismatchedTurnCompletions: number
}

export type ContinuationSafety = 'fresh-only' | 'completed-turn-only' | 'mid-turn-safe'

export type ContinuationEvidenceToken =
  | 'open-turn'
  | 'paired-turns'
  | 'pending-lifecycle'
  | 'repair-drift'

export type ContinuationPolicyEvidence = ReadonlySet<ContinuationEvidenceToken>

export function buildContinuationPolicyEvidence(tokens: Iterable<ContinuationEvidenceToken>): ContinuationPolicyEvidence {
  return new Set(tokens)
}

export function hasContinuationEvidence(
  evidence: ContinuationPolicyEvidence,
  token: ContinuationEvidenceToken,
): boolean {
  return evidence.has(token)
}

export interface ContinuationSafetyPolicyRow {
  readonly safety: ContinuationSafety
  readonly runtimeRecoveryBoundary: QueryRuntimeRecoveryBoundary
  readonly allowDerivedContext: boolean
  readonly resetToStartingRole: boolean
  readonly accepts: (evidence: ContinuationPolicyEvidence) => boolean
}

export const CONTINUATION_SAFETY_POLICY: Record<ContinuationSafety, ContinuationSafetyPolicyRow> = {
  'fresh-only': {
    safety: 'fresh-only',
    runtimeRecoveryBoundary: 'fresh-entry',
    allowDerivedContext: false,
    resetToStartingRole: true,
    accepts: () => true,
  },
  'completed-turn-only': {
    safety: 'completed-turn-only',
    runtimeRecoveryBoundary: 'completed-turn-reentry',
    allowDerivedContext: true,
    resetToStartingRole: false,
    accepts: evidence => hasContinuationEvidence(evidence, 'paired-turns'),
  },
  'mid-turn-safe': {
    safety: 'mid-turn-safe',
    runtimeRecoveryBoundary: 'mid-turn-reentry',
    allowDerivedContext: true,
    resetToStartingRole: false,
    accepts: evidence =>
      hasContinuationEvidence(evidence, 'open-turn')
      && !hasContinuationEvidence(evidence, 'repair-drift')
      && !hasContinuationEvidence(evidence, 'pending-lifecycle'),
  },
}

export function resolveContinuationSafety(params: {
  evidence: ContinuationPolicyEvidence
}): ContinuationSafety {
  if (CONTINUATION_SAFETY_POLICY['mid-turn-safe'].accepts(params.evidence)) {
    return 'mid-turn-safe'
  }

  if (CONTINUATION_SAFETY_POLICY['completed-turn-only'].accepts(params.evidence)) {
    return 'completed-turn-only'
  }

  return 'fresh-only'
}

export interface QueryRuntimeSeedTruthBoundary {
  readonly source: 'durable-replay'
  readonly normalizedEventCount: number
  readonly pairedTurnCount: number
  readonly policyEvidence: ContinuationPolicyEvidence
  readonly repairSummary: QueryRuntimeRepairSummary
  readonly continuationSafety: ContinuationSafety
  readonly openTurn?: {
    readonly role: AgentRole
    readonly turn: number
  }
}

export interface QueryRuntimeSeedDerivedState {
  readonly transcript: readonly AgentExecutionOutput[]
}

interface DerivedQueryContext {
  readonly sharedContext: SharedContext
  readonly visitedTransitions: readonly string[]
}

export interface QueryRuntimeStateSeed {
  readonly config: QueryRuntimeConfig
  readonly currentRole: AgentRole
  readonly turn: number
  readonly lastContinuationReason?: ContinuationReason
  readonly pendingLifecycle: DurableLifecycleIndex
  readonly recoveryBoundary: QueryRuntimeRecoveryBoundary
  readonly truthBoundary: QueryRuntimeSeedTruthBoundary
  readonly derivedState: QueryRuntimeSeedDerivedState
}

export function createQueryRuntimeState(
  config: QueryRuntimeConfig,
): QueryRuntimeState {
  return {
    config,
    currentRole: config.startingRole,
    turn: 1,
    lastContinuationReason: undefined,
    pendingLifecycle: createEmptyLifecycleIndex(),
    sharedContext: {
      sessionId: config.sessionId,
      initialPrompt: config.initialPrompt,
      notes: [],
      handoffs: [],
    },
    transcript: [],
    visitedTransitions: new Set<string>(),
  }
}

export function createQueryRuntimeStateFromSeed(
  seed: QueryRuntimeStateSeed,
): QueryRuntimeState {
  const derivedContext = deriveQueryContextFromTranscript(seed)
  const policy = CONTINUATION_SAFETY_POLICY[seed.truthBoundary.continuationSafety]

  return {
    config: seed.config,
    currentRole: seed.currentRole,
    turn: seed.turn,
    lastContinuationReason: seed.lastContinuationReason,
    pendingLifecycle: {
      pendingApprovals: { ...seed.pendingLifecycle.pendingApprovals },
      pendingTools: { ...seed.pendingLifecycle.pendingTools },
      taskStates: { ...seed.pendingLifecycle.taskStates },
    },
    sharedContext: derivedContext.sharedContext,
    transcript: policy.allowDerivedContext ? [...seed.derivedState.transcript] : [],
    visitedTransitions: new Set(derivedContext.visitedTransitions),
  }
}

function deriveQueryContextFromTranscript(seed: QueryRuntimeStateSeed): DerivedQueryContext {
  const policy = CONTINUATION_SAFETY_POLICY[seed.truthBoundary.continuationSafety]

  if (!policy.allowDerivedContext) {
    return {
      sharedContext: {
        sessionId: seed.config.sessionId,
        initialPrompt: seed.config.initialPrompt,
        notes: [],
        handoffs: [],
      },
      visitedTransitions: [],
    }
  }

  const notes: string[] = []
  const handoffs: SharedContext['handoffs'] = []

  seed.derivedState.transcript.forEach((output, index) => {
    if (output.notes?.length) {
      notes.push(...output.notes)
    }

    if (output.handoffTo) {
      handoffs.push({
        from: output.role,
        to: output.handoffTo,
        reason: output.handoffReason ?? 'unspecified',
        turn: index + 1,
      })
    }
  })

  return {
    sharedContext: {
      sessionId: seed.config.sessionId,
      initialPrompt: seed.config.initialPrompt,
      notes,
      handoffs,
    },
    visitedTransitions: handoffs.map(handoff => `${handoff.from}->${handoff.to}`),
  }
}
