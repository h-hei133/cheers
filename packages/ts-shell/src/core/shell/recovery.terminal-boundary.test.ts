import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { QueryEngine } from '../query/QueryEngine.js'
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

describe('shell recovery terminal boundary', () => {
  it('keeps terminal envelope and durable coarse boundary aligned after repeated-resume handoff recovery', async () => {
    const originalUserProfile = process.env.USERPROFILE
    const originalHome = process.env.HOME
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-terminal-boundary-'))
    process.env.USERPROFILE = fakeHome
    process.env.HOME = fakeHome

    try {
      async function runTerminalScenario(input: {
        prompt: string
        stopReason: string
        terminalClassification: 'stopped' | 'error'
        lastContinuationReason?: 'handoff' | 'retryable-error'
        finalOutput: string
      }) {
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

        manager.persistUserPromptBarrier(session.id, input.prompt)
        manager.markTurnActive(session.id)
        manager.appendQueryEvent(session.id, {
          type: 'query.started',
          sessionId: session.id,
          prompt: input.prompt,
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
                return 'interrupted before terminal boundary assertion'
              }
            }
            throw new Error('Expected coder turn after resumed handoff before terminal boundary completion')
          },
        } as never

        const firstResult = await resumeShellSession({
          requestedSessionId: session.id,
          sessionManager: manager,
          runtimeContext: createRuntimeContext(),
          sessionRuntime: firstRuntime,
          renderer: { renderLine() {} } as never,
        })
        expect(firstResult).toEqual({ resumed: true })

        let capturedRuntimeSeed: Awaited<ReturnType<SessionManager['buildRuntimeStateSeed']>> | undefined
        const runtime = new ShellSessionRuntime({
          sessionManager: manager,
          renderer: { renderLine() {}, renderChunk() {} } as never,
          runPrompt: async function* (_prompt, _signal, runtimeSeed) {
            capturedRuntimeSeed = runtimeSeed
            yield {
              type: 'query.completed',
              result: {
                status: 'stopped_error',
                terminalReason: 'stopped_error',
                terminalClassification: input.terminalClassification,
                lastContinuationReason: input.lastContinuationReason,
                stopReason: input.stopReason,
                transcript: [
                  plannerOutput,
                  coderOutput,
                  reviewerOutput,
                  {
                    role: 'coder' as const,
                    content: input.finalOutput,
                    notes: ['coder-terminal-note'],
                  },
                ],
                sharedContext: {
                  sessionId: session.id,
                  initialPrompt: input.prompt,
                  notes: ['planner-note', 'coder-note', 'reviewer-note', 'coder-terminal-note'],
                  handoffs: [
                    { from: 'planner', to: 'coder', reason: 'plan-ready', turn: 1 },
                    { from: 'coder', to: 'reviewer', reason: 'ready-for-review', turn: 2 },
                    { from: 'reviewer', to: 'coder', reason: 'needs-more-code', turn: 3 },
                  ],
                },
                finalOutput: input.finalOutput,
              },
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

        expect(secondResult).toEqual({ resumed: true })
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
          terminalReason: 'stopped_error',
          terminalClassification: input.terminalClassification,
          stopReason: input.stopReason,
          finalOutput: input.finalOutput,
        })
        expect(terminalQueryEvents[0].event.result.lastContinuationReason).toBe(input.lastContinuationReason)

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

        const snapshot = manager.getRecoverySnapshot(session.id)
        return { state, snapshot, terminalEvent: terminalQueryEvents[0].event.result }
      }

      const plainStoppedScenario = await runTerminalScenario({
        prompt: 'terminal plain stopped prompt',
        stopReason: 'User stopped during recovery',
        terminalClassification: 'stopped',
        lastContinuationReason: 'handoff',
        finalOutput: 'partial stopped output',
      })

      expect(plainStoppedScenario.state.status).toBe('error')
      expect(plainStoppedScenario.state.terminalReason).toBe('stopped_error')
      expect(plainStoppedScenario.state.terminalClassification).toBe('stopped')
      expect(plainStoppedScenario.state.durableStatus).toBe('stopped')
      expect(plainStoppedScenario.state.lastContinuationReason).toBe('handoff')
      expect(plainStoppedScenario.state.lastError).toBeUndefined()
      expect(plainStoppedScenario.snapshot.terminalReason).toBe('stopped_error')
      expect(plainStoppedScenario.snapshot.terminalClassification).toBe('stopped')
      expect(plainStoppedScenario.snapshot.durableStatus).toBe('stopped')
      expect(plainStoppedScenario.snapshot.lastContinuationReason).toBe('handoff')
      expect(plainStoppedScenario.terminalEvent).toMatchObject({
        terminalReason: plainStoppedScenario.state.terminalReason,
        terminalClassification: plainStoppedScenario.state.terminalClassification,
        finalOutput: 'partial stopped output',
      })
      expect(plainStoppedScenario.terminalEvent.lastContinuationReason).toBe(plainStoppedScenario.state.lastContinuationReason)

      const retryableScenario = await runTerminalScenario({
        prompt: 'terminal stopped prompt',
        stopReason: 'Retry budget exhausted',
        terminalClassification: 'stopped',
        lastContinuationReason: 'retryable-error',
        finalOutput: 'partial retry output',
      })

      expect(retryableScenario.state.status).toBe('error')
      expect(retryableScenario.state.terminalReason).toBe('stopped_error')
      expect(retryableScenario.state.terminalClassification).toBe('stopped')
      expect(retryableScenario.state.durableStatus).toBe('stopped')
      expect(retryableScenario.state.lastContinuationReason).toBe('retryable-error')
      expect(retryableScenario.state.lastError).toBeUndefined()
      expect(retryableScenario.snapshot.terminalReason).toBe('stopped_error')
      expect(retryableScenario.snapshot.terminalClassification).toBe('stopped')
      expect(retryableScenario.snapshot.durableStatus).toBe('stopped')
      expect(retryableScenario.snapshot.lastContinuationReason).toBe('retryable-error')
      expect(retryableScenario.terminalEvent).toMatchObject({
        terminalReason: retryableScenario.state.terminalReason,
        terminalClassification: retryableScenario.state.terminalClassification,
        finalOutput: 'partial retry output',
      })
      expect(retryableScenario.terminalEvent.lastContinuationReason).toBe(retryableScenario.state.lastContinuationReason)

      const errorScenario = await runTerminalScenario({
        prompt: 'terminal error prompt',
        stopReason: 'Transport exploded',
        terminalClassification: 'error',
        finalOutput: 'partial failure output',
      })

      expect(errorScenario.state.status).toBe('error')
      expect(errorScenario.state.terminalReason).toBe('stopped_error')
      expect(errorScenario.state.terminalClassification).toBe('error')
      expect(errorScenario.state.durableStatus).toBe('error')
      expect(errorScenario.state.lastContinuationReason).toBeUndefined()
      expect(errorScenario.state.lastError).toBe('Transport exploded')
      expect(errorScenario.snapshot.terminalReason).toBe('stopped_error')
      expect(errorScenario.snapshot.terminalClassification).toBe('error')
      expect(errorScenario.snapshot.durableStatus).toBe('error')
      expect(errorScenario.snapshot.lastContinuationReason).toBeUndefined()
      expect(errorScenario.terminalEvent).toMatchObject({
        terminalReason: errorScenario.state.terminalReason,
        terminalClassification: errorScenario.state.terminalClassification,
        finalOutput: 'partial failure output',
      })
      expect(errorScenario.terminalEvent.lastContinuationReason).toBeUndefined()
    } finally {
      process.env.USERPROFILE = originalUserProfile
      process.env.HOME = originalHome
      fs.rmSync(fakeHome, { recursive: true, force: true })
    }
  })
})
