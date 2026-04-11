import type { QueryEvent } from '../query/events.js'
import type { ToolExecutionResult } from '../../tools/types.js'

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
  event: QueryEvent,
): DurableLifecycleIndex {
  if (
    event.type !== 'approval.requested' &&
    event.type !== 'approval.resolved' &&
    event.type !== 'tool.started' &&
    event.type !== 'tool.result'
  ) {
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
