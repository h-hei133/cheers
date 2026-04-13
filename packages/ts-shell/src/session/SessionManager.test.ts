import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SessionManager } from './SessionManager.js'

describe('SessionManager', () => {
  const originalUserProfile = process.env.USERPROFILE
  const originalHome = process.env.HOME
  let fakeHome: string

  beforeEach(() => {
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-home-'))
    process.env.USERPROFILE = fakeHome
    process.env.HOME = fakeHome
  })

  afterEach(() => {
    process.env.USERPROFILE = originalUserProfile
    process.env.HOME = originalHome
    fs.rmSync(fakeHome, { recursive: true, force: true })
  })

  it('restores an interrupted session and preserves pending prompt metadata', () => {
    const manager = new SessionManager()
    const session = manager.createNew()

    manager.markRunStarted(session.id, 'resume me later')
    manager.addTurn(session.id, { role: 'user', content: 'resume me later' })
    manager.saveInterrupted(session.id)

    const resumed = manager.tryResume(session.id)
    expect(resumed.ok).toBe(true)
    if (!resumed.ok) {
      throw new Error('Expected interrupted session to resume successfully')
    }

    expect(resumed.session.status).toBe('active')
    expect(resumed.session.pendingPrompt).toBe('resume me later')
    expect(resumed.session.turns).toHaveLength(1)
  })

  it('preserves interrupted durable state for runtime seed construction after tryResume', () => {
    const manager = new SessionManager()
    const session = manager.createNew()
    const transcriptPath = path.join(manager.getSessionDirPath(session.id), 'transcript.jsonl')
    const statePath = path.join(manager.getSessionDirPath(session.id), 'state.json')

    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          type: 'lifecycle',
          event: 'run-started',
          timestamp: '2026-01-01T00:00:00.000Z',
          detail: 'repair after resume',
        }),
        JSON.stringify({
          type: 'query-event',
          event: { type: 'turn.started', role: 'planner', turn: 1 },
          timestamp: '2026-01-01T00:00:01.000Z',
        }),
      ].join('\n') + '\n',
      'utf8',
    )
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        status: 'interrupted',
        pendingPrompt: 'repair after resume',
        runPhase: 'turn-active',
        interruptedKind: 'turn',
      }, null, 2),
      'utf8',
    )

    const resumed = manager.tryResume(session.id)
    expect(resumed.ok).toBe(true)
    if (!resumed.ok) {
      throw new Error('Expected interrupted session to resume successfully')
    }

    const persistedState = JSON.parse(fs.readFileSync(statePath, 'utf8')) as { status: string }
    const seed = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 })

    expect(resumed.session.status).toBe('active')
    expect(persistedState.status).toBe('interrupted')
    expect(seed.truthBoundary.repairSummary.insertedRunInterrupted).toBe(true)
    expect(seed.truthBoundary.repairSummary.insertedPromptMessage).toBe(true)
    expect(seed.truthBoundary.policyEvidence.has('open-turn')).toBe(true)
    expect(seed.truthBoundary.policyEvidence.has('repair-drift')).toBe(false)
    expect(seed.truthBoundary.continuationSafety).toBe('mid-turn-safe')
    expect(seed.recoveryBoundary).toBe('mid-turn-reentry')
  })

  it('returns recovery guidance when a session file is corrupt', () => {
    const manager = new SessionManager()
    const session = manager.createNew()
    const sessionPath = manager.getSessionFilePath(session.id)

    fs.writeFileSync(sessionPath, '{not valid json', 'utf8')

    const result = manager.tryResume(session.id)
    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.error).toContain('Failed to resume session')
      expect(result.recoveryHint).toContain('Start a fresh session')
      return
    }

    throw new Error('Expected corrupt session resume to fail')
  })

  it('creates directory substrate with metadata, transcript, and state files', () => {
    const manager = new SessionManager()
    const session = manager.createNew()
    const sessionDir = manager.getSessionDirPath(session.id)

    expect(fs.existsSync(path.join(sessionDir, 'metadata.json'))).toBe(true)
    expect(fs.existsSync(path.join(sessionDir, 'transcript.jsonl'))).toBe(true)
    expect(fs.existsSync(path.join(sessionDir, 'state.json'))).toBe(true)
  })

  it('suggests the latest interrupted or errored session for recovery', () => {
    const manager = new SessionManager()
    const first = manager.createNew()
    manager.markRunStarted(first.id, 'first prompt')
    manager.saveInterrupted(first.id)

    const second = manager.createNew()
    manager.markRunStarted(second.id, 'second prompt')
    manager.saveError(second.id, 'daemon unavailable')

    const suggested = manager.getSuggestedRecoverySession()
    expect(suggested).toBeTruthy()
    expect([first.id, second.id]).toContain(suggested?.id)
    expect(['interrupted', 'error']).toContain(suggested?.status)
  })

  it('stores richer transcript events and exposes a recovery snapshot', () => {
    const manager = new SessionManager()
    const session = manager.createNew()

    manager.markRunStarted(session.id, 'recover this prompt')
    manager.addTurn(session.id, { role: 'user', content: 'recover this prompt' })
    manager.appendQueryEvent(session.id, {
      type: 'query.started',
      sessionId: session.id,
      prompt: 'recover this prompt',
    })
    manager.appendQueryEvent(session.id, {
      type: 'tool.started',
      toolName: 'read',
      taskId: 'task_1',
    })
    manager.saveInterrupted(session.id)

    const transcriptEvents = manager.getTranscriptEvents(session.id)
    expect(transcriptEvents.some(event => event.type === 'query-event')).toBe(true)
    expect(transcriptEvents.some(event => event.type === 'lifecycle')).toBe(true)

    const snapshot = manager.getRecoverySnapshot(session.id)
    expect(snapshot.pendingPrompt).toBe('recover this prompt')
    expect(snapshot.lastUserMessage?.content).toBe('recover this prompt')
    expect(snapshot.lastLifecycleEvent?.event).toBe('run-interrupted')
  })

  it('persists append-before-model-call barrier before query events begin', () => {
    const manager = new SessionManager()
    const session = manager.createNew()

    manager.persistUserPromptBarrier(session.id, 'barrier prompt')

    const transcriptEvents = manager.getTranscriptEvents(session.id)
    expect(transcriptEvents[0]).toMatchObject({ type: 'lifecycle', event: 'run-started' })
    expect(transcriptEvents[1]).toMatchObject({ type: 'message', content: 'barrier prompt' })

    const snapshot = manager.getRecoverySnapshot(session.id)
    expect(snapshot.pendingPrompt).toBe('barrier prompt')
    expect(snapshot.runPhase).toBe('prompt-persisted')
  })

  it('builds a replay plan for interrupted turns with continuation prompt', () => {
    const manager = new SessionManager()
    const session = manager.createNew()

    manager.persistUserPromptBarrier(session.id, 'initial prompt')
    manager.markTurnActive(session.id)
    manager.appendQueryEvent(session.id, {
      type: 'query.started',
      sessionId: session.id,
      prompt: 'initial prompt',
    })
    manager.saveInterrupted(session.id, 'turn')

    const replayPlan = manager.getReplayPlan(session.id)
    expect(replayPlan.continuationPrompt).toBe('Continue from where you left off.')
    expect(replayPlan.replayMessages[0].content).toBe('initial prompt')
    expect(replayPlan.requiresAssistantSentinel).toBe(true)
  })

  it('persists terminal classification into state.json for completed and error runs', () => {
    const manager = new SessionManager()
    const completed = manager.createNew()
    manager.markRunStarted(completed.id, 'done prompt')
    manager.saveCompleted(completed.id, {
      terminalReason: 'completed',
      terminalClassification: 'success',
      lastContinuationReason: 'handoff',
    })

    const completedState = JSON.parse(
      fs.readFileSync(path.join(manager.getSessionDirPath(completed.id), 'state.json'), 'utf8'),
    ) as { terminalReason?: string; terminalClassification?: string; durableStatus?: string; lastContinuationReason?: string }

    expect(completedState.terminalReason).toBe('completed')
    expect(completedState.terminalClassification).toBe('success')
    expect(completedState.durableStatus).toBe('success')
    expect(completedState.lastContinuationReason).toBe('handoff')

    const completedSnapshot = manager.getRecoverySnapshot(completed.id)
    expect(completedSnapshot.durableStatus).toBe('success')
    expect(completedSnapshot.terminalReason).toBe('completed')
    expect(completedSnapshot.terminalClassification).toBe('success')
    expect(completedSnapshot.lastContinuationReason).toBe('handoff')

    const errored = manager.createNew()
    manager.markRunStarted(errored.id, 'retry prompt')
    manager.saveError(errored.id, 'Retry budget exhausted', {
      terminalReason: 'stopped_error',
      terminalClassification: 'stopped',
      lastContinuationReason: 'retryable-error',
    })

    const errorState = JSON.parse(
      fs.readFileSync(path.join(manager.getSessionDirPath(errored.id), 'state.json'), 'utf8'),
    ) as { terminalReason?: string; terminalClassification?: string; durableStatus?: string; lastContinuationReason?: string; pendingPrompt?: string; lastError?: string }

    expect(errorState.terminalReason).toBe('stopped_error')
    expect(errorState.terminalClassification).toBe('stopped')
    expect(errorState.durableStatus).toBe('stopped')
    expect(errorState.lastContinuationReason).toBe('retryable-error')
    expect(errorState.pendingPrompt).toBeUndefined()
    expect(errorState.lastError).toBeUndefined()

    const erroredSnapshot = manager.getRecoverySnapshot(errored.id)
    expect(erroredSnapshot.durableStatus).toBe('stopped')
    expect(erroredSnapshot.terminalReason).toBe('stopped_error')
    expect(erroredSnapshot.terminalClassification).toBe('stopped')

    manager.markRunStarted(errored.id, 'fresh prompt')
    const resetState = JSON.parse(
      fs.readFileSync(path.join(manager.getSessionDirPath(errored.id), 'state.json'), 'utf8'),
    ) as { terminalReason?: string; terminalClassification?: string; durableStatus?: string; lastContinuationReason?: string; lastError?: string }

    expect(resetState.terminalReason).toBeUndefined()
    expect(resetState.terminalClassification).toBeUndefined()
    expect(resetState.durableStatus).toBeUndefined()
    expect(resetState.lastContinuationReason).toBeUndefined()
    expect(resetState.lastError).toBeUndefined()
  })

  it('preserves lastError only for true durable errors', () => {
    const manager = new SessionManager()
    const stopped = manager.createNew()
    manager.markRunStarted(stopped.id, 'stop prompt')
    manager.saveError(stopped.id, 'Retry budget exhausted', {
      terminalReason: 'stopped_error',
      terminalClassification: 'stopped',
    })

    const stoppedState = JSON.parse(
      fs.readFileSync(path.join(manager.getSessionDirPath(stopped.id), 'state.json'), 'utf8'),
    ) as { status: string; lastError?: string; terminalClassification?: string; durableStatus?: string }
    expect(stoppedState.status).toBe('error')
    expect(stoppedState.terminalClassification).toBe('stopped')
    expect(stoppedState.durableStatus).toBe('stopped')
    expect(stoppedState.lastError).toBeUndefined()

    const failed = manager.createNew()
    manager.markRunStarted(failed.id, 'fail prompt')
    manager.saveError(failed.id, 'Transport exploded', {
      terminalReason: 'stopped_error',
      terminalClassification: 'error',
    })

    const failedState = JSON.parse(
      fs.readFileSync(path.join(manager.getSessionDirPath(failed.id), 'state.json'), 'utf8'),
    ) as { status: string; lastError?: string; terminalClassification?: string; durableStatus?: string }
    expect(failedState.status).toBe('error')
    expect(failedState.terminalClassification).toBe('error')
    expect(failedState.durableStatus).toBe('error')
    expect(failedState.lastError).toBe('Transport exploded')
  })

  it('filters empty assistant messages from replay normalization', () => {
    const manager = new SessionManager()
    const session = manager.createNew()
    const transcriptPath = path.join(manager.getSessionDirPath(session.id), 'transcript.jsonl')

    fs.appendFileSync(
      transcriptPath,
      `${JSON.stringify({ type: 'message', role: 'assistant', content: '   ', timestamp: new Date().toISOString() })}\n`,
      'utf8',
    )
    fs.appendFileSync(
      transcriptPath,
      `${JSON.stringify({ type: 'message', role: 'user', content: 'real', timestamp: new Date().toISOString() })}\n`,
      'utf8',
    )

    const replayPlan = manager.getReplayPlan(session.id)
    expect(replayPlan.replayMessages).toHaveLength(1)
    expect(replayPlan.replayMessages[0].content).toBe('real')
  })

  it('repairs orphaned interrupted transcript state into a replayable plan', () => {
    const manager = new SessionManager()
    const session = manager.createNew()
    const sessionDir = manager.getSessionDirPath(session.id)
    const transcriptPath = path.join(sessionDir, 'transcript.jsonl')
    const statePath = path.join(sessionDir, 'state.json')

    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          type: 'lifecycle',
          event: 'run-started',
          timestamp: new Date().toISOString(),
          detail: 'repair me',
        }),
        JSON.stringify({
          type: 'query-event',
          event: { type: 'tool.started', toolName: 'read', taskId: 'task_orphan' },
          timestamp: new Date().toISOString(),
        }),
        JSON.stringify({
          type: 'query-event',
          event: {
            type: 'query.completed',
            result: {
              status: 'completed',
              terminalReason: 'completed',
              terminalClassification: 'success',
              transcript: [],
              sharedContext: { sessionId: session.id, initialPrompt: 'repair me', notes: [], handoffs: [] },
              finalOutput: 'orphaned',
            },
          },
          timestamp: new Date().toISOString(),
        }),
      ].join('\n') + '\n',
      'utf8',
    )
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        status: 'interrupted',
        pendingPrompt: 'repair me',
        runPhase: 'turn-active',
        interruptedKind: 'turn',
      }, null, 2),
      'utf8',
    )

    const replayPlan = manager.getReplayPlan(session.id)

    expect(replayPlan.replayMessages[0]).toMatchObject({ role: 'user', content: 'repair me' })
    expect(replayPlan.normalizedTranscriptEvents.some(
      event => event.type === 'query-event' && event.event.type === 'query.started',
    )).toBe(true)
    expect(replayPlan.normalizedTranscriptEvents.some(
      event => event.type === 'query-event' && event.event.type === 'query.completed',
    )).toBe(false)
    expect(replayPlan.normalizedTranscriptEvents.some(
      event => event.type === 'lifecycle' && event.event === 'run-interrupted',
    )).toBe(true)
  })

  it('repairs transcript state idempotently across repeated replay planning', () => {
    const manager = new SessionManager()
    const session = manager.createNew()
    const sessionDir = manager.getSessionDirPath(session.id)
    const transcriptPath = path.join(sessionDir, 'transcript.jsonl')
    const statePath = path.join(sessionDir, 'state.json')

    fs.writeFileSync(
      transcriptPath,
      `${JSON.stringify({
        type: 'query-event',
        event: { type: 'tool.started', toolName: 'read', taskId: 'task_repeat' },
        timestamp: new Date().toISOString(),
      })}\n`,
      'utf8',
    )
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        status: 'interrupted',
        pendingPrompt: 'repeat me',
        runPhase: 'turn-active',
        interruptedKind: 'turn',
      }, null, 2),
      'utf8',
    )

    const first = manager.getReplayPlan(session.id)
    const second = manager.getReplayPlan(session.id)

    expect(second).toEqual(first)
    expect(first.normalizedTranscriptEvents.filter(
      event => event.type === 'query-event' && event.event.type === 'query.started',
    )).toHaveLength(1)
    expect(first.normalizedTranscriptEvents.filter(
      event => event.type === 'message' && event.role === 'user' && event.content === 'repeat me',
    )).toHaveLength(1)
    expect(first.normalizedTranscriptEvents.filter(
      event => event.type === 'lifecycle' && event.event === 'run-interrupted',
    )).toHaveLength(1)
    expect(second.repairSummary).toEqual(first.repairSummary)
  })

  it('builds a runtime state seed from durable replay state', () => {
    const manager = new SessionManager()
    const session = manager.createNew()

    manager.persistUserPromptBarrier(session.id, 'recover feature')
    manager.markTurnActive(session.id)
    manager.appendQueryEvent(session.id, {
      type: 'query.started',
      sessionId: session.id,
      prompt: 'recover feature',
    })
    manager.appendQueryEvent(session.id, {
      type: 'turn.started',
      role: 'planner',
      turn: 1,
    })
    manager.appendQueryEvent(session.id, {
      type: 'turn.completed',
      output: {
        role: 'planner',
        content: 'plan',
        handoffTo: 'coder',
        handoffReason: 'plan-ready',
        notes: ['planner-note'],
      },
    })
    manager.appendQueryEvent(session.id, {
      type: 'turn.started',
      role: 'coder',
      turn: 2,
    })
    manager.appendQueryEvent(session.id, {
      type: 'approval.requested',
      toolName: 'bash',
      taskId: 'task_pending_approval',
    })
    manager.appendQueryEvent(session.id, {
      type: 'tool.started',
      toolName: 'read',
      taskId: 'task_pending_tool',
    })
    manager.saveInterrupted(session.id, 'turn')

    const seed = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 })

    expect(seed.recoveryBoundary).toBe('completed-turn-reentry')
    expect(seed.currentRole).toBe('coder')
    expect(seed.turn).toBe(2)
    expect(seed.derivedState.transcript).toHaveLength(1)
    expect(seed.pendingLifecycle.pendingApprovals.task_pending_approval?.toolName).toBe('bash')
    expect(seed.pendingLifecycle.pendingTools.task_pending_tool?.toolName).toBe('read')
    expect(seed.truthBoundary.source).toBe('durable-replay')
    expect(seed.truthBoundary.continuationSafety).toBe('completed-turn-only')
    expect(seed.truthBoundary.policyEvidence.has('open-turn')).toBe(true)
    expect(seed.truthBoundary.policyEvidence.has('paired-turns')).toBe(true)
    expect(seed.truthBoundary.policyEvidence.has('pending-lifecycle')).toBe(true)
    expect(seed.truthBoundary.policyEvidence.has('repair-drift')).toBe(false)
    expect(Object.keys(seed.derivedState)).toEqual(['transcript'])
  })

  it('classifies completed-turn re-entry from paired turn events without relying on turn counts', () => {
    const manager = new SessionManager()
    const session = manager.createNew()

    manager.persistUserPromptBarrier(session.id, 'resume after completed turn')
    manager.markTurnActive(session.id)
    manager.appendQueryEvent(session.id, {
      type: 'query.started',
      sessionId: session.id,
      prompt: 'resume after completed turn',
    })
    manager.appendQueryEvent(session.id, {
      type: 'turn.started',
      role: 'planner',
      turn: 1,
    })
    manager.appendQueryEvent(session.id, {
      type: 'turn.completed',
      output: {
        role: 'planner',
        content: 'plan',
        handoffTo: 'coder',
        handoffReason: 'ready-for-code',
      },
    })
    manager.saveInterrupted(session.id, 'turn')

    const seed = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 })

    expect(seed.recoveryBoundary).toBe('completed-turn-reentry')
    expect(seed.currentRole).toBe('coder')
    expect(seed.turn).toBe(2)
    expect(seed.derivedState.transcript).toHaveLength(1)
    expect(seed.truthBoundary.continuationSafety).toBe('completed-turn-only')
    expect(seed.truthBoundary.policyEvidence.has('open-turn')).toBe(false)
    expect(seed.truthBoundary.policyEvidence.has('paired-turns')).toBe(true)
    expect(seed.truthBoundary.policyEvidence.has('pending-lifecycle')).toBe(false)
    expect(seed.truthBoundary.policyEvidence.has('repair-drift')).toBe(false)
  })

  it('classifies fresh-entry when no turn has started yet', () => {
    const manager = new SessionManager()
    const session = manager.createNew()

    manager.persistUserPromptBarrier(session.id, 'fresh prompt')
    manager.saveInterrupted(session.id, 'prompt')

    const seed = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 })

    expect(seed.recoveryBoundary).toBe('fresh-entry')
    expect(seed.currentRole).toBe('planner')
    expect(seed.turn).toBe(1)
    expect(seed.derivedState.transcript).toHaveLength(0)
    expect(seed.truthBoundary.continuationSafety).toBe('fresh-only')
    expect(seed.truthBoundary.policyEvidence.has('open-turn')).toBe(false)
    expect(seed.truthBoundary.policyEvidence.has('paired-turns')).toBe(false)
    expect(seed.truthBoundary.policyEvidence.has('pending-lifecycle')).toBe(false)
    expect(seed.truthBoundary.policyEvidence.has('repair-drift')).toBe(false)
  })

  it('keeps recovery boundary stable across repeated seed builds for the same open turn', () => {
    const manager = new SessionManager()
    const session = manager.createNew()

    manager.persistUserPromptBarrier(session.id, 'repeat boundary')
    manager.markTurnActive(session.id)
    manager.appendQueryEvent(session.id, {
      type: 'turn.started',
      role: 'coder',
      turn: 2,
    })
    manager.saveInterrupted(session.id, 'turn')

    const first = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 })
    const second = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 })

    expect(first.recoveryBoundary).toBe('mid-turn-reentry')
    expect(second.recoveryBoundary).toBe('mid-turn-reentry')
    expect(second.currentRole).toBe(first.currentRole)
    expect(second.turn).toBe(first.turn)
    expect(Array.from(second.truthBoundary.policyEvidence).sort()).toEqual(Array.from(first.truthBoundary.policyEvidence).sort())
    expect(second.truthBoundary.continuationSafety).toBe(first.truthBoundary.continuationSafety)
    expect(second.truthBoundary.openTurn).toEqual(first.truthBoundary.openTurn)
    expect(second.truthBoundary.repairSummary).toEqual(first.truthBoundary.repairSummary)
  })

  it('computes continuation safety from the shared policy table when unresolved lifecycle exists', () => {
    const manager = new SessionManager()
    const session = manager.createNew()

    manager.persistUserPromptBarrier(session.id, 'policy pending prompt')
    manager.markTurnActive(session.id)
    manager.appendQueryEvent(session.id, {
      type: 'turn.started',
      role: 'planner',
      turn: 1,
    })
    manager.appendQueryEvent(session.id, {
      type: 'approval.requested',
      toolName: 'bash',
      taskId: 'task_pending_policy',
    })
    manager.saveInterrupted(session.id, 'turn')

    const seed = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 })

    expect(seed.truthBoundary.continuationSafety).toBe('fresh-only')
    expect(seed.truthBoundary.policyEvidence.has('open-turn')).toBe(true)
    expect(seed.truthBoundary.policyEvidence.has('paired-turns')).toBe(false)
    expect(seed.truthBoundary.policyEvidence.has('pending-lifecycle')).toBe(true)
    expect(seed.truthBoundary.policyEvidence.has('repair-drift')).toBe(false)
    expect(seed.recoveryBoundary).toBe('fresh-entry')
    expect(seed.currentRole).toBe('planner')
    expect(seed.turn).toBe(1)
  })

  it('reports replay repair and drift summary deterministically without mutating transcript truth', () => {
    const manager = new SessionManager()
    const session = manager.createNew()
    const sessionDir = manager.getSessionDirPath(session.id)
    const transcriptPath = path.join(sessionDir, 'transcript.jsonl')
    const statePath = path.join(sessionDir, 'state.json')

    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          type: 'lifecycle',
          event: 'run-started',
          timestamp: '2026-01-01T00:00:00.000Z',
          detail: 'repair drift',
        }),
        JSON.stringify({
          type: 'query-event',
          event: { type: 'turn.started', role: 'planner', turn: 1 },
          timestamp: '2026-01-01T00:00:01.000Z',
        }),
        JSON.stringify({
          type: 'query-event',
          event: { type: 'turn.started', role: 'coder', turn: 2 },
          timestamp: '2026-01-01T00:00:02.000Z',
        }),
        JSON.stringify({
          type: 'query-event',
          event: {
            type: 'turn.completed',
            output: { role: 'reviewer', content: 'mismatch' },
          },
          timestamp: '2026-01-01T00:00:03.000Z',
        }),
      ].join('\n') + '\n',
      'utf8',
    )
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        status: 'interrupted',
        pendingPrompt: 'repair drift',
        runPhase: 'turn-active',
        interruptedKind: 'turn',
      }, null, 2),
      'utf8',
    )

    const first = manager.getReplayPlan(session.id)
    const second = manager.getReplayPlan(session.id)
    const seed = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 })

    expect(second).toEqual(first)
    expect(first.repairSummary).toEqual({
      insertedPromptMessage: true,
      insertedQueryStarted: true,
      strippedInterruptedTerminalEvents: 0,
      insertedRunInterrupted: true,
      ignoredDuplicateTurnStarts: 1,
      ignoredUnpairedTurnCompletions: 0,
      ignoredRoleMismatchedTurnCompletions: 1,
    })
    expect(seed.recoveryBoundary).toBe('fresh-entry')
    expect(seed.truthBoundary.source).toBe('durable-replay')
    expect(seed.truthBoundary.normalizedEventCount).toBe(first.normalizedTranscriptEvents.length)
    expect(seed.truthBoundary.pairedTurnCount).toBe(0)
    expect(seed.truthBoundary.policyEvidence.has('open-turn')).toBe(true)
    expect(seed.truthBoundary.policyEvidence.has('paired-turns')).toBe(false)
    expect(seed.truthBoundary.policyEvidence.has('pending-lifecycle')).toBe(false)
    expect(seed.truthBoundary.policyEvidence.has('repair-drift')).toBe(true)
    expect(seed.truthBoundary.repairSummary).toEqual(first.repairSummary)
    expect(seed.truthBoundary.continuationSafety).toBe('fresh-only')
    expect(seed.truthBoundary.openTurn).toBeUndefined()
    expect(seed.derivedState).toEqual({
      transcript: [],
    })
  })

  it('keeps stripped interrupted terminal counts aligned between replay plan and runtime seed truth boundary', () => {
    const manager = new SessionManager()
    const session = manager.createNew()
    const sessionDir = manager.getSessionDirPath(session.id)
    const transcriptPath = path.join(sessionDir, 'transcript.jsonl')
    const statePath = path.join(sessionDir, 'state.json')

    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          type: 'lifecycle',
          event: 'run-started',
          timestamp: '2026-01-01T00:00:00.000Z',
          detail: 'strip terminal event',
        }),
        JSON.stringify({
          type: 'query-event',
          event: {
            type: 'query.started',
            sessionId: session.id,
            prompt: 'strip terminal event',
          },
          timestamp: '2026-01-01T00:00:01.000Z',
        }),
        JSON.stringify({
          type: 'query-event',
          event: {
            type: 'query.completed',
            result: {
              status: 'completed',
              terminalReason: 'completed',
              terminalClassification: 'success',
              transcript: [],
              sharedContext: { sessionId: session.id, initialPrompt: 'strip terminal event', notes: [], handoffs: [] },
              finalOutput: 'done',
            },
          },
          timestamp: '2026-01-01T00:00:02.000Z',
        }),
      ].join('\n') + '\n',
      'utf8',
    )
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        status: 'interrupted',
        pendingPrompt: 'strip terminal event',
        runPhase: 'turn-active',
        interruptedKind: 'turn',
      }, null, 2),
      'utf8',
    )

    const replayPlan = manager.getReplayPlan(session.id)
    const seed = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 })

    expect(replayPlan.normalizedTranscriptEvents.some(
      event => event.type === 'query-event' && (event.event.type === 'query.completed' || event.event.type === 'query.failed'),
    )).toBe(false)
    expect(replayPlan.repairSummary.strippedInterruptedTerminalEvents).toBe(1)
    expect(seed.truthBoundary.repairSummary.strippedInterruptedTerminalEvents).toBe(1)
    expect(seed.truthBoundary.normalizedEventCount).toBe(replayPlan.normalizedTranscriptEvents.length)
    expect(seed.truthBoundary.repairSummary).toEqual(replayPlan.repairSummary)
  })

  it('derives recovery snapshot and runtime seed pending lifecycle from transcript truth instead of stale state', () => {
    const manager = new SessionManager()
    const session = manager.createNew()
    const transcriptPath = path.join(manager.getSessionDirPath(session.id), 'transcript.jsonl')
    const statePath = path.join(manager.getSessionDirPath(session.id), 'state.json')

    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          type: 'message',
          role: 'user',
          content: 'repair read-model prompt',
          timestamp: '2026-01-01T00:00:00.000Z',
        }),
        JSON.stringify({
          type: 'query-event',
          event: {
            type: 'approval.requested',
            toolName: 'bash',
            taskId: 'task_read_approval',
          },
          timestamp: '2026-01-01T00:00:01.000Z',
        }),
        JSON.stringify({
          type: 'query-event',
          event: {
            type: 'approval.resolved',
            toolName: 'bash',
            taskId: 'task_read_approval',
            outcome: 'approved',
          },
          timestamp: '2026-01-01T00:00:02.000Z',
        }),
        JSON.stringify({
          type: 'query-event',
          event: {
            type: 'tool.started',
            toolName: 'read',
            taskId: 'task_read_tool',
          },
          timestamp: '2026-01-01T00:00:03.000Z',
        }),
        JSON.stringify({
          type: 'query-event',
          event: {
            type: 'tool.result',
            toolName: 'read',
            taskId: 'task_read_tool',
            success: true,
          },
          timestamp: '2026-01-01T00:00:04.000Z',
        }),
      ].join('\n') + '\n',
      'utf8',
    )
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        status: 'interrupted',
        pendingPrompt: 'repair read-model prompt',
        runPhase: 'turn-active',
        interruptedKind: 'turn',
        pendingLifecycle: {
          pendingApprovals: {
            task_read_approval: { taskId: 'task_read_approval', toolName: 'bash' },
          },
          pendingTools: {
            task_read_tool: { taskId: 'task_read_tool', toolName: 'read' },
          },
          taskStates: {},
        },
      }, null, 2),
      'utf8',
    )

    const snapshot = manager.getRecoverySnapshot(session.id)
    const seed = manager.buildRuntimeStateSeed(session.id, { maxTurns: 8 })

    expect(snapshot.pendingLifecycle.pendingApprovals).toEqual({})
    expect(snapshot.pendingLifecycle.pendingTools).toEqual({})
    expect(snapshot.pendingLifecycle.taskStates.task_read_approval).toMatchObject({
      lastEvent: 'approval.resolved',
      outcome: 'approved',
      toolName: 'bash',
      taskId: 'task_read_approval',
    })
    expect(snapshot.pendingLifecycle.taskStates.task_read_tool).toMatchObject({
      lastEvent: 'tool.result',
      success: true,
      toolName: 'read',
      taskId: 'task_read_tool',
    })
    expect(seed.pendingLifecycle).toEqual(snapshot.pendingLifecycle)
    expect(seed.truthBoundary.policyEvidence.has('pending-lifecycle')).toBe(false)
  })

  it('tracks pending lifecycle durably and clears it when resolved or restarted', () => {
    const manager = new SessionManager()
    const session = manager.createNew()

    manager.persistUserPromptBarrier(session.id, 'lifecycle prompt')
    manager.appendQueryEvent(session.id, {
      type: 'approval.requested',
      toolName: 'bash',
      taskId: 'task_approval',
    })
    manager.appendQueryEvent(session.id, {
      type: 'tool.started',
      toolName: 'read',
      taskId: 'task_tool',
    })

    let snapshot = manager.getRecoverySnapshot(session.id)
    expect(snapshot.pendingLifecycle.pendingApprovals.task_approval?.toolName).toBe('bash')
    expect(snapshot.pendingLifecycle.pendingTools.task_tool?.toolName).toBe('read')
    expect(snapshot.pendingLifecycle.taskStates.task_approval?.lastEvent).toBe('approval.requested')
    expect(snapshot.pendingLifecycle.taskStates.task_tool?.lastEvent).toBe('tool.started')

    manager.appendQueryEvent(session.id, {
      type: 'approval.resolved',
      toolName: 'bash',
      taskId: 'task_approval',
      outcome: 'denied',
      compensated: true,
    })
    manager.appendQueryEvent(session.id, {
      type: 'tool.result',
      toolName: 'read',
      taskId: 'task_tool',
      success: false,
      compensated: true,
    })

    snapshot = manager.getRecoverySnapshot(session.id)
    expect(snapshot.pendingLifecycle.pendingApprovals.task_approval).toBeUndefined()
    expect(snapshot.pendingLifecycle.pendingTools.task_tool).toBeUndefined()
    expect(snapshot.pendingLifecycle.taskStates.task_approval?.lastEvent).toBe('approval.resolved')
    expect(snapshot.pendingLifecycle.taskStates.task_tool?.lastEvent).toBe('tool.result')

    manager.markRunStarted(session.id, 'fresh run')
    snapshot = manager.getRecoverySnapshot(session.id)
    expect(snapshot.pendingLifecycle.pendingApprovals).toEqual({})
    expect(snapshot.pendingLifecycle.pendingTools).toEqual({})
    expect(snapshot.pendingLifecycle.taskStates.task_approval).toMatchObject({
      lastEvent: 'approval.resolved',
      compensated: true,
      outcome: 'denied',
    })
    expect(snapshot.pendingLifecycle.taskStates.task_tool).toMatchObject({
      lastEvent: 'tool.result',
      compensated: true,
      success: false,
    })
  })

  it('reconcilePendingLifecycle is idempotent across repeated calls', () => {
    const manager = new SessionManager()
    const session = manager.createNew()

    manager.persistUserPromptBarrier(session.id, 'reconcile prompt')
    manager.appendQueryEvent(session.id, {
      type: 'approval.requested',
      toolName: 'bash',
      taskId: 'task_repeat_approval',
    })
    manager.appendQueryEvent(session.id, {
      type: 'tool.started',
      toolName: 'read',
      taskId: 'task_repeat_tool',
    })

    const first = manager.reconcilePendingLifecycle(session.id)
    const second = manager.reconcilePendingLifecycle(session.id)

    expect(first).toEqual({
      pendingApprovals: {},
      pendingTools: {},
      taskStates: {
        task_repeat_approval: {
          taskId: 'task_repeat_approval',
          toolName: 'bash',
          lastEvent: 'approval.resolved',
          outcome: 'denied',
          compensated: true,
        },
        task_repeat_tool: {
          taskId: 'task_repeat_tool',
          toolName: 'read',
          lastEvent: 'tool.result',
          success: false,
          compensated: true,
        },
      },
    })
    expect(second).toEqual(first)

    const transcriptEvents = manager.getTranscriptEvents(session.id)
    expect(transcriptEvents.filter(
      event => event.type === 'query-event' && event.event.type === 'approval.resolved' && event.event.taskId === 'task_repeat_approval',
    )).toHaveLength(1)
    expect(transcriptEvents.filter(
      event => event.type === 'query-event' && event.event.type === 'tool.result' && event.event.taskId === 'task_repeat_tool',
    )).toHaveLength(1)
  })

  it('reconcilePendingLifecycle reuses existing compensated transcript events without duplicating them', () => {
    const manager = new SessionManager()
    const session = manager.createNew()
    const transcriptPath = path.join(manager.getSessionDirPath(session.id), 'transcript.jsonl')
    const statePath = path.join(manager.getSessionDirPath(session.id), 'state.json')

    manager.persistUserPromptBarrier(session.id, 'drift reconcile prompt')
    manager.appendQueryEvent(session.id, {
      type: 'approval.requested',
      toolName: 'bash',
      taskId: 'task_drift_approval',
    })
    manager.appendQueryEvent(session.id, {
      type: 'tool.started',
      toolName: 'read',
      taskId: 'task_drift_tool',
    })

    fs.appendFileSync(
      transcriptPath,
      `${JSON.stringify({
        type: 'query-event',
        event: {
          type: 'approval.resolved',
          toolName: 'bash',
          taskId: 'task_drift_approval',
          outcome: 'denied',
          compensated: true,
        },
        timestamp: new Date().toISOString(),
      })}\n`,
      'utf8',
    )
    fs.appendFileSync(
      transcriptPath,
      `${JSON.stringify({
        type: 'query-event',
        event: {
          type: 'tool.result',
          toolName: 'read',
          taskId: 'task_drift_tool',
          success: false,
          compensated: true,
        },
        timestamp: new Date().toISOString(),
      })}\n`,
      'utf8',
    )

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
      pendingLifecycle: {
        pendingApprovals: Record<string, { taskId: string; toolName: string }>
        pendingTools: Record<string, { taskId: string; toolName: string }>
        taskStates: Record<string, unknown>
      }
    }

    expect(state.pendingLifecycle.pendingApprovals.task_drift_approval?.toolName).toBe('bash')
    expect(state.pendingLifecycle.pendingTools.task_drift_tool?.toolName).toBe('read')

    const reconciled = manager.reconcilePendingLifecycle(session.id)
    expect(reconciled.pendingApprovals).toEqual({})
    expect(reconciled.pendingTools).toEqual({})
    expect(reconciled.taskStates.task_drift_approval).toMatchObject({
      lastEvent: 'approval.resolved',
      compensated: true,
      outcome: 'denied',
    })
    expect(reconciled.taskStates.task_drift_tool).toMatchObject({
      lastEvent: 'tool.result',
      compensated: true,
      success: false,
    })

    const transcriptEvents = manager.getTranscriptEvents(session.id)
    expect(transcriptEvents.filter(
      event => event.type === 'query-event' && event.event.type === 'approval.resolved' && event.event.taskId === 'task_drift_approval',
    )).toHaveLength(1)
    expect(transcriptEvents.filter(
      event => event.type === 'query-event' && event.event.type === 'tool.result' && event.event.taskId === 'task_drift_tool',
    )).toHaveLength(1)
  })

  it('reconcilePendingLifecycle does not append synthetic cleanup when direct tool.result already exists', () => {
    const manager = new SessionManager()
    const session = manager.createNew()
    const transcriptPath = path.join(manager.getSessionDirPath(session.id), 'transcript.jsonl')
    const taskId = 'task_direct_tool'

    manager.persistUserPromptBarrier(session.id, 'duplication guard prompt')
    manager.appendQueryEvent(session.id, {
      type: 'tool.started',
      toolName: 'read',
      taskId,
    })

    const before = manager.getRecoverySnapshot(session.id)
    expect(before.pendingLifecycle.pendingTools[taskId]?.toolName).toBe('read')

    fs.appendFileSync(
      transcriptPath,
      `${JSON.stringify({
        type: 'query-event',
        event: {
          type: 'tool.result',
          toolName: 'read',
          taskId,
          success: true,
        },
        timestamp: new Date().toISOString(),
      })}\n`,
      'utf8',
    )

    const transcriptBefore = manager.getTranscriptEvents(session.id)
    expect(transcriptBefore.filter(
      event => event.type === 'query-event' && event.event.type === 'tool.result' && event.event.taskId === taskId,
    )).toHaveLength(1)

    const reconciled = manager.reconcilePendingLifecycle(session.id)
    expect(reconciled.pendingTools[taskId]).toBeUndefined()
    expect(reconciled.taskStates[taskId]).toMatchObject({
      lastEvent: 'tool.result',
      success: true,
      toolName: 'read',
      taskId,
    })

    const transcriptAfter = manager.getTranscriptEvents(session.id)
    expect(transcriptAfter.filter(
      event => event.type === 'query-event' && event.event.type === 'tool.result' && event.event.taskId === taskId,
    )).toHaveLength(1)
  })

  it('reconcilePendingLifecycle does not append compensated denial when direct approval.resolved already exists', () => {
    const manager = new SessionManager()
    const session = manager.createNew()
    const transcriptPath = path.join(manager.getSessionDirPath(session.id), 'transcript.jsonl')
    const taskId = 'task_direct_approval'

    manager.persistUserPromptBarrier(session.id, 'approval drift prompt')
    manager.appendQueryEvent(session.id, {
      type: 'approval.requested',
      toolName: 'bash',
      taskId,
    })

    const before = manager.getRecoverySnapshot(session.id)
    expect(before.pendingLifecycle.pendingApprovals[taskId]?.toolName).toBe('bash')

    fs.appendFileSync(
      transcriptPath,
      `${JSON.stringify({
        type: 'query-event',
        event: {
          type: 'approval.resolved',
          toolName: 'bash',
          taskId,
          outcome: 'approved',
        },
        timestamp: new Date().toISOString(),
      })}\n`,
      'utf8',
    )

    const transcriptBefore = manager.getTranscriptEvents(session.id)
    expect(transcriptBefore.filter(
      event => event.type === 'query-event' && event.event.type === 'approval.resolved' && event.event.taskId === taskId,
    )).toHaveLength(1)

    const reconciled = manager.reconcilePendingLifecycle(session.id)
    expect(reconciled.pendingApprovals[taskId]).toBeUndefined()
    expect(reconciled.taskStates[taskId]).toMatchObject({
      lastEvent: 'approval.resolved',
      outcome: 'approved',
      toolName: 'bash',
      taskId,
    })
    expect(reconciled.taskStates[taskId]?.compensated).toBeUndefined()

    const transcriptAfter = manager.getTranscriptEvents(session.id)
    expect(transcriptAfter.filter(
      event => event.type === 'query-event' && event.event.type === 'approval.resolved' && event.event.taskId === taskId,
    )).toHaveLength(1)
  })

  it('appendQueryEvent is idempotent for identical direct resolution events', () => {
    const manager = new SessionManager()
    const session = manager.createNew()

    manager.appendQueryEvent(session.id, {
      type: 'approval.resolved',
      toolName: 'bash',
      taskId: 'task_append_approval',
      outcome: 'approved',
    })
    manager.appendQueryEvent(session.id, {
      type: 'approval.resolved',
      toolName: 'bash',
      taskId: 'task_append_approval',
      outcome: 'approved',
    })

    manager.appendQueryEvent(session.id, {
      type: 'tool.result',
      toolName: 'read',
      taskId: 'task_append_tool',
      success: true,
    })
    manager.appendQueryEvent(session.id, {
      type: 'tool.result',
      toolName: 'read',
      taskId: 'task_append_tool',
      success: true,
    })

    const transcriptEvents = manager.getTranscriptEvents(session.id)
    expect(transcriptEvents.filter(
      event => event.type === 'query-event' && event.event.type === 'approval.resolved' && event.event.taskId === 'task_append_approval',
    )).toHaveLength(1)
    expect(transcriptEvents.filter(
      event => event.type === 'query-event' && event.event.type === 'tool.result' && event.event.taskId === 'task_append_tool',
    )).toHaveLength(1)

    const snapshot = manager.getRecoverySnapshot(session.id)
    expect(snapshot.pendingLifecycle.taskStates.task_append_approval).toMatchObject({
      lastEvent: 'approval.resolved',
      outcome: 'approved',
      toolName: 'bash',
      taskId: 'task_append_approval',
    })
    expect(snapshot.pendingLifecycle.taskStates.task_append_tool).toMatchObject({
      lastEvent: 'tool.result',
      success: true,
      toolName: 'read',
      taskId: 'task_append_tool',
    })
  })
})
