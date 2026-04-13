import { describe, expect, it } from 'vitest'
import type { AgentRunner } from '../../orchestration/types.js'
import { QueryEngine } from './QueryEngine.js'

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
      'turn.started',
      'mcp.snapshot',
      'tool.started',
      'approval.requested',
      'approval.resolved',
      'tool.result',
      'tool.result',
      'message.delta',
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
})
