import { describe, expect, it } from 'vitest'
import type { AgentRunner, CodingResultSummary } from '../../../orchestration/types.js'
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
            observedEvidence: ['source receipt'],
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
})

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
