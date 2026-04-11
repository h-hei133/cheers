import type { AgentExecutionOutput, AgentRunner, AgentRole } from '../../orchestration/types.js'
import type { QueryEvent } from './events.js'
import type { QueryRuntimeState } from './runtimeState.js'
import { applyLifecycleEventToIndex } from '../tools/toolResultLifecycle.js'
import {
  ALLOWED_HANDOFFS,
  continueQuery,
  terminalQuery,
  type QueryTerminal,
} from './transitions.js'

export interface QueryLoopDependencies {
  readonly runAgent: AgentRunner
  readonly getRolePrompt: (role: QueryRuntimeState['currentRole']) => string
  readonly onEvent?: (event: QueryEvent) => void | Promise<void>
}

const DEFAULT_MAX_RETRIES_PER_TURN = 2

interface QueryRuntimeErrorLike {
  readonly message?: string
  readonly retryable?: boolean
  readonly events?: readonly QueryEvent[]
}

export async function runQueryLoop(
  state: QueryRuntimeState,
  deps: QueryLoopDependencies,
): Promise<QueryTerminal> {
  while (state.turn <= state.config.maxTurns) {
    await deps.onEvent?.({ type: 'turn.started', role: state.currentRole, turn: state.turn })

    const execution = await executeTurn(state, deps)
    if (execution.action === 'terminal') {
      return execution.terminal
    }

    const output = execution.output

    state.transcript.push(output)
    appendNotes(state, output)
    await emitOutputEvents(state, output, deps)
    await emitMessageDeltas(output, deps)
    await deps.onEvent?.({ type: 'turn.completed', output })

    const transition = getTransition(state, output)
    if (transition.action === 'terminal') {
      return transition
    }

    state.sharedContext.handoffs.push({
      from: state.currentRole,
      to: transition.nextRole,
      reason: transition.reason,
      turn: state.turn,
    })
    state.lastContinuationReason = transition.continuationReason
    state.visitedTransitions.add(transition.signature)
    state.currentRole = transition.nextRole
    state.turn += 1
  }

  return terminalQuery(
    'stopped_max_turns',
    `Maximum turns reached (${state.config.maxTurns})`,
  )
}

async function executeTurn(
  state: QueryRuntimeState,
  deps: QueryLoopDependencies,
): Promise<{ action: 'completed'; output: AgentExecutionOutput } | { action: 'terminal'; terminal: QueryTerminal }> {
  for (let attempt = 1; attempt <= DEFAULT_MAX_RETRIES_PER_TURN + 1; attempt += 1) {
    try {
      const output = await deps.runAgent({
        role: state.currentRole,
        rolePrompt: deps.getRolePrompt(state.currentRole),
        turn: state.turn,
        maxTurns: state.config.maxTurns,
        sharedContext: state.sharedContext,
        transcript: state.transcript,
      })

      return { action: 'completed', output }
    } catch (error) {
      const queryError = toQueryRuntimeError(error)
      const compensationEvents = compensateToolLifecycle(queryError.events ?? [])

      for (const event of queryError.events ?? []) {
        state.pendingLifecycle = applyLifecycleEventToIndex(state.pendingLifecycle, event)
        await deps.onEvent?.(event)
      }
      for (const event of compensationEvents) {
        state.pendingLifecycle = applyLifecycleEventToIndex(state.pendingLifecycle, event)
        await deps.onEvent?.(event)
      }

      if (queryError.retryable === true && attempt <= DEFAULT_MAX_RETRIES_PER_TURN) {
        state.lastContinuationReason = 'retryable-error'
        await deps.onEvent?.({
          type: 'query.retrying',
          role: state.currentRole,
          turn: state.turn,
          attempt,
          reason: queryError.message ?? 'Retryable query runtime error',
        })
        continue
      }

      return {
        action: 'terminal',
        terminal: terminalQuery(
          'stopped_error',
          queryError.message ?? (error instanceof Error ? error.message : String(error)),
        ),
      }
    }
  }

  return {
    action: 'terminal',
    terminal: terminalQuery('stopped_error', 'Retry budget exhausted'),
  }
}

async function emitOutputEvents(
  state: QueryRuntimeState,
  output: AgentExecutionOutput,
  deps: QueryLoopDependencies,
): Promise<void> {
  for (const event of output.events ?? []) {
    state.pendingLifecycle = applyLifecycleEventToIndex(state.pendingLifecycle, event)
    await deps.onEvent?.(event)
  }

  for (const event of compensateToolLifecycle(output.events ?? [])) {
    state.pendingLifecycle = applyLifecycleEventToIndex(state.pendingLifecycle, event)
    await deps.onEvent?.(event)
  }
}

async function emitMessageDeltas(output: AgentExecutionOutput, deps: QueryLoopDependencies): Promise<void> {
  for (const word of output.content.split(' ')) {
    if (word.length > 0) {
      await deps.onEvent?.({ type: 'message.delta', role: output.role, delta: `${word} ` })
    }
  }
}

function toQueryRuntimeError(error: unknown): QueryRuntimeErrorLike {
  if (typeof error === 'object' && error !== null) {
    return error as QueryRuntimeErrorLike
  }

  return { message: String(error) }
}

function compensateToolLifecycle(events: readonly QueryEvent[]): QueryEvent[] {
  const pendingToolStarts = new Map<string, Extract<QueryEvent, { type: 'tool.started' }>>()
  const pendingApprovals = new Map<string, Extract<QueryEvent, { type: 'approval.requested' }>>()

  for (const event of events) {
    switch (event.type) {
      case 'tool.started':
        pendingToolStarts.set(event.taskId, event)
        break
      case 'approval.requested':
        pendingApprovals.set(event.taskId, event)
        break
      case 'approval.resolved':
        pendingApprovals.delete(event.taskId)
        break
      case 'tool.result':
        pendingToolStarts.delete(event.taskId)
        break
      default:
        break
    }
  }

  const compensated: QueryEvent[] = []
  for (const pendingApproval of pendingApprovals.values()) {
    compensated.push({
      type: 'approval.resolved',
      toolName: pendingApproval.toolName,
      taskId: pendingApproval.taskId,
      outcome: 'denied',
      compensated: true,
    })
  }
  for (const pendingTool of pendingToolStarts.values()) {
    compensated.push({
      type: 'tool.result',
      toolName: pendingTool.toolName,
      taskId: pendingTool.taskId,
      success: false,
      compensated: true,
    })
  }

  return compensated
}

function appendNotes(state: QueryRuntimeState, output: AgentExecutionOutput): void {
  if (!output.notes?.length) {
    return
  }

  state.sharedContext.notes.push(...output.notes)
}

function getTransition(
  state: QueryRuntimeState,
  output: AgentExecutionOutput,
) {
  const handoffTo = output.handoffTo
  if (!handoffTo) {
    return terminalQuery('completed')
  }

  if (!ALLOWED_HANDOFFS[state.currentRole].includes(handoffTo)) {
    return terminalQuery(
      'stopped_invalid_handoff',
      `Invalid handoff ${state.currentRole} -> ${handoffTo}`,
    )
  }

  const transition = continueQuery(
    state.currentRole,
    handoffTo,
    output.handoffReason ?? 'unspecified',
  )

  if (state.visitedTransitions.has(transition.signature)) {
    return terminalQuery(
      'stopped_cycle',
      `Cycle detected at ${transition.signature}`,
    )
  }

  return transition
}
