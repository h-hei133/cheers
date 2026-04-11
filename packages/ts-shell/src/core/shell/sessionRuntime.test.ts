import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ShellSessionRuntime } from './sessionRuntime.js'
import { SessionManager } from '../../session/SessionManager.js'

describe('shell session runtime (W5)', () => {
  it('moves through a successful prompt execution lifecycle', async () => {
    const calls: string[] = []
    const runtime = new ShellSessionRuntime({
      sessionManager: {
        markRunStarted(sessionId: string, prompt: string) {
          calls.push(`started:${sessionId}:${prompt}`)
        },
        persistUserPromptBarrier(sessionId: string, prompt: string) {
          calls.push(`barrier:${sessionId}:${prompt}`)
        },
        markTurnActive(_sessionId: string) {},
        appendQueryEvent(_sessionId: string, _event: unknown) {},
        addTurn(sessionId: string, turn: { role: string; content: string }) {
          calls.push(`turn:${sessionId}:${turn.role}:${turn.content}`)
        },
        saveCompleted(sessionId: string) {
          calls.push(`completed:${sessionId}`)
        },
        saveInterrupted(sessionId: string) {
          calls.push(`interrupted:${sessionId}`)
        },
        saveError(sessionId: string, error: string) {
          calls.push(`error:${sessionId}:${error}`)
        },
        saveTerminated(sessionId: string) {
          calls.push(`terminated:${sessionId}`)
        },
      } as never,
      renderer: {
        renderLine() {},
        renderChunk() {},
      } as never,
      runPrompt: async function* (prompt) {
        yield { type: 'message.delta', role: 'reviewer', delta: 'partial ' }
        yield {
          type: 'query.completed',
          result: {
            status: 'completed',
            terminalReason: 'completed',
            terminalClassification: 'success',
            transcript: [],
            sharedContext: { sessionId: 'sess_1', initialPrompt: prompt, notes: [], handoffs: [] },
            finalOutput: `done:${prompt}`,
          },
        }
      },
    })

    const output = await runtime.executePrompt('sess_1', 'hello')
    expect(output).toBe('done:hello')
    expect(runtime.getState()).toBe('idle')
    expect(calls).toEqual([
      'barrier:sess_1:hello',
      'turn:sess_1:assistant:done:hello',
      'completed:sess_1',
    ])
  })

  it('maps non-completed terminal query results to session error state', async () => {
    const calls: string[] = []
    const runtime = new ShellSessionRuntime({
      sessionManager: {
        markRunStarted() {},
        persistUserPromptBarrier(sessionId: string, prompt: string) {
          calls.push(`barrier:${sessionId}:${prompt}`)
        },
        markTurnActive() {},
        appendQueryEvent() {},
        addTurn(sessionId: string, turn: { role: string; content: string }) {
          calls.push(`turn:${sessionId}:${turn.role}:${turn.content}`)
        },
        saveCompleted(sessionId: string) {
          calls.push(`completed:${sessionId}`)
        },
        saveInterrupted(sessionId: string) {
          calls.push(`interrupted:${sessionId}`)
        },
        saveError(sessionId: string, error: string) {
          calls.push(`error:${sessionId}:${error}`)
        },
        saveTerminated() {},
      } as never,
      renderer: {
        renderLine() {},
        renderChunk() {},
      } as never,
      runPrompt: async function* () {
        yield {
          type: 'query.completed',
          result: {
            status: 'stopped_error',
            terminalReason: 'stopped_error',
            terminalClassification: 'stopped',
            stopReason: 'Retry budget exhausted',
            transcript: [],
            sharedContext: { sessionId: 'sess_stop', initialPrompt: 'hello', notes: [], handoffs: [] },
            finalOutput: 'partial result',
          },
        }
      },
    })

    const output = await runtime.executePrompt('sess_stop', 'hello')

    expect(output).toBe('partial result')
    expect(calls).toEqual([
      'barrier:sess_stop:hello',
      'turn:sess_stop:assistant:partial result',
      'error:sess_stop:Retry budget exhausted',
    ])
  })

  it('marks interrupted state when aborted', async () => {
    const calls: string[] = []
    const runtime = new ShellSessionRuntime({
      sessionManager: {
        markRunStarted() {},
        persistUserPromptBarrier() {},
        markTurnActive() {},
        appendQueryEvent() {},
        addTurn() {},
        saveCompleted() {},
        saveInterrupted(sessionId: string) {
          calls.push(`interrupted:${sessionId}`)
        },
        saveError() {},
        saveTerminated() {},
      } as never,
      renderer: {
        renderLine() {},
        renderChunk() {},
      } as never,
      runPrompt: async function* (_prompt, signal) {
        runtime.cancelCurrentRun()
        if (signal.aborted) {
          throw new Error('Aborted')
        }
        yield {
          type: 'query.completed',
          result: {
            status: 'completed',
            terminalReason: 'completed',
            terminalClassification: 'success',
            transcript: [],
            sharedContext: { sessionId: 'sess_abort', initialPrompt: 'stop', notes: [], handoffs: [] },
            finalOutput: 'never',
          },
        }
      },
    })

    await expect(runtime.executePrompt('sess_abort', 'stop')).rejects.toThrow('Aborted')
    expect(runtime.getState()).toBe('interrupted')
    expect(calls).toEqual(['interrupted:sess_abort'])
  })

  it('terminates independently from prompt execution lifecycle', () => {
    const calls: string[] = []
    const runtime = new ShellSessionRuntime({
      sessionManager: {
        markRunStarted() {},
        persistUserPromptBarrier() {},
        markTurnActive() {},
        appendQueryEvent() {},
        addTurn() {},
        saveCompleted() {},
        saveInterrupted() {},
        saveError() {},
        saveTerminated(sessionId: string) {
          calls.push(`terminated:${sessionId}`)
        },
      } as never,
      renderer: {
        renderLine() {},
        renderChunk() {},
      } as never,
      runPrompt: async function* (prompt) {
        yield {
          type: 'query.completed',
          result: {
            status: 'completed',
            terminalReason: 'completed',
            terminalClassification: 'success',
            transcript: [],
            sharedContext: { sessionId: 'sess_term', initialPrompt: prompt, notes: [], handoffs: [] },
            finalOutput: prompt,
          },
        }
      },
    })

    runtime.terminate('sess_term')
    expect(runtime.getState()).toBe('terminated')
    expect(calls).toEqual(['terminated:sess_term'])
  })

  it('records interrupted prompt vs interrupted turn differently', async () => {
    const originalUserProfile = process.env.USERPROFILE
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-interrupt-kind-'))
    process.env.USERPROFILE = fakeHome

    try {
      const manager = new SessionManager()
      const session = manager.createNew()

      const promptInterruptedRuntime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (_prompt, signal) {
          await new Promise(resolve => setTimeout(resolve, 0))
          for await (const event of [] as import('../query/events.js').QueryEvent[]) {
            yield event
          }
          if (signal.aborted) {
            throw new Error('Aborted')
          }
          throw new Error('Aborted')
        },
      })

      const promptRun = promptInterruptedRuntime.executePrompt(session.id, 'prompt-only')
      promptInterruptedRuntime.cancelCurrentRun()
      await expect(promptRun).rejects.toThrow()
      let snapshot = manager.getRecoverySnapshot(session.id)
      expect(snapshot.interruptedKind).toBe('prompt')

      const resumed = manager.resume(session.id)
      const turnInterruptedRuntime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (_prompt, signal) {
          yield { type: 'query.started', sessionId: resumed.id, prompt: 'turn-phase' }
          turnInterruptedRuntime.cancelCurrentRun()
          if (signal.aborted) {
            throw new Error('Aborted')
          }
          throw new Error('Aborted')
        },
      })

      await expect(turnInterruptedRuntime.executePrompt(resumed.id, 'turn-phase')).rejects.toThrow()
      snapshot = manager.getRecoverySnapshot(resumed.id)
      expect(snapshot.interruptedKind).toBe('turn')
    } finally {
      process.env.USERPROFILE = originalUserProfile
      fs.rmSync(fakeHome, { recursive: true, force: true })
    }
  })

  it('persists terminal classification from query.completed into state.json', async () => {
    const originalUserProfile = process.env.USERPROFILE
    const originalHome = process.env.HOME
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-terminal-state-'))
    process.env.USERPROFILE = fakeHome
    process.env.HOME = fakeHome

    try {
      const manager = new SessionManager()
      const session = manager.createNew()
      const runtime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* () {
          yield {
            type: 'query.completed',
            result: {
              status: 'stopped_error',
              terminalReason: 'stopped_error',
              terminalClassification: 'stopped',
              lastContinuationReason: 'retryable-error',
              stopReason: 'Retry budget exhausted',
              transcript: [],
              sharedContext: { sessionId: session.id, initialPrompt: 'hello', notes: [], handoffs: [] },
              finalOutput: 'partial result',
            },
          }
        },
      })

      await runtime.executePrompt(session.id, 'hello')

      const statePath = path.join(manager.getSessionDirPath(session.id), 'state.json')
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
        status: string
        terminalReason?: string
        lastContinuationReason?: string
      }

      expect(state.status).toBe('error')
      expect(state.terminalReason).toBe('stopped_error')
      expect(state.lastContinuationReason).toBe('retryable-error')
    } finally {
      process.env.USERPROFILE = originalUserProfile
      process.env.HOME = originalHome
      fs.rmSync(fakeHome, { recursive: true, force: true })
    }
  })

  it('fails defensively when the prompt stream ends without a terminal event', async () => {
    const calls: string[] = []
    const runtime = new ShellSessionRuntime({
      sessionManager: {
        markRunStarted() {},
        persistUserPromptBarrier(sessionId: string, prompt: string) {
          calls.push(`barrier:${sessionId}:${prompt}`)
        },
        markTurnActive() {},
        appendQueryEvent() {},
        addTurn() {},
        saveCompleted(sessionId: string) {
          calls.push(`completed:${sessionId}`)
        },
        saveInterrupted() {},
        saveError(sessionId: string, error: string) {
          calls.push(`error:${sessionId}:${error}`)
        },
        saveTerminated() {},
      } as never,
      renderer: { renderLine() {}, renderChunk() {} } as never,
      runPrompt: async function* () {
        yield { type: 'query.started', sessionId: 'sess_missing_terminal', prompt: 'hello' }
        yield { type: 'turn.started', role: 'planner', turn: 1 }
      },
    })

    await expect(runtime.executePrompt('sess_missing_terminal', 'hello')).rejects.toThrow(
      'Query runtime ended without a terminal event',
    )
    expect(calls).toEqual([
      'barrier:sess_missing_terminal:hello',
      'error:sess_missing_terminal:Query runtime ended without a terminal event',
    ])
  })
})
