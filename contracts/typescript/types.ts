export const RUNTIME_PROTOCOL_SCHEMA_VERSION = '1.0.0' as const

export type SchemaVersion = `${number}.${number}.${number}`

export type RuntimeOrigin =
  | 'typescript'
  | 'rust'
  | 'python'
  | 'user'
  | 'system'
  | 'external'

export type RuntimeErrorCode =
  | 'E_SCHEMA_VERSION_REQUIRED'
  | 'E_SCHEMA_VERSION_FORMAT'
  | 'E_COMPATIBILITY_UNSUPPORTED'
  | 'E_KIND_INVALID'
  | 'E_FIELD_REQUIRED'
  | 'E_FIELD_INVALID_TYPE'
  | 'E_FIELD_INVALID_VALUE'
  | 'E_COMMAND_INVALID'
  | 'E_TASK_STATUS_INVALID'
  | 'E_PERMISSION_RESPONSE_INVALID'
  | 'E_CANCELLATION_INVALID'

type BaseMessage<K extends string> = {
  schemaVersion: SchemaVersion
  kind: K
}

export type CommandRequest = BaseMessage<'command.request'> & {
  commandId: string
  taskId: string
  commandName: string
  args: Record<string, unknown>
  requestedBy: RuntimeOrigin
  issuedAt: number
  correlationId?: string
}

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'killed'
  | 'cancelled'

export type TaskLifecycleEvent = BaseMessage<'task.lifecycle'> & {
  eventId: string
  taskId: string
  status: TaskStatus
  previousStatus?: TaskStatus
  message?: string
  progress?: number
  timestamp: number
}

export type StreamChannel =
  | 'stdout'
  | 'stderr'
  | 'system'
  | 'assistant'
  | 'tool'

export type StreamChunk = BaseMessage<'stream.chunk'> & {
  streamId: string
  taskId: string
  channel: StreamChannel
  chunkIndex: number
  content: string
  isFinal: boolean
  emittedAt: number
}

export type RuntimeErrorPayload = BaseMessage<'runtime.error'> & {
  errorId: string
  taskId?: string
  code: RuntimeErrorCode
  message: string
  recoverable: boolean
  details?: Record<string, unknown>
  emittedAt: number
}

export type PermissionScopeMode =
  | 'read'
  | 'write'
  | 'execute'
  | 'network'
  | 'system'

export type PermissionDecision = 'allow' | 'deny' | 'ask'

export type PermissionPrompt = BaseMessage<'permission.prompt'> & {
  promptId: string
  taskId: string
  toolName: string
  action: string
  rationale?: string
  scope: {
    mode: PermissionScopeMode
    target: string
  }
  defaultDecision: PermissionDecision
  requestedAt: number
  expiresAt?: number
}

export type CancellationRequest = BaseMessage<'task.cancel'> & {
  requestId: string
  taskId: string
  reason?: string
  requestedBy: RuntimeOrigin
  requestedAt: number
  immediate: boolean
  correlationId?: string
}

export type RuntimeProtocolMessage =
  | CommandRequest
  | TaskLifecycleEvent
  | StreamChunk
  | RuntimeErrorPayload
  | PermissionPrompt
  | CancellationRequest

export type ValidationFailure = {
  code: RuntimeErrorCode
  message: string
  path?: string
}

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

export function validateSchemaVersion(value: unknown): ValidationFailure[] {
  if (value === undefined) {
    return [
      {
        code: 'E_SCHEMA_VERSION_REQUIRED',
        message: 'schemaVersion is required',
        path: '/schemaVersion',
      },
    ]
  }
  if (typeof value !== 'string' || !SEMVER_RE.test(value)) {
    return [
      {
        code: 'E_SCHEMA_VERSION_FORMAT',
        message: 'schemaVersion must match major.minor.patch',
        path: '/schemaVersion',
      },
    ]
  }
  return []
}
