import { describe, expect, it } from 'vitest'
import { MultiAgentOrchestrator } from './MultiAgentOrchestrator.js'
import type { AgentRunner } from './types.js'

describe('MultiAgentOrchestrator (T7)', () => {
  it('executes planner -> coder -> reviewer with preserved shared context', async () => {
    const seenNotes = [] as number[]
    const runAgent: AgentRunner = async ({ role, sharedContext }) => {
      seenNotes.push(sharedContext.notes.length)
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
        content: `review-complete-${sharedContext.notes.length}`,
        notes: ['reviewer-note'],
      }
    }

    const orchestrator = new MultiAgentOrchestrator(runAgent)
    const result = await orchestrator.run('sess_t7', 'implement feature X', {
      maxTurns: 6,
    })

    expect(result.status).toBe('completed')
    expect(result.transcript.map(turn => turn.role)).toEqual([
      'planner',
      'coder',
      'reviewer',
    ])
    expect(result.sharedContext.handoffs).toEqual([
      { from: 'planner', to: 'coder', reason: 'plan-ready', turn: 1 },
      { from: 'coder', to: 'reviewer', reason: 'code-ready', turn: 2 },
    ])
    expect(result.sharedContext.notes).toEqual([
      'planner-note',
      'coder-saw-planner-note',
      'reviewer-note',
    ])
    expect(result.finalOutput).toContain('review-complete-2')
    expect(seenNotes).toEqual([0, 1, 2])
  })

  it('detects recursive reviewer <-> coder cycle and stops safely', async () => {
    const runAgent: AgentRunner = async ({ role }) => {
      if (role === 'planner') {
        return {
          role,
          content: 'plan',
          handoffTo: 'coder',
          handoffReason: 'start coding',
        }
      }

      if (role === 'coder') {
        return {
          role,
          content: 'code revision',
          handoffTo: 'reviewer',
          handoffReason: 'review this',
        }
      }

      return {
        role,
        content: 'needs another revision',
        handoffTo: 'coder',
        handoffReason: 'loop back',
      }
    }

    const orchestrator = new MultiAgentOrchestrator(runAgent)
    const result = await orchestrator.run('sess_t7_cycle', 'force cycle', {
      maxTurns: 10,
    })

    expect(result.status).toBe('stopped_cycle')
    expect(result.stopReason).toContain('coder->reviewer')
    expect(result.transcript.map(turn => turn.role)).toEqual([
      'planner',
      'coder',
      'reviewer',
      'coder',
    ])
  })

  it('enforces max-turn guard when no terminal output exists', async () => {
    const runAgent: AgentRunner = async ({ role }) => {
      if (role === 'planner') {
        return {
          role,
          content: 'plan',
          handoffTo: 'coder',
          handoffReason: 'start',
        }
      }

      return {
        role,
        content: 'still working',
        handoffTo: 'reviewer',
        handoffReason: 'handoff to reviewer',
      }
    }

    const orchestrator = new MultiAgentOrchestrator(runAgent)
    const result = await orchestrator.run('sess_t7_turns', 'long run', {
      maxTurns: 2,
    })

    expect(result.status).toBe('stopped_max_turns')
    expect(result.stopReason).toContain('Maximum turns reached')
    expect(result.transcript).toHaveLength(2)
  })
})
