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
    ) as { terminalReason?: string; terminalClassification?: string; lastContinuationReason?: string }

    expect(completedState.terminalReason).toBe('completed')
    expect(completedState.terminalClassification).toBe('success')
    expect(completedState.lastContinuationReason).toBe('handoff')

    const completedSnapshot = manager.getRecoverySnapshot(completed.id)
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
    ) as { terminalReason?: string; terminalClassification?: string; lastContinuationReason?: string; pendingPrompt?: string }

    expect(errorState.terminalReason).toBe('stopped_error')
    expect(errorState.terminalClassification).toBe('stopped')
    expect(errorState.lastContinuationReason).toBe('retryable-error')
    expect(errorState.pendingPrompt).toBeUndefined()

    manager.markRunStarted(errored.id, 'fresh prompt')
    const resetState = JSON.parse(
      fs.readFileSync(path.join(manager.getSessionDirPath(errored.id), 'state.json'), 'utf8'),
    ) as { terminalReason?: string; terminalClassification?: string; lastContinuationReason?: string }

    expect(resetState.terminalReason).toBeUndefined()
    expect(resetState.terminalClassification).toBeUndefined()
    expect(resetState.lastContinuationReason).toBeUndefined()
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
    expect(seed.truthBoundary.policyEvidence).toEqual({
      hasOpenTurn: true,
      hasPairedTurns: true,
      hasPendingLifecycle: true,
      hasRepairDrift: false,
    })
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
    expect(seed.truthBoundary.policyEvidence).toEqual({
      hasOpenTurn: false,
      hasPairedTurns: true,
      hasPendingLifecycle: false,
      hasRepairDrift: false,
    })
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
    expect(seed.truthBoundary.policyEvidence).toEqual({
      hasOpenTurn: false,
      hasPairedTurns: false,
      hasPendingLifecycle: false,
      hasRepairDrift: false,
    })
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
    expect(second.truthBoundary).toEqual(first.truthBoundary)
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
    expect(seed.truthBoundary.policyEvidence).toEqual({
      hasOpenTurn: true,
      hasPairedTurns: false,
      hasPendingLifecycle: true,
      hasRepairDrift: false,
    })
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
    expect(seed.truthBoundary).toEqual({
      source: 'durable-replay',
      normalizedEventCount: first.normalizedTranscriptEvents.length,
      pairedTurnCount: 0,
      policyEvidence: {
        hasOpenTurn: true,
        hasPairedTurns: false,
        hasPendingLifecycle: false,
        hasRepairDrift: true,
      },
      repairSummary: first.repairSummary,
      continuationSafety: 'fresh-only',
      openTurn: undefined,
    })
    expect(seed.derivedState).toEqual({
      transcript: [],
    })
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
    expect(snapshot.pendingLifecycle).toEqual({
      pendingApprovals: {},
      pendingTools: {},
      taskStates: {},
    })
  })
})
