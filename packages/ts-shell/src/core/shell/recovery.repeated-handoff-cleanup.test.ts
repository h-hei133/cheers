import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { QueryEngine } from '../query/runtime/engine.js'
import { createQueryRuntimeStateFromSeed } from '../query/runtime/state.js'
import { SessionManager } from '../../session/SessionManager.js'
import { ShellSessionRuntime } from './sessionRuntime.js'
import type { ShellRuntimeContext } from './runtimeContext.js'
import { resumeShellSession } from './recovery.js'

function createRuntimeContext(): ShellRuntimeContext {
  return {
    cwd: 'D:/repo',
    originalCwd: 'D:/repo',
    projectRoot: 'D:/repo',
    runtimeConfig: {
      provider: 'openai',
      daemonEnabled: true,
      maxTurns: 6,
      disabledTools: [],
      hiddenToolPrefixes: [],
      enableMcpTools: true,
      configSources: [],
    },
    gitContext: {
      insideGit: true,
      branch: 'main',
      isClean: true,
      root: 'D:/repo',
    },
    session: { id: 'sess_current' },
    activeSession: { sessionId: 'sess_current', sessionProjectDir: 'D:/repo' },
  } as never
}

describe('shell recovery repeated handoff cleanup', () => {
  it('keeps repeated-resume handoff and pending lifecycle cleanup aligned in one recovery chain', async () => {
    const originalUserProfile = process.env.USERPROFILE
    const originalHome = process.env.HOME
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-repeated-handoff-cleanup-'))
    process.env.USERPROFILE = fakeHome
    process.env.HOME = fakeHome

    try {
      const manager = new SessionManager()
      const session = manager.createNew()
      const plannerOutput = {
        role: 'planner' as const,
        content: 'plan',
        handoffTo: 'coder' as const,
        handoffReason: 'plan-ready',
        notes: ['planner-note'],
      }
      const coderOutput = {
        role: 'coder' as const,
        content: 'code',
        handoffTo: 'reviewer' as const,
        handoffReason: 'ready-for-review',
        notes: ['coder-note'],
      }
      const reviewerOutput = {
        role: 'reviewer' as const,
        content: 'needs another coding pass',
        handoffTo: 'coder' as const,
        handoffReason: 'needs-more-code',
        notes: ['reviewer-note'],
        events: [
          {
            type: 'approval.requested' as const,
            toolName: 'bash',
            taskId: 'task_repeated_handoff_approval',
          },
          {
            type: 'tool.started' as const,
            toolName: 'read',
            taskId: 'task_repeated_handoff_tool',
          },
        ],
      }

      manager.persistUserPromptBarrier(session.id, 'repeated handoff cleanup prompt')
      manager.markTurnActive(session.id)
      manager.appendQueryEvent(session.id, {
        type: 'query.started',
        sessionId: session.id,
        prompt: 'repeated handoff cleanup prompt',
      })
      manager.appendQueryEvent(session.id, {
        type: 'turn.started',
        role: 'planner',
        turn: 1,
      })
      manager.appendQueryEvent(session.id, {
        type: 'turn.completed',
        output: plannerOutput,
      })
      manager.appendQueryEvent(session.id, {
        type: 'turn.started',
        role: 'coder',
        turn: 2,
      })
      manager.appendQueryEvent(session.id, {
        type: 'turn.completed',
        output: coderOutput,
      })
      manager.appendQueryEvent(session.id, {
        type: 'turn.started',
        role: 'reviewer',
        turn: 3,
      })
      manager.saveInterrupted(session.id, 'turn')

      const firstEngine = new QueryEngine({
        runAgent: async ({ role, turn, sharedContext, transcript }) => {
          expect(role).toBe('reviewer')
          expect(turn).toBe(3)
          expect(sharedContext.handoffs).toEqual([
            { from: 'planner', to: 'coder', reason: 'plan-ready', turn: 1 },
            { from: 'coder', to: 'reviewer', reason: 'ready-for-review', turn: 2 },
          ])
          expect(transcript).toEqual([
            plannerOutput,
            coderOutput,
          ])
          return reviewerOutput
        },
      })

      let firstSeed: Awaited<ReturnType<SessionManager['buildRuntimeStateSeed']>> | undefined
      const firstRuntime = {
        getState: () => 'interrupted',
        executePrompt: async (_sessionId: string, prompt: string, options?: { runtimeSeed?: Awaited<ReturnType<SessionManager['buildRuntimeStateSeed']>> }) => {
          firstSeed = options?.runtimeSeed
          for await (const event of firstEngine.streamMessage(session.id, prompt, { runtimeSeed: options?.runtimeSeed })) {
            if (event.type === 'query.completed') {
              break
            }
            manager.appendQueryEvent(session.id, event)
            if (event.type === 'turn.started' && event.role === 'coder' && event.turn === 4) {
              manager.saveInterrupted(session.id, 'turn')
              return 'interrupted after resumed handoff cleanup'
            }
          }
          throw new Error('Expected coder turn after resumed handoff cleanup before terminal completion')
        },
      } as never

      const firstResult = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: firstRuntime,
        renderer: { renderLine() {} } as never,
      })

      expect(firstResult).toMatchObject({ resumed: true })
      if (!firstResult.resumed || !firstResult.autoResume) {
        throw new Error('Expected first auto-resume payload')
      }
      await firstRuntime.executePrompt(session.id, firstResult.autoResume.prompt, {
        runtimeSeed: firstResult.autoResume.runtimeSeed,
        continuityState: firstResult.autoResume.continuityState,
      })
      expect(firstSeed?.recoveryBoundary).toBe('mid-turn-reentry')
      expect(firstSeed?.currentRole).toBe('reviewer')
      expect(firstSeed?.turn).toBe(3)

      let secondSeed: Awaited<ReturnType<SessionManager['buildRuntimeStateSeed']>> | undefined
      const seenTurns: string[] = []
      const secondEngine = new QueryEngine({
        runAgent: async ({ role, turn, sharedContext, transcript }) => {
          seenTurns.push(`${role}:${turn}`)
          expect(role).toBe('coder')
          expect(turn).toBe(4)
          expect(sharedContext.handoffs).toEqual([
            { from: 'planner', to: 'coder', reason: 'plan-ready', turn: 1 },
            { from: 'coder', to: 'reviewer', reason: 'ready-for-review', turn: 2 },
            { from: 'reviewer', to: 'coder', reason: 'needs-more-code', turn: 3 },
          ])
          expect(transcript).toEqual([
            plannerOutput,
            coderOutput,
            reviewerOutput,
          ])
          return {
            role: 'coder',
            content: 'coding patch applied with cleanup',
            notes: ['coder-return-note'],
          }
        },
      })

      const secondRuntime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (prompt, _signal, runtimeSeed) {
          secondSeed = runtimeSeed
          for await (const event of secondEngine.streamMessage(session.id, prompt, { runtimeSeed })) {
            yield event
          }
        },
      })

      const secondResult = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: secondRuntime,
        renderer: { renderLine() {} } as never,
      })

      expect(secondResult).toMatchObject({ resumed: true })
      if (!secondResult.resumed || !secondResult.autoResume) {
        throw new Error('Expected second auto-resume payload')
      }
      await secondRuntime.executePrompt(session.id, secondResult.autoResume.prompt, {
        runtimeSeed: secondResult.autoResume.runtimeSeed,
        continuityState: secondResult.autoResume.continuityState,
      })
      expect(secondSeed?.recoveryBoundary).toBe('mid-turn-reentry')
      expect(secondSeed?.currentRole).toBe('coder')
      expect(secondSeed?.turn).toBe(4)
      expect(secondSeed?.truthBoundary.openTurn).toEqual({ role: 'coder', turn: 4 })
      expect(secondSeed?.pendingLifecycle.pendingApprovals).toEqual({})
      expect(secondSeed?.pendingLifecycle.pendingTools).toEqual({})
      expect(secondSeed?.pendingLifecycle.taskStates.task_repeated_handoff_approval).toMatchObject({
        lastEvent: 'approval.resolved',
        outcome: 'denied',
        compensated: true,
        taskId: 'task_repeated_handoff_approval',
      })
      expect(secondSeed?.pendingLifecycle.taskStates.task_repeated_handoff_approval?.toolName).toBe('bash')
      expect(secondSeed?.pendingLifecycle.taskStates.task_repeated_handoff_tool).toMatchObject({
        lastEvent: 'tool.result',
        success: false,
        compensated: true,
        taskId: 'task_repeated_handoff_tool',
      })
      expect(secondSeed?.pendingLifecycle.taskStates.task_repeated_handoff_tool?.toolName).toBe('read')
      const reconstructedSecondState = secondSeed
        ? createQueryRuntimeStateFromSeed(secondSeed)
        : undefined
      const mergedHandoffs = [
        { from: 'planner', to: 'coder', reason: 'plan-ready', turn: 1 },
        { from: 'coder', to: 'reviewer', reason: 'ready-for-review', turn: 2 },
        { from: 'reviewer', to: 'coder', reason: 'needs-more-code', turn: 3 },
      ]
      expect(reconstructedSecondState?.sharedContext.handoffs).toEqual(mergedHandoffs)
      expect(seenTurns).toEqual(['coder:4'])

      const transcriptEvents = manager.getTranscriptEvents(session.id)
      expect(transcriptEvents.filter(
        event => event.type === 'query-event' && event.event.type === 'approval.resolved' && event.event.taskId === 'task_repeated_handoff_approval',
      )).toHaveLength(1)
      expect(transcriptEvents.filter(
        event => event.type === 'query-event' && event.event.type === 'tool.result' && event.event.taskId === 'task_repeated_handoff_tool',
      )).toHaveLength(1)
      const terminalEvents = transcriptEvents.filter(
        (event): event is Extract<(typeof transcriptEvents)[number], { type: 'query-event' }> =>
          event.type === 'query-event' && event.event.type === 'query.completed',
      )
      expect(terminalEvents).toHaveLength(1)
      expect(terminalEvents[0].event.result.sharedContext.handoffs).toEqual(mergedHandoffs)
      expect(terminalEvents[0].event.result.terminalReason).toBe('completed')
      expect(terminalEvents[0].event.result.terminalClassification).toBe('success')

      const statePath = path.join(manager.getSessionDirPath(session.id), 'state.json')
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
        status: string
        terminalReason?: string
        terminalClassification?: string
        durableStatus?: string
        lastError?: string
      }
      expect(state.status).toBe('completed')
      expect(state.terminalReason).toBe('completed')
      expect(state.terminalClassification).toBe('success')
      expect(state.durableStatus).toBe('success')
      expect(state.lastError).toBeUndefined()

      const snapshot = manager.getRecoverySnapshot(session.id)
      expect(snapshot.pendingLifecycle.pendingApprovals).toEqual({})
      expect(snapshot.pendingLifecycle.pendingTools).toEqual({})
      expect(snapshot.pendingLifecycle.taskStates.task_repeated_handoff_approval).toMatchObject({
        lastEvent: 'approval.resolved',
        outcome: 'denied',
        compensated: true,
        taskId: 'task_repeated_handoff_approval',
        toolName: 'bash',
      })
      expect(snapshot.pendingLifecycle.taskStates.task_repeated_handoff_tool).toMatchObject({
        lastEvent: 'tool.result',
        success: false,
        compensated: true,
        taskId: 'task_repeated_handoff_tool',
        toolName: 'read',
      })
      expect(snapshot.terminalReason).toBe('completed')
      expect(snapshot.terminalClassification).toBe('success')
      expect(snapshot.durableStatus).toBe('success')
      const snapshotTerminalEvents = snapshot.transcriptEvents.filter(
        (event): event is Extract<(typeof snapshot.transcriptEvents)[number], { type: 'query-event' }> =>
          event.type === 'query-event' && event.event.type === 'query.completed',
      )
      expect(snapshotTerminalEvents).toHaveLength(1)
      expect(snapshotTerminalEvents[0].event.result.sharedContext.handoffs).toEqual(mergedHandoffs)
      expect(snapshotTerminalEvents[0].event.result).toMatchObject({
        terminalReason: state.terminalReason,
        terminalClassification: state.terminalClassification,
      })
    } finally {
      process.env.USERPROFILE = originalUserProfile
      process.env.HOME = originalHome
      fs.rmSync(fakeHome, { recursive: true, force: true })
    }
  })
})
