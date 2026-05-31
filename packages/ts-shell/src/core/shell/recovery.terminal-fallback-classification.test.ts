import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentRunner } from '../../orchestration/types.js'
import { QueryEngine } from '../query/runtime/engine.js'
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

describe('shell recovery terminal fallback classification', () => {
  it('keeps fallback classification from collapsing a true resumed error into stopped', async () => {
    const originalUserProfile = process.env.USERPROFILE
    const originalHome = process.env.HOME
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-terminal-fallback-'))
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
            taskId: `${session.id}-approval`,
          },
          {
            type: 'tool.started' as const,
            toolName: 'read',
            taskId: `${session.id}-tool`,
          },
        ],
      }

      manager.persistUserPromptBarrier(session.id, 'terminal fallback prompt')
      manager.markTurnActive(session.id)
      manager.appendQueryEvent(session.id, {
        type: 'query.started',
        sessionId: session.id,
        prompt: 'terminal fallback prompt',
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

      const firstRuntime = {
        getState: () => 'interrupted',
        executePrompt: async (_sessionId: string, prompt: string, options?: { runtimeSeed?: Awaited<ReturnType<SessionManager['buildRuntimeStateSeed']>> }) => {
          for await (const event of firstEngine.streamMessage(session.id, prompt, { runtimeSeed: options?.runtimeSeed })) {
            if (event.type === 'query.completed') {
              break
            }
            manager.appendQueryEvent(session.id, event)
            if (event.type === 'turn.started' && event.role === 'coder' && event.turn === 4) {
              manager.saveInterrupted(session.id, 'turn')
              return 'interrupted before fallback classification assertion'
            }
          }
          throw new Error('Expected coder turn after resumed handoff before fallback classification completion')
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

      const runAgent: AgentRunner = async ({ role, turn, sharedContext, transcript }) => {
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
        throw new Error('Transport exploded')
      }

      const engine = new QueryEngine({ runAgent })
      let capturedRuntimeSeed: Awaited<ReturnType<SessionManager['buildRuntimeStateSeed']>> | undefined
      const runtime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (prompt, _signal, runtimeSeed) {
          capturedRuntimeSeed = runtimeSeed
          for await (const event of engine.streamMessage(session.id, prompt, { runtimeSeed })) {
            yield event
          }
        },
      })

      const secondResult = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: runtime,
        renderer: { renderLine() {} } as never,
      })

      expect(secondResult).toMatchObject({ resumed: true })
      if (!secondResult.resumed || !secondResult.autoResume) {
        throw new Error('Expected second auto-resume payload')
      }
      await runtime.executePrompt(session.id, secondResult.autoResume.prompt, {
        runtimeSeed: secondResult.autoResume.runtimeSeed,
        continuityState: secondResult.autoResume.continuityState,
      })
      expect(capturedRuntimeSeed?.recoveryBoundary).toBe('mid-turn-reentry')
      expect(capturedRuntimeSeed?.currentRole).toBe('coder')
      expect(capturedRuntimeSeed?.turn).toBe(4)
      expect(capturedRuntimeSeed?.pendingLifecycle.pendingApprovals).toEqual({})
      expect(capturedRuntimeSeed?.pendingLifecycle.pendingTools).toEqual({})

      const terminalQueryEvents = manager.getTranscriptEvents(session.id).filter(
        (event): event is Extract<ReturnType<SessionManager['getTranscriptEvents']>[number], { type: 'query-event' }> =>
          event.type === 'query-event' && event.event.type === 'query.completed',
      )
      expect(terminalQueryEvents).toHaveLength(1)
      expect(terminalQueryEvents[0].event.result).toMatchObject({
        status: 'stopped_error',
        terminalReason: 'stopped_error',
        terminalClassification: 'error',
        stopReason: 'Transport exploded',
        finalOutput: 'needs another coding pass',
      })

      const state = JSON.parse(
        fs.readFileSync(path.join(manager.getSessionDirPath(session.id), 'state.json'), 'utf8'),
      ) as {
        status: string
        terminalReason?: string
        terminalClassification?: string
        durableStatus?: string
        lastContinuationReason?: string
        lastError?: string
      }
      expect(state.status).toBe('error')
      expect(state.terminalReason).toBe('stopped_error')
      expect(state.terminalClassification).toBe('error')
      expect(state.durableStatus).toBe('error')
      expect(state.lastError).toBe('Transport exploded')

      const snapshot = manager.getRecoverySnapshot(session.id)
      expect(snapshot.terminalReason).toBe('stopped_error')
      expect(snapshot.terminalClassification).toBe('error')
      expect(snapshot.durableStatus).toBe('error')
      expect(snapshot.pendingLifecycle.pendingApprovals).toEqual({})
      expect(snapshot.pendingLifecycle.pendingTools).toEqual({})

      const terminalAssistantMessages = manager.getTranscriptEvents(session.id).filter(
        event => event.type === 'message' && event.role === 'assistant' && event.content === 'needs another coding pass',
      )
      expect(terminalAssistantMessages).toHaveLength(1)
    } finally {
      process.env.USERPROFILE = originalUserProfile
      process.env.HOME = originalHome
      fs.rmSync(fakeHome, { recursive: true, force: true })
    }
  })
})
