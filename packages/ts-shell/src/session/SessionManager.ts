/**
 * SessionManager - directory-based session substrate
 *
 * Layout per session:
 * - metadata.json   -> identity + timestamps
 * - transcript.jsonl -> append-only events/messages
 * - state.json      -> mutable runtime state snapshot
 */

import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { QueryEvent } from '../core/query/events.js'
import type {
  ContinuationSafety,
  ContinuationPolicyEvidence,
  ContinuationEvidenceToken,
  QueryRuntimeRepairSummary,
  QueryRuntimeRecoveryBoundary,
  QueryRuntimeStateSeed,
} from '../core/query/runtimeState.js'
import {
  buildContinuationPolicyEvidence,
  CONTINUATION_SAFETY_POLICY,
  resolveContinuationSafety,
} from '../core/query/runtimeState.js'
import type { ContinuationReason, TerminalClassification, TerminalReason } from '../orchestration/types.js'
import {
  applyLifecycleEventToIndex,
  createEmptyLifecycleIndex,
  type DurableLifecycleIndex,
} from '../core/tools/toolResultLifecycle.js'
import type { AgentExecutionOutput, AgentRole } from '../orchestration/types.js'

export interface SessionMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

export interface Session {
  id: string
  createdAt: string
  updatedAt: string
  status: 'active' | 'interrupted' | 'completed' | 'error' | 'terminated'
  turns: SessionMessage[]
  pendingPrompt?: string
  lastError?: string
}

interface SessionMetadata {
  id: string
  createdAt: string
  updatedAt: string
}

interface SessionStateSnapshot {
  status: Session['status']
  pendingPrompt?: string
  lastError?: string
  durableStatus?: 'success' | 'stopped' | 'error'
  runPhase?: 'idle' | 'prompt-persisted' | 'turn-active'
  interruptedKind?: 'prompt' | 'turn'
  terminalReason?: TerminalReason
  terminalClassification?: TerminalClassification
  lastContinuationReason?: ContinuationReason
  pendingLifecycle?: DurableLifecycleIndex
}

interface TranscriptRepairContext {
  readonly sessionId: string
  readonly state: SessionStateSnapshot
  readonly pendingPrompt?: string
  readonly updatedAt: string
}

export type TranscriptEvent =
  | { type: 'message'; role: SessionMessage['role']; content: string; timestamp: string }
  | { type: 'lifecycle'; event: 'run-started' | 'run-interrupted' | 'run-completed' | 'run-error' | 'run-terminated'; timestamp: string; detail?: string }
  | { type: 'query-event'; event: QueryEvent; timestamp: string }

export interface RecoverySnapshot {
  readonly pendingPrompt?: string
  readonly runPhase?: 'idle' | 'prompt-persisted' | 'turn-active'
  readonly interruptedKind?: 'prompt' | 'turn'
  readonly durableStatus?: 'success' | 'stopped' | 'error'
  readonly terminalReason?: TerminalReason
  readonly terminalClassification?: TerminalClassification
  readonly lastContinuationReason?: ContinuationReason
  readonly pendingLifecycle: DurableLifecycleIndex
  readonly repairSummary: QueryRuntimeRepairSummary
  readonly lastUserMessage?: SessionMessage
  readonly lastAssistantMessage?: SessionMessage
  readonly lastLifecycleEvent?: Extract<TranscriptEvent, { type: 'lifecycle' }>
  readonly transcriptEvents: TranscriptEvent[]
}

interface TerminalPersistence {
  readonly terminalReason?: TerminalReason
  readonly terminalClassification?: TerminalClassification
  readonly lastContinuationReason?: ContinuationReason
}

function toDurableStatus(
  terminalClassification: TerminalClassification | undefined,
  status: Session['status'],
): 'success' | 'stopped' | 'error' | undefined {
  if (terminalClassification === 'success' || status === 'completed') {
    return 'success'
  }

  if (terminalClassification === 'stopped') {
    return 'stopped'
  }

  if (terminalClassification === 'error' || status === 'error') {
    return 'error'
  }

  return undefined
}

export interface ReplayPlan {
  readonly normalizedTranscriptEvents: TranscriptEvent[]
  readonly replayMessages: SessionMessage[]
  readonly continuationPrompt?: string
  readonly requiresAssistantSentinel: boolean
  readonly repairSummary: QueryRuntimeRepairSummary
}

interface RuntimeSeedOptions {
  readonly maxTurns?: number
  readonly fallbackStartingRole?: AgentRole
}

type TurnStartedQueryEvent = Extract<QueryEvent, { type: 'turn.started' }>
type TurnCompletedQueryEvent = Extract<QueryEvent, { type: 'turn.completed' }>

interface TurnPairingState {
  readonly pairedTurns: Array<{
    readonly started: TurnStartedQueryEvent
    readonly output: AgentExecutionOutput
  }>
  readonly openTurn?: TurnStartedQueryEvent
  readonly ignoredDuplicateTurnStarts: number
  readonly ignoredUnpairedTurnCompletions: number
  readonly ignoredRoleMismatchedTurnCompletions: number
}

interface ReplayPreparation {
  readonly transcriptEvents: TranscriptEvent[]
  readonly repairSummary: QueryRuntimeRepairSummary
}

export type ResumeResult =
  | { ok: true; session: Session }
  | { ok: false; error: string; recoveryHint: string }

export class SessionManager {
  private sessionsDir: string

  constructor() {
    const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir()
    this.sessionsDir = path.join(homeDir, '.private-agents', 'sessions')
    this.ensureSessionsDir()
  }

  private ensureSessionsDir(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true })
    }
  }

  private generateSessionId(): string {
    return `sess_${crypto.randomBytes(8).toString('hex')}_${Date.now()}`
  }

  private getSessionDir(sessionId: string): string {
    return path.join(this.sessionsDir, sessionId)
  }

  private getMetadataPath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'metadata.json')
  }

  private getTranscriptPath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'transcript.jsonl')
  }

  private getStatePath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'state.json')
  }

  getSessionFilePath(sessionId: string): string {
    return this.getMetadataPath(sessionId)
  }

  getSessionDirPath(sessionId: string): string {
    return this.getSessionDir(sessionId)
  }

  createNew(): Session {
    const now = new Date().toISOString()
    const session: Session = {
      id: this.generateSessionId(),
      createdAt: now,
      updatedAt: now,
      status: 'active',
      turns: [],
    }

    this.writeSession(session)
    return session
  }

  resume(sessionId: string): Session {
    const sessionDir = this.getSessionDir(sessionId)
    if (!fs.existsSync(sessionDir)) {
      throw new Error(`Session ${sessionId} not found`)
    }

    try {
      const session = this.load(sessionId)
      session.status = 'active'
      session.updatedAt = new Date().toISOString()
      this.writeSessionMetadata(session)
      return session
    } catch (error) {
      throw new Error(`Failed to resume session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  tryResume(sessionId: string): ResumeResult {
    try {
      return { ok: true, session: this.resume(sessionId) }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        recoveryHint: `Session ${sessionId} could not be restored. Start a fresh session or inspect ${this.getSessionDir(sessionId)}.`,
      }
    }
  }

  addTurn(sessionId: string, message: SessionMessage): void {
    const session = this.load(sessionId)
    const timestamp = new Date().toISOString()
    const nextMessage: SessionMessage = { ...message, timestamp }
    session.turns.push(nextMessage)
    session.updatedAt = timestamp
    this.appendTranscriptEvent(sessionId, {
      type: 'message',
      role: nextMessage.role,
      content: nextMessage.content,
      timestamp,
    })
    this.writeSessionMetadata(session)
    this.writeSessionState(session)
  }

  markRunStarted(sessionId: string, prompt: string): void {
    const session = this.load(sessionId)
    session.status = 'active'
    delete session.lastError
    session.pendingPrompt = prompt
    session.updatedAt = new Date().toISOString()
    this.appendTranscriptEvent(sessionId, {
      type: 'lifecycle',
      event: 'run-started',
      timestamp: session.updatedAt,
      detail: prompt,
    })
    this.writeSessionMetadata(session)
    this.writeSessionState(session, {
      terminalReason: undefined,
      terminalClassification: undefined,
      lastContinuationReason: undefined,
      pendingLifecycle: createEmptyLifecycleIndex(),
    })
  }

  persistUserPromptBarrier(sessionId: string, prompt: string): void {
    const session = this.load(sessionId)
    const timestamp = new Date().toISOString()
    const nextMessage: SessionMessage = { role: 'user', content: prompt, timestamp }

    session.status = 'active'
    delete session.lastError
    session.pendingPrompt = prompt
    session.updatedAt = timestamp
    session.turns.push(nextMessage)

    this.appendTranscriptEvent(sessionId, {
      type: 'lifecycle',
      event: 'run-started',
      timestamp,
      detail: prompt,
    })
    this.appendTranscriptEvent(sessionId, {
      type: 'message',
      role: 'user',
      content: prompt,
      timestamp,
    })

    this.writeSessionMetadata(session)
    this.writeSessionState(session, {
      runPhase: 'prompt-persisted',
      interruptedKind: undefined,
      terminalReason: undefined,
      terminalClassification: undefined,
      lastContinuationReason: undefined,
      pendingLifecycle: createEmptyLifecycleIndex(),
    })
  }

  markTurnActive(sessionId: string): void {
    const session = this.load(sessionId)
    delete session.lastError
    session.updatedAt = new Date().toISOString()
    this.writeSessionMetadata(session)
    this.writeSessionState(session, {
      runPhase: 'turn-active',
      interruptedKind: undefined,
      terminalReason: undefined,
      terminalClassification: undefined,
      lastContinuationReason: undefined,
      pendingLifecycle: createEmptyLifecycleIndex(),
    })
  }

  markRecoveryReentry(
    sessionId: string,
    boundary: QueryRuntimeRecoveryBoundary,
  ): void {
    const session = this.load(sessionId)
    session.status = 'active'
    delete session.lastError
    session.updatedAt = new Date().toISOString()
    this.writeSessionMetadata(session)
    this.writeSessionState(session, {
      runPhase: boundary === 'mid-turn-reentry' ? 'turn-active' : 'prompt-persisted',
      interruptedKind: boundary === 'mid-turn-reentry' ? 'turn' : 'prompt',
      terminalReason: undefined,
      terminalClassification: undefined,
      lastContinuationReason: undefined,
    })
  }

  saveInterrupted(sessionId: string, interruptedKind: 'prompt' | 'turn' = 'prompt'): void {
    const session = this.load(sessionId)
    session.status = 'interrupted'
    delete session.lastError
    session.updatedAt = new Date().toISOString()
    this.appendTranscriptEvent(sessionId, {
      type: 'lifecycle',
      event: 'run-interrupted',
      timestamp: session.updatedAt,
      detail: session.pendingPrompt,
    })
    this.writeSessionMetadata(session)
    this.writeSessionState(session, {
      interruptedKind,
      terminalReason: undefined,
      terminalClassification: undefined,
      lastContinuationReason: undefined,
    })
  }

  saveCompleted(sessionId: string, terminal?: TerminalPersistence): void {
    const session = this.load(sessionId)
    session.status = 'completed'
    delete session.lastError
    delete session.pendingPrompt
    session.updatedAt = new Date().toISOString()
    this.appendTranscriptEvent(sessionId, {
      type: 'lifecycle',
      event: 'run-completed',
      timestamp: session.updatedAt,
    })
    this.writeSessionMetadata(session)
    this.writeSessionState(session, {
      runPhase: 'idle',
      interruptedKind: undefined,
      terminalReason: terminal?.terminalReason ?? 'completed',
      terminalClassification: terminal?.terminalClassification ?? 'success',
      lastContinuationReason: terminal?.lastContinuationReason,
    })
  }

  saveError(sessionId: string, error: string, terminal?: TerminalPersistence): void {
    const session = this.load(sessionId)
    const terminalClassification = terminal?.terminalClassification ?? 'error'
    session.status = 'error'
    delete session.pendingPrompt
    if (terminalClassification === 'stopped') {
      delete session.lastError
    } else {
      session.lastError = error
    }
    session.updatedAt = new Date().toISOString()
    this.appendTranscriptEvent(sessionId, {
      type: 'lifecycle',
      event: 'run-error',
      timestamp: session.updatedAt,
      detail: error,
    })
    this.writeSessionMetadata(session)
    this.writeSessionState(session, {
      runPhase: 'idle',
      interruptedKind: undefined,
      terminalReason: terminal?.terminalReason,
      terminalClassification,
      lastContinuationReason: terminal?.lastContinuationReason,
    })
  }

  saveTerminated(sessionId: string): void {
    const session = this.load(sessionId)
    session.status = 'terminated'
    delete session.lastError
    delete session.pendingPrompt
    session.updatedAt = new Date().toISOString()
    this.appendTranscriptEvent(sessionId, {
      type: 'lifecycle',
      event: 'run-terminated',
      timestamp: session.updatedAt,
    })
    this.writeSessionMetadata(session)
    this.writeSessionState(session, {
      runPhase: 'idle',
      interruptedKind: undefined,
      terminalReason: undefined,
      terminalClassification: undefined,
      lastContinuationReason: undefined,
    })
  }

  reconcilePendingLifecycle(sessionId: string): DurableLifecycleIndex {
    const snapshot = this.getRecoverySnapshot(sessionId)
    for (const pendingApproval of Object.values(snapshot.pendingLifecycle.pendingApprovals)) {
      const compensatedApproval = this.findCompensatedLifecycleEvent(sessionId, {
        type: 'approval.resolved',
        toolName: pendingApproval.toolName,
        taskId: pendingApproval.taskId,
      })

      if (compensatedApproval) {
        this.applyQueryEventToState(sessionId, compensatedApproval)
        continue
      }

      this.appendQueryEvent(sessionId, {
        type: 'approval.resolved',
        toolName: pendingApproval.toolName,
        taskId: pendingApproval.taskId,
        outcome: 'denied',
        compensated: true,
      })
    }
    for (const pendingTool of Object.values(snapshot.pendingLifecycle.pendingTools)) {
      const compensatedTool = this.findCompensatedLifecycleEvent(sessionId, {
        type: 'tool.result',
        toolName: pendingTool.toolName,
        taskId: pendingTool.taskId,
      })

      if (compensatedTool) {
        this.applyQueryEventToState(sessionId, compensatedTool)
        continue
      }

      this.appendQueryEvent(sessionId, {
        type: 'tool.result',
        toolName: pendingTool.toolName,
        taskId: pendingTool.taskId,
        success: false,
        compensated: true,
      })
    }

    return this.getRecoverySnapshot(sessionId).pendingLifecycle
  }

  appendQueryEvent(sessionId: string, event: QueryEvent): void {
    if (this.isDuplicateDurableResolutionEvent(sessionId, event)) {
      return
    }

    this.appendTranscriptEvent(sessionId, {
      type: 'query-event',
      event,
      timestamp: new Date().toISOString(),
    })
    this.applyQueryEventToState(sessionId, event)
  }

  private isDuplicateDurableResolutionEvent(sessionId: string, event: QueryEvent): boolean {
    if (event.type !== 'approval.resolved' && event.type !== 'tool.result') {
      return false
    }

    return this.getTranscriptEvents(sessionId).some(existing => {
      if (existing.type !== 'query-event') {
        return false
      }

      return JSON.stringify(existing.event) === JSON.stringify(event)
    })
  }

  getTranscriptEvents(sessionId: string): TranscriptEvent[] {
    const transcriptPath = this.getTranscriptPath(sessionId)
    if (!fs.existsSync(transcriptPath)) {
      return []
    }

    return fs
      .readFileSync(transcriptPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as TranscriptEvent)
  }

  getRecoverySnapshot(sessionId: string): RecoverySnapshot {
    const session = this.load(sessionId)
    const state = JSON.parse(fs.readFileSync(this.getStatePath(sessionId), 'utf8')) as SessionStateSnapshot
    const replayPreparation = this.prepareReplayTranscript(
      this.normalizeTranscriptEvents(this.getTranscriptEvents(sessionId)),
      {
        sessionId,
        state,
        pendingPrompt: session.pendingPrompt,
        updatedAt: session.updatedAt,
      },
    )
    const transcriptEvents = replayPreparation.transcriptEvents
    const messageEvents = transcriptEvents.filter((event): event is Extract<TranscriptEvent, { type: 'message' }> => event.type === 'message')
    const lifecycleEvents = transcriptEvents.filter((event): event is Extract<TranscriptEvent, { type: 'lifecycle' }> => event.type === 'lifecycle')
    const readModelLifecycle = this.deriveLifecycleIndexFromTranscript(transcriptEvents)

    const lastUserMessage = [...messageEvents].reverse().find(event => event.role === 'user')
    const lastAssistantMessage = [...messageEvents].reverse().find(event => event.role === 'assistant')

    return {
      pendingPrompt: session.pendingPrompt,
      runPhase: state.runPhase,
      interruptedKind: state.interruptedKind,
      durableStatus: state.durableStatus,
      terminalReason: state.terminalReason,
      terminalClassification: state.terminalClassification,
      lastContinuationReason: state.lastContinuationReason,
      pendingLifecycle: readModelLifecycle,
      repairSummary: replayPreparation.repairSummary,
      lastUserMessage,
      lastAssistantMessage,
      lastLifecycleEvent: lifecycleEvents[lifecycleEvents.length - 1],
      transcriptEvents,
    }
  }

  private deriveLifecycleIndexFromTranscript(events: TranscriptEvent[]): DurableLifecycleIndex {
    return events.reduce<DurableLifecycleIndex>((index, event) => {
      if (event.type !== 'query-event') {
        return index
      }

      return applyLifecycleEventToIndex(index, event.event)
    }, createEmptyLifecycleIndex())
  }

  normalizeTranscriptEvents(events: TranscriptEvent[]): TranscriptEvent[] {
    return events.filter(event => {
      if (event.type === 'message' && event.role === 'assistant' && event.content.trim().length === 0) {
        return false
      }

      return true
    })
  }

  repairTranscriptEvents(events: TranscriptEvent[], context: TranscriptRepairContext): TranscriptEvent[] {
    return this.prepareReplayTranscript(events, context).transcriptEvents
  }

  private prepareReplayTranscript(
    events: TranscriptEvent[],
    context: TranscriptRepairContext,
  ): ReplayPreparation {
    const repaired = [...events]
    const baseTimestamp = new Date(context.updatedAt).getTime()
    let syntheticOffset = 0
    let insertedPromptMessage = false
    let insertedQueryStarted = false
    let insertedRunInterrupted = false

    const nextSyntheticTimestamp = (): string => {
      syntheticOffset += 1
      return new Date(baseTimestamp + syntheticOffset).toISOString()
    }

    if (context.pendingPrompt) {
      const normalizedPrompt = context.pendingPrompt.trim()
      const hasPromptMessage = repaired.some((event): event is Extract<TranscriptEvent, { type: 'message' }> =>
        event.type === 'message' && event.role === 'user' && event.content.trim() === normalizedPrompt,
      )

      if (!hasPromptMessage && context.state.runPhase !== 'idle') {
        const runStartedIndex = repaired.findIndex((event): event is Extract<TranscriptEvent, { type: 'lifecycle' }> =>
          event.type === 'lifecycle' && event.event === 'run-started',
        )
        const insertionIndex = runStartedIndex === -1 ? 0 : runStartedIndex + 1
        repaired.splice(insertionIndex, 0, {
          type: 'message',
          role: 'user',
          content: context.pendingPrompt,
          timestamp: nextSyntheticTimestamp(),
        })
        insertedPromptMessage = true
      }
    }

    const hasQueryStarted = repaired.some((event): event is Extract<TranscriptEvent, { type: 'query-event' }> =>
      event.type === 'query-event' && event.event.type === 'query.started',
    )
    const firstQueryEventIndex = repaired.findIndex(event => event.type === 'query-event')
    const hasQueryPhaseEvents = repaired.some((event): event is Extract<TranscriptEvent, { type: 'query-event' }> =>
      event.type === 'query-event' && event.event.type !== 'query.started',
    )

    if (context.state.runPhase === 'turn-active' && context.pendingPrompt && hasQueryPhaseEvents && !hasQueryStarted) {
      repaired.splice(firstQueryEventIndex === -1 ? repaired.length : firstQueryEventIndex, 0, {
        type: 'query-event',
        event: {
          type: 'query.started',
          sessionId: context.sessionId,
          prompt: context.pendingPrompt,
        },
        timestamp: nextSyntheticTimestamp(),
      })
      insertedQueryStarted = true
    }

    const interruptedTerminalQueries = repaired.filter((event): boolean =>
      event.type === 'query-event' && (event.event.type === 'query.completed' || event.event.type === 'query.failed'),
    ).length

    const withoutInterruptedTerminalQueries = context.state.status === 'interrupted'
      ? repaired.filter((event): boolean =>
          event.type !== 'query-event' || (event.event.type !== 'query.completed' && event.event.type !== 'query.failed'),
        )
      : repaired

    const hasRunInterrupted = withoutInterruptedTerminalQueries.some((event): event is Extract<TranscriptEvent, { type: 'lifecycle' }> =>
      event.type === 'lifecycle' && event.event === 'run-interrupted',
    )

    if (context.state.status === 'interrupted' && !hasRunInterrupted) {
      withoutInterruptedTerminalQueries.push({
        type: 'lifecycle',
        event: 'run-interrupted',
        timestamp: nextSyntheticTimestamp(),
        detail: context.pendingPrompt,
      })
      insertedRunInterrupted = true
    }

    return {
      transcriptEvents: withoutInterruptedTerminalQueries,
      repairSummary: {
        insertedPromptMessage,
        insertedQueryStarted,
        strippedInterruptedTerminalEvents: context.state.status === 'interrupted' ? interruptedTerminalQueries : 0,
        insertedRunInterrupted,
        ignoredDuplicateTurnStarts: 0,
        ignoredUnpairedTurnCompletions: 0,
        ignoredRoleMismatchedTurnCompletions: 0,
      },
    }
  }

  getReplayPlan(sessionId: string): ReplayPlan {
    const snapshot = this.getRecoverySnapshot(sessionId)
    const turnPairing = this.buildTurnPairingState(snapshot.transcriptEvents)
    const replayMessages = snapshot.transcriptEvents
      .filter((event): event is Extract<TranscriptEvent, { type: 'message' }> => event.type === 'message')
      .map(event => ({ role: event.role, content: event.content, timestamp: event.timestamp }))

    const lastReplayMessage = replayMessages[replayMessages.length - 1]
    const continuationPrompt = snapshot.interruptedKind === 'turn'
      ? 'Continue from where you left off.'
      : snapshot.interruptedKind === 'prompt'
        ? snapshot.pendingPrompt
        : undefined

    return {
      normalizedTranscriptEvents: snapshot.transcriptEvents,
      replayMessages,
      continuationPrompt,
      requiresAssistantSentinel: lastReplayMessage?.role === 'user',
      repairSummary: {
        ...snapshot.repairSummary,
        ignoredDuplicateTurnStarts: turnPairing.ignoredDuplicateTurnStarts,
        ignoredUnpairedTurnCompletions: turnPairing.ignoredUnpairedTurnCompletions,
        ignoredRoleMismatchedTurnCompletions: turnPairing.ignoredRoleMismatchedTurnCompletions,
      },
    }
  }

  buildRuntimeStateSeed(
    sessionId: string,
    options: RuntimeSeedOptions = {},
  ): QueryRuntimeStateSeed {
    const snapshot = this.getRecoverySnapshot(sessionId)
    const turnPairing = this.buildTurnPairingState(snapshot.transcriptEvents)
    const turnCompletedOutputs = turnPairing.pairedTurns.map(turn => turn.output)

    const initialPrompt = snapshot.pendingPrompt
      ?? snapshot.lastUserMessage?.content
      ?? ''
    const startingRole = turnPairing.pairedTurns[0]?.started.role
      ?? turnPairing.openTurn?.role
      ?? turnCompletedOutputs[0]?.role
      ?? options.fallbackStartingRole
      ?? 'planner'
    const lastCompletedOutput = turnCompletedOutputs[turnCompletedOutputs.length - 1]
    const lastPairedTurn = turnPairing.pairedTurns[turnPairing.pairedTurns.length - 1]?.started
    const driftSummary = {
      ...snapshot.repairSummary,
      ignoredDuplicateTurnStarts: turnPairing.ignoredDuplicateTurnStarts,
      ignoredUnpairedTurnCompletions: turnPairing.ignoredUnpairedTurnCompletions,
      ignoredRoleMismatchedTurnCompletions: turnPairing.ignoredRoleMismatchedTurnCompletions,
    }
    const driftCount = driftSummary.ignoredDuplicateTurnStarts
      + driftSummary.ignoredUnpairedTurnCompletions
      + driftSummary.ignoredRoleMismatchedTurnCompletions

    const computedBoundary: QueryRuntimeRecoveryBoundary = turnPairing.openTurn
      ? 'mid-turn-reentry'
      : turnPairing.pairedTurns.length > 0
        ? 'completed-turn-reentry'
        : 'fresh-entry'
    const hasPendingLifecycle = Object.keys(snapshot.pendingLifecycle.pendingApprovals).length > 0
      || Object.keys(snapshot.pendingLifecycle.pendingTools).length > 0
    const policyEvidenceTokens: ContinuationEvidenceToken[] = []
    if (computedBoundary === 'mid-turn-reentry') {
      policyEvidenceTokens.push('open-turn')
    }
    if (turnPairing.pairedTurns.length > 0) {
      policyEvidenceTokens.push('paired-turns')
    }
    if (hasPendingLifecycle) {
      policyEvidenceTokens.push('pending-lifecycle')
    }
    if (driftCount > 0) {
      policyEvidenceTokens.push('repair-drift')
    }
    const policyEvidence: ContinuationPolicyEvidence = buildContinuationPolicyEvidence(policyEvidenceTokens)
    const continuationSafety: ContinuationSafety = resolveContinuationSafety({
      evidence: policyEvidence,
    })
    const continuationPolicy = CONTINUATION_SAFETY_POLICY[continuationSafety]
    const recoveryBoundary: QueryRuntimeRecoveryBoundary = continuationPolicy.runtimeRecoveryBoundary

    const currentRole = recoveryBoundary === 'mid-turn-reentry'
      ? turnPairing.openTurn!.role
      : lastCompletedOutput?.handoffTo ?? startingRole
    const turn = recoveryBoundary === 'mid-turn-reentry'
      ? turnPairing.openTurn!.turn
      : (lastPairedTurn?.turn ?? 0) + 1

    return {
      config: {
        sessionId,
        initialPrompt,
        maxTurns: options.maxTurns ?? 12,
        startingRole,
      },
      currentRole,
      turn,
      lastContinuationReason: snapshot.lastContinuationReason,
      pendingLifecycle: snapshot.pendingLifecycle,
      recoveryBoundary,
      truthBoundary: {
        source: 'durable-replay',
        normalizedEventCount: snapshot.transcriptEvents.length,
        pairedTurnCount: turnPairing.pairedTurns.length,
        policyEvidence,
        repairSummary: driftSummary,
        continuationSafety,
        openTurn: recoveryBoundary === 'mid-turn-reentry' && turnPairing.openTurn
          ? {
              role: turnPairing.openTurn.role,
              turn: turnPairing.openTurn.turn,
            }
          : undefined,
      },
      derivedState: {
        transcript: turnCompletedOutputs,
      },
    }
  }

  private buildTurnPairingState(
    transcriptEvents: readonly TranscriptEvent[],
  ): TurnPairingState {
    const pairedTurns: Array<{ started: TurnStartedQueryEvent; output: AgentExecutionOutput }> = []
    let openTurn: TurnStartedQueryEvent | undefined
    let ignoredDuplicateTurnStarts = 0
    let ignoredUnpairedTurnCompletions = 0
    let ignoredRoleMismatchedTurnCompletions = 0

    for (const event of transcriptEvents) {
      if (event.type !== 'query-event') {
        continue
      }

      if (event.event.type === 'turn.started') {
        if (!openTurn) {
          openTurn = event.event
        } else {
          ignoredDuplicateTurnStarts += 1
        }
        continue
      }

      if (event.event.type === 'turn.completed') {
        if (openTurn && openTurn.role === event.event.output.role) {
          pairedTurns.push({ started: openTurn, output: event.event.output })
          openTurn = undefined
        } else if (openTurn) {
          ignoredRoleMismatchedTurnCompletions += 1
        } else {
          ignoredUnpairedTurnCompletions += 1
        }
      }
    }

    return {
      pairedTurns,
      openTurn,
      ignoredDuplicateTurnStarts,
      ignoredUnpairedTurnCompletions,
      ignoredRoleMismatchedTurnCompletions,
    }
  }

  listSessions(): Session[] {
    try {
      const entries = fs.readdirSync(this.sessionsDir, { withFileTypes: true })
      const sessions: Session[] = []

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue
        }

        try {
          sessions.push(this.load(entry.name))
        } catch (error) {
          console.warn(
            `Skipping unreadable session directory ${entry.name}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    } catch (error) {
      console.warn(
        `Failed to list sessions in ${this.sessionsDir}: ${error instanceof Error ? error.message : String(error)}`,
      )
      return []
    }
  }

  listRecentSessions(limit: number = 5): Session[] {
    return this.listSessions().slice(0, limit)
  }

  getSuggestedRecoverySession(): Session | null {
    return this.listSessions().find(session =>
      session.status === 'interrupted' || session.status === 'error',
    ) ?? null
  }

  private writeSession(session: Session): void {
    const sessionDir = this.getSessionDir(session.id)
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true })
    }

    if (!fs.existsSync(this.getTranscriptPath(session.id))) {
      fs.writeFileSync(this.getTranscriptPath(session.id), '', 'utf8')
    }

    this.writeSessionMetadata(session)
    this.writeSessionState(session)
  }

  private writeSessionMetadata(session: Session): void {
    const metadata: SessionMetadata = {
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }
    fs.writeFileSync(this.getMetadataPath(session.id), JSON.stringify(metadata, null, 2), 'utf8')
  }

  private writeSessionState(
    session: Session,
    overrides?: Partial<Pick<SessionStateSnapshot, 'runPhase' | 'interruptedKind' | 'terminalReason' | 'terminalClassification' | 'lastContinuationReason' | 'pendingLifecycle'>>,
  ): void {
    const current = fs.existsSync(this.getStatePath(session.id))
      ? JSON.parse(fs.readFileSync(this.getStatePath(session.id), 'utf8')) as SessionStateSnapshot
      : undefined
    const snapshot: SessionStateSnapshot = {
      status: session.status,
      pendingPrompt: session.pendingPrompt,
      lastError: session.lastError,
      runPhase: overrides && Object.prototype.hasOwnProperty.call(overrides, 'runPhase')
        ? overrides.runPhase
        : current?.runPhase ?? 'idle',
      interruptedKind: overrides && Object.prototype.hasOwnProperty.call(overrides, 'interruptedKind')
        ? overrides.interruptedKind
        : current?.interruptedKind,
      terminalReason: overrides && Object.prototype.hasOwnProperty.call(overrides, 'terminalReason')
        ? overrides.terminalReason
        : current?.terminalReason,
      terminalClassification: overrides && Object.prototype.hasOwnProperty.call(overrides, 'terminalClassification')
        ? overrides.terminalClassification
        : current?.terminalClassification,
      durableStatus: toDurableStatus(
        overrides && Object.prototype.hasOwnProperty.call(overrides, 'terminalClassification')
          ? overrides.terminalClassification
          : current?.terminalClassification,
        session.status,
      ),
      lastContinuationReason: overrides && Object.prototype.hasOwnProperty.call(overrides, 'lastContinuationReason')
        ? overrides.lastContinuationReason
        : current?.lastContinuationReason,
      pendingLifecycle: overrides && Object.prototype.hasOwnProperty.call(overrides, 'pendingLifecycle')
        ? overrides.pendingLifecycle
        : current?.pendingLifecycle ?? createEmptyLifecycleIndex(),
    }
    fs.writeFileSync(this.getStatePath(session.id), JSON.stringify(snapshot, null, 2), 'utf8')
  }

  private appendTranscriptEvent(sessionId: string, event: TranscriptEvent): void {
    fs.appendFileSync(this.getTranscriptPath(sessionId), `${JSON.stringify(event)}\n`, 'utf8')
  }

  private findCompensatedLifecycleEvent(
    sessionId: string,
    input:
      | { type: 'approval.resolved'; taskId: string; toolName: string }
      | { type: 'tool.result'; taskId: string; toolName: string },
  ): Extract<QueryEvent, { type: 'approval.resolved' | 'tool.result' }> | undefined {
    return this.getTranscriptEvents(sessionId).find((event): event is Extract<TranscriptEvent, { type: 'query-event' }> & {
      event: Extract<QueryEvent, { type: 'approval.resolved' | 'tool.result' }>
    } => {
      if (event.type !== 'query-event') {
        return false
      }

      if (event.event.type !== input.type) {
        return false
      }

      if (event.event.taskId !== input.taskId || event.event.toolName !== input.toolName) {
        return false
      }

      return true
    })?.event
  }

  private applyQueryEventToState(sessionId: string, event: QueryEvent): void {
    const session = this.load(sessionId)
    const statePath = this.getStatePath(sessionId)
    const current = fs.existsSync(statePath)
      ? JSON.parse(fs.readFileSync(statePath, 'utf8')) as SessionStateSnapshot
      : undefined
    this.writeSessionState(session, {
      pendingLifecycle: applyLifecycleEventToIndex(current?.pendingLifecycle ?? createEmptyLifecycleIndex(), event),
    })
  }

  private load(sessionId: string): Session {
    const metadataPath = this.getMetadataPath(sessionId)
    const statePath = this.getStatePath(sessionId)
    const transcriptPath = this.getTranscriptPath(sessionId)

    if (!fs.existsSync(metadataPath) || !fs.existsSync(statePath) || !fs.existsSync(transcriptPath)) {
      throw new Error(`Session ${sessionId} not found`)
    }

    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as SessionMetadata
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as SessionStateSnapshot
      const transcriptLines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean)
      const parsedEvents = transcriptLines.map(line => {
        const event = JSON.parse(line) as TranscriptEvent
        if (event.type === 'message') {
          const message: SessionMessage = {
            role: event.role,
            content: event.content,
            timestamp: event.timestamp,
          }
          return message
        }

        return null
      })
      const turns: SessionMessage[] = parsedEvents.filter((event): event is SessionMessage => event !== null)

      return {
        id: metadata.id,
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
        status: state.status,
        pendingPrompt: state.pendingPrompt,
        lastError: state.lastError,
        turns,
      }
    } catch (error) {
      throw new Error(`Failed to load session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
