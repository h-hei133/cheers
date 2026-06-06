import { describe, expect, it } from 'vitest'
import { createEmptyLifecycleIndex } from '../../tools/toolResultLifecycle.js'
import type { AgentRunner, CodingResultSummary } from '../../../orchestration/types.js'
import { buildResumeReplayInput } from '../../../session/replay/builder.js'
import type { QueryRuntimeTaskState } from './taskState.js'
import { QueryEngine } from './engine.js'

describe('core QueryEngine migration (W1)', () => {
  it('executes planner -> coder -> reviewer through the core query loop', async () => {
    const runAgent: AgentRunner = async ({ role, sharedContext }) => {
      if (role === 'planner') {
        return {
          role,
          content: 'plan',
          handoffTo: 'coder',
          handoffReason: 'plan-ready',
          notes: ['planner-note'],
        }
      }

      if (role === 'coder') {
        return {
          role,
          content: 'code',
          handoffTo: 'reviewer',
          handoffReason: 'code-ready',
          notes: [`coder-saw-${sharedContext.notes[0]}`],
        }
      }

      return {
        role,
        content: 'review-finished',
        notes: ['reviewer-note'],
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_w1', 'ship feature', {
      maxTurns: 6,
    })

    expect(result.status).toBe('completed')
    expect(result.terminalReason).toBe('completed')
    expect(result.terminalClassification).toBe('success')
    expect(result.transcript.map(turn => turn.role)).toEqual([
      'planner',
      'coder',
      'reviewer',
    ])
    expect(result.sharedContext.notes).toEqual([
      'planner-note',
      'coder-saw-planner-note',
      'reviewer-note',
    ])
    expect(result.finalOutput).toBe('review-finished')
  })

  it('exposes explicit terminal stop reasons for invalid handoff', async () => {
    const runAgent: AgentRunner = async ({ role }) => ({
      role,
      content: 'bad handoff',
      handoffTo: role === 'planner' ? 'reviewer' : undefined,
      handoffReason: 'skip coding',
    })

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_invalid', 'bad flow', {
      maxTurns: 4,
    })

    expect(result.status).toBe('stopped_invalid_handoff')
    expect(result.terminalReason).toBe('stopped_invalid_handoff')
    expect(result.terminalClassification).toBe('stopped')
    expect(result.stopReason).toContain('planner -> reviewer')
  })

  it('stops on repeated transition cycles', async () => {
    const runAgent: AgentRunner = async ({ role }) => {
      if (role === 'planner') {
        return {
          role,
          content: 'plan',
          handoffTo: 'coder',
          handoffReason: 'start',
        }
      }

      if (role === 'coder') {
        return {
          role,
          content: 'needs review',
          handoffTo: 'reviewer',
          handoffReason: 'review it',
        }
      }

      return {
        role,
        content: 'needs more work',
        handoffTo: 'coder',
        handoffReason: 'back to coding',
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_cycle', 'loop', {
      maxTurns: 10,
    })

    expect(result.status).toBe('stopped_cycle')
    expect(result.terminalReason).toBe('stopped_cycle')
    expect(result.terminalClassification).toBe('stopped')
    expect(result.stopReason).toContain('coder->reviewer')
  })

  it('allows reason-distinct progress but stops repeated same-reason long-run cycles', async () => {
    const reviewReasons = ['inspect contract', 'apply repair', 'inspect contract']
    const seenReasons: string[] = []
    const runAgent: AgentRunner = async ({ role, turn }) => {
      if (role === 'planner') {
        return {
          role,
          content: 'plan',
          handoffTo: 'coder',
          handoffReason: 'start',
        }
      }

      if (role === 'coder') {
        return {
          role,
          content: `code ${turn}`,
          handoffTo: 'reviewer',
          handoffReason: `code ${turn}`,
        }
      }

      const reason = reviewReasons.shift() ?? 'inspect contract'
      seenReasons.push(reason)
      return {
        role,
        content: `review ${turn}`,
        handoffTo: 'coder',
        handoffReason: reason,
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_reason_distinct_cycle', 'loop with different reasons', {
      maxTurns: 8,
    })

    expect(seenReasons).toEqual(['inspect contract', 'apply repair', 'inspect contract'])
    expect(result.status).toBe('stopped_cycle')
    expect(result.stopReason).toContain('reviewer->coder:inspect contract')
  })

  it('streams custom runtime events and compensates orphaned tool lifecycle before terminal completion', async () => {
    const runAgent: AgentRunner = async ({ role }) => ({
      role,
      content: 'done',
      events: [
        { type: 'mcp.snapshot', clients: 1, tools: 2 },
        { type: 'tool.started', toolName: 'read', taskId: 'task_1' },
        { type: 'approval.requested', toolName: 'bash', taskId: 'task_2' },
        { type: 'approval.resolved', toolName: 'bash', taskId: 'task_2', outcome: 'approved' },
        { type: 'tool.result', toolName: 'bash', taskId: 'task_2', success: true },
      ],
    })

    const engine = new QueryEngine({ runAgent })
    const events: string[] = []
    for await (const event of engine.streamMessage('sess_events', 'stream it')) {
      events.push(event.type)
    }

    expect(events).toEqual([
      'query.started',
      'runtime.next-action',
      'turn.started',
      'mcp.snapshot',
      'tool.started',
      'approval.requested',
      'approval.resolved',
      'tool.result',
      'tool.result',
      'message.delta',
      'runtime.task-proof',
      'turn.completed',
      'query.completed',
    ])
  })

  it('emits exactly one synthetic tool cleanup event and preserves direct tool results', async () => {
    const runAgent: AgentRunner = async ({ role }) => ({
      role,
      content: 'done',
      events: [
        { type: 'tool.started', toolName: 'read', taskId: 'task_cleanup' },
        { type: 'approval.requested', toolName: 'bash', taskId: 'task_direct' },
        { type: 'approval.resolved', toolName: 'bash', taskId: 'task_direct', outcome: 'approved' },
        { type: 'tool.result', toolName: 'bash', taskId: 'task_direct', success: true },
      ],
    })

    const engine = new QueryEngine({ runAgent })
    const timeline: string[] = []
    const syntheticToolResults: string[] = []
    const directToolResults: string[] = []

    for await (const event of engine.streamMessage('sess_tool_cleanup', 'cleanup it')) {
      timeline.push(event.type)
      if (event.type === 'tool.result') {
        const marker = `${event.toolName}:${event.taskId}:${event.success}:${event.compensated === true ? 'synthetic' : 'direct'}`
        if (event.compensated === true) {
          syntheticToolResults.push(marker)
        } else {
          directToolResults.push(marker)
        }
      }
    }

    expect(syntheticToolResults).toEqual(['read:task_cleanup:false:synthetic'])
    expect(directToolResults).toEqual(['bash:task_direct:true:direct'])
    expect(timeline.filter(type => type === 'tool.result')).toHaveLength(2)
    expect(timeline.indexOf('tool.result')).toBeLessThan(timeline.indexOf('turn.completed'))
    expect(timeline.indexOf('tool.result')).toBeLessThan(timeline.indexOf('query.completed'))
  })

  it('keeps direct approval/tool resolutions and orphaned synthetic cleanup exactly-once in one run', async () => {
    const runAgent: AgentRunner = async ({ role }) => ({
      role,
      content: 'done',
      events: [
        { type: 'approval.requested', toolName: 'bash', taskId: 'task_direct_approval' },
        { type: 'approval.resolved', toolName: 'bash', taskId: 'task_direct_approval', outcome: 'approved' },
        { type: 'tool.started', toolName: 'bash', taskId: 'task_direct_tool' },
        { type: 'tool.result', toolName: 'bash', taskId: 'task_direct_tool', success: true },
        { type: 'tool.started', toolName: 'read', taskId: 'task_orphan_tool' },
      ],
    })

    const engine = new QueryEngine({ runAgent })
    const approvalEvents: string[] = []
    const toolEvents: string[] = []
    const timeline: string[] = []

    for await (const event of engine.streamMessage('sess_bundle_cleanup', 'bundle cleanup')) {
      timeline.push(event.type)
      if (event.type === 'approval.resolved') {
        approvalEvents.push(`${event.toolName}:${event.taskId}:${event.outcome}:${event.compensated === true ? 'compensated' : 'direct'}`)
      }
      if (event.type === 'tool.result') {
        toolEvents.push(`${event.toolName}:${event.taskId}:${event.success}:${event.compensated === true ? 'compensated' : 'direct'}`)
      }
    }

    expect(approvalEvents).toEqual(['bash:task_direct_approval:approved:direct'])
    expect(toolEvents).toEqual([
      'bash:task_direct_tool:true:direct',
      'read:task_orphan_tool:false:compensated',
    ])
    expect(timeline.filter(type => type === 'approval.resolved')).toHaveLength(1)
    expect(timeline.filter(type => type === 'tool.result')).toHaveLength(2)
    expect(timeline.indexOf('approval.resolved')).toBeLessThan(timeline.indexOf('query.completed'))
    expect(timeline.indexOf('tool.result')).toBeLessThan(timeline.indexOf('query.completed'))
  })

  it('withholds retryable errors and continues the same turn before completing', async () => {
    let attempts = 0
    const runAgent: AgentRunner = async ({ role }) => {
      if (role === 'planner' && attempts === 0) {
        attempts += 1
        throw {
          message: 'temporary provider saturation',
          retryable: true,
          events: [
            { type: 'tool.started', toolName: 'read', taskId: 'task_retry' },
          ],
        }
      }

      if (role === 'planner') {
        return {
          role,
          content: 'plan after retry',
          handoffTo: 'coder',
          handoffReason: 'retry recovered',
        }
      }

      if (role === 'coder') {
        return {
          role,
          content: 'code',
          handoffTo: 'reviewer',
          handoffReason: 'ready',
        }
      }

      return {
        role,
        content: 'done',
      }
    }

    const engine = new QueryEngine({ runAgent })
    const events: string[] = []
    const compensatedEvents: string[] = []
    let resultStatus = ''
    let continuationReason = ''
    for await (const event of engine.streamMessage('sess_retry', 'retry it')) {
      events.push(event.type)
      if (event.type === 'tool.result' && event.compensated) {
        compensatedEvents.push(`${event.toolName}:${event.taskId}`)
      }
      if (event.type === 'query.completed') {
        resultStatus = event.result.status
        continuationReason = event.result.lastContinuationReason ?? ''
      }
    }

    expect(events).toContain('query.retrying')
    expect(compensatedEvents).toEqual(['read:task_retry'])
    expect(resultStatus).toBe('completed')
    expect(continuationReason).toBe('handoff')
  })

  it('terminates with stopped_error after retry budget is exhausted', async () => {
    const runAgent: AgentRunner = async () => {
      throw {
        message: 'persistent retryable failure',
        retryable: true,
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_retry_fail', 'retry until stop', {
      maxTurns: 3,
    })

    expect(result.status).toBe('stopped_error')
    expect(result.terminalReason).toBe('stopped_error')
    expect(result.terminalClassification).toBe('stopped')
    expect(result.stopReason).toContain('persistent retryable failure')
    expect(result.lastContinuationReason).toBe('retryable-error')
  })

  it('compensates orphaned approval requests on retryable failure paths', async () => {
    let attempts = 0
    const runAgent: AgentRunner = async ({ role }) => {
      if (role === 'planner' && attempts === 0) {
        attempts += 1
        throw {
          message: 'approval flow interrupted',
          retryable: true,
          events: [
            { type: 'approval.requested', toolName: 'bash', taskId: 'task_approval_retry' },
          ],
        }
      }

      if (role === 'planner') {
        return {
          role,
          content: 'plan',
          handoffTo: 'coder',
          handoffReason: 'retry recovered',
        }
      }

      if (role === 'coder') {
        return {
          role,
          content: 'code',
          handoffTo: 'reviewer',
          handoffReason: 'ready',
        }
      }

      return { role, content: 'done' }
    }

    const engine = new QueryEngine({ runAgent })
    const events: Array<string> = []
    for await (const event of engine.streamMessage('sess_approval_retry', 'retry approvals')) {
      if (event.type === 'approval.resolved') {
        events.push(`${event.type}:${event.toolName}:${event.taskId}:${event.outcome}:${event.compensated === true ? 'compensated' : 'direct'}`)
      }
    }

    expect(events).toContain('approval.resolved:bash:task_approval_retry:denied:compensated')
  })

  it('imports replay-built runtime seed instead of restarting from the first turn', async () => {
    const seenTurns: Array<string> = []
    const runAgent: AgentRunner = async ({ role, turn, transcript, sharedContext }) => {
      seenTurns.push(`${role}:${turn}:${transcript.length}:${sharedContext.notes.join(',')}`)

      if (role === 'coder') {
        return {
          role,
          content: 'code after resume',
          handoffTo: 'reviewer',
          handoffReason: 'resume-ready',
          notes: ['coder-note'],
        }
      }

      return {
        role,
        content: 'review complete',
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_seeded', 'ignored fresh prompt', {
      runtimeSeed: {
        config: {
          sessionId: 'sess_seeded',
          initialPrompt: 'recover feature',
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
            normalizedEventCount: 3,
            pairedTurnCount: 1,
            policyEvidence: new Set(['open-turn', 'paired-turns']),
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
          transcript: [
            {
              role: 'planner',
              content: 'plan',
              handoffTo: 'coder',
              handoffReason: 'plan-ready',
              notes: ['planner-note'],
            },
          ],
        },
      },
    })

    expect(seenTurns).toEqual([
      'coder:2:1:planner-note',
      'reviewer:3:2:planner-note,coder-note',
    ])
    expect(result.transcript.map(turn => turn.role)).toEqual(['planner', 'coder', 'reviewer'])
    expect(result.sharedContext.handoffs).toEqual([
      { from: 'planner', to: 'coder', reason: 'plan-ready', turn: 1 },
      { from: 'coder', to: 'reviewer', reason: 'resume-ready', turn: 2 },
    ])
  })

  it('uses replay-restored continuation proof facts for normal runtime targeted verification', async () => {
    const persistedOutput = {
      role: 'coder',
      content: 'continuation proof pending',
      codingResult: {
        ...codingResult({
          taskKind: 'write-file',
          changedFiles: ['reports/report.md'],
          evidenceFiles: ['src/report.ts'],
          verifiedFiles: [],
          requiredEvidence: ['report claim backed by source'],
          observedEvidence: [],
          verification: {
            status: 'not-requested',
            reason: 'pending continuation verification',
          },
        }),
        continuation: {
          status: 'failed-after-bounded-continuation',
          attempts: 1,
          evidence: ['pending artifact verification'],
        },
      },
    } as const
    const runtimeSeed = buildResumeReplayInput({
      sessionId: 'sess_replay_continuation_proof',
      snapshot: {
        pendingPrompt: 'continue report proof',
        runPhase: 'turn-active',
        interruptedKind: 'turn',
        pendingLifecycle: createEmptyLifecycleIndex(),
        repairSummary: {
          insertedPromptMessage: false,
          insertedQueryStarted: false,
          strippedInterruptedTerminalEvents: 0,
          insertedRunInterrupted: false,
          ignoredDuplicateTurnStarts: 0,
          ignoredUnpairedTurnCompletions: 0,
          ignoredRoleMismatchedTurnCompletions: 0,
        },
        lastUserMessage: {
          role: 'user',
          content: 'continue report proof',
          timestamp: '2026-05-13T00:00:00.000Z',
        },
        transcriptEvents: [
          {
            type: 'query-event',
            event: { type: 'turn.started', role: 'coder', turn: 1 },
            timestamp: '2026-05-13T00:00:01.000Z',
          },
          {
            type: 'query-event',
            event: { type: 'turn.completed', output: persistedOutput },
            timestamp: '2026-05-13T00:00:02.000Z',
          },
        ],
      },
      options: { maxTurns: 4 },
    })
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role }) => ({
      role,
      content: 'targeted verification passed',
      codingResult: codingResult({
        taskKind: 'write-file',
        changedFiles: ['reports/report.md'],
        evidenceFiles: ['src/report.ts'],
        verifiedFiles: ['reports/report.md', 'src/report.test.ts'],
        requiredEvidence: ['report claim backed by source'],
        observedEvidence: ['artifact-source:src/report.ts'],
        verification: { status: 'passed', reason: 'targeted report check passed' },
      }),
    })

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_replay_continuation_proof', 'ignored fresh prompt', {
      runtimeSeed,
    })
    for await (const event of engine.streamMessage('sess_replay_continuation_proof_stream', 'ignored fresh prompt', {
      runtimeSeed,
    })) {
      if (event.type === 'runtime.next-action') {
        seenActions.push(`${event.decision.nextAction}:${event.decision.changedFiles.join(',')}:${event.decision.verificationTargets.join(',')}:${event.decision.proofGap.join('|')}`)
      }
    }

    expect(runtimeSeed.observations?.pendingAction).toBe('continue')
    expect(seenActions[0]).toContain('continue:reports/report.md:reports/report.md')
    expect(seenActions[0]).toContain('pending continuation proof')
    expect(result.status).toBe('completed')
  })

  it('drops compacted transcript and derived context for fresh-only recovery seeds', async () => {
    const seenTurns: string[] = []
    const runAgent: AgentRunner = async ({ role, turn, transcript, sharedContext }) => {
      seenTurns.push(`${role}:${turn}:${transcript.length}:${sharedContext.notes.length}:${sharedContext.handoffs.length}`)
      return {
        role,
        content: 'fresh-only-output',
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_fresh_only_seed', 'fresh prompt', {
      runtimeSeed: {
        config: {
          sessionId: 'sess_fresh_only_seed',
          initialPrompt: 'fresh prompt',
          maxTurns: 6,
          startingRole: 'coder',
        },
        currentRole: 'coder',
        turn: 3,
        pendingLifecycle: { pendingApprovals: {}, pendingTools: {}, taskStates: {} },
        recoveryBoundary: 'fresh-entry',
        truthBoundary: {
          source: 'durable-replay',
          normalizedEventCount: 5,
          pairedTurnCount: 1,
          policyEvidence: new Set(['open-turn', 'repair-drift']),
          repairSummary: {
            insertedPromptMessage: true,
            insertedQueryStarted: true,
            strippedInterruptedTerminalEvents: 1,
            insertedRunInterrupted: true,
            ignoredDuplicateTurnStarts: 0,
            ignoredUnpairedTurnCompletions: 0,
            ignoredRoleMismatchedTurnCompletions: 0,
          },
          continuationSafety: 'fresh-only',
          openTurn: undefined,
        },
        derivedState: {
          transcript: [
            {
              role: 'planner',
              content: 'old plan',
              handoffTo: 'coder',
              handoffReason: 'stale-handoff',
              notes: ['stale-note'],
            },
          ],
        },
      },
    })

    expect(seenTurns).toEqual(['coder:3:0:0:0'])
    expect(result.sharedContext.notes).toEqual([])
    expect(result.sharedContext.handoffs).toEqual([])
    expect(result.transcript).toEqual([
      {
        role: 'coder',
        content: 'fresh-only-output',
      },
    ])
  })

  it('passes missing context runtime action to the normal agent runner', async () => {
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction }) => {
      seenActions.push(`${runtimeAction.nextAction}:${runtimeAction.selectedPaths.join(',')}`)
      return {
        role,
        content: 'context needed',
        handoffTo: 'coder',
        handoffReason: 'context gathered',
        codingResult: codingResult({
          evidenceFiles: ['src/owner.ts'],
          observedEvidence: ['owner context'],
          lastAction: { actionKind: 'repo-explain', target: 'src/owner.ts' },
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    await engine.submitMessage('sess_missing_context_action', 'inspect missing context for src/unknown.ts', {
      maxTurns: 2,
    })

    expect(seenActions[0]).toBe('search:')
    expect(seenActions).toContain('read:src/owner.ts')
  })

  it('resolves ambiguous owner discovery through search then read', async () => {
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}:${runtimeAction.selectedPaths.join(',')}`)
      if (turn === 1) {
        return {
          role,
          content: 'ambiguous owner narrowed',
          handoffTo: 'coder',
          handoffReason: 'read selected owner',
          codingResult: codingResult({
            evidenceFiles: ['src/runtime/owner.ts'],
            observedEvidence: ['owner context'],
            lastAction: { actionKind: 'repo-explain', target: 'src/runtime/owner.ts' },
          }),
        }
      }
      return { role, content: 'owner read selected' }
    }

    const engine = new QueryEngine({ runAgent })
    await engine.submitMessage('sess_hard_ambiguous_owner', 'inspect missing context for runtime owner', {
      maxTurns: 2,
    })

    expect(seenActions).toEqual([
      '1:search:',
      '2:read:src/runtime/owner.ts',
    ])
  })

  it('keeps explicit task path ahead of stale observed context paths', async () => {
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}:${runtimeAction.selectedPaths.join(',')}`)
      if (turn === 1) {
        return {
          role,
          content: 'found stale owner',
          handoffTo: 'coder',
          handoffReason: 'stale owner found',
          codingResult: codingResult({
            evidenceFiles: ['src/stale.ts'],
            observedEvidence: ['stale owner context'],
            lastAction: { actionKind: 'repo-explain', target: 'src/stale.ts' },
          }),
        }
      }
      return { role, content: 'explicit target selected' }
    }

    const engine = new QueryEngine({ runAgent })
    await engine.submitMessage('sess_explicit_path_precedence', 'inspect src/target.ts missing context', {
      maxTurns: 2,
    })

    expect(seenActions[1]).toContain('src/target.ts')
  })

  it('selects targeted verification for changed files before the next normal runtime turn', async () => {
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}:${runtimeAction.changedFiles.join(',')}`)
      if (turn === 1) {
        return {
          role,
          content: 'changed file',
          handoffTo: 'coder',
          handoffReason: 'needs verification',
          codingResult: codingResult({
            changedFiles: ['src/app.ts'],
            verification: { status: 'not-requested', reason: 'No check ran.' },
            requiredEvidence: ['post-change verification'],
            observedEvidence: [],
          }),
        }
      }
      return { role, content: 'verification selected' }
    }

    const engine = new QueryEngine({ runAgent })
    await engine.submitMessage('sess_changed_file_verify', 'edit src/app.ts', {
      maxTurns: 3,
    })

    expect(seenActions).toContain('2:verify:src/app.ts')
  })

  it('records edit observation into task proof before targeted verification', async () => {
    const proofStates: string[] = []
    const runAgent: AgentRunner = async ({ role, turn }) => {
      if (turn === 1) {
        return {
          role,
          content: 'changed file',
          handoffTo: 'coder',
          handoffReason: 'needs verification',
          codingResult: codingResult({
            changedFiles: ['src/edit-target.ts'],
            verification: { status: 'not-requested', reason: 'No check ran.' },
            requiredEvidence: ['post-change verification'],
            observedEvidence: [],
            lastAction: {
              actionKind: 'edit-file',
              changedFiles: ['src/edit-target.ts'],
              target: 'src/edit-target.ts',
            },
          }),
        }
      }
      return { role, content: 'verify selected' }
    }

    const engine = new QueryEngine({ runAgent })
    for await (const event of engine.streamMessage('sess_edit_observation_proof', 'edit src/edit-target.ts', { maxTurns: 2 })) {
      if (event.type === 'runtime.task-proof') {
        proofStates.push([
          event.turn,
          event.projection.action,
          event.projection.observationState.changedFileCount,
          event.projection.observationState.verificationTargetCount,
        ].join(':'))
      }
    }

    expect(proofStates).toContain('1:search:1:1')
  })

  it('uses verification failure observation to choose repair in the next normal runtime turn', async () => {
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}`)
      if (turn === 1) {
        return {
          role,
          content: 'verification failed',
          handoffTo: 'coder',
          handoffReason: 'repair needed',
          codingResult: codingResult({
            changedFiles: ['src/app.ts'],
            failedFiles: [{ path: 'src/app.ts', reason: 'verification failed' }],
            verification: { status: 'failed', reason: 'verification failed' },
            requiredEvidence: ['post-change verification'],
            observedEvidence: [],
          }),
        }
      }
      return { role, content: 'repair selected' }
    }

    const engine = new QueryEngine({ runAgent })
    await engine.submitMessage('sess_verify_failure_repair', 'debug src/app.ts verification failure', {
      maxTurns: 3,
    })

    expect(seenActions).toContain('2:repair')
  })

  it('switches repeated repair failure toward discovery instead of repeating repair', async () => {
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}`)
      if (turn === 1) {
        return {
          role,
          content: 'repair failed',
          handoffTo: 'coder',
          handoffReason: 'needs context',
          codingResult: codingResult({
            changedFiles: ['src/app.ts'],
            failedFiles: [{ path: 'src/app.ts', reason: 'missing context for repair' }],
            repair: { status: 'failed', attempts: 1, notes: ['missing context for repair'] },
            verification: { status: 'failed', reason: 'verification failed after repair' },
            requiredEvidence: ['post-repair verification'],
            observedEvidence: [],
          }),
        }
      }
      return { role, content: 'discovery selected' }
    }

    const engine = new QueryEngine({ runAgent })
    await engine.submitMessage('sess_repair_discovery', 'debug repair src/app.ts failure', {
      maxTurns: 3,
    })

    expect(seenActions).toContain('2:search')
  })

  it('changes strategy after repeated repair failure without explicit missing-context wording', async () => {
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}`)
      if (turn === 1) {
        return {
          role,
          content: 'repair failed with same patch',
          handoffTo: 'coder',
          handoffReason: 'needs different strategy',
          codingResult: codingResult({
            changedFiles: ['src/app.ts'],
            failedFiles: [{ path: 'src/app.ts', reason: 'patch still fails' }],
            repair: { status: 'failed', attempts: 1, notes: ['same repair failed'] },
            verification: { status: 'failed', reason: 'post-repair verification failed' },
            requiredEvidence: ['post-repair verification'],
            observedEvidence: [],
          }),
        }
      }
      return { role, content: 'new strategy selected' }
    }

    const engine = new QueryEngine({ runAgent })
    await engine.submitMessage('sess_repair_strategy_switch', 'debug repair src/app.ts failure', {
      maxTurns: 3,
    })

    expect(seenActions).toContain('2:search')
    expect(seenActions).not.toContain('2:repair')
  })

  it('uses recovered repair observation to rerun verification', async () => {
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}`)
      if (turn === 1) {
        return {
          role,
          content: 'repair recovered',
          handoffTo: 'coder',
          handoffReason: 'needs post repair verification',
          codingResult: codingResult({
            changedFiles: ['src/app.ts'],
            repair: { status: 'recovered', attempts: 1, recoveredItems: ['src/app.ts'] },
            verification: { status: 'not-requested', reason: 'Post repair check not run.' },
            requiredEvidence: ['post-repair verification'],
            observedEvidence: [],
          }),
        }
      }
      return { role, content: 'verify selected' }
    }

    const engine = new QueryEngine({ runAgent })
    await engine.submitMessage('sess_repair_reverify', 'debug repair src/app.ts', {
      maxTurns: 3,
    })

    expect(seenActions).toContain('2:verify')
  })

  it('stops repair completion when original failure proof is missing', async () => {
    const runAgent: AgentRunner = async ({ role }) => ({
      role,
      content: 'repair passed without original failure proof',
      codingResult: codingResult({
        taskKind: 'debug-repair',
        changedFiles: ['src/app.ts'],
        repair: { status: 'recovered', attempts: 1, recoveredItems: ['src/app.ts'] },
        verification: { status: 'passed', reason: 'Post repair verification passed.' },
        requiredEvidence: ['post-repair verification'],
        observedEvidence: ['post-repair verification'],
        lastAction: { actionKind: 'verify', target: 'src/app.ts' },
      }),
    })

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_repair_missing_original_failure', 'debug repair src/app.ts', {
      maxTurns: 2,
    })

    expect(result.status).toBe('stopped_not_proven')
    expect(result.terminalClassification).toBe('stopped')
    expect(result.stopReason).toContain('original-failure-preserved')
  })

  it('restores continuation pending action into normal runtime decision', async () => {
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction }) => {
      seenActions.push(runtimeAction.nextAction)
      return { role, content: 'continued' }
    }

    const engine = new QueryEngine({ runAgent })
    await engine.submitMessage('sess_pending_continue', 'resume pending verification', {
      runtimeSeed: {
        config: {
          sessionId: 'sess_pending_continue',
          initialPrompt: 'resume pending verification',
          maxTurns: 3,
          startingRole: 'coder',
        },
        currentRole: 'coder',
        turn: 1,
        lastContinuationReason: 'retryable-error',
        pendingLifecycle: {
          pendingApprovals: {},
          pendingTools: { task_pending: { toolName: 'verify', startedAt: 'now' } },
          taskStates: {},
        },
        recoveryBoundary: 'mid-turn-reentry',
        truthBoundary: {
          source: 'durable-replay',
          normalizedEventCount: 3,
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
          openTurn: { role: 'coder', turn: 1 },
        },
        derivedState: { transcript: [] },
      },
    })

    expect(seenActions[0]).toBe('continue')
  })

  it('selects artifact validation when artifact claims lack evidence', async () => {
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}:${runtimeAction.artifactRequired}`)
      if (turn === 1) {
        return {
          role,
          content: 'artifact incomplete',
          handoffTo: 'coder',
          handoffReason: 'validate artifact',
          codingResult: codingResult({
            verification: { status: 'not-requested', reason: 'Artifact was not checked.' },
            requiredEvidence: ['claim backed by source', 'claim backed by verification'],
            observedEvidence: ['claim backed by source'],
          }),
        }
      }
      return { role, content: 'artifact action selected' }
    }

    const engine = new QueryEngine({ runAgent })
    await engine.submitMessage('sess_artifact_action', 'produce artifact report', {
      maxTurns: 3,
    })

    expect(seenActions).toContain('2:artifact:true')
  })

  it('keeps duplicate artifact claim evidence as missing evidence', async () => {
    const artifactStates: string[] = []
    const runAgent: AgentRunner = async ({ role, turn }) => {
      if (turn === 1) {
        return {
          role,
          content: 'artifact with repeated evidence',
          codingResult: codingResult({
            taskKind: 'data-artifact',
            changedFiles: ['reports/summary.md'],
            evidenceFiles: ['notes/source.md'],
            verification: { status: 'passed', reason: 'Artifact format check passed.' },
            requiredEvidence: ['claim alpha', 'claim beta'],
            observedEvidence: ['claim-alpha-receipt', 'claim-alpha-receipt'],
          }),
        }
      }
      return { role, content: 'done' }
    }

    const engine = new QueryEngine({ runAgent })
    for await (const event of engine.streamMessage('sess_duplicate_artifact_evidence', 'produce artifact report')) {
      if (event.type === 'runtime.task-proof') {
        artifactStates.push([
          event.projection.artifactReceipt?.validationState,
          event.projection.artifactReceipt?.blockers.join('|'),
          event.projection.artifactReceipt?.claimEvidenceReceipts
            .map((receipt) => `${receipt.claim}=${receipt.proven}`)
            .join(','),
          event.projection.verdict.completeProof,
        ].join(':'))
      }
    }

    expect(artifactStates).toContain(
      'claim-evidence-missing:artifact claim evidence missing:claim alpha=true,claim beta=false:false',
    )
  })

  it('uses failed tool observation to select a safe next action without success claim', async () => {
    const seenActions: string[] = []
    const terminalSuccessClaims: boolean[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}`)
      if (turn === 1) {
        return {
          role,
          content: 'tool failed',
          handoffTo: 'coder',
          handoffReason: 'recover from tool failure',
          events: [
            { type: 'tool.started', toolName: 'verify', taskId: 'task_verify_failed' },
            { type: 'tool.result', toolName: 'verify', taskId: 'task_verify_failed', success: false },
          ],
          codingResult: codingResult({
            changedFiles: ['src/app.ts'],
            verification: { status: 'failed', reason: 'verification failed' },
            requiredEvidence: ['post-change verification'],
            observedEvidence: [],
          }),
        }
      }
      return { role, content: 'safe action selected' }
    }

    const engine = new QueryEngine({ runAgent })
    for await (const event of engine.streamMessage('sess_tool_failure_safe_action', 'debug src/app.ts verification failure', { maxTurns: 3 })) {
      if (event.type === 'runtime.next-action') {
        terminalSuccessClaims.push(event.decision.terminalSuccessClaim)
      }
    }

    expect(seenActions).toContain('2:repair')
    expect(terminalSuccessClaims.length).toBeGreaterThanOrEqual(2)
    expect(terminalSuccessClaims.every((claim) => claim === false)).toBe(true)
  })

  it('stops terminal success after failed tool output without task proof', async () => {
    const runAgent: AgentRunner = async ({ role }) => ({
      role,
      content: 'tool failed without proof',
      events: [
        { type: 'tool.started', toolName: 'verify', taskId: 'task_failed_tool' },
        { type: 'tool.result', toolName: 'verify', taskId: 'task_failed_tool', success: false },
      ],
    })

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_failed_tool_terminal', 'verify src/app.ts', {
      maxTurns: 1,
    })

    expect(result.status).toBe('stopped_not_proven')
    expect(result.terminalClassification).toBe('stopped')
    expect(result.stopReason).toContain('failed tool')
  })

  it('turns failed read feedback into renewed discovery before edit or terminal result', async () => {
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}`)
      if (turn === 1) {
        return {
          role,
          content: 'read failed before owner context',
          handoffTo: 'coder',
          handoffReason: 'recover context',
          events: [
            { type: 'tool.started', toolName: 'read', taskId: 'task_read_owner' },
            { type: 'tool.result', toolName: 'read', taskId: 'task_read_owner', success: false },
          ],
        }
      }
      return {
        role,
        content: 'renewed discovery selected',
        codingResult: codingResult({
          evidenceFiles: ['src/runtime/owner.ts'],
          observedEvidence: ['owner context'],
          lastAction: { actionKind: 'repo-explain', target: 'src/runtime/owner.ts' },
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    await engine.submitMessage('sess_failed_read_recovery', 'edit runtime owner after failed read', {
      maxTurns: 3,
    })

    expect(seenActions).toContain('2:search')
    expect(seenActions).not.toContain('2:edit')
  })

  it('recovers from failed edit with renewed discovery before another mutation', async () => {
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}`)
      if (turn === 1) {
        return {
          role,
          content: 'edit tool failed before mutation proof',
          handoffTo: 'coder',
          handoffReason: 'recover mutation target',
          events: [
            { type: 'tool.started', toolName: 'edit', taskId: 'task_edit_status' },
            { type: 'tool.result', toolName: 'edit', taskId: 'task_edit_status', success: false },
          ],
          codingResult: codingResult({
            verification: { status: 'not-requested', reason: 'Edit did not apply.' },
            requiredEvidence: ['mutation applied', 'targeted verification'],
            observedEvidence: [],
          }),
        }
      }
      return {
        role,
        content: 'renewed owner discovery selected',
        codingResult: codingResult({
          evidenceFiles: ['src/status.ts', 'src/status.test.ts'],
          observedEvidence: ['owner context'],
          lastAction: { actionKind: 'repo-explain', target: 'src/status.ts' },
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    await engine.submitMessage('sess_failed_edit_recovery', 'edit src/status.ts after failed mutation', {
      maxTurns: 3,
    })

    expect(seenActions).toContain('2:search')
    expect(seenActions).not.toContain('2:edit')
  })

  it('completes a multi-step mission through search read edit and verify observations', async () => {
    const seenActions: string[] = []
    const proofStates: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}`)
      if (turn === 1) {
        return {
          role,
          content: 'found owner',
          handoffTo: 'coder',
          handoffReason: 'owner found',
          codingResult: codingResult({
            evidenceFiles: ['src/app.ts'],
            observedEvidence: ['owner context'],
            lastAction: { actionKind: 'repo-explain', target: 'src/app.ts' },
          }),
        }
      }
      if (turn === 2) {
        return {
          role,
          content: 'read owner',
          handoffTo: 'reviewer',
          handoffReason: 'owner read',
          codingResult: codingResult({
            evidenceFiles: ['src/app.ts'],
            observedEvidence: ['owner content'],
            lastAction: { actionKind: 'read-file', target: 'src/app.ts' },
          }),
        }
      }
      if (turn === 3) {
        return {
          role,
          content: 'edited owner',
          handoffTo: 'coder',
          handoffReason: 'verify edit',
          codingResult: codingResult({
            changedFiles: ['src/app.ts'],
            verification: { status: 'not-requested', reason: 'No check ran.' },
            requiredEvidence: ['post-change verification'],
            observedEvidence: [],
            lastAction: {
              actionKind: 'edit-file',
              changedFiles: ['src/app.ts'],
              target: 'src/app.ts',
            },
          }),
        }
      }
      return {
        role,
        content: 'verified owner edit',
        codingResult: codingResult({
          changedFiles: ['src/app.ts'],
          verification: { status: 'passed', reason: 'Focused check passed.' },
          requiredEvidence: ['post-change verification'],
          observedEvidence: ['post-change verification'],
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    for await (const event of engine.streamMessage('sess_three_step_observation', 'edit src/app.ts after finding owner', { maxTurns: 5 })) {
      if (event.type === 'runtime.task-proof') {
        proofStates.push([
          event.turn,
          event.projection.observationState.contextPathCount,
          event.projection.observationState.changedFileCount,
          event.projection.observationState.verificationTargetCount,
          event.projection.verdict.status,
        ].join(':'))
      }
    }

    expect(seenActions).toEqual(['1:search', '2:read', '3:edit', '4:verify'])
    expect(proofStates).toContain('4:1:1:1:complete')
  })

  it('accounts for multi-file mission changes and verifies every changed target', async () => {
    const seenActions: string[] = []
    const proofStates: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}:${runtimeAction.changedFiles.join(',')}`)
      if (turn === 1) {
        return {
          role,
          content: 'found source and dependent owner',
          handoffTo: 'coder',
          handoffReason: 'owners found',
          codingResult: codingResult({
            evidenceFiles: ['src/source.ts', 'src/dependent.ts'],
            observedEvidence: ['owner context'],
            lastAction: { actionKind: 'repo-explain', target: 'src/source.ts' },
          }),
        }
      }
      if (turn === 2) {
        return {
          role,
          content: 'read source owner',
          handoffTo: 'reviewer',
          handoffReason: 'source read',
          codingResult: codingResult({
            evidenceFiles: ['src/source.ts', 'src/dependent.ts'],
            observedEvidence: ['owner content'],
            lastAction: { actionKind: 'read-file', target: 'src/dependent.ts' },
          }),
        }
      }
      if (turn === 3) {
        return {
          role,
          content: 'edited source and dependent target',
          handoffTo: 'coder',
          handoffReason: 'verify multi-file edit',
          codingResult: codingResult({
            changedFiles: ['src/source.ts', 'src/dependent.ts'],
            verification: { status: 'not-requested', reason: 'No multi-file check ran.' },
            requiredEvidence: ['multi-file verification'],
            observedEvidence: [],
            lastAction: {
              actionKind: 'edit-file',
              changedFiles: ['src/source.ts', 'src/dependent.ts'],
              target: 'src/source.ts',
            },
          }),
        }
      }
      return {
        role,
        content: 'verified source and dependent target',
        codingResult: codingResult({
          changedFiles: ['src/source.ts', 'src/dependent.ts'],
          verification: { status: 'passed', reason: 'Focused multi-file check passed.' },
          requiredEvidence: ['multi-file verification'],
          observedEvidence: ['multi-file verification'],
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    for await (const event of engine.streamMessage('sess_multi_file_mission', 'edit src/source.ts and dependent target', { maxTurns: 5 })) {
      if (event.type === 'runtime.task-proof') {
        proofStates.push([
          event.turn,
          event.projection.action,
          event.projection.changedFiles.join(','),
          event.projection.observationState.changedFileCount,
          event.projection.observationState.verificationTargetCount,
          event.projection.verdict.status,
        ].join(':'))
      }
    }

    expect(seenActions).toContain('4:verify:src/source.ts,src/dependent.ts')
    expect(proofStates).toContain('4:verify:src/source.ts,src/dependent.ts:2:2:complete')
  })

  it('selects impacted tests after source changes before claiming completion', async () => {
    const seenTargets: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenTargets.push(`${turn}:${runtimeAction.nextAction}:${runtimeAction.verificationTargets.join(',')}`)
      if (turn === 1) {
        return {
          role,
          content: 'status source changed; impacted test identified',
          handoffTo: 'coder',
          handoffReason: 'run impacted test',
          codingResult: codingResult({
            changedFiles: ['src/status.ts'],
            evidenceFiles: ['src/status.test.ts'],
            verification: { status: 'not-requested', reason: 'Impacted test not run.' },
            requiredEvidence: ['targeted verification'],
            observedEvidence: [],
            lastAction: {
              actionKind: 'edit-file',
              changedFiles: ['src/status.ts'],
              target: 'src/status.ts',
            },
          }),
        }
      }
      return {
        role,
        content: 'targeted verification complete',
        codingResult: codingResult({
          changedFiles: ['src/status.ts'],
          verification: {
            status: 'passed',
            reason: 'Impacted test passed.',
            command: 'npm test -- src/status.test.ts',
            selectionScope: 'focused',
            selectionSource: 'changed-file-impact',
          },
          verifiedFiles: ['src/status.test.ts', 'src/status.ts'],
          requiredEvidence: ['targeted verification'],
          observedEvidence: ['targeted verification'],
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_targeted_test_selection', 'change src/status.ts and run impacted tests', {
      maxTurns: 4,
    })

    expect(seenTargets).toContain('2:verify:src/status.test.ts,src/status.ts')
    expect(result.status).toBe('completed')
    expect(result.terminalClassification).toBe('success')
  })

  it('keeps partial changed-file verification not proven', async () => {
    const proofStates: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      if (turn === 1) {
        return {
          role,
          content: 'changed source and dependent target',
          handoffTo: 'coder',
          handoffReason: 'verify changed targets',
          codingResult: codingResult({
            changedFiles: ['src/source.ts', 'src/dependent.ts'],
            verification: { status: 'not-requested', reason: 'No check ran.' },
            requiredEvidence: ['post-change verification'],
            observedEvidence: [],
            lastAction: {
              actionKind: 'edit-file',
              changedFiles: ['src/source.ts', 'src/dependent.ts'],
              target: 'src/source.ts',
            },
          }),
        }
      }

      const partial = codingResult({
        changedFiles: ['src/source.ts', 'src/dependent.ts'],
        verification: { status: 'passed', reason: 'Only the source target was checked.' },
        requiredEvidence: ['post-change verification'],
        observedEvidence: ['post-change verification'],
      })
      return {
        role,
        content: 'partial verification complete',
        codingResult: {
          ...partial,
          verifiedFiles: ['src/source.ts'],
          unverifiedFiles: [{ path: 'src/dependent.ts', reason: 'Dependent target was not checked.' }],
        },
      }
    }

    const engine = new QueryEngine({ runAgent })
    for await (const event of engine.streamMessage('sess_hard_partial_verification', 'edit source and dependent target', { maxTurns: 3 })) {
      if (event.type === 'runtime.task-proof') {
        proofStates.push([
          event.turn,
          event.projection.action,
          event.projection.proof.status,
          event.projection.verdict.status,
          event.projection.verdict.completeProof,
          event.projection.proof.missingProof.join('|'),
          event.projection.proofGap.join('|'),
        ].join(':'))
      }
    }

    expect(proofStates).toContain(
      '2:verify:partial:partial:false:changed-file-verification-complete:verification target missing|missing proof: post-change verification|verification proof missing for changed files|verification proof missing for src/source.ts|verification proof missing for src/dependent.ts',
    )
  })

  it('continues a pending mission, reruns verification, and completes with proof', async () => {
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}`)
      return {
        role,
        content: 'resumed verification complete',
        codingResult: codingResult({
          changedFiles: ['src/resumed.ts'],
          verification: { status: 'passed', reason: 'Resumed verification passed.' },
          requiredEvidence: ['resumed verification'],
          observedEvidence: ['resumed verification'],
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_continue_complete', 'resume pending verification', {
      runtimeSeed: {
        config: {
          sessionId: 'sess_continue_complete',
          initialPrompt: 'resume pending verification',
          maxTurns: 3,
          startingRole: 'coder',
        },
        currentRole: 'coder',
        turn: 1,
        lastContinuationReason: 'retryable-error',
        pendingLifecycle: {
          pendingApprovals: {},
          pendingTools: { task_pending: { toolName: 'verify', startedAt: 'now' } },
          taskStates: {},
        },
        recoveryBoundary: 'mid-turn-reentry',
        truthBoundary: {
          source: 'durable-replay',
          normalizedEventCount: 3,
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
          openTurn: { role: 'coder', turn: 1 },
        },
        derivedState: { transcript: [] },
      },
    })

    expect(seenActions).toEqual(['1:continue'])
    expect(result.status).toBe('completed')
    expect(result.codingResult?.verifiedFiles).toEqual(['src/resumed.ts'])
    expect(result.terminalClassification).toBe('success')
  })

  it('keeps resumed changed files not proven until verification runs', async () => {
    const runAgent: AgentRunner = async ({ role }) => ({
      role,
      content: 'resumed edit without verification',
      codingResult: codingResult({
        changedFiles: ['src/resumed.ts'],
        verification: { status: 'not-requested', reason: 'Resumed verification did not run.' },
        requiredEvidence: ['resumed verification'],
        observedEvidence: [],
      }),
    })

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_continue_unverified_change', 'resume pending verification', {
      runtimeSeed: {
        config: {
          sessionId: 'sess_continue_unverified_change',
          initialPrompt: 'resume pending verification',
          maxTurns: 1,
          startingRole: 'coder',
        },
        currentRole: 'coder',
        turn: 1,
        lastContinuationReason: 'retryable-error',
        pendingLifecycle: {
          pendingApprovals: {},
          pendingTools: { task_pending: { toolName: 'verify', startedAt: 'now' } },
          taskStates: {},
        },
        recoveryBoundary: 'mid-turn-reentry',
        truthBoundary: {
          source: 'durable-replay',
          normalizedEventCount: 3,
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
          openTurn: { role: 'coder', turn: 1 },
        },
        derivedState: { transcript: [] },
      },
    })

    expect(result.status).toBe('stopped_not_proven')
    expect(result.terminalClassification).toBe('stopped')
    expect(result.stopReason).toContain('proof gap')
  })

  it('resumes pending artifact mission state before artifact correction', async () => {
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction }) => {
      seenActions.push(runtimeAction.nextAction)
      return {
        role,
        content: 'artifact continuation resumed',
        codingResult: codingResult({
          taskKind: 'data-artifact',
          changedFiles: ['reports/summary.md'],
          evidenceFiles: ['notes/source.md'],
          verification: { status: 'passed', reason: 'Pending artifact verification passed.' },
          requiredEvidence: ['artifact verification'],
          observedEvidence: ['artifact verification receipt'],
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_pending_artifact_continue', 'resume pending artifact report', {
      runtimeSeed: {
        config: {
          sessionId: 'sess_pending_artifact_continue',
          initialPrompt: 'resume pending artifact report',
          maxTurns: 3,
          startingRole: 'coder',
        },
        currentRole: 'coder',
        turn: 1,
        lastContinuationReason: 'retryable-error',
        pendingLifecycle: {
          pendingApprovals: {},
          pendingTools: { task_pending: { toolName: 'verify', startedAt: 'now' } },
          taskStates: {},
        },
        recoveryBoundary: 'mid-turn-reentry',
        truthBoundary: {
          source: 'durable-replay',
          normalizedEventCount: 3,
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
          openTurn: { role: 'coder', turn: 1 },
        },
        derivedState: { transcript: [] },
      },
    })

    expect(seenActions).toEqual(['continue'])
    expect(result.status).toBe('completed')
  })

  it('emits runtime next-action evidence without treating policy output as terminal success', async () => {
    const runAgent: AgentRunner = async ({ role }) => ({ role, content: 'done' })
    const engine = new QueryEngine({ runAgent })
    const decisions: string[] = []
    const terminalEvents: string[] = []

    for await (const event of engine.streamMessage('sess_next_action_event', 'inspect missing context')) {
      if (event.type === 'runtime.next-action') {
        decisions.push(`${event.turn}:${event.decision.nextAction}:${event.decision.terminalSuccessClaim}`)
      }
      if (event.type === 'query.completed') {
        terminalEvents.push(event.result.terminalClassification)
      }
    }

    expect(decisions[0]).toBe('1:search:false')
    expect(terminalEvents).toEqual(['success'])
  })

  it('emits normal runtime task proof and result verdict after targeted verification', async () => {
    const proofEvents: string[] = []
    const runAgent: AgentRunner = async ({ role, turn }) => {
      if (turn === 1) {
        return {
          role,
          content: 'changed file',
          handoffTo: 'coder',
          handoffReason: 'needs verification',
          codingResult: codingResult({
            changedFiles: ['src/app.ts'],
            verification: { status: 'not-requested', reason: 'No check ran.' },
            requiredEvidence: ['post-change verification'],
            observedEvidence: [],
          }),
        }
      }
      return {
        role,
        content: 'verified change',
        codingResult: codingResult({
          changedFiles: ['src/app.ts'],
          verification: { status: 'passed', reason: 'Focused check passed.' },
          requiredEvidence: ['post-change verification'],
          observedEvidence: ['post-change verification'],
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    for await (const event of engine.streamMessage('sess_runtime_task_proof', 'edit src/app.ts')) {
      if (event.type === 'runtime.task-proof') {
        proofEvents.push([
          event.turn,
          event.projection.action,
          event.projection.proof.status,
          event.projection.verdict.status,
          event.projection.verdict.completeProof,
          event.projection.terminalSuccessClaim,
        ].join(':'))
      }
    }

    expect(proofEvents).toContain('2:verify:complete:complete:true:false')
  })

  it('carries artifact claim-evidence gaps through normal runtime proof without success claim', async () => {
    const artifactStates: string[] = []
    const runAgent: AgentRunner = async ({ role, turn }) => {
      if (turn === 1) {
        return {
          role,
          content: 'artifact drafted',
          handoffTo: 'coder',
          handoffReason: 'validate artifact',
          codingResult: codingResult({
            taskKind: 'data-artifact',
            changedFiles: ['reports/summary.md'],
            evidenceFiles: ['notes/source.md'],
            verification: { status: 'not-requested', reason: 'Artifact was not checked.' },
            requiredEvidence: ['claim backed by source', 'claim backed by verification'],
            observedEvidence: ['claim backed by source'],
          }),
        }
      }
      return {
        role,
        content: 'artifact still missing claim evidence',
        codingResult: codingResult({
          taskKind: 'data-artifact',
          changedFiles: ['reports/summary.md'],
          evidenceFiles: ['notes/source.md'],
          verification: { status: 'passed', reason: 'Artifact format check passed.' },
          requiredEvidence: ['claim backed by source', 'claim backed by verification'],
          observedEvidence: ['claim backed by source'],
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    for await (const event of engine.streamMessage('sess_runtime_artifact_proof', 'produce artifact report')) {
      if (event.type === 'runtime.task-proof') {
        artifactStates.push([
          event.turn,
          event.projection.action,
          event.projection.artifactReceipt?.validationState,
          event.projection.artifactReceipt?.blockers.join('|'),
          event.projection.verdict.completeProof,
        ].join(':'))
      }
    }

    expect(artifactStates).toContain('2:artifact:claim-evidence-missing:artifact claim evidence missing:false')
  })

  it('validates artifact claims with cumulative evidence across mission turns', async () => {
    const artifactStates: string[] = []
    const claimCounts: string[] = []
    const runAgent: AgentRunner = async ({ role, turn }) => {
      if (turn === 1) {
        return {
          role,
          content: 'artifact drafted with source claim',
          handoffTo: 'coder',
          handoffReason: 'collect artifact verification evidence',
          codingResult: codingResult({
            taskKind: 'data-artifact',
            changedFiles: ['reports/summary.md'],
            evidenceFiles: ['notes/source.md'],
            verification: { status: 'not-requested', reason: 'Artifact verification not run.' },
            requiredEvidence: ['claim backed by source', 'claim backed by verification'],
            observedEvidence: ['notes/source.md'],
          }),
        }
      }
      return {
        role,
        content: 'artifact verification complete',
        codingResult: codingResult({
          taskKind: 'data-artifact',
          changedFiles: ['reports/summary.md'],
          evidenceFiles: ['notes/source.md'],
          verification: { status: 'passed', reason: 'Artifact verification passed.' },
          requiredEvidence: ['claim backed by verification'],
          observedEvidence: ['verification receipt'],
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    for await (const event of engine.streamMessage('sess_artifact_cumulative_claims', 'produce artifact report')) {
      if (event.type === 'runtime.task-proof') {
        artifactStates.push([
          event.turn,
          event.projection.action,
          event.projection.artifactReceipt?.validationState,
          event.projection.artifactReceipt?.blockers.join('|'),
          event.projection.verdict.completeProof,
        ].join(':'))
        claimCounts.push([
          event.turn,
          event.projection.artifactReceipt?.claimEvidenceReceipts.length ?? 0,
          event.projection.artifactReceipt?.claimEvidenceReceipts.filter((receipt) => receipt.proven).length ?? 0,
        ].join(':'))
      }
    }

    expect(claimCounts).toContain('2:2:2')
    expect(artifactStates).toContain('2:artifact:validation-passed::true')
  })

  it('stops artifact output when claim evidence is mismatched', async () => {
    const runAgent: AgentRunner = async ({ role }) => ({
      role,
      content: 'artifact with mismatched proof',
      codingResult: codingResult({
        taskKind: 'data-artifact',
        changedFiles: ['reports/summary.md'],
        evidenceFiles: ['notes/source.md'],
        verification: { status: 'passed', reason: 'Artifact format check passed.' },
        requiredEvidence: ['source covered', 'verification passed'],
        observedEvidence: ['artifact-check:source-coverage:passed', 'source-receipt'],
      }),
    })

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_artifact_mismatched_terminal', 'produce artifact report', {
      maxTurns: 2,
    })

    expect(result.status).toBe('stopped_not_proven')
    expect(result.terminalClassification).toBe('stopped')
    expect(result.stopReason).toContain('artifact claim evidence missing')
  })

  it('stops artifact completion when changed artifact output lacks verification proof', async () => {
    const runAgent: AgentRunner = async ({ role }) => {
      const artifact = codingResult({
        taskKind: 'data-artifact',
        changedFiles: ['reports/summary.md'],
        evidenceFiles: ['notes/source.md'],
        verification: { status: 'passed', reason: 'Only source receipts were checked.' },
        verifiedFiles: ['notes/source.md'],
        requiredEvidence: ['source covered', 'verification passed'],
        observedEvidence: ['notes/source.md', 'verification receipt'],
      })
      return {
        role,
        content: 'artifact proof without changed output verification',
        codingResult: {
          ...artifact,
          unverifiedFiles: [{ path: 'reports/summary.md', reason: 'Artifact output was not checked.' }],
        },
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_artifact_unverified_output', 'produce artifact report', {
      maxTurns: 2,
    })

    expect(result.status).toBe('stopped_not_proven')
    expect(result.terminalClassification).toBe('stopped')
    expect(result.stopReason).toContain('proof gap')
  })

  it('stops as not proven when proof gap remains and no safe budget remains', async () => {
    const runAgent: AgentRunner = async ({ role }) => ({
      role,
      content: 'unverified edit',
      handoffTo: role === 'planner' ? 'coder' : 'reviewer',
      handoffReason: 'needs verification',
      codingResult: codingResult({
        changedFiles: ['src/app.ts'],
        verification: { status: 'not-requested', reason: 'No verification.' },
        requiredEvidence: ['post-change verification'],
        observedEvidence: [],
      }),
    })

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_stop_not_proven', 'edit src/app.ts', {
      maxTurns: 2,
    })

    expect(result.status).toBe('stopped_not_proven')
    expect(result.terminalClassification).toBe('stopped')
    expect(result.stopReason).toContain('no safe action remains')
  })

  it('stops proof gap without terminal success', async () => {
    const runAgent: AgentRunner = async ({ role }) => ({
      role,
      content: 'unverified terminal edit',
      codingResult: codingResult({
        changedFiles: ['src/proof-gap.ts'],
        verification: { status: 'not-requested', reason: 'No verification.' },
        requiredEvidence: ['post-change verification'],
        observedEvidence: [],
      }),
    })

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_hard_proof_gap_stop', 'edit src/proof-gap.ts', {
      maxTurns: 2,
    })

    expect(result.status).toBe('stopped_not_proven')
    expect(result.terminalClassification).toBe('stopped')
    expect(result.stopReason).toContain('proof gap')
  })

  it('stops as not proven when a terminal turn still has a proof gap', async () => {
    const runAgent: AgentRunner = async ({ role }) => ({
      role,
      content: 'unverified terminal edit',
      codingResult: codingResult({
        changedFiles: ['src/app.ts'],
        verification: { status: 'not-requested', reason: 'No verification.' },
        requiredEvidence: ['post-change verification'],
        observedEvidence: [],
      }),
    })

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_terminal_gap_stop', 'edit src/app.ts', {
      maxTurns: 3,
    })

    expect(result.status).toBe('stopped_not_proven')
    expect(result.terminalClassification).toBe('stopped')
    expect(result.stopReason).toContain('proof gap')
  })

  it('stops as not proven when terminal change-set files lack verification proof', async () => {
    const runAgent: AgentRunner = async ({ role }) => {
      const result = codingResult({
        verification: { status: 'not-requested', reason: 'No verification.' },
        requiredEvidence: ['post-change verification'],
        observedEvidence: [],
      })
      return {
        role,
        content: 'unverified change-set edit',
        codingResult: {
          ...result,
          changeSet: {
            ...result.changeSet,
            changedFiles: ['src/change-set-only.ts'],
          },
        },
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_change_set_gap_stop', 'edit src/change-set-only.ts', {
      maxTurns: 3,
    })

    expect(result.status).toBe('stopped_not_proven')
    expect(result.terminalClassification).toBe('stopped')
    expect(result.stopReason).toContain('proof gap')
  })

  it('final real task trial repairs a dependent contract change before complete proof', async () => {
    const seenActions: string[] = []
    const proofStates: string[] = []
    const changedTargets = [
      'src/status/contract.ts',
      'src/status/model.ts',
      'src/status/render.ts',
      'src/status/render.test.ts',
    ]
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}:${runtimeAction.verificationTargets.join(',')}`)
      if (turn === 1) {
        return {
          role,
          content: 'located typed status contract owners',
          handoffTo: 'coder',
          handoffReason: 'read contract and consumers',
          codingResult: codingResult({
            evidenceFiles: changedTargets,
            observedEvidence: ['owner graph located'],
            lastAction: { actionKind: 'repo-explain', target: 'src/status/contract.ts' },
          }),
        }
      }
      if (turn === 2) {
        return {
          role,
          content: 'read dependent consumer and test',
          handoffTo: 'reviewer',
          handoffReason: 'edit contract graph',
          codingResult: codingResult({
            evidenceFiles: changedTargets,
            observedEvidence: ['contract consumer read'],
            lastAction: { actionKind: 'read-file', target: 'src/status/render.ts' },
          }),
        }
      }
      if (turn === 3) {
        return {
          role,
          content: 'changed contract implementation consumer and test',
          handoffTo: 'coder',
          handoffReason: 'verify dependent contract graph',
          codingResult: codingResult({
            changedFiles: changedTargets,
            verification: { status: 'not-requested', reason: 'Dependent contract check not run.' },
            requiredEvidence: ['dependent contract verification'],
            observedEvidence: [],
            lastAction: {
              actionKind: 'edit-file',
              changedFiles: changedTargets,
              target: 'src/status/contract.ts',
            },
          }),
        }
      }
      if (turn === 4) {
        return {
          role,
          content: 'focused dependent check failed in render consumer',
          handoffTo: 'reviewer',
          handoffReason: 'repair failed consumer',
          codingResult: codingResult({
            changedFiles: changedTargets,
            failedFiles: [{ path: 'src/status/render.ts', reason: 'consumer expected old contract shape' }],
            verifiedFiles: [
              'src/status/contract.ts',
              'src/status/model.ts',
              'src/status/render.test.ts',
            ],
            verification: {
              status: 'failed',
              reason: 'Consumer still expects the old contract shape.',
              command: 'npm test -- src/status/render.test.ts',
              selectionScope: 'focused',
              selectionSource: 'changed-file-impact',
            },
            requiredEvidence: ['dependent contract verification'],
            observedEvidence: [],
          }),
        }
      }
      if (turn === 5) {
        return {
          role,
          content: 'consumer repaired',
          handoffTo: 'coder',
          handoffReason: 'reverify repaired consumer',
          codingResult: codingResult({
            changedFiles: changedTargets,
            failedFiles: [{ path: 'src/status/render.ts', reason: 'consumer repair requires recheck' }],
            repair: { status: 'recovered', attempts: 1, recoveredItems: ['src/status/render.ts'] },
            verification: { status: 'not-requested', reason: 'Post-repair dependent check not run.' },
            requiredEvidence: ['dependent contract verification'],
            observedEvidence: [],
            lastAction: {
              actionKind: 'repair',
              changedFiles: ['src/status/render.ts'],
              target: 'src/status/render.ts',
            },
          }),
        }
      }
      return {
        role,
        content: 'dependent contract graph verified',
        codingResult: codingResult({
          changedFiles: changedTargets,
          repair: { status: 'recovered', attempts: 1, recoveredItems: ['src/status/render.ts'] },
          verification: {
            status: 'passed',
            reason: 'Focused dependent contract check passed after repair.',
            command: 'npm test -- src/status/render.test.ts',
            selectionScope: 'focused',
            selectionSource: 'changed-file-impact',
          },
          verifiedFiles: changedTargets,
          requiredEvidence: ['dependent contract verification'],
          observedEvidence: ['dependent contract verification'],
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    for await (const event of engine.streamMessage('sess_final_contract_repair', 'change status contract and update dependent renderer', {
      maxTurns: 7,
    })) {
      if (event.type === 'runtime.task-proof') {
        proofStates.push([
          event.turn,
          event.projection.action,
          event.projection.changedFiles.join(','),
          event.projection.verdict.status,
        ].join(':'))
      }
    }

    expect(seenActions).toContain('4:verify:src/status/contract.ts,src/status/model.ts,src/status/render.ts,src/status/render.test.ts')
    expect(seenActions.some((action) => action.startsWith('5:repair:') && action.includes('src/status/render.ts'))).toBe(true)
    expect(seenActions.some((action) => action.startsWith('6:verify:') && action.includes('src/status/render.ts'))).toBe(true)
    expect(proofStates).toContain('6:verify:src/status/contract.ts,src/status/model.ts,src/status/render.ts,src/status/render.test.ts:complete')
  })

  it('final real task trial rediscovers after stale tool failure and changes repair strategy', async () => {
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}:${runtimeAction.changedFiles.join(',')}:${runtimeAction.proofGap.join('|')}`)
      if (turn === 1) {
        return {
          role,
          content: 'stale owner read failed',
          handoffTo: 'coder',
          handoffReason: 'renew owner discovery',
          events: [
            { type: 'tool.started', toolName: 'read', taskId: 'task_read_stale' },
            { type: 'tool.result', toolName: 'read', taskId: 'task_read_stale', success: false },
          ],
          codingResult: codingResult({
            evidenceFiles: ['src/old/status.ts'],
            verification: { status: 'not-requested', reason: 'Read failed before safe mutation.' },
            requiredEvidence: ['fresh owner context', 'targeted verification'],
            observedEvidence: [],
          }),
        }
      }
      if (turn === 2) {
        return {
          role,
          content: 'fresh owners discovered',
          handoffTo: 'reviewer',
          handoffReason: 'read fresh owners',
          codingResult: codingResult({
            evidenceFiles: ['src/status/model.ts', 'src/status/model.test.ts'],
            observedEvidence: ['fresh owner context'],
            lastAction: { actionKind: 'repo-explain', target: 'src/status/model.ts' },
          }),
        }
      }
      if (turn === 3) {
        return {
          role,
          content: 'failed edit attempt on stale target',
          handoffTo: 'coder',
          handoffReason: 'recover before mutation',
          events: [
            { type: 'tool.started', toolName: 'edit', taskId: 'task_edit_stale' },
            { type: 'tool.result', toolName: 'edit', taskId: 'task_edit_stale', success: false },
          ],
          codingResult: codingResult({
            evidenceFiles: ['src/status/model.ts', 'src/status/model.test.ts'],
            verification: { status: 'not-requested', reason: 'Edit failed before mutation.' },
            requiredEvidence: ['fresh owner context', 'targeted verification'],
            observedEvidence: ['fresh owner context'],
          }),
        }
      }
      if (turn === 4) {
        return {
          role,
          content: 'updated model and test after recovery but focused verification failed',
          handoffTo: 'reviewer',
          handoffReason: 'repair status model',
          codingResult: codingResult({
            changedFiles: ['src/status/model.ts', 'src/status/model.test.ts'],
            failedFiles: [{ path: 'src/status/model.ts', reason: 'model edge case failed' }],
            verification: {
              status: 'failed',
              reason: 'Focused status model test failed.',
              command: 'npm test -- src/status/model.test.ts',
              selectionScope: 'focused',
              selectionSource: 'changed-file-impact',
            },
            requiredEvidence: ['targeted verification'],
            observedEvidence: [],
            lastAction: {
              actionKind: 'edit-file',
              changedFiles: ['src/status/model.ts', 'src/status/model.test.ts'],
              target: 'src/status/model.ts',
            },
          }),
        }
      }
      if (turn === 5) {
        return {
          role,
          content: 'repair failed because more owner context is needed',
          handoffTo: 'coder',
          handoffReason: 'change repair strategy',
          codingResult: codingResult({
            changedFiles: ['src/status/model.ts', 'src/status/model.test.ts'],
            failedFiles: [{ path: 'src/status/model.ts', reason: 'related formatter owner missing' }],
            repair: { status: 'failed', attempts: 1, notes: ['related formatter owner missing'] },
            verification: { status: 'failed', reason: 'Repair did not address formatter path.' },
            requiredEvidence: ['targeted verification'],
            observedEvidence: [],
          }),
        }
      }
      if (turn === 6) {
        return {
          role,
          content: 'missing formatter owner discovered',
          handoffTo: 'reviewer',
          handoffReason: 'repair with fresh formatter context',
          codingResult: codingResult({
            evidenceFiles: ['src/status/format.ts'],
            observedEvidence: ['formatter owner context'],
            lastAction: { actionKind: 'repo-explain', target: 'src/status/format.ts' },
          }),
        }
      }
      if (turn === 7) {
        return {
          role,
          content: 'status model repaired',
          handoffTo: 'coder',
          handoffReason: 'reverify repaired status model',
          codingResult: codingResult({
            changedFiles: ['src/status/model.ts', 'src/status/model.test.ts'],
            failedFiles: [{ path: 'src/status/model.ts', reason: 'recheck repaired model' }],
            repair: { status: 'recovered', attempts: 2, recoveredItems: ['src/status/model.ts'] },
            verification: { status: 'not-requested', reason: 'Post-repair focused check not run.' },
            requiredEvidence: ['targeted verification'],
            observedEvidence: [],
          }),
        }
      }
      return {
        role,
        content: 'focused status verification passed',
        codingResult: codingResult({
          changedFiles: ['src/status/model.ts', 'src/status/model.test.ts'],
          repair: { status: 'recovered', attempts: 2, recoveredItems: ['src/status/model.ts'] },
          verification: {
            status: 'passed',
            reason: 'Focused status model check passed.',
            command: 'npm test -- src/status/model.test.ts',
            selectionScope: 'focused',
            selectionSource: 'changed-file-impact',
          },
          verifiedFiles: ['src/status/model.ts', 'src/status/model.test.ts'],
          requiredEvidence: ['targeted verification'],
          observedEvidence: ['targeted verification'],
          lastAction: { actionKind: 'verify', target: 'src/status/model.test.ts' },
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_final_stale_tool_repair', 'fix ambiguous status model after stale tool failure', {
      maxTurns: 11,
    })

    expect(seenActions[0]?.startsWith('1:search:')).toBe(true)
    expect(seenActions[1]?.startsWith('2:search:')).toBe(true)
    expect(seenActions.some((action) => action.startsWith('4:search:'))).toBe(true)
    expect(seenActions.some((action) => action.startsWith('5:repair:') && action.includes('src/status/model.ts'))).toBe(true)
    expect(seenActions.some((action) => action.startsWith('6:read:') && action.includes('repair proof missing'))).toBe(true)
    expect(seenActions.some((action) => action.startsWith('8:verify:') && action.includes('src/status/model.ts'))).toBe(true)
    expect(result.status).toBe('completed')
    expect(result.terminalClassification).toBe('success')
  })

  it('final real task trial resumes artifact verification with semantic claim evidence', async () => {
    const seenActions: string[] = []
    const artifactStates: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction }) => {
      seenActions.push(`${runtimeAction.nextAction}:${runtimeAction.changedFiles.join(',')}:${runtimeAction.verificationTargets.join(',')}`)
      return {
        role,
        content: 'resumed artifact verification complete',
        codingResult: codingResult({
          taskKind: 'data-artifact',
          changedFiles: ['src/status/model.ts', 'reports/status-summary.md'],
          evidenceFiles: ['src/status/model.ts', 'reports/status-summary.md', 'docs/status-source.md'],
          verification: {
            status: 'passed',
            reason: 'Focused status artifact verification passed.',
            command: 'npm test -- src/status/model.test.ts && npm run check -- reports/status-summary.md',
            selectionScope: 'focused',
            selectionSource: 'changed-file-impact',
          },
          verifiedFiles: ['src/status/model.ts', 'reports/status-summary.md'],
          requiredEvidence: [
            'status claim backed by source receipt',
          'status claim backed by verification receipt',
          ],
          observedEvidence: [
            'docs/status-source.md',
            'status artifact verification receipt',
          ],
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    for await (const event of engine.streamMessage('sess_final_artifact_continue', 'resume status artifact verification', {
      maxTurns: 3,
      runtimeSeed: {
        config: {
          sessionId: 'sess_final_artifact_continue',
          initialPrompt: 'resume status artifact verification',
          maxTurns: 3,
          startingRole: 'coder',
        },
        currentRole: 'coder',
        turn: 1,
        lastContinuationReason: 'retryable-error',
        pendingLifecycle: {
          pendingApprovals: {},
          pendingTools: { task_pending_artifact: { toolName: 'verify', startedAt: 'now' } },
          taskStates: {},
        },
        recoveryBoundary: 'mid-turn-reentry',
        truthBoundary: {
          source: 'durable-replay',
          normalizedEventCount: 4,
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
          openTurn: { role: 'coder', turn: 1 },
        },
        derivedState: { transcript: [] },
        observations: {
          contextPaths: ['src/status/model.ts', 'reports/status-summary.md', 'docs/status-source.md'],
          changedFiles: ['src/status/model.ts', 'reports/status-summary.md'],
          verificationTargets: ['src/status/model.ts', 'reports/status-summary.md'],
          failedVerificationTargets: [],
          repairAttempts: [],
          toolFailures: [],
          artifactEvidence: [],
          artifactClaims: [
            'status claim backed by source receipt',
            'status claim backed by verification receipt',
          ],
          artifactClaimEvidence: [],
          commandCoverage: [],
          continuationFacts: ['pending artifact verification'],
          completedActions: [],
          pendingAction: 'continue',
        },
      },
    })) {
      if (event.type === 'runtime.task-proof') {
        artifactStates.push([
          event.turn,
          event.projection.action,
          event.projection.artifactReceipt?.validationState,
          event.projection.artifactReceipt?.claimEvidenceReceipts.length ?? 0,
          event.projection.artifactReceipt?.claimEvidenceReceipts.filter(receipt => receipt.proven).length ?? 0,
          event.projection.verdict.status,
        ].join(':'))
      }
    }

    expect(seenActions).toEqual(['continue:src/status/model.ts,reports/status-summary.md:src/status/model.ts,reports/status-summary.md'])
    expect(artifactStates).toContain('1:continue:validation-passed:2:2:complete')
  })

  it('blocks completion when execution output does not match the staged runtime action', async () => {
    const seenActions: string[] = []
    const changedTargets = ['src/billing/rules.ts', 'src/billing/rules.test.ts']
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}`)
      if (turn === 1) {
        return {
          role,
          content: 'billing rule owners located',
          handoffTo: 'coder',
          handoffReason: 'edit billing rules',
          codingResult: codingResult({
            evidenceFiles: changedTargets,
            observedEvidence: ['billing owners located'],
            lastAction: { actionKind: 'repo-explain', target: 'src/billing/rules.ts' },
          }),
        }
      }
      if (turn === 2) {
        return {
          role,
          content: 'billing rule and focused test updated',
          handoffTo: 'reviewer',
          handoffReason: 'run focused billing verification',
          codingResult: codingResult({
            changedFiles: changedTargets,
            verification: { status: 'not-requested', reason: 'Focused verification not run.' },
            requiredEvidence: ['billing focused verification'],
            observedEvidence: [],
            lastAction: {
              actionKind: 'edit-file',
              changedFiles: changedTargets,
              target: 'src/billing/rules.ts',
            },
          }),
        }
      }
      return {
        role,
        content: 'verification claimed after an unexpected edit',
        codingResult: codingResult({
          changedFiles: changedTargets,
          verification: {
            status: 'passed',
            reason: 'Focused billing verification passed.',
            command: 'npm test -- src/billing/rules.test.ts',
            selectionScope: 'focused',
            selectionSource: 'changed-file-impact',
          },
          verifiedFiles: changedTargets,
          requiredEvidence: ['billing focused verification'],
          observedEvidence: ['billing focused verification'],
          lastAction: {
            actionKind: 'edit-file',
            changedFiles: changedTargets,
            target: 'src/billing/rules.ts',
            reason: 'writer changed code while runtime staged verification',
          },
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_staged_action_consistency', 'update billing rule with focused verification', {
      maxTurns: 4,
    })

    expect(seenActions).toEqual(['1:search', '2:read', '3:verify'])
    expect(result.status).toBe('stopped_not_proven')
    expect(result.stopReason).toContain('staged action')
  })

  it('uses typed verification tool failure to rediscover missing owner context before repair', async () => {
    const seenActions: string[] = []
    const changedTargets = ['src/invoice/summary.ts', 'src/invoice/summary.test.ts']
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}:${runtimeAction.proofGap.join('|')}`)
      if (turn === 1) {
        return {
          role,
          content: 'invoice owners located',
          handoffTo: 'coder',
          handoffReason: 'edit invoice summary',
          codingResult: codingResult({
            evidenceFiles: changedTargets,
            observedEvidence: ['invoice owners located'],
            lastAction: { actionKind: 'repo-explain', target: 'src/invoice/summary.ts' },
          }),
        }
      }
      if (turn === 2) {
        return {
          role,
          content: 'invoice summary updated',
          handoffTo: 'reviewer',
          handoffReason: 'verify invoice summary',
          codingResult: codingResult({
            changedFiles: changedTargets,
            verification: { status: 'not-requested', reason: 'Focused verification not run.' },
            requiredEvidence: ['invoice focused verification'],
            observedEvidence: [],
            lastAction: {
              actionKind: 'edit-file',
              changedFiles: changedTargets,
              target: 'src/invoice/summary.ts',
            },
          }),
        }
      }
      if (turn === 3) {
        return {
          role,
          content: 'focused invoice verification could not resolve owner fixture',
          handoffTo: 'coder',
          handoffReason: 'find missing fixture owner',
          events: [
            { type: 'tool.started', toolName: 'verify', taskId: 'verify_invoice_summary' },
            {
              type: 'tool.result',
              toolName: 'verify',
              taskId: 'verify_invoice_summary',
              success: false,
              failureReason: 'missing owner context for invoice fixture',
            },
          ],
          codingResult: codingResult({
            changedFiles: changedTargets,
            failedFiles: [{ path: 'src/invoice/summary.test.ts', reason: 'invoice fixture owner missing' }],
            verification: {
              status: 'failed',
              reason: 'Missing owner context for invoice fixture.',
              command: 'npm test -- src/invoice/summary.test.ts',
              selectionScope: 'focused',
              selectionSource: 'changed-file-impact',
            },
            requiredEvidence: ['invoice focused verification'],
            observedEvidence: [],
          }),
        }
      }
      return {
        role,
        content: 'missing invoice fixture owner discovered',
        codingResult: codingResult({
          evidenceFiles: ['src/invoice/fixtures.ts'],
          observedEvidence: ['invoice fixture owner context'],
          lastAction: { actionKind: 'repo-explain', target: 'src/invoice/fixtures.ts' },
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    await engine.submitMessage('sess_typed_tool_failure_context', 'update invoice summary with missing fixture owner', {
      maxTurns: 5,
    })

    expect(seenActions.some((action) => action.startsWith('4:read:'))).toBe(true)
  })

  it('execution loop trial keeps command receipt coverage in runtime proof', async () => {
    const seenProofStates: string[] = []
    const changedTargets = ['src/pricing/discount.ts', 'src/pricing/discount.test.ts']
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      if (turn === 1) {
        return {
          role,
          content: 'pricing owners located',
          handoffTo: 'coder',
          handoffReason: 'edit pricing discount',
          codingResult: codingResult({
            evidenceFiles: changedTargets,
            observedEvidence: ['pricing owners located'],
            lastAction: { actionKind: 'repo-explain', target: 'src/pricing/discount.ts' },
          }),
        }
      }
      if (turn === 2) {
        return {
          role,
          content: 'pricing discount and focused test updated',
          handoffTo: 'reviewer',
          handoffReason: 'verify pricing discount',
          codingResult: codingResult({
            changedFiles: changedTargets,
            verification: { status: 'not-requested', reason: 'Focused verification not run.' },
            requiredEvidence: ['pricing focused verification'],
            observedEvidence: [],
            lastAction: {
              actionKind: 'edit-file',
              changedFiles: changedTargets,
              target: 'src/pricing/discount.ts',
            },
          }),
        }
      }
      if (turn === 3) {
        return {
          role,
          content: 'focused pricing verification claimed passed with partial command receipt',
          events: [
            { type: 'tool.started', toolName: 'verify', taskId: 'verify_pricing_discount' },
            {
              type: 'tool.result',
              toolName: 'verify',
              taskId: 'verify_pricing_discount',
              success: true,
              coveredFiles: ['src/pricing/discount.test.ts'],
            },
          ],
          codingResult: codingResult({
            changedFiles: changedTargets,
            verification: {
              status: 'passed',
              reason: 'Focused pricing verification passed.',
              command: 'npm test -- src/pricing/discount.test.ts',
              selectionScope: 'focused',
              selectionSource: 'changed-file-impact',
            },
            verifiedFiles: changedTargets,
            requiredEvidence: ['pricing focused verification'],
            observedEvidence: ['pricing focused verification'],
            lastAction: { actionKind: 'verify', target: 'src/pricing/discount.test.ts' },
          }),
        }
      }
      return {
        role,
        content: `runtime selected ${runtimeAction.nextAction} for missing command coverage`,
        codingResult: codingResult({
          changedFiles: changedTargets,
          verification: { status: 'not-requested', reason: 'Source target still needs command coverage.' },
          requiredEvidence: ['pricing focused verification'],
          observedEvidence: [],
          lastAction: { actionKind: runtimeAction.nextAction, target: 'src/pricing/discount.ts' },
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    for await (const event of engine.streamMessage('sess_execution_loop_command_receipt', 'update pricing discount with focused verification', {
      maxTurns: 4,
    })) {
      if (event.type === 'runtime.task-proof') {
        seenProofStates.push(`${event.turn}:${event.projection.proof.status}:${event.projection.verdict.status}:${event.projection.proof.missingProof.join('|')}`)
      }
    }

    const hasMissingCommandCoverage = seenProofStates.some((state) =>
      state.startsWith('3:partial:partial:') && state.includes('changed-file-verification-complete')
    )
    expect(hasMissingCommandCoverage).toBe(true)
    expect(seenProofStates.some((state) => state.startsWith('4:'))).toBe(false)
  })

  it('execution loop trial requires post-repair verification receipt before repair proof completes', async () => {
    const proofStates: string[] = []
    const changedTargets = ['src/schedule/clock.ts', 'src/schedule/clock.test.ts']
    const runAgent: AgentRunner = async ({ role, turn }) => {
      if (turn === 1) {
        return {
          role,
          content: 'schedule owners located',
          handoffTo: 'coder',
          handoffReason: 'edit schedule clock',
          codingResult: codingResult({
            evidenceFiles: changedTargets,
            observedEvidence: ['schedule owners located'],
            lastAction: { actionKind: 'repo-explain', target: 'src/schedule/clock.ts' },
          }),
        }
      }
      if (turn === 2) {
        return {
          role,
          content: 'clock edit failed focused verification',
          handoffTo: 'reviewer',
          handoffReason: 'repair failed clock test',
          codingResult: codingResult({
            changedFiles: changedTargets,
            failedFiles: [{ path: 'src/schedule/clock.test.ts', reason: 'clock boundary failed' }],
            verification: {
              status: 'failed',
              reason: 'Focused schedule verification failed.',
              command: 'npm test -- src/schedule/clock.test.ts',
              selectionScope: 'focused',
              selectionSource: 'changed-file-impact',
            },
            requiredEvidence: ['schedule focused verification'],
            observedEvidence: [],
            lastAction: { actionKind: 'verify', target: 'src/schedule/clock.test.ts' },
          }),
        }
      }
      return {
        role,
        content: 'repair reported recovered with optimistic verification summary',
        codingResult: codingResult({
          changedFiles: changedTargets,
          repair: { status: 'recovered', attempts: 1, recoveredItems: ['src/schedule/clock.ts'] },
          verification: {
            status: 'passed',
            reason: 'Summary says schedule verification passed, but no post-repair receipt was emitted.',
            command: 'npm test -- src/schedule/clock.test.ts',
            selectionScope: 'focused',
            selectionSource: 'changed-file-impact',
          },
          verifiedFiles: changedTargets,
          requiredEvidence: ['schedule focused verification'],
          observedEvidence: ['schedule focused verification'],
          lastAction: { actionKind: 'repair', target: 'src/schedule/clock.ts', changedFiles: changedTargets },
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    for await (const event of engine.streamMessage('sess_execution_loop_repair_receipt', 'repair schedule clock after focused verification failure', {
      maxTurns: 4,
    })) {
      if (event.type === 'runtime.task-proof') {
        proofStates.push(`${event.turn}:${event.projection.proof.status}:${event.projection.proof.missingProof.join('|')}`)
      }
    }

    const hasMissingPostValidation = proofStates.some((state) =>
      state.startsWith('3:partial:') && state.includes('repair-post-validation')
    )
    expect(hasMissingPostValidation, proofStates.join('\n')).toBe(true)
  })

  it('blocks a pending edit at runtime authority when discovery is required', async () => {
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}:${runtimeAction.proofGap.join('|')}`)
      return {
        role,
        content: 'owner context discovered after unsafe edit was rejected',
        codingResult: codingResult({
          evidenceFiles: ['src/permissions/policy.ts'],
          requiredEvidence: ['safe edit blocked proof'],
          observedEvidence: [],
          lastAction: { actionKind: 'repo-explain', target: 'src/permissions/policy.ts' },
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_runtime_authority_edit_discovery', 'update permission policy contract', {
      maxTurns: 2,
      runtimeSeed: {
        config: {
          sessionId: 'sess_runtime_authority_edit_discovery',
          initialPrompt: 'update permission policy contract',
          maxTurns: 2,
          startingRole: 'coder',
        },
        currentRole: 'coder',
        turn: 1,
        sharedContext: {
          sessionId: 'sess_runtime_authority_edit_discovery',
          initialPrompt: 'update permission policy contract',
          notes: [],
          handoffs: [],
        },
        transcript: [],
        visitedTransitions: [],
        pendingLifecycle: createEmptyLifecycleIndex(),
        recoveryBoundary: 'completed-turn-reentry',
        truthBoundary: replayTruthBoundary(),
        derivedState: { transcript: [] },
        observations: {
          ...emptyRuntimeObservations(),
          pendingAction: 'edit',
        },
      },
    })

    expect(seenActions[0]).toContain('search:')
    expect(result.status).toBe('stopped_not_proven')
    expect(result.stopReason).toContain('proof gap')
  })

  it('blocks generic verification at runtime authority when targeted verification is required', async () => {
    const seenActions: string[] = []
    const changedTargets = ['src/scheduler/api.ts', 'src/scheduler/worker.ts', 'src/scheduler/worker.test.ts']
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}:${runtimeAction.verificationTargets.join(',')}`)
      return {
        role,
        content: 'generic verification summary',
        codingResult: codingResult({
          changedFiles: changedTargets,
          verification: {
            status: 'passed',
            reason: 'generic workspace check passed but did not prove changed scheduler targets',
            command: 'npm test',
            selectionScope: 'broader',
            selectionSource: 'explicit-user',
          },
          verifiedFiles: [],
          requiredEvidence: ['scheduler targeted verification'],
          observedEvidence: ['scheduler targeted verification'],
          lastAction: { actionKind: 'verify', target: 'workspace' },
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_runtime_authority_targeted_verify', 'verify scheduler api update', {
      maxTurns: 1,
      startingRole: 'reviewer',
      runtimeSeed: {
        config: {
          sessionId: 'sess_runtime_authority_targeted_verify',
          initialPrompt: 'verify scheduler api update',
          maxTurns: 1,
          startingRole: 'reviewer',
        },
        currentRole: 'reviewer',
        turn: 1,
        sharedContext: {
          sessionId: 'sess_runtime_authority_targeted_verify',
          initialPrompt: 'verify scheduler api update',
          notes: [],
          handoffs: [],
        },
        transcript: [],
        visitedTransitions: [],
        pendingLifecycle: createEmptyLifecycleIndex(),
        recoveryBoundary: 'completed-turn-reentry',
        truthBoundary: replayTruthBoundary(),
        derivedState: { transcript: [] },
        observations: {
          ...emptyRuntimeObservations(),
          changedFiles: [...changedTargets],
          verificationTargets: [...changedTargets],
          pendingAction: 'verify',
        },
      },
    })

    expect(seenActions[0]).toContain(`verify:${changedTargets.join(',')}`)
    expect(result.status).toBe('stopped_not_proven')
    expect(result.stopReason).toContain('no safe action')
  })

  it('redirects missing-context repair to discovery before repair execution', async () => {
    const seenActions: string[] = []
    const changedTargets = ['src/billing/calc.ts', 'src/billing/calc.test.ts']
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}:${runtimeAction.proofGap.join('|')}`)
      return {
        role,
        content: 'billing owner context refreshed',
        codingResult: codingResult({
          evidenceFiles: ['src/billing/rules.ts'],
          requiredEvidence: ['repair target context'],
          observedEvidence: [],
          lastAction: { actionKind: 'repo-explain', target: 'src/billing/rules.ts' },
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_runtime_authority_repair_requires_context', 'repair billing calculation after failed check', {
      maxTurns: 1,
      startingRole: 'coder',
      runtimeSeed: {
        config: {
          sessionId: 'sess_runtime_authority_repair_requires_context',
          initialPrompt: 'repair billing calculation after failed check',
          maxTurns: 1,
          startingRole: 'coder',
        },
        currentRole: 'coder',
        turn: 1,
        sharedContext: {
          sessionId: 'sess_runtime_authority_repair_requires_context',
          initialPrompt: 'repair billing calculation after failed check',
          notes: [],
          handoffs: [],
        },
        transcript: [],
        visitedTransitions: [],
        pendingLifecycle: createEmptyLifecycleIndex(),
        recoveryBoundary: 'completed-turn-reentry',
        truthBoundary: replayTruthBoundary(),
        derivedState: { transcript: [] },
        observations: {
          ...emptyRuntimeObservations(),
          changedFiles: [...changedTargets],
          failedVerificationTargets: ['src/billing/calc.test.ts'],
          toolFailures: [{
            action: 'verify',
            signature: 'src/billing/calc.test.ts',
            reason: 'missing billing rules owner context',
          }],
          pendingAction: 'repair',
        },
      },
    })

    expect(seenActions[0]).toContain('search:')
    expect(seenActions[0]).not.toContain('repair:')
    expect(result.status).toBe('stopped_not_proven')
  })

  it('rejects metadata-only artifact completion at runtime authority', async () => {
    const seenActions: string[] = []
    const changedTargets = ['src/report/model.ts', 'reports/report.md']
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}:${runtimeAction.proofGap.join('|')}`)
      return {
        role,
        content: 'artifact metadata says complete',
        codingResult: codingResult({
          taskKind: 'write-file',
          changedFiles: changedTargets,
          evidenceFiles: [],
          verifiedFiles: [],
          verification: { status: 'not-requested', reason: 'artifact metadata only' },
          requiredEvidence: ['report claim backed by source', 'report claim backed by verification'],
          observedEvidence: ['artifact metadata marker', 'artifact output exists'],
          lastAction: { actionKind: 'write-file', target: 'reports/report.md', changedFiles: changedTargets },
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_runtime_authority_artifact_metadata_only', 'write report artifact with claim proof', {
      maxTurns: 1,
      startingRole: 'coder',
      runtimeSeed: {
        config: {
          sessionId: 'sess_runtime_authority_artifact_metadata_only',
          initialPrompt: 'write report artifact with claim proof',
          maxTurns: 1,
          startingRole: 'coder',
        },
        currentRole: 'coder',
        turn: 1,
        sharedContext: {
          sessionId: 'sess_runtime_authority_artifact_metadata_only',
          initialPrompt: 'write report artifact with claim proof',
          notes: [],
          handoffs: [],
        },
        transcript: [],
        visitedTransitions: [],
        pendingLifecycle: createEmptyLifecycleIndex(),
        recoveryBoundary: 'completed-turn-reentry',
        truthBoundary: replayTruthBoundary(),
        derivedState: { transcript: [] },
        observations: {
          ...emptyRuntimeObservations(),
          changedFiles: [...changedTargets],
          artifactClaims: ['report claim backed by source', 'report claim backed by verification'],
          artifactClaimEvidence: [],
          pendingAction: 'artifact',
        },
      },
    })

    expect(seenActions[0]).toContain('artifact:')
    expect(result.status).toBe('stopped_not_proven')
    expect(result.stopReason).toContain('no safe action')
  })

  it('ingests ordered execution batch results before choosing the next action', async () => {
    const seenActions: string[] = []
    const seenBatches: string[][] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}:${runtimeAction.selectedPaths.join(',')}`)
      return {
        role,
        content: `turn ${turn}`,
        handoffTo: turn === 1 ? 'coder' : undefined,
        handoffReason: turn === 1 ? 'continue with ordered owner context' : undefined,
      }
    }

    const engine = new QueryEngine({
      runAgent,
      executeRuntimeBatch: async ({ batch }: any) => {
        seenBatches.push(batch.items.map((item: any) => `${item.order}:${item.actionKind}:${item.toolId}`))
        return {
          batchId: batch.batchId,
          results: [
            {
              toolId: 'runtime-search',
              actionKind: 'search',
              coveredFiles: [],
              affectedPaths: ['src/order/owner.ts'],
              exitStatusClass: 'success',
              failureClass: 'none',
              redactionStatus: 'report-safe',
              truncated: false,
            },
            {
              toolId: 'runtime-read',
              actionKind: 'read',
              coveredFiles: ['src/order/owner.ts'],
              affectedPaths: ['src/order/owner.ts'],
              exitStatusClass: 'success',
              failureClass: 'none',
              redactionStatus: 'report-safe',
              truncated: false,
            },
          ],
        }
      },
    } as any)

    await engine.submitMessage('sess_runtime_batch_ordered', 'inspect missing order owner context', {
      maxTurns: 2,
    })

    expect(seenBatches[0]).toEqual(['1:search:runtime-search'])
    expect(seenActions).toEqual([
      '1:search:',
      '2:read:src/order/owner.ts',
    ])
  })

  it('keeps partial execution batch failure visible for the next action', async () => {
    const seenActions: string[] = []
    const changedTargets = ['src/batch/source.ts', 'src/batch/source.test.ts']
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}:${runtimeAction.proofGap.join('|')}`)
      if (turn === 1) {
        return {
          role,
          content: 'batch source changed',
          handoffTo: 'coder',
          handoffReason: 'verify changed targets',
          codingResult: codingResult({
            changedFiles: changedTargets,
            verification: { status: 'not-requested', reason: 'Focused verification not run.' },
            requiredEvidence: ['focused verification'],
            observedEvidence: [],
            lastAction: {
              actionKind: 'edit-file',
              target: 'src/batch/source.ts',
              changedFiles: changedTargets,
            },
          }),
        }
      }
      return {
        role,
        content: 'provider claimed verification after partial batch',
        handoffTo: turn === 2 ? 'reviewer' : undefined,
        handoffReason: turn === 2 ? 'repair partial batch failure' : undefined,
        codingResult: codingResult({
          changedFiles: changedTargets,
          verification: {
            status: 'passed',
            command: 'npm test -- src/batch/source.test.ts',
            reason: 'Later target passed.',
            selectionScope: 'focused',
            selectionSource: 'changed-file-impact',
          },
          requiredEvidence: ['focused verification'],
          observedEvidence: ['focused verification'],
          verifiedFiles: changedTargets,
          lastAction: { actionKind: 'verify', target: 'src/batch/source.test.ts' },
        }),
      }
    }

    const engine = new QueryEngine({
      runAgent,
      executeRuntimeBatch: async ({ batch }: any) => {
        if (!batch.items.some((item: any) => item.actionKind === 'verify')) {
          return { batchId: batch.batchId, results: [] }
        }
        return {
          batchId: batch.batchId,
          results: [
            {
              toolId: 'verify-source',
              actionKind: 'verify',
              coveredFiles: ['src/batch/source.ts'],
              affectedPaths: ['src/batch/source.ts'],
              exitStatusClass: 'failed',
              failureClass: 'test-failed',
              redactionStatus: 'report-safe',
              truncated: false,
            },
            {
              toolId: 'verify-test',
              actionKind: 'verify',
              coveredFiles: ['src/batch/source.test.ts'],
              affectedPaths: ['src/batch/source.test.ts'],
              exitStatusClass: 'success',
              failureClass: 'none',
              redactionStatus: 'report-safe',
              truncated: false,
            },
          ],
        }
      },
    } as any)

    await engine.submitMessage('sess_runtime_partial_batch_failure', 'update batch source with focused verification', {
      maxTurns: 3,
    })

    expect(seenActions[1]).toContain('2:verify:')
    expect(seenActions[2]).toContain('3:repair:verification failed for src/batch/source.ts')
    expect(seenActions[2]).not.toContain('src/batch/source.test.ts')
  })

  it('emits safe execution batch failure details without raw output', async () => {
    const feedback: string[] = []
    const runAgent: AgentRunner = async ({ role }) => ({
      role,
      content: 'read failed safely',
    })
    const engine = new QueryEngine({
      runAgent,
      executeRuntimeBatch: async ({ batch }: any) => ({
        batchId: batch.batchId,
        results: [
          {
            toolId: 'runtime-read',
            actionKind: 'read',
            coveredFiles: [],
            affectedPaths: ['src/private-redacted.ts'],
            exitStatusClass: 'failed',
            failureClass: 'not-found',
            redactionStatus: 'redacted',
            truncated: true,
          },
        ],
      }),
    } as any)

    for await (const event of engine.streamMessage('sess_runtime_safe_tool_feedback', 'inspect missing safe feedback context', {
      maxTurns: 1,
    })) {
      if (event.type === 'runtime.tool-feedback') {
        feedback.push([
          event.toolId,
          event.actionKind,
          event.exitStatusClass,
          event.failureClass,
          event.affectedPaths.join(','),
          event.redactionStatus,
          event.truncated ? 'truncated' : 'full',
        ].join(':'))
      }
    }

    expect(feedback).toEqual([
      'runtime-read:read:failed:not-found:src/private-redacted.ts:redacted:truncated',
    ])
  })

  it('hands targeted verification execution to command coverage before proof projection', async () => {
    const coverageCounts: number[] = []
    const changedTargets = ['packages/ts-shell/src/runtime/batch.ts']
    const runAgent: AgentRunner = async ({ role, turn }) => {
      if (turn === 1) {
        return {
          role,
          content: 'runtime batch changed',
          handoffTo: 'coder',
          handoffReason: 'verify runtime batch',
          codingResult: codingResult({
            changedFiles: changedTargets,
            verification: { status: 'not-requested', reason: 'Focused verification not run.' },
            requiredEvidence: ['runtime batch focused verification'],
            observedEvidence: [],
            lastAction: {
              actionKind: 'edit-file',
              target: changedTargets[0],
              changedFiles: changedTargets,
            },
          }),
        }
      }
      return {
        role,
        content: 'verification result projected',
        codingResult: codingResult({
          changedFiles: changedTargets,
          verification: {
            status: 'passed',
            command: 'npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts',
            reason: 'Focused runtime test passed.',
            selectionScope: 'focused',
            selectionSource: 'changed-file-impact',
          },
          requiredEvidence: ['runtime batch focused verification'],
          observedEvidence: ['runtime batch focused verification'],
          verifiedFiles: changedTargets,
          lastAction: { actionKind: 'verify', target: changedTargets[0] },
        }),
      }
    }
    const engine = new QueryEngine({
      runAgent,
      executeRuntimeBatch: async ({ batch }: any) => ({
        batchId: batch.batchId,
        results: batch.items.some((item: any) => item.actionKind === 'verify')
          ? [
              {
                toolId: 'verification-command',
                actionKind: 'verify',
                coveredFiles: changedTargets,
                affectedPaths: changedTargets,
                exitStatusClass: 'success',
                failureClass: 'none',
                redactionStatus: 'report-safe',
                truncated: false,
                commandCoverage: {
                  taskId: 'runtime_batch_verify',
                  coveredFiles: changedTargets,
                  uncoveredFiles: [],
                  coverageStatus: 'complete',
                },
              },
            ]
          : [],
      }),
    } as any)

    for await (const event of engine.streamMessage('sess_runtime_targeted_verification_handoff', 'update runtime batch', {
      maxTurns: 2,
    })) {
      if (event.type === 'runtime.task-proof') {
        coverageCounts.push(event.projection.observationState.commandCoverageCount)
      }
    }

    expect(coverageCounts).toEqual([0, 1])
  })

  it('blocks unsafe execution batch action before calling execution or agent runners', async () => {
    let batchCalls = 0
    let agentCalls = 0
    const feedback: string[] = []
    const runAgent: AgentRunner = async ({ role }) => {
      agentCalls += 1
      return { role, content: 'should not run' }
    }
    const engine = new QueryEngine({
      runAgent,
      executeRuntimeBatch: async () => {
        batchCalls += 1
        return { batchId: 'unexpected', results: [] }
      },
    } as any)

    for await (const event of engine.streamMessage('sess_runtime_authority_block', 'artifact without owner context', {
      maxTurns: 1,
      runtimeSeed: {
        config: {
          sessionId: 'sess_runtime_authority_block',
          initialPrompt: 'artifact without owner context',
          maxTurns: 1,
          startingRole: 'coder',
        },
        currentRole: 'coder',
        turn: 1,
        lastContinuationReason: undefined,
        pendingLifecycle: createEmptyLifecycleIndex(),
        sharedContext: {
          sessionId: 'sess_runtime_authority_block',
          initialPrompt: 'artifact without owner context',
          notes: [],
          handoffs: [],
        },
        transcript: [],
        visitedTransitions: [],
        recoveryBoundary: 'completed-turn-reentry',
        truthBoundary: replayTruthBoundary(),
        derivedState: { transcript: [] },
        observations: {
          ...emptyRuntimeObservations(),
          artifactClaims: ['owner-backed artifact claim'],
          pendingAction: 'artifact',
        },
      },
    })) {
      if (event.type === 'runtime.tool-feedback') {
        feedback.push(`${event.actionKind}:${event.failureClass}:${event.exitStatusClass}`)
      }
    }

    expect(batchCalls).toBe(0)
    expect(agentCalls).toBe(0)
    expect(feedback).toEqual(['artifact:authority-blocked:blocked'])
  })

  it('stops as not proven when unsafe execution batch failure leaves no safe next action', async () => {
    const runAgent: AgentRunner = async ({ role }) => ({
      role,
      content: 'should not hide unsafe failure',
      handoffTo: 'coder',
      handoffReason: 'unsafe failure remains',
    })
    let batchCalls = 0
    const engine = new QueryEngine({
      runAgent,
      executeRuntimeBatch: async ({ batch }: any) => {
        batchCalls += 1
        return {
          batchId: batch.batchId,
          results: [
            {
              toolId: 'runtime-verify',
              actionKind: 'verify',
              coveredFiles: [],
              affectedPaths: ['src/unsafe.ts'],
              exitStatusClass: 'blocked',
              failureClass: 'unsafe-output',
              redactionStatus: 'report-safe',
              truncated: false,
            },
          ],
        }
      },
    } as any)

    const result = await engine.submitMessage('sess_runtime_unsafe_batch_stop', 'verify unsafe target', {
      maxTurns: 1,
      runtimeSeed: {
        config: {
          sessionId: 'sess_runtime_unsafe_batch_stop',
          initialPrompt: 'verify unsafe target',
          maxTurns: 1,
          startingRole: 'reviewer',
        },
        currentRole: 'reviewer',
        turn: 1,
        lastContinuationReason: undefined,
        pendingLifecycle: createEmptyLifecycleIndex(),
        sharedContext: {
          sessionId: 'sess_runtime_unsafe_batch_stop',
          initialPrompt: 'verify unsafe target',
          notes: [],
          handoffs: [],
        },
        transcript: [],
        visitedTransitions: [],
        recoveryBoundary: 'completed-turn-reentry',
        truthBoundary: replayTruthBoundary(),
        derivedState: { transcript: [] },
        observations: {
          ...emptyRuntimeObservations(),
          changedFiles: ['src/unsafe.ts'],
          verificationTargets: ['src/unsafe.ts'],
          pendingAction: 'verify',
        },
      },
    })

    expect(batchCalls).toBe(1)
    expect(result.status).toBe('stopped_not_proven')
    expect(result.stopReason).toContain('no safe action remains after execution batch failure')
  })

  it('does not complete from execution batch coverage without task proof', async () => {
    const runAgent: AgentRunner = async ({ role }) => ({
      role,
      content: 'host check ran but no task proof was produced',
    })
    const engine = new QueryEngine({
      runAgent,
      executeRuntimeBatch: async ({ batch }: any) => ({
        batchId: batch.batchId,
        results: [
          {
            toolId: 'runtime-verify',
            actionKind: 'verify',
            coveredFiles: ['src/ledger/balance.ts'],
            affectedPaths: ['src/ledger/balance.ts'],
            exitStatusClass: 'success',
            redactionStatus: 'report-safe',
            truncated: false,
            commandCoverage: {
              taskId: 'ledger-balance-focused-check',
              coveredFiles: ['src/ledger/balance.ts'],
              uncoveredFiles: [],
              coverageStatus: 'complete',
            },
          },
        ],
      }),
    } as any)

    const result = await engine.submitMessage(
      'sess_execution_batch_without_task_proof',
      'finish ledger balance verification after edited files',
      {
        maxTurns: 1,
        runtimeSeed: {
          config: {
            sessionId: 'sess_execution_batch_without_task_proof',
            initialPrompt: 'finish ledger balance verification after edited files',
            maxTurns: 1,
            startingRole: 'reviewer',
          },
          currentRole: 'reviewer',
          turn: 1,
          lastContinuationReason: undefined,
          pendingLifecycle: createEmptyLifecycleIndex(),
          sharedContext: {
            sessionId: 'sess_execution_batch_without_task_proof',
            initialPrompt: 'finish ledger balance verification after edited files',
            notes: [],
            handoffs: [],
          },
          transcript: [],
          visitedTransitions: [],
          recoveryBoundary: 'completed-turn-reentry',
          truthBoundary: replayTruthBoundary(),
          derivedState: { transcript: [] },
          observations: {
            ...emptyRuntimeObservations(),
            changedFiles: ['src/ledger/balance.ts'],
            verificationTargets: ['src/ledger/balance.ts'],
            pendingAction: 'verify',
          },
        },
      },
    )

    expect(result.status).toBe('stopped_not_proven')
    expect(result.terminalClassification).toBe('stopped')
    expect(result.stopReason).toContain('task proof')
  })

  it('changes repeated repair strategy from restored task state to discovery', async () => {
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}:${runtimeAction.proofGap.join('|')}`)
      return {
        role,
        content: 'rediscovered formatter owner after repeated repair',
        codingResult: codingResult({
          evidenceFiles: ['src/order/formatter.ts'],
          requiredEvidence: ['fresh repair context'],
          observedEvidence: [],
          lastAction: { actionKind: 'repo-explain', target: 'src/order/formatter.ts' },
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_task_state_repeated_repair', 'continue order repair after failed focused check', {
      maxTurns: 1,
      startingRole: 'coder',
      runtimeSeed: runtimeSeedWithTaskState('sess_task_state_repeated_repair', {
        source: 'replay',
        pendingAction: 'repair',
        proofGap: ['verification failed', 'repair proof missing'],
        changedFiles: ['src/order/rules.ts'],
        verifiedFiles: [],
        unverifiedFiles: ['src/order/rules.ts'],
        failureCategories: ['verification failed', 'repair failed'],
        originalFailureClassification: 'test-failed',
        repairAttempts: [{
          attempt: 1,
          signature: 'src/order/rules.ts',
          reason: 'same focused verification failed after first repair',
          changedFiles: ['src/order/rules.ts'],
        }],
        nextVerificationPlan: {
          command: 'npm test -- src/order/rules.test.ts',
          targetFiles: ['src/order/rules.ts', 'src/order/rules.test.ts'],
          failedFiles: ['src/order/rules.test.ts'],
          status: 'failed',
          nextAction: 'repair order rules',
        },
        artifactPendingState: {
          claims: [],
          evidenceIds: [],
          missingClaims: [],
        },
        continuationSafety: {
          status: 'safe',
          reasons: ['replay turn pairing accepted'],
        },
      }),
    })

    expect(seenActions[0]).toContain('1:search:')
    expect(seenActions[0]).not.toContain('1:repair:')
    expect(result.status).toBe('stopped_not_proven')
  })

  it('requires targeted verification after restored repair changed files', async () => {
    const seenActions: string[] = []
    const changedTargets = ['src/cart/total.ts', 'src/cart/total.test.ts']
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}:${runtimeAction.verificationTargets.join(',')}`)
      return {
        role,
        content: 'post repair verification still pending',
        codingResult: codingResult({
          changedFiles: changedTargets,
          repair: { status: 'recovered', attempts: 1, recoveredItems: ['src/cart/total.ts'] },
          verification: { status: 'not-requested', reason: 'post repair targeted check not run' },
          requiredEvidence: ['post repair targeted verification'],
          observedEvidence: [],
          lastAction: { actionKind: 'repair', target: 'src/cart/total.ts', changedFiles: changedTargets },
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_task_state_post_repair_verify', 'continue cart repair verification', {
      maxTurns: 1,
      startingRole: 'reviewer',
      runtimeSeed: runtimeSeedWithTaskState('sess_task_state_post_repair_verify', {
        source: 'replay',
        pendingAction: 'verify',
        proofGap: ['verification proof missing for changed files'],
        changedFiles: changedTargets,
        verifiedFiles: [],
        unverifiedFiles: changedTargets,
        failureCategories: ['verification failed'],
        originalFailureClassification: 'test-failed',
        repairAttempts: [{
          attempt: 1,
          signature: 'src/cart/total.ts',
          reason: 'repair changed cart total',
          changedFiles: changedTargets,
        }],
        nextVerificationPlan: {
          command: 'npm test -- src/cart/total.test.ts',
          targetFiles: changedTargets,
          failedFiles: [],
          status: 'not-requested',
          nextAction: 'rerun focused verification',
        },
        artifactPendingState: {
          claims: [],
          evidenceIds: [],
          missingClaims: [],
        },
        continuationSafety: {
          status: 'safe',
          reasons: ['replay turn pairing accepted'],
        },
      }),
    })

    expect(seenActions[0]).toBe(`1:verify:${changedTargets.join(',')}`)
    expect(result.status).toBe('stopped_not_proven')
    expect(result.stopReason).not.toBe('completed')
  })

  it('switches missing-context repair from restored state to discovery', async () => {
    const seenActions: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction, turn }) => {
      seenActions.push(`${turn}:${runtimeAction.nextAction}:${runtimeAction.proofGap.join('|')}`)
      return {
        role,
        content: 'read missing pricing owner context',
        codingResult: codingResult({
          evidenceFiles: ['src/pricing/source.ts'],
          requiredEvidence: ['pricing owner context'],
          observedEvidence: [],
          lastAction: { actionKind: 'repo-explain', target: 'src/pricing/source.ts' },
        }),
      }
    }

    const engine = new QueryEngine({ runAgent })
    const result = await engine.submitMessage('sess_task_state_missing_context_repair', 'continue pricing repair', {
      maxTurns: 1,
      startingRole: 'coder',
      runtimeSeed: runtimeSeedWithTaskState('sess_task_state_missing_context_repair', {
        source: 'compact',
        pendingAction: 'repair',
        proofGap: ['context evidence incomplete', 'verification failed'],
        changedFiles: ['src/pricing/discount.ts'],
        verifiedFiles: [],
        unverifiedFiles: ['src/pricing/discount.ts'],
        failureCategories: ['missing context', 'verification failed'],
        originalFailureClassification: 'missing-context',
        repairAttempts: [],
        nextVerificationPlan: {
          command: 'npm test -- src/pricing/discount.test.ts',
          targetFiles: ['src/pricing/discount.ts', 'src/pricing/discount.test.ts'],
          failedFiles: ['src/pricing/discount.test.ts'],
          status: 'failed',
          nextAction: 'inspect pricing source before repair',
        },
        artifactPendingState: {
          claims: [],
          evidenceIds: [],
          missingClaims: [],
        },
        continuationSafety: {
          status: 'safe',
          reasons: ['compact quality checks passed'],
        },
      }),
    })

    expect(seenActions[0]).toContain('1:search:')
    expect(seenActions[0]).not.toContain('1:repair:')
    expect(result.status).toBe('stopped_not_proven')
  })

  it('preserves original failure classification from restored task state in runtime proof gap', async () => {
    const seenProofGaps: string[] = []
    const runAgent: AgentRunner = async ({ role, runtimeAction }) => {
      seenProofGaps.push(runtimeAction.proofGap.join('|'))
      return { role, content: 'classification observed' }
    }

    const engine = new QueryEngine({ runAgent })
    await engine.submitMessage('sess_task_state_original_failure', 'continue inventory verification repair', {
      maxTurns: 1,
      startingRole: 'coder',
      runtimeSeed: runtimeSeedWithTaskState('sess_task_state_original_failure', {
        source: 'replay',
        pendingAction: 'repair',
        proofGap: ['verification failed', 'original failure: test-failed'],
        changedFiles: ['src/inventory/status.ts'],
        verifiedFiles: [],
        unverifiedFiles: ['src/inventory/status.ts'],
        failureCategories: ['verification failed'],
        originalFailureClassification: 'test-failed',
        repairAttempts: [],
        nextVerificationPlan: {
          command: 'npm test -- src/inventory/status.test.ts',
          targetFiles: ['src/inventory/status.ts', 'src/inventory/status.test.ts'],
          failedFiles: ['src/inventory/status.test.ts'],
          status: 'failed',
          nextAction: 'repair inventory status',
        },
        artifactPendingState: {
          claims: [],
          evidenceIds: [],
          missingClaims: [],
        },
        continuationSafety: {
          status: 'safe',
          reasons: ['replay turn pairing accepted'],
        },
      }),
    })

    expect(seenProofGaps[0]).toContain('original failure: test-failed')
  })
})

function emptyRuntimeObservations() {
  return {
    contextPaths: [],
    changedFiles: [],
    verificationTargets: [],
    failedVerificationTargets: [],
    restoredProofGap: [],
    failureCategories: [],
    repairAttempts: [],
    toolFailures: [],
    artifactEvidence: [],
    artifactClaims: [],
    artifactClaimEvidence: [],
    commandCoverage: [],
    toolFeedback: [],
    continuationFacts: [],
    completedActions: [],
  }
}

function replayTruthBoundary() {
  return {
    source: 'durable-replay' as const,
    normalizedEventCount: 0,
    pairedTurnCount: 0,
    policyEvidence: ['policy:completed-turn-only'] as const,
    repairSummary: {
      insertedPromptMessage: false,
      insertedQueryStarted: false,
      strippedInterruptedTerminalEvents: 0,
      insertedRunInterrupted: false,
      ignoredDuplicateTurnStarts: 0,
      ignoredUnpairedTurnCompletions: 0,
      ignoredRoleMismatchedTurnCompletions: 0,
    },
    continuationSafety: 'completed-turn-only' as const,
  }
}

function runtimeSeedWithTaskState(
  sessionId: string,
  taskState: QueryRuntimeTaskState,
) {
  return {
    config: {
      sessionId,
      initialPrompt: 'continue restored task state',
      maxTurns: 1,
      startingRole: 'coder' as const,
    },
    currentRole: 'coder' as const,
    turn: 1,
    lastContinuationReason: undefined,
    pendingLifecycle: createEmptyLifecycleIndex(),
    sharedContext: {
      sessionId,
      initialPrompt: 'continue restored task state',
      notes: [],
      handoffs: [],
    },
    transcript: [],
    visitedTransitions: [],
    recoveryBoundary: 'completed-turn-reentry' as const,
    truthBoundary: replayTruthBoundary(),
    derivedState: { transcript: [] },
    taskState,
  }
}

function codingResult(input: {
  taskKind?: CodingResultSummary['taskKind']
  changedFiles?: string[]
  failedFiles?: Array<{ path: string; reason: string }>
  evidenceFiles?: string[]
  repair?: Partial<CodingResultSummary['repair']>
  verification?: Partial<CodingResultSummary['verification']>
  verifiedFiles?: string[]
  requiredEvidence?: string[]
  observedEvidence?: string[]
  lastAction?: CodingResultSummary['lastActionResultSeed']
}): CodingResultSummary {
  const changedFiles = input.changedFiles ?? []
  const failedFiles = input.failedFiles ?? []
  const requiredEvidence = input.requiredEvidence ?? []
  const observedEvidence = input.observedEvidence ?? []
  return {
    taskKind: input.taskKind ?? 'edit-file',
    diagnosis: input.evidenceFiles ? {
      disposition: 'grounded-explanation',
      candidateFiles: [],
      evidenceFiles: input.evidenceFiles,
      searchPattern: 'task evidence',
      reason: 'Evidence files supplied by focused runtime test.',
      evidenceNodes: [],
      evidenceLinks: [],
    } : undefined,
    changedFiles,
    failedFiles,
    repair: {
      status: input.repair?.status ?? 'not-needed',
      attempts: input.repair?.attempts ?? 0,
      recoveredItems: input.repair?.recoveredItems ?? [],
      failedItems: input.repair?.failedItems ?? [],
      notes: input.repair?.notes ?? [],
    },
    continuation: {
      status: 'first-pass-success',
      attempts: 0,
      evidence: [],
    },
    changeSet: {
      gitAware: true,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: changedFiles,
      attemptedFiles: [...changedFiles, ...failedFiles.map(file => file.path)],
      changedFiles,
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: observedEvidence.length >= requiredEvidence.length ? 'satisfied' : 'insufficient-evidence',
      reasons: observedEvidence.length >= requiredEvidence.length ? [] : ['Missing required proof.'],
      requiredEvidence,
      observedEvidence,
    },
    verifiedFiles: input.verifiedFiles ?? (input.verification?.status === 'passed' ? changedFiles : []),
    unverifiedFiles: input.verification?.status === 'passed'
      ? []
      : changedFiles.map(path => ({ path, reason: input.verification?.reason ?? 'Not verified.' })),
    verification: {
      status: input.verification?.status ?? 'not-requested',
      command: input.verification?.command,
      reason: input.verification?.reason,
      selectionScope: input.verification?.selectionScope,
      selectionSource: input.verification?.selectionSource,
      blockerKind: input.verification?.blockerKind,
      nextAction: input.verification?.nextAction,
    },
    evidence: observedEvidence,
    lastActionResultSeed: input.lastAction,
  }
}
