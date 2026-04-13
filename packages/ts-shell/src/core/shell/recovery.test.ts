import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
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

describe('shell recovery helpers', () => {
  it('returns resumed false when no recoverable session exists', async () => {
    const lines: string[] = []
    const result = await resumeShellSession({
      sessionManager: {
        getSuggestedRecoverySession: () => null,
      } as never,
      runtimeContext: {} as never,
      sessionRuntime: {} as never,
      renderer: { renderLine: (line: string) => lines.push(line) } as never,
    })

    expect(result).toEqual({ resumed: false })
    expect(lines.join('\n')).toContain('No recoverable session found')
  })

  it('does not partially mutate runtime context when resume fails', async () => {
    const lines: string[] = []
    const runtimeContext: ShellRuntimeContext = {
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

    const result = await resumeShellSession({
      requestedSessionId: 'sess_missing',
      sessionManager: {
        tryResume: () => ({
          ok: false,
          error: 'resume failed',
          recoveryHint: 'inspect the session directory',
        }),
      } as never,
      runtimeContext,
      sessionRuntime: {} as never,
      renderer: { renderLine: (line: string) => lines.push(line) } as never,
    })

    expect(result).toEqual({ resumed: false })
    expect(runtimeContext.session.id).toBe('sess_current')
    expect(runtimeContext.projectRoot).toBe('D:/repo')
    expect(runtimeContext.activeSession).toEqual({
      sessionId: 'sess_current',
      sessionProjectDir: 'D:/repo',
    })
    expect(lines.join('\n')).toContain('resume failed')
  })

  it('passes a replay-built runtime seed into resumed prompt execution', async () => {
    const lines: string[] = []
    const executeCalls: Array<{ sessionId: string; prompt: string; recoveryBoundary?: string; repairInsertedPromptMessage?: boolean }> = []
    const runtimeContext: ShellRuntimeContext = {
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

    const result = await resumeShellSession({
      requestedSessionId: 'sess_resume',
      sessionManager: {
        tryResume: () => ({
          ok: true,
          session: {
            id: 'sess_resume',
            pendingPrompt: 'continue me',
          },
        }),
        buildRuntimeStateSeed: () => ({
          config: {
            sessionId: 'sess_resume',
            initialPrompt: 'continue me',
            maxTurns: 6,
            startingRole: 'planner',
          },
          currentRole: 'coder',
          turn: 2,
          lastContinuationReason: 'handoff',
          pendingLifecycle: { pendingApprovals: {}, pendingTools: {}, taskStates: {} },
          recoveryBoundary: 'mid-turn-reentry',
          truthBoundary: {
            source: 'durable-replay',
            normalizedEventCount: 0,
            pairedTurnCount: 0,
            policyEvidence: new Set(['open-turn']),
            repairSummary: {
              insertedPromptMessage: false,
              insertedQueryStarted: false,
              strippedInterruptedTerminalEvents: 0,
              insertedRunInterrupted: false,
              ignoredDuplicateTurnStarts: 0,
              ignoredUnpairedTurnCompletions: 0,
              ignoredRoleMismatchedTurnCompletions: 0,
            },
            continuationSafety: 'mid-turn-safe',
            openTurn: { role: 'coder', turn: 2 },
          },
          derivedState: {
            transcript: [],
          },
        }),
        getRecoverySnapshot: () => ({
          pendingPrompt: 'continue me',
          runPhase: 'turn-active',
          interruptedKind: 'turn',
          pendingLifecycle: { pendingApprovals: {}, pendingTools: {}, taskStates: {} },
          repairSummary: {
            insertedPromptMessage: false,
            insertedQueryStarted: false,
            strippedInterruptedTerminalEvents: 0,
            insertedRunInterrupted: false,
            ignoredDuplicateTurnStarts: 0,
            ignoredUnpairedTurnCompletions: 0,
            ignoredRoleMismatchedTurnCompletions: 0,
          },
          transcriptEvents: [],
        }),
        reconcilePendingLifecycle: () => ({ pendingApprovals: {}, pendingTools: {}, taskStates: {} }),
      } as never,
      runtimeContext,
        sessionRuntime: {
          executePrompt: async (sessionId: string, prompt: string, options?: { runtimeSeed?: { recoveryBoundary?: string; truthBoundary?: { repairSummary?: { insertedPromptMessage: boolean } } } }) => {
            executeCalls.push({
              sessionId,
              prompt,
              recoveryBoundary: options?.runtimeSeed?.recoveryBoundary,
              repairInsertedPromptMessage: options?.runtimeSeed?.truthBoundary?.repairSummary?.insertedPromptMessage,
            })
            return 'ok'
          },
        } as never,
      renderer: { renderLine: (line: string) => lines.push(line) } as never,
    })

    expect(result).toEqual({ resumed: true })
    expect(executeCalls).toEqual([
      {
        sessionId: 'sess_resume',
        prompt: 'continue me',
        recoveryBoundary: 'mid-turn-reentry',
        repairInsertedPromptMessage: false,
      },
    ])
    expect(lines.join('\n')).toContain('Resumed session sess_resume')
  })

  it('does not duplicate persisted prompt barrier when resuming with an existing runtime seed', async () => {
    const originalUserProfile = process.env.USERPROFILE
    const originalHome = process.env.HOME
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-no-dup-resume-barrier-'))
    process.env.USERPROFILE = fakeHome
    process.env.HOME = fakeHome

    try {
      const manager = new SessionManager()
      const session = manager.createNew()
      manager.persistUserPromptBarrier(session.id, 'no-dup prompt')
      manager.saveInterrupted(session.id, 'prompt')

      const runtime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (_prompt, _signal, _runtimeSeed) {
          yield {
            type: 'query.completed',
            result: {
              status: 'completed',
              terminalReason: 'completed',
              terminalClassification: 'success',
              transcript: [],
              sharedContext: { sessionId: session.id, initialPrompt: 'no-dup prompt', notes: [], handoffs: [] },
              finalOutput: 'ok',
            },
          }
        },
      })

      await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: runtime,
        renderer: { renderLine() {} } as never,
      })

      const transcript = manager.getTranscriptEvents(session.id)
      expect(transcript.filter(event => event.type === 'lifecycle' && event.event === 'run-started')).toHaveLength(1)
      expect(transcript.filter(
        event => event.type === 'message' && event.role === 'user' && event.content === 'no-dup prompt',
      )).toHaveLength(1)
    } finally {
      process.env.USERPROFILE = originalUserProfile
      process.env.HOME = originalHome
      fs.rmSync(fakeHome, { recursive: true, force: true })
    }
  })

  it('reconciles pending lifecycle before resuming a mid-turn interrupted session', async () => {
    const originalUserProfile = process.env.USERPROFILE
    const originalHome = process.env.HOME
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-recovery-lifecycle-'))
    process.env.USERPROFILE = fakeHome
    process.env.HOME = fakeHome

    try {
      const lines: string[] = []
      const manager = new SessionManager()
      const session = manager.createNew()
      manager.persistUserPromptBarrier(session.id, 'resume prompt')
      manager.markTurnActive(session.id)
      manager.appendQueryEvent(session.id, {
        type: 'query.started',
        sessionId: session.id,
        prompt: 'resume prompt',
      })
      manager.appendQueryEvent(session.id, {
        type: 'turn.started',
        role: 'planner',
        turn: 1,
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

      const runtimeContext: ShellRuntimeContext = {
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

      let capturedSeed: {
        recoveryBoundary: string
        pendingApprovals: string[]
        pendingTools: string[]
      } | null = null

      const result = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext,
        sessionRuntime: {
          getState: () => 'idle',
          executePrompt: async (_sessionId: string, _prompt: string, options?: { runtimeSeed?: { recoveryBoundary: string; pendingLifecycle: { pendingApprovals: Record<string, unknown>; pendingTools: Record<string, unknown> } } }) => {
            capturedSeed = {
              recoveryBoundary: options?.runtimeSeed?.recoveryBoundary ?? 'missing',
              pendingApprovals: Object.keys(options?.runtimeSeed?.pendingLifecycle.pendingApprovals ?? {}),
              pendingTools: Object.keys(options?.runtimeSeed?.pendingLifecycle.pendingTools ?? {}),
            }
            return 'ok'
          },
        } as never,
        renderer: { renderLine: (line: string) => lines.push(line) } as never,
      })

      expect(result).toEqual({ resumed: true })
      expect(capturedSeed).toEqual({
        recoveryBoundary: 'mid-turn-reentry',
        pendingApprovals: [],
        pendingTools: [],
      })

      const snapshot = manager.getRecoverySnapshot(session.id)
      expect(snapshot.pendingLifecycle.pendingApprovals).toEqual({})
      expect(snapshot.pendingLifecycle.pendingTools).toEqual({})
      expect(snapshot.pendingLifecycle.taskStates.task_pending_approval?.lastEvent).toBe('approval.resolved')
      expect(snapshot.pendingLifecycle.taskStates.task_pending_tool?.lastEvent).toBe('tool.result')
      expect(lines.join('\n')).toContain(`Resumed session ${session.id}`)
    } finally {
      process.env.USERPROFILE = originalUserProfile
      process.env.HOME = originalHome
      fs.rmSync(fakeHome, { recursive: true, force: true })
    }
  })

  it('passes repairSummary into recovery runtime seed when transcript drift was repaired', async () => {
    const originalUserProfile = process.env.USERPROFILE
    const originalHome = process.env.HOME
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-recovery-repair-summary-'))
    process.env.USERPROFILE = fakeHome
    process.env.HOME = fakeHome

    try {
      const manager = new SessionManager()
      const session = manager.createNew()
      const transcriptPath = path.join(manager.getSessionDirPath(session.id), 'transcript.jsonl')
      const statePath = path.join(manager.getSessionDirPath(session.id), 'state.json')

      fs.writeFileSync(
        transcriptPath,
        [
          JSON.stringify({ type: 'lifecycle', event: 'run-started', timestamp: '2026-01-01T00:00:00.000Z', detail: 'repair drift' }),
          JSON.stringify({ type: 'query-event', event: { type: 'turn.started', role: 'planner', turn: 1 }, timestamp: '2026-01-01T00:00:01.000Z' }),
          JSON.stringify({ type: 'query-event', event: { type: 'turn.started', role: 'coder', turn: 2 }, timestamp: '2026-01-01T00:00:02.000Z' }),
          JSON.stringify({ type: 'query-event', event: { type: 'turn.completed', output: { role: 'reviewer', content: 'mismatch' } }, timestamp: '2026-01-01T00:00:03.000Z' }),
        ].join('\n') + '\n',
        'utf8',
      )
      fs.writeFileSync(
        statePath,
        JSON.stringify({ status: 'interrupted', pendingPrompt: 'repair drift', runPhase: 'turn-active', interruptedKind: 'turn' }, null, 2),
        'utf8',
      )

      const runtimeContext: ShellRuntimeContext = {
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

      let capturedSummary: { ignoredDuplicateTurnStarts: number; ignoredRoleMismatchedTurnCompletions: number } | null = null

      await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext,
        sessionRuntime: {
          getState: () => 'idle',
          executePrompt: async (_sessionId: string, _prompt: string, options?: { runtimeSeed?: { truthBoundary?: { repairSummary?: { ignoredDuplicateTurnStarts: number; ignoredRoleMismatchedTurnCompletions: number } } } }) => {
            capturedSummary = options?.runtimeSeed?.truthBoundary?.repairSummary ?? null
            return 'ok'
          },
        } as never,
        renderer: { renderLine() {} } as never,
      })

      expect(capturedSummary).toEqual({
        insertedPromptMessage: true,
        insertedQueryStarted: true,
        strippedInterruptedTerminalEvents: 0,
        insertedRunInterrupted: true,
        ignoredDuplicateTurnStarts: 1,
        ignoredUnpairedTurnCompletions: 0,
        ignoredRoleMismatchedTurnCompletions: 1,
      })
    } finally {
      process.env.USERPROFILE = originalUserProfile
      process.env.HOME = originalHome
      fs.rmSync(fakeHome, { recursive: true, force: true })
    }
  })

  it('downgrades unsafe mid-turn recovery seeds when drift summary indicates unreliable open turn', async () => {
    const lines: string[] = []
    const executeCalls: Array<{ recoveryBoundary?: string; currentRole?: string; turn?: number }> = []
    const runtimeContext: ShellRuntimeContext = {
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

    const result = await resumeShellSession({
      requestedSessionId: 'sess_guarded',
      sessionManager: {
        tryResume: () => ({
          ok: true,
          session: {
            id: 'sess_guarded',
            pendingPrompt: 'continue me',
          },
        }),
        buildRuntimeStateSeed: () => ({
          config: {
            sessionId: 'sess_guarded',
            initialPrompt: 'continue me',
            maxTurns: 6,
            startingRole: 'planner',
          },
          currentRole: 'coder',
          turn: 2,
          lastContinuationReason: 'handoff',
          pendingLifecycle: { pendingApprovals: {}, pendingTools: {}, taskStates: {} },
          recoveryBoundary: 'mid-turn-reentry',
          truthBoundary: {
            source: 'durable-replay',
            normalizedEventCount: 5,
            pairedTurnCount: 0,
            policyEvidence: new Set(['open-turn', 'repair-drift']),
            repairSummary: {
              insertedPromptMessage: false,
              insertedQueryStarted: false,
              strippedInterruptedTerminalEvents: 0,
              insertedRunInterrupted: false,
              ignoredDuplicateTurnStarts: 1,
              ignoredUnpairedTurnCompletions: 0,
              ignoredRoleMismatchedTurnCompletions: 0,
            },
            continuationSafety: 'fresh-only',
          },
          derivedState: {
            transcript: [],
          },
        }),
        getRecoverySnapshot: () => ({
          pendingPrompt: 'continue me',
          runPhase: 'turn-active',
          interruptedKind: 'turn',
          pendingLifecycle: { pendingApprovals: {}, pendingTools: {}, taskStates: {} },
          repairSummary: {
            insertedPromptMessage: false,
            insertedQueryStarted: false,
            strippedInterruptedTerminalEvents: 0,
            insertedRunInterrupted: false,
            ignoredDuplicateTurnStarts: 1,
            ignoredUnpairedTurnCompletions: 0,
            ignoredRoleMismatchedTurnCompletions: 0,
          },
          transcriptEvents: [],
        }),
        reconcilePendingLifecycle: () => ({ pendingApprovals: {}, pendingTools: {}, taskStates: {} }),
      } as never,
      runtimeContext,
      sessionRuntime: {
        getState: () => 'idle',
        executePrompt: async (_sessionId: string, _prompt: string, options?: { runtimeSeed?: { recoveryBoundary?: string; currentRole?: string; turn?: number } }) => {
          executeCalls.push({
            recoveryBoundary: options?.runtimeSeed?.recoveryBoundary,
            currentRole: options?.runtimeSeed?.currentRole,
            turn: options?.runtimeSeed?.turn,
          })
          return 'ok'
        },
      } as never,
      renderer: { renderLine: (line: string) => lines.push(line) } as never,
    })

    expect(result).toEqual({ resumed: true })
    expect(executeCalls).toEqual([
      {
        recoveryBoundary: 'fresh-entry',
        currentRole: 'planner',
        turn: 1,
      },
    ])
    expect(lines.join('\n')).toContain('Resumed session sess_guarded')
    expect(lines.join('\n')).toContain('Recovery guardrail downgraded continuation to fresh-entry')
  })

  it('keeps fresh-only, completed-turn-only, and mid-turn-safe stable across repeated resumes', async () => {
    const originalUserProfile = process.env.USERPROFILE
    const originalHome = process.env.HOME
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-repeated-resume-'))
    process.env.USERPROFILE = fakeHome
    process.env.HOME = fakeHome

    try {
      const freshManager = new SessionManager()
      const freshSession = freshManager.createNew()
      freshManager.persistUserPromptBarrier(freshSession.id, 'fresh prompt')
      freshManager.saveInterrupted(freshSession.id, 'prompt')

      const freshBoundaries: string[] = []
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await resumeShellSession({
          requestedSessionId: freshSession.id,
          sessionManager: freshManager,
          runtimeContext: createRuntimeContext(),
          sessionRuntime: {
            getState: () => 'idle',
            executePrompt: async (_sessionId: string, _prompt: string, options?: { runtimeSeed?: { truthBoundary?: { continuationSafety?: string }; recoveryBoundary?: string } }) => {
              freshBoundaries.push(`${options?.runtimeSeed?.truthBoundary?.continuationSafety}:${options?.runtimeSeed?.recoveryBoundary}`)
              freshManager.saveInterrupted(freshSession.id, 'prompt')
              return 'ok'
            },
          } as never,
          renderer: { renderLine() {} } as never,
        })
      }
      expect(freshBoundaries).toEqual([
        'fresh-only:fresh-entry',
        'fresh-only:fresh-entry',
      ])

      const completedManager = new SessionManager()
      const completedSession = completedManager.createNew()
      completedManager.persistUserPromptBarrier(completedSession.id, 'completed prompt')
      completedManager.markTurnActive(completedSession.id)
      completedManager.appendQueryEvent(completedSession.id, {
        type: 'turn.started',
        role: 'planner',
        turn: 1,
      })
      completedManager.appendQueryEvent(completedSession.id, {
        type: 'turn.completed',
        output: {
          role: 'planner',
          content: 'plan',
          handoffTo: 'coder',
          handoffReason: 'ready-for-code',
        },
      })
      completedManager.saveInterrupted(completedSession.id, 'turn')

      const completedBoundaries: string[] = []
      let completedResumeCount = 0
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await resumeShellSession({
          requestedSessionId: completedSession.id,
          sessionManager: completedManager,
          runtimeContext: createRuntimeContext(),
          sessionRuntime: {
            getState: () => 'idle',
            executePrompt: async (_sessionId: string, _prompt: string, options?: { runtimeSeed?: { truthBoundary?: { continuationSafety?: string }; recoveryBoundary?: string } }) => {
              completedBoundaries.push(`${options?.runtimeSeed?.truthBoundary?.continuationSafety}:${options?.runtimeSeed?.recoveryBoundary}`)
              completedResumeCount += 1
              if (completedResumeCount === 1) {
                completedManager.appendQueryEvent(completedSession.id, {
                  type: 'turn.started',
                  role: 'coder',
                  turn: 2,
                })
                completedManager.appendQueryEvent(completedSession.id, {
                  type: 'turn.completed',
                  output: {
                    role: 'coder',
                    content: 'code',
                    handoffTo: 'reviewer',
                    handoffReason: 'review',
                  },
                })
                completedManager.saveInterrupted(completedSession.id, 'turn')
              }
              return 'ok'
            },
          } as never,
          renderer: { renderLine() {} } as never,
        })
      }
      expect(completedBoundaries).toEqual([
        'completed-turn-only:completed-turn-reentry',
        'completed-turn-only:completed-turn-reentry',
      ])

      const midTurnManager = new SessionManager()
      const midTurnSession = midTurnManager.createNew()
      midTurnManager.persistUserPromptBarrier(midTurnSession.id, 'mid-turn prompt')
      midTurnManager.markTurnActive(midTurnSession.id)
      midTurnManager.appendQueryEvent(midTurnSession.id, {
        type: 'turn.started',
        role: 'planner',
        turn: 1,
      })
      midTurnManager.saveInterrupted(midTurnSession.id, 'turn')

      const midTurnBoundaries: string[] = []
      let midTurnResumeCount = 0
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await resumeShellSession({
          requestedSessionId: midTurnSession.id,
          sessionManager: midTurnManager,
          runtimeContext: createRuntimeContext(),
          sessionRuntime: {
            getState: () => 'idle',
            executePrompt: async (_sessionId: string, _prompt: string, options?: { runtimeSeed?: { truthBoundary?: { continuationSafety?: string }; recoveryBoundary?: string } }) => {
              midTurnBoundaries.push(`${options?.runtimeSeed?.truthBoundary?.continuationSafety}:${options?.runtimeSeed?.recoveryBoundary}`)
              midTurnResumeCount += 1
              if (midTurnResumeCount === 1) {
                midTurnManager.appendQueryEvent(midTurnSession.id, {
                  type: 'turn.completed',
                  output: {
                    role: 'planner',
                    content: 'plan complete',
                    handoffTo: 'coder',
                    handoffReason: 'continue',
                  },
                })
                midTurnManager.appendQueryEvent(midTurnSession.id, {
                  type: 'turn.started',
                  role: 'coder',
                  turn: 2,
                })
                midTurnManager.saveInterrupted(midTurnSession.id, 'turn')
              }
              return 'ok'
            },
          } as never,
          renderer: { renderLine() {} } as never,
        })
      }
      expect(midTurnBoundaries).toEqual([
        'mid-turn-safe:mid-turn-reentry',
        'mid-turn-safe:mid-turn-reentry',
      ])
    } finally {
      process.env.USERPROFILE = originalUserProfile
      process.env.HOME = originalHome
      fs.rmSync(fakeHome, { recursive: true, force: true })
    }
  })

  it('keeps contract values aligned with mixed-boundary recovery behavior across transitions', async () => {
    const originalUserProfile = process.env.USERPROFILE
    const originalHome = process.env.HOME
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-mixed-boundary-'))
    process.env.USERPROFILE = fakeHome
    process.env.HOME = fakeHome

    try {
      const manager = new SessionManager()
      const session = manager.createNew()
      const observations: Array<{ contract: string; boundary: string; role: string; turn: number }> = []

      manager.persistUserPromptBarrier(session.id, 'mixed prompt')
      manager.saveInterrupted(session.id, 'prompt')

      await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: {
          getState: () => 'idle',
          executePrompt: async (_sessionId: string, _prompt: string, options?: { runtimeSeed?: { truthBoundary?: { continuationSafety?: string }; recoveryBoundary?: string; currentRole?: string; turn?: number } }) => {
            observations.push({
              contract: options?.runtimeSeed?.truthBoundary?.continuationSafety ?? 'missing',
              boundary: options?.runtimeSeed?.recoveryBoundary ?? 'missing',
              role: options?.runtimeSeed?.currentRole ?? 'missing',
              turn: options?.runtimeSeed?.turn ?? -1,
            })
            manager.markTurnActive(session.id)
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
                handoffReason: 'ready',
              },
            })
            manager.saveInterrupted(session.id, 'turn')
            return 'ok'
          },
        } as never,
        renderer: { renderLine() {} } as never,
      })

      await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: {
          getState: () => 'idle',
          executePrompt: async (_sessionId: string, _prompt: string, options?: { runtimeSeed?: { truthBoundary?: { continuationSafety?: string }; recoveryBoundary?: string; currentRole?: string; turn?: number } }) => {
            observations.push({
              contract: options?.runtimeSeed?.truthBoundary?.continuationSafety ?? 'missing',
              boundary: options?.runtimeSeed?.recoveryBoundary ?? 'missing',
              role: options?.runtimeSeed?.currentRole ?? 'missing',
              turn: options?.runtimeSeed?.turn ?? -1,
            })
            manager.appendQueryEvent(session.id, {
              type: 'turn.started',
              role: 'coder',
              turn: 2,
            })
            manager.saveInterrupted(session.id, 'turn')
            return 'ok'
          },
        } as never,
        renderer: { renderLine() {} } as never,
      })

      await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: {
          getState: () => 'idle',
          executePrompt: async (_sessionId: string, _prompt: string, options?: { runtimeSeed?: { truthBoundary?: { continuationSafety?: string }; recoveryBoundary?: string; currentRole?: string; turn?: number } }) => {
            observations.push({
              contract: options?.runtimeSeed?.truthBoundary?.continuationSafety ?? 'missing',
              boundary: options?.runtimeSeed?.recoveryBoundary ?? 'missing',
              role: options?.runtimeSeed?.currentRole ?? 'missing',
              turn: options?.runtimeSeed?.turn ?? -1,
            })
            return 'ok'
          },
        } as never,
        renderer: { renderLine() {} } as never,
      })

      expect(observations).toEqual([
        { contract: 'fresh-only', boundary: 'fresh-entry', role: 'planner', turn: 1 },
        { contract: 'completed-turn-only', boundary: 'completed-turn-reentry', role: 'coder', turn: 2 },
        { contract: 'mid-turn-safe', boundary: 'mid-turn-reentry', role: 'coder', turn: 2 },
      ])
    } finally {
      process.env.USERPROFILE = originalUserProfile
      process.env.HOME = originalHome
      fs.rmSync(fakeHome, { recursive: true, force: true })
    }
  })

  it('integrates interrupt recovery with pending lifecycle repair and stopped terminal durability', async () => {
    const originalUserProfile = process.env.USERPROFILE
    const originalHome = process.env.HOME
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-cross-interrupt-runtime-'))
    process.env.USERPROFILE = fakeHome
    process.env.HOME = fakeHome

    try {
      const manager = new SessionManager()
      const session = manager.createNew()
      const transcriptPath = path.join(manager.getSessionDirPath(session.id), 'transcript.jsonl')

      manager.persistUserPromptBarrier(session.id, 'recover integrated prompt')
      manager.markTurnActive(session.id)
      manager.appendQueryEvent(session.id, {
        type: 'turn.started',
        role: 'planner',
        turn: 1,
      })
      manager.appendQueryEvent(session.id, {
        type: 'approval.requested',
        toolName: 'bash',
        taskId: 'task_integrated_approval',
      })
      manager.appendQueryEvent(session.id, {
        type: 'tool.started',
        toolName: 'read',
        taskId: 'task_integrated_tool',
      })
      manager.saveInterrupted(session.id, 'turn')

      const transcriptEvents = manager
        .getTranscriptEvents(session.id)
        .filter(event => !(event.type === 'lifecycle' && event.event === 'run-interrupted'))
      fs.writeFileSync(
        transcriptPath,
        `${transcriptEvents.map(event => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      )

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
              terminalClassification: 'stopped',
              lastContinuationReason: 'retryable-error',
              stopReason: 'Retry budget exhausted',
              transcript: [],
              sharedContext: { sessionId: session.id, initialPrompt: 'recover integrated prompt', notes: [], handoffs: [] },
              finalOutput: 'partial recovery output',
            },
          }
        },
      })

      const result = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: runtime,
        renderer: { renderLine() {} } as never,
      })

      expect(result).toEqual({ resumed: true })
      expect(capturedRuntimeSeed).toBeDefined()
      expect(capturedRuntimeSeed?.recoveryBoundary).toBe('mid-turn-reentry')
      expect(capturedRuntimeSeed?.truthBoundary.repairSummary.insertedRunInterrupted).toBe(true)
      expect(capturedRuntimeSeed?.pendingLifecycle.pendingApprovals).toEqual({})
      expect(capturedRuntimeSeed?.pendingLifecycle.pendingTools).toEqual({})
      expect(capturedRuntimeSeed?.pendingLifecycle.taskStates.task_integrated_approval).toMatchObject({
        lastEvent: 'approval.resolved',
        compensated: true,
        outcome: 'denied',
      })
      expect(capturedRuntimeSeed?.pendingLifecycle.taskStates.task_integrated_tool).toMatchObject({
        lastEvent: 'tool.result',
        compensated: true,
        success: false,
      })

      const state = JSON.parse(
        fs.readFileSync(path.join(manager.getSessionDirPath(session.id), 'state.json'), 'utf8'),
      ) as {
        status: string
        terminalReason?: string
        terminalClassification?: string
        lastError?: string
      }
      expect(state.status).toBe('error')
      expect(state.terminalReason).toBe('stopped_error')
      expect(state.terminalClassification).toBe('stopped')
      expect(state.lastError).toBeUndefined()

      const snapshot = manager.getRecoverySnapshot(session.id)
      expect(snapshot.pendingLifecycle.pendingApprovals).toEqual({})
      expect(snapshot.pendingLifecycle.pendingTools).toEqual({})
      expect(snapshot.terminalClassification).toBe('stopped')
    } finally {
      process.env.USERPROFILE = originalUserProfile
      process.env.HOME = originalHome
      fs.rmSync(fakeHome, { recursive: true, force: true })
    }
  })

  it('reuses direct approval resolution during recovery without appending compensated denial', async () => {
    const originalUserProfile = process.env.USERPROFILE
    const originalHome = process.env.HOME
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-approval-drift-recovery-'))
    process.env.USERPROFILE = fakeHome
    process.env.HOME = fakeHome

    try {
      const manager = new SessionManager()
      const session = manager.createNew()
      const transcriptPath = path.join(manager.getSessionDirPath(session.id), 'transcript.jsonl')
      const taskId = 'task_direct_approval'

      manager.persistUserPromptBarrier(session.id, 'approval recovery prompt')
      manager.markTurnActive(session.id)
      manager.appendQueryEvent(session.id, {
        type: 'turn.started',
        role: 'planner',
        turn: 1,
      })
      manager.appendQueryEvent(session.id, {
        type: 'approval.requested',
        toolName: 'bash',
        taskId,
      })
      manager.saveInterrupted(session.id, 'turn')

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

      let capturedRuntimeSeed: Awaited<ReturnType<SessionManager['buildRuntimeStateSeed']>> | undefined
      const runtime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (_prompt, _signal, runtimeSeed) {
          capturedRuntimeSeed = runtimeSeed
          yield {
            type: 'query.completed',
            result: {
              status: 'completed',
              terminalReason: 'completed',
              terminalClassification: 'success',
              transcript: [],
              sharedContext: { sessionId: session.id, initialPrompt: 'approval recovery prompt', notes: [], handoffs: [] },
              finalOutput: 'approval recovered',
            },
          }
        },
      })

      const result = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: runtime,
        renderer: { renderLine() {} } as never,
      })

      expect(result).toEqual({ resumed: true })
      expect(capturedRuntimeSeed?.pendingLifecycle.pendingApprovals).toEqual({})
      expect(capturedRuntimeSeed?.pendingLifecycle.taskStates[taskId]).toMatchObject({
        lastEvent: 'approval.resolved',
        outcome: 'approved',
        toolName: 'bash',
        taskId,
      })
      expect(capturedRuntimeSeed?.pendingLifecycle.taskStates[taskId]?.compensated).toBeUndefined()

      const transcriptEvents = manager.getTranscriptEvents(session.id)
      expect(transcriptEvents.filter(
        event => event.type === 'query-event' && event.event.type === 'approval.resolved' && event.event.taskId === taskId,
      )).toHaveLength(1)

      const snapshot = manager.getRecoverySnapshot(session.id)
      expect(snapshot.pendingLifecycle.pendingApprovals).toEqual({})
      expect(snapshot.pendingLifecycle.taskStates[taskId]).toMatchObject({
        lastEvent: 'approval.resolved',
        outcome: 'approved',
        taskId,
        toolName: 'bash',
      })
    } finally {
      process.env.USERPROFILE = originalUserProfile
      process.env.HOME = originalHome
      fs.rmSync(fakeHome, { recursive: true, force: true })
    }
  })

  it('reconciles approval drift before prompt-level resume when transcript already contains direct resolution', async () => {
    const originalUserProfile = process.env.USERPROFILE
    const originalHome = process.env.HOME
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-approval-prompt-recovery-'))
    process.env.USERPROFILE = fakeHome
    process.env.HOME = fakeHome

    try {
      const manager = new SessionManager()
      const session = manager.createNew()
      const transcriptPath = path.join(manager.getSessionDirPath(session.id), 'transcript.jsonl')
      const taskId = 'task_prompt_approval'

      manager.persistUserPromptBarrier(session.id, 'approval prompt resume')
      manager.appendQueryEvent(session.id, {
        type: 'approval.requested',
        toolName: 'bash',
        taskId,
      })
      manager.saveInterrupted(session.id, 'prompt')

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

      let capturedRuntimeSeed: Awaited<ReturnType<SessionManager['buildRuntimeStateSeed']>> | undefined
      const runtime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (_prompt, _signal, runtimeSeed) {
          capturedRuntimeSeed = runtimeSeed
          yield {
            type: 'query.completed',
            result: {
              status: 'completed',
              terminalReason: 'completed',
              terminalClassification: 'success',
              transcript: [],
              sharedContext: { sessionId: session.id, initialPrompt: 'approval prompt resume', notes: [], handoffs: [] },
              finalOutput: 'approval prompt recovered',
            },
          }
        },
      })

      const result = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: runtime,
        renderer: { renderLine() {} } as never,
      })

      expect(result).toEqual({ resumed: true })
      expect(capturedRuntimeSeed?.pendingLifecycle.pendingApprovals).toEqual({})
      expect(capturedRuntimeSeed?.pendingLifecycle.taskStates[taskId]).toMatchObject({
        lastEvent: 'approval.resolved',
        outcome: 'approved',
        taskId,
        toolName: 'bash',
      })
      expect(capturedRuntimeSeed?.pendingLifecycle.taskStates[taskId]?.compensated).toBeUndefined()

      const transcriptEvents = manager.getTranscriptEvents(session.id)
      expect(transcriptEvents.filter(
        event => event.type === 'query-event' && event.event.type === 'approval.resolved' && event.event.taskId === taskId,
      )).toHaveLength(1)

      const snapshot = manager.getRecoverySnapshot(session.id)
      expect(snapshot.pendingLifecycle.pendingApprovals).toEqual({})
    } finally {
      process.env.USERPROFILE = originalUserProfile
      process.env.HOME = originalHome
      fs.rmSync(fakeHome, { recursive: true, force: true })
    }
  })

  it('keeps replay plan, runtime seed, cleanup semantics, and stopped terminal state aligned across prompt recovery', async () => {
    const originalUserProfile = process.env.USERPROFILE
    const originalHome = process.env.HOME
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-recovery-bundle-audit-'))
    process.env.USERPROFILE = fakeHome
    process.env.HOME = fakeHome

    try {
      const manager = new SessionManager()
      const session = manager.createNew()
      const sessionDir = manager.getSessionDirPath(session.id)
      const transcriptPath = path.join(sessionDir, 'transcript.jsonl')
      const statePath = path.join(sessionDir, 'state.json')

      manager.persistUserPromptBarrier(session.id, 'bundle audit prompt')
      manager.appendQueryEvent(session.id, {
        type: 'approval.requested',
        toolName: 'bash',
        taskId: 'task_bundle_approval',
      })
      manager.appendQueryEvent(session.id, {
        type: 'approval.resolved',
        toolName: 'bash',
        taskId: 'task_bundle_approval',
        outcome: 'approved',
      })
      manager.appendQueryEvent(session.id, {
        type: 'tool.started',
        toolName: 'bash',
        taskId: 'task_bundle_direct_tool',
      })
      manager.appendQueryEvent(session.id, {
        type: 'tool.result',
        toolName: 'bash',
        taskId: 'task_bundle_direct_tool',
        success: true,
      })
      manager.appendQueryEvent(session.id, {
        type: 'tool.started',
        toolName: 'read',
        taskId: 'task_bundle_orphan_tool',
      })
      manager.saveInterrupted(session.id, 'prompt')

      const transcriptWithoutInterrupted = manager.getTranscriptEvents(session.id).filter(
        event => !(event.type === 'lifecycle' && event.event === 'run-interrupted'),
      )
      fs.writeFileSync(
        transcriptPath,
        `${transcriptWithoutInterrupted.map(event => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      )

      const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
        status: string
        pendingPrompt?: string
        runPhase?: string
        interruptedKind?: string
        pendingLifecycle?: {
          pendingApprovals: Record<string, { taskId: string; toolName: string }>
          pendingTools: Record<string, { taskId: string; toolName: string }>
          taskStates: Record<string, unknown>
        }
      }
      state.pendingLifecycle = {
        pendingApprovals: {
          task_bundle_approval: { taskId: 'task_bundle_approval', toolName: 'bash' },
        },
        pendingTools: {
          task_bundle_direct_tool: { taskId: 'task_bundle_direct_tool', toolName: 'bash' },
          task_bundle_orphan_tool: { taskId: 'task_bundle_orphan_tool', toolName: 'read' },
        },
        taskStates: {},
      }
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8')

      const replayPlan = manager.getReplayPlan(session.id)
      expect(replayPlan.repairSummary.insertedRunInterrupted).toBe(true)
      expect(replayPlan.repairSummary.insertedPromptMessage).toBe(false)
      expect(replayPlan.replayMessages).toHaveLength(1)
      expect(replayPlan.replayMessages[0]).toMatchObject({ role: 'user', content: 'bundle audit prompt' })

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
              terminalClassification: 'stopped',
              lastContinuationReason: 'retryable-error',
              stopReason: 'Bundle audit stop',
              transcript: [],
              sharedContext: { sessionId: session.id, initialPrompt: 'bundle audit prompt', notes: [], handoffs: [] },
              finalOutput: 'partial bundle output',
            },
          }
        },
      })

      const result = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: runtime,
        renderer: { renderLine() {} } as never,
      })

      expect(result).toEqual({ resumed: true })
      expect(capturedRuntimeSeed?.recoveryBoundary).toBe('fresh-entry')
      expect(capturedRuntimeSeed?.truthBoundary.repairSummary.insertedRunInterrupted).toBe(true)
      expect(capturedRuntimeSeed?.pendingLifecycle.pendingApprovals).toEqual({})
      expect(capturedRuntimeSeed?.pendingLifecycle.pendingTools).toEqual({})
      expect(capturedRuntimeSeed?.pendingLifecycle.taskStates.task_bundle_approval).toMatchObject({
        lastEvent: 'approval.resolved',
        outcome: 'approved',
        taskId: 'task_bundle_approval',
        toolName: 'bash',
      })
      expect(capturedRuntimeSeed?.pendingLifecycle.taskStates.task_bundle_approval?.compensated).toBeUndefined()
      expect(capturedRuntimeSeed?.pendingLifecycle.taskStates.task_bundle_direct_tool).toMatchObject({
        lastEvent: 'tool.result',
        success: true,
        taskId: 'task_bundle_direct_tool',
        toolName: 'bash',
      })
      expect(capturedRuntimeSeed?.pendingLifecycle.taskStates.task_bundle_direct_tool?.compensated).toBeUndefined()
      expect(capturedRuntimeSeed?.pendingLifecycle.taskStates.task_bundle_orphan_tool).toMatchObject({
        lastEvent: 'tool.result',
        success: false,
        compensated: true,
        taskId: 'task_bundle_orphan_tool',
        toolName: 'read',
      })

      const transcript = manager.getTranscriptEvents(session.id)
      expect(transcript.filter(event => event.type === 'lifecycle' && event.event === 'run-started')).toHaveLength(1)
      expect(transcript.filter(
        event => event.type === 'message' && event.role === 'user' && event.content === 'bundle audit prompt',
      )).toHaveLength(1)
      expect(transcript.filter(
        event => event.type === 'query-event' && event.event.type === 'approval.resolved' && event.event.taskId === 'task_bundle_approval',
      )).toHaveLength(1)
      expect(transcript.filter(
        event => event.type === 'query-event' && event.event.type === 'tool.result' && event.event.taskId === 'task_bundle_direct_tool',
      )).toHaveLength(1)
      expect(transcript.filter(
        event => event.type === 'query-event' && event.event.type === 'tool.result' && event.event.taskId === 'task_bundle_orphan_tool',
      )).toHaveLength(1)

      const finalState = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
        status: string
        terminalReason?: string
        terminalClassification?: string
        lastError?: string
      }
      expect(finalState.status).toBe('error')
      expect(finalState.terminalReason).toBe('stopped_error')
      expect(finalState.terminalClassification).toBe('stopped')
      expect(finalState.lastError).toBeUndefined()

      const snapshot = manager.getRecoverySnapshot(session.id)
      expect(snapshot.pendingLifecycle).toEqual(capturedRuntimeSeed?.pendingLifecycle)
      expect(snapshot.terminalClassification).toBe('stopped')
      expect(snapshot.lastContinuationReason).toBe('retryable-error')
    } finally {
      process.env.USERPROFILE = originalUserProfile
      process.env.HOME = originalHome
      fs.rmSync(fakeHome, { recursive: true, force: true })
    }
  })

  it('keeps replay plan, runtime seed, cleanup semantics, and true-error terminal state aligned across prompt recovery', async () => {
    const originalUserProfile = process.env.USERPROFILE
    const originalHome = process.env.HOME
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-recovery-error-audit-'))
    process.env.USERPROFILE = fakeHome
    process.env.HOME = fakeHome

    try {
      const manager = new SessionManager()
      const session = manager.createNew()
      const sessionDir = manager.getSessionDirPath(session.id)
      const transcriptPath = path.join(sessionDir, 'transcript.jsonl')
      const statePath = path.join(sessionDir, 'state.json')

      manager.persistUserPromptBarrier(session.id, 'bundle error prompt')
      manager.appendQueryEvent(session.id, {
        type: 'approval.requested',
        toolName: 'bash',
        taskId: 'task_error_approval',
      })
      manager.appendQueryEvent(session.id, {
        type: 'approval.resolved',
        toolName: 'bash',
        taskId: 'task_error_approval',
        outcome: 'approved',
      })
      manager.appendQueryEvent(session.id, {
        type: 'tool.started',
        toolName: 'read',
        taskId: 'task_error_tool',
      })
      manager.saveInterrupted(session.id, 'prompt')

      const transcriptWithoutInterrupted = manager.getTranscriptEvents(session.id).filter(
        event => !(event.type === 'lifecycle' && event.event === 'run-interrupted'),
      )
      fs.writeFileSync(
        transcriptPath,
        `${transcriptWithoutInterrupted.map(event => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      )

      const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
        pendingLifecycle?: {
          pendingApprovals: Record<string, { taskId: string; toolName: string }>
          pendingTools: Record<string, { taskId: string; toolName: string }>
          taskStates: Record<string, unknown>
        }
      }
      state.pendingLifecycle = {
        pendingApprovals: {
          task_error_approval: { taskId: 'task_error_approval', toolName: 'bash' },
        },
        pendingTools: {
          task_error_tool: { taskId: 'task_error_tool', toolName: 'read' },
        },
        taskStates: {},
      }
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8')

      const replayPlan = manager.getReplayPlan(session.id)
      expect(replayPlan.repairSummary.insertedRunInterrupted).toBe(true)
      expect(replayPlan.replayMessages).toHaveLength(1)
      expect(replayPlan.replayMessages[0]).toMatchObject({ role: 'user', content: 'bundle error prompt' })

      let capturedRuntimeSeed: Awaited<ReturnType<SessionManager['buildRuntimeStateSeed']>> | undefined
      const runtime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (_prompt, _signal, runtimeSeed) {
          capturedRuntimeSeed = runtimeSeed
          yield {
            type: 'query.failed',
            error: 'daemon exploded',
          }
        },
      })

      const result = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: runtime,
        renderer: { renderLine() {} } as never,
      })

      expect(result).toEqual({ resumed: true })

      expect(capturedRuntimeSeed?.recoveryBoundary).toBe('fresh-entry')
      expect(capturedRuntimeSeed?.truthBoundary.repairSummary.insertedRunInterrupted).toBe(true)
      expect(capturedRuntimeSeed?.truthBoundary.repairSummary.strippedInterruptedTerminalEvents).toBe(replayPlan.repairSummary.strippedInterruptedTerminalEvents)
      expect(capturedRuntimeSeed?.pendingLifecycle.pendingApprovals).toEqual({})
      expect(capturedRuntimeSeed?.pendingLifecycle.pendingTools).toEqual({})
      expect(capturedRuntimeSeed?.pendingLifecycle.taskStates.task_error_approval).toMatchObject({
        lastEvent: 'approval.resolved',
        outcome: 'approved',
        taskId: 'task_error_approval',
      })
      expect(capturedRuntimeSeed?.pendingLifecycle.taskStates.task_error_tool).toMatchObject({
        lastEvent: 'tool.result',
        success: false,
        compensated: true,
        taskId: 'task_error_tool',
      })

      const finalState = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
        status: string
        terminalReason?: string
        terminalClassification?: string
        lastError?: string
      }
      expect(finalState.status).toBe('error')
      expect(finalState.terminalReason).toBe('stopped_error')
      expect(finalState.terminalClassification).toBe('error')
      expect(finalState.lastError).toBe('daemon exploded')

      const snapshot = manager.getRecoverySnapshot(session.id)
      expect(snapshot.pendingLifecycle).toEqual(capturedRuntimeSeed?.pendingLifecycle)
      expect(snapshot.terminalClassification).toBe('error')
      expect(snapshot.lastContinuationReason).toBeUndefined()

      const transcript = manager.getTranscriptEvents(session.id)
      expect(transcript.filter(event => event.type === 'lifecycle' && event.event === 'run-started')).toHaveLength(1)
      expect(transcript.filter(
        event => event.type === 'message' && event.role === 'user' && event.content === 'bundle error prompt',
      )).toHaveLength(1)
      expect(transcript.filter(
        event => event.type === 'query-event' && event.event.type === 'approval.resolved' && event.event.taskId === 'task_error_approval',
      )).toHaveLength(1)
      expect(transcript.filter(
        event => event.type === 'query-event' && event.event.type === 'tool.result' && event.event.taskId === 'task_error_tool',
      )).toHaveLength(1)
    } finally {
      process.env.USERPROFILE = originalUserProfile
      process.env.HOME = originalHome
      fs.rmSync(fakeHome, { recursive: true, force: true })
    }
  })
})
