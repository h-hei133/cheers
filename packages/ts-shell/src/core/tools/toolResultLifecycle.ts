import type { ToolExecutionResult } from '../../tools/types.js'

/**
 * The only event shapes this index reacts to.
 *
 * Deliberately structural rather than an import of `QueryEvent`: the query
 * runtime's event module reaches back into this one through state, so importing
 * it here would close a dependency cycle. A full `QueryEvent` satisfies this
 * type, and the early return below ignores everything else.
 */
export type LifecycleEventLike =
  | { readonly type: 'approval.requested'; readonly taskId: string; readonly toolName: string }
  | {
      readonly type: 'approval.resolved'
      readonly taskId: string
      readonly toolName: string
      readonly outcome?: 'approved' | 'denied'
      readonly compensated?: boolean
    }
  | { readonly type: 'tool.started'; readonly taskId: string; readonly toolName: string }
  | {
      readonly type: 'tool.result'
      readonly taskId: string
      readonly toolName: string
      readonly success?: boolean
      readonly compensated?: boolean
    }
  | { readonly type: string; readonly taskId?: string; readonly toolName?: string }

/**
 * Whether this index reacts to the event at all. Exported because the parameter
 * type deliberately tolerates events this index ignores.
 */
export function isLifecycleEvent(event: {
  readonly type: string;
}): event is Extract<LifecycleEventLike, { readonly taskId: string }> {
  return (
    event.type === 'approval.requested' ||
    event.type === 'approval.resolved' ||
    event.type === 'tool.started' ||
    event.type === 'tool.result'
  )
}

export interface PendingApprovalEntry {
  readonly taskId: string
  readonly toolName: string
}

export interface PendingToolEntry {
  readonly taskId: string
  readonly toolName: string
}

export interface TaskLifecycleEntry {
  readonly taskId: string
  readonly toolName: string
  readonly lastEvent:
    | 'approval.requested'
    | 'approval.resolved'
    | 'tool.started'
    | 'tool.result'
  readonly outcome?: 'approved' | 'denied'
  readonly success?: boolean
  readonly compensated?: boolean
}

export interface DurableLifecycleIndex {
  readonly pendingApprovals: Record<string, PendingApprovalEntry>
  readonly pendingTools: Record<string, PendingToolEntry>
  readonly taskStates: Record<string, TaskLifecycleEntry>
}

export function createEmptyLifecycleIndex(): DurableLifecycleIndex {
  return {
    pendingApprovals: {},
    pendingTools: {},
    taskStates: {},
  }
}

export function applyLifecycleEventToIndex(
  index: DurableLifecycleIndex,
  event: LifecycleEventLike,
): DurableLifecycleIndex {
  if (!isLifecycleEvent(event)) {
    return index
  }

  const nextIndex: DurableLifecycleIndex = {
    pendingApprovals: { ...index.pendingApprovals },
    pendingTools: { ...index.pendingTools },
    taskStates: { ...index.taskStates },
  }

  switch (event.type) {
    case 'approval.requested':
      nextIndex.pendingApprovals[event.taskId] = {
        taskId: event.taskId,
        toolName: event.toolName,
      }
      nextIndex.taskStates[event.taskId] = {
        taskId: event.taskId,
        toolName: event.toolName,
        lastEvent: 'approval.requested',
      }
      return nextIndex
    case 'approval.resolved':
      delete nextIndex.pendingApprovals[event.taskId]
      nextIndex.taskStates[event.taskId] = {
        taskId: event.taskId,
        toolName: event.toolName,
        lastEvent: 'approval.resolved',
        outcome: event.outcome,
        compensated: event.compensated,
      }
      return nextIndex
    case 'tool.started':
      nextIndex.pendingTools[event.taskId] = {
        taskId: event.taskId,
        toolName: event.toolName,
      }
      nextIndex.taskStates[event.taskId] = {
        taskId: event.taskId,
        toolName: event.toolName,
        lastEvent: 'tool.started',
      }
      return nextIndex
    case 'tool.result':
      delete nextIndex.pendingTools[event.taskId]
      nextIndex.taskStates[event.taskId] = {
        taskId: event.taskId,
        toolName: event.toolName,
        lastEvent: 'tool.result',
        success: event.success,
        compensated: event.compensated,
      }
      return nextIndex
  }
}

export function approvedResult(
  output?: string,
  metadata?: Record<string, unknown>,
): ToolExecutionResult {
  return {
    success: true,
    output,
    metadata,
  }
}

export function deniedResult(
  error: string,
  metadata?: Record<string, unknown>,
): ToolExecutionResult {
  return {
    success: false,
    error,
    metadata,
  }
}

export function runtimeErrorResult(
  error: unknown,
  metadata?: Record<string, unknown>,
): ToolExecutionResult {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    metadata,
  }
}
