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

export type ExecutionAuthorityMode =
  | 'none-required'
  | 'read-only'
  | 'preview'
  | 'permission-pending'
  | 'denied'
  | 'approved-for-write'
  | 'command-allowlisted'
  | 'sandbox-approved'
  | 'sandbox-rejected'
  | 'unknown-transitional'

export type ExecutionAuthoritySource =
  | 'tool-runtime-approval'
  | 'workspace-authority'
  | 'daemon-sandbox'
  | 'none'
  | 'unknown-transitional'

export type ExecutionPath = 'ts-local' | 'rust-daemon'
export type ExecutionStatus = 'completed' | 'failed' | 'timeout' | 'cancelled'
export type ExecutionFailureKind =
  | 'sandbox_preflight'
  | 'execution_failure'
  | 'timeout'
  | 'cancelled'

export type ExecutionCommandRequest = {
  operationKind: 'command.run'
  command: string
  args: readonly string[]
  cwd: string
  workspaceRoot: string
  authority: {
    mode: ExecutionAuthorityMode
    source: ExecutionAuthoritySource
    reason: string
  }
  caller: string
  reason: string
  reportSafeCommand: string
  timeoutMs?: number
}

export type ExecutionEvent =
  | {
      kind: 'execution.started'
      operationKind: 'command.run'
      executionPath: ExecutionPath
      authorityMode: ExecutionAuthorityMode
      caller: string
      reportSafeCommand: string
      timeoutMs?: number
    }
  | {
      kind: 'execution.exited'
      operationKind: 'command.run'
      executionPath: ExecutionPath
      authorityMode: ExecutionAuthorityMode
      status: 'completed'
      exitCode: number | null
    }
  | {
      kind: 'execution.failed' | 'execution.timed_out' | 'execution.cancelled'
      operationKind: 'command.run'
      executionPath: ExecutionPath
      authorityMode: ExecutionAuthorityMode
      status: 'failed' | 'timeout' | 'cancelled'
      exitCode: number | null
      failureKind: ExecutionFailureKind
      recoveryReason?: string
    }

export type ExecutionCommandResult = {
  status: ExecutionStatus
  exitCode: number | null
  stdout: string
  stderr: string
  failureKind?: ExecutionFailureKind
  executionPath: ExecutionPath
  events: readonly ExecutionEvent[]
}

export type ExecutionCommandContract = BaseMessage<'execution.command.contract'> & {
  request: ExecutionCommandRequest
  results: {
    completed: ExecutionCommandResult & { status: 'completed' }
    failed: ExecutionCommandResult & { status: 'failed'; failureKind: ExecutionFailureKind }
    timedOut: ExecutionCommandResult & { status: 'timeout'; failureKind: 'timeout' }
    cancelled: ExecutionCommandResult & { status: 'cancelled'; failureKind: 'cancelled' }
  }
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
  | ExecutionCommandContract
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
