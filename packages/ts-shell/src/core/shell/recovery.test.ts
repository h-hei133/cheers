import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SessionManager } from '../../session/SessionManager.js'
import type { ShellRuntimeContext } from './runtimeContext.js'
import { resumeShellSession } from './recovery.js'

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
            policyEvidence: {
              hasOpenTurn: true,
              hasPairedTurns: false,
              hasPendingLifecycle: false,
              hasRepairDrift: false,
            },
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
        insertedRunInterrupted: false,
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
            policyEvidence: {
              hasOpenTurn: true,
              hasPairedTurns: false,
              hasPendingLifecycle: false,
              hasRepairDrift: true,
            },
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
})
