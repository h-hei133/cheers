import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentRunner } from '../../orchestration/types.js'
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

describe('shell recovery read-model priority', () => {
  it('keeps transcript truth ahead of stale compacted hints when recovery falls back to fresh-entry', async () => {
    const originalUserProfile = process.env.USERPROFILE
    const originalHome = process.env.HOME
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-read-model-priority-'))
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
          JSON.stringify({
            type: 'lifecycle',
            event: 'run-started',
            timestamp: '2026-01-01T00:00:00.000Z',
            detail: 'priority repair prompt',
          }),
          JSON.stringify({
            type: 'query-event',
            event: { type: 'turn.started', role: 'planner', turn: 1 },
            timestamp: '2026-01-01T00:00:01.000Z',
          }),
          JSON.stringify({
            type: 'query-event',
            event: {
              type: 'turn.completed',
              output: {
                role: 'planner',
                content: 'valid plan before drift',
                handoffTo: 'coder',
                handoffReason: 'valid-handoff',
                notes: ['valid-note'],
              },
            },
            timestamp: '2026-01-01T00:00:01.500Z',
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
              output: {
                role: 'reviewer',
                content: 'stale compacted reviewer output',
                handoffTo: 'coder',
                handoffReason: 'stale-handoff',
                notes: ['stale-note'],
              },
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
          pendingPrompt: 'priority repair prompt',
          runPhase: 'turn-active',
          interruptedKind: 'turn',
          pendingLifecycle: {
            pendingApprovals: {},
            pendingTools: {},
            taskStates: {},
          },
        }, null, 2),
        'utf8',
      )

      const seenTurns: string[] = []
      const runAgent: AgentRunner = async ({ role, turn, transcript, sharedContext }) => {
        seenTurns.push(`${role}:${turn}:${transcript.length}:${sharedContext.notes.join(',')}:${sharedContext.handoffs.length}`)
        return {
          role,
          content: 'fresh-only-output',
        }
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

      const result = await resumeShellSession({
        requestedSessionId: session.id,
        sessionManager: manager,
        runtimeContext: createRuntimeContext(),
        sessionRuntime: runtime,
        renderer: { renderLine() {} } as never,
      })

      expect(result).toMatchObject({ resumed: true })
      if (!result.resumed || !result.autoResume) {
        throw new Error('Expected auto-resume payload')
      }
      await runtime.executePrompt(session.id, result.autoResume.prompt, {
        runtimeSeed: result.autoResume.runtimeSeed,
        continuityState: result.autoResume.continuityState,
      })
      expect(capturedRuntimeSeed?.recoveryBoundary).toBe('fresh-entry')
      expect(capturedRuntimeSeed?.truthBoundary.continuationSafety).toBe('fresh-only')
      expect(capturedRuntimeSeed?.truthBoundary.policyEvidence.has('repair-drift')).toBe(true)
      expect(capturedRuntimeSeed?.derivedState.transcript).toEqual([])
      expect(seenTurns).toEqual(['planner:1:0::0'])

      const transcriptEvents = manager.getTranscriptEvents(session.id)
      expect(transcriptEvents.filter(
        event => event.type === 'message' && event.role === 'assistant' && event.content === 'fresh-only-output',
      )).toHaveLength(1)

      const snapshot = manager.getRecoverySnapshot(session.id)
      expect(snapshot.repairSummary.ignoredDuplicateTurnStarts).toBe(0)
      expect(snapshot.repairSummary.ignoredRoleMismatchedTurnCompletions).toBe(0)
    } finally {
      process.env.USERPROFILE = originalUserProfile
      process.env.HOME = originalHome
      fs.rmSync(fakeHome, { recursive: true, force: true })
    }
  })
})
