const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

const SUPPORTED_MAJOR = 1

const TASK_STATUSES = new Set([
  'pending',
  'running',
  'completed',
  'failed',
  'killed',
  'cancelled',
])
const STREAM_CHANNELS = new Set(['stdout', 'stderr', 'system', 'assistant', 'tool'])
const RUNTIME_ORIGINS = new Set([
  'typescript',
  'user',
  'system',
  'external',
])
const PERMISSION_SCOPE_MODES = new Set([
  'read',
  'write',
  'execute',
  'network',
  'system',
])
const PERMISSION_DECISIONS = new Set(['allow', 'deny', 'ask'])
const EXECUTION_AUTHORITY_MODES = new Set([
  'none-required',
  'read-only',
  'preview',
  'permission-pending',
  'denied',
  'approved-for-write',
  'command-allowlisted',
  'sandbox-approved',
  'sandbox-rejected',
  'unknown-transitional',
])
const EXECUTION_AUTHORITY_SOURCES = new Set([
  'tool-runtime-approval',
  'workspace-authority',
  'none',
  'unknown-transitional',
])
const EXECUTION_PATHS = new Set(['ts-local'])
const EXECUTION_STATUSES = new Set(['completed', 'failed', 'timeout', 'cancelled'])
const EXECUTION_FAILURE_KINDS = new Set([
  'sandbox_preflight',
  'execution_failure',
  'timeout',
  'cancelled',
])
const EXECUTION_EVENT_KINDS = new Set([
  'execution.started',
  'execution.exited',
  'execution.failed',
  'execution.timed_out',
  'execution.cancelled',
])

const KIND_REQUIRED_FIELDS = {
  'command.request': [
    'commandId',
    'taskId',
    'commandName',
    'args',
    'requestedBy',
    'issuedAt',
  ],
  'execution.command.contract': ['request', 'results'],
  'task.lifecycle': ['eventId', 'taskId', 'status', 'timestamp'],
  'stream.chunk': [
    'streamId',
    'taskId',
    'channel',
    'chunkIndex',
    'content',
    'isFinal',
    'emittedAt',
  ],
  'runtime.error': [
    'errorId',
    'code',
    'message',
    'recoverable',
    'emittedAt',
  ],
  'permission.prompt': [
    'promptId',
    'taskId',
    'toolName',
    'action',
    'scope',
    'defaultDecision',
    'requestedAt',
  ],
  'task.cancel': ['requestId', 'taskId', 'requestedBy', 'requestedAt', 'immediate'],
}

const KIND_OPTIONAL_FIELDS = {
  'command.request': ['correlationId'],
  'execution.command.contract': [],
  'task.lifecycle': ['previousStatus', 'message', 'progress'],
  'stream.chunk': [],
  'runtime.error': ['taskId', 'details'],
  'permission.prompt': ['rationale', 'expiresAt'],
  'task.cancel': ['reason', 'correlationId'],
}

const COMMON_FIELDS = ['schemaVersion', 'kind']

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value) {
  return typeof value === 'string'
}

function isInteger(value) {
  return Number.isInteger(value) && value >= 0
}

function failure(code, message, path) {
  return { code, message, path }
}

function parseMajor(version) {
  const major = version.split('.')[0]
  return Number.parseInt(major, 10)
}

export function validatePayload(payload) {
  if (!isObject(payload)) {
    return [failure('E_FIELD_INVALID_TYPE', 'payload must be an object', '/')]
  }

  if (payload.schemaVersion === undefined) {
    return [
      failure(
        'E_SCHEMA_VERSION_REQUIRED',
        'schemaVersion is required',
        '/schemaVersion',
      ),
    ]
  }

  if (!isString(payload.schemaVersion) || !SEMVER_RE.test(payload.schemaVersion)) {
    return [
      failure(
        'E_SCHEMA_VERSION_FORMAT',
        'schemaVersion must match major.minor.patch',
        '/schemaVersion',
      ),
    ]
  }

  if (parseMajor(payload.schemaVersion) !== SUPPORTED_MAJOR) {
    return [
      failure(
        'E_COMPATIBILITY_UNSUPPORTED',
        `unsupported schema major version: ${payload.schemaVersion}`,
        '/schemaVersion',
      ),
    ]
  }

  if (!isString(payload.kind) || !Object.hasOwn(KIND_REQUIRED_FIELDS, payload.kind)) {
    return [failure('E_KIND_INVALID', 'kind is invalid or unsupported', '/kind')]
  }

  for (const field of KIND_REQUIRED_FIELDS[payload.kind]) {
    if (payload[field] === undefined) {
      return [
        failure('E_FIELD_REQUIRED', `${field} is required for ${payload.kind}`, `/${field}`),
      ]
    }
  }

  const allowedFields = new Set([
    ...COMMON_FIELDS,
    ...KIND_REQUIRED_FIELDS[payload.kind],
    ...(KIND_OPTIONAL_FIELDS[payload.kind] ?? []),
  ])
  for (const key of Object.keys(payload)) {
    if (!allowedFields.has(key)) {
      return [
        failure(
          'E_FIELD_UNKNOWN',
          `${key} is not allowed for ${payload.kind}`,
          `/${key}`,
        ),
      ]
    }
  }

  switch (payload.kind) {
    case 'command.request': {
      if (!isString(payload.commandId) || !isString(payload.commandName) || !isString(payload.taskId)) {
        return [
          failure(
            'E_COMMAND_INVALID',
            'commandId, commandName, and taskId must be strings',
            '/commandId',
          ),
        ]
      }
      if (!isObject(payload.args)) {
        return [failure('E_FIELD_INVALID_TYPE', 'args must be an object', '/args')]
      }
      if (!RUNTIME_ORIGINS.has(payload.requestedBy)) {
        return [failure('E_FIELD_INVALID_VALUE', 'requestedBy is invalid', '/requestedBy')]
      }
      if (!isInteger(payload.issuedAt)) {
        return [failure('E_FIELD_INVALID_TYPE', 'issuedAt must be an integer >= 0', '/issuedAt')]
      }
      return []
    }
    case 'execution.command.contract': {
      return validateExecutionCommandContract(payload)
    }
    case 'task.lifecycle': {
      if (!TASK_STATUSES.has(payload.status)) {
        return [failure('E_TASK_STATUS_INVALID', 'status is invalid', '/status')]
      }
      if (payload.previousStatus !== undefined && !TASK_STATUSES.has(payload.previousStatus)) {
        return [
          failure('E_TASK_STATUS_INVALID', 'previousStatus is invalid', '/previousStatus'),
        ]
      }
      if (!isInteger(payload.timestamp)) {
        return [failure('E_FIELD_INVALID_TYPE', 'timestamp must be an integer >= 0', '/timestamp')]
      }
      return []
    }
    case 'stream.chunk': {
      if (!STREAM_CHANNELS.has(payload.channel)) {
        return [failure('E_FIELD_INVALID_VALUE', 'channel is invalid', '/channel')]
      }
      if (!isInteger(payload.chunkIndex)) {
        return [
          failure('E_FIELD_INVALID_TYPE', 'chunkIndex must be an integer >= 0', '/chunkIndex'),
        ]
      }
      if (typeof payload.isFinal !== 'boolean') {
        return [failure('E_FIELD_INVALID_TYPE', 'isFinal must be boolean', '/isFinal')]
      }
      if (!isInteger(payload.emittedAt)) {
        return [
          failure('E_FIELD_INVALID_TYPE', 'emittedAt must be an integer >= 0', '/emittedAt'),
        ]
      }
      return []
    }
    case 'runtime.error': {
      if (!isString(payload.code) || !payload.code.startsWith('E_')) {
        return [failure('E_FIELD_INVALID_VALUE', 'code must be a protocol E_* error code', '/code')]
      }
      if (typeof payload.recoverable !== 'boolean') {
        return [
          failure('E_FIELD_INVALID_TYPE', 'recoverable must be boolean', '/recoverable'),
        ]
      }
      if (!isInteger(payload.emittedAt)) {
        return [
          failure('E_FIELD_INVALID_TYPE', 'emittedAt must be an integer >= 0', '/emittedAt'),
        ]
      }
      return []
    }
    case 'permission.prompt': {
      if (!isObject(payload.scope)) {
        return [failure('E_FIELD_INVALID_TYPE', 'scope must be an object', '/scope')]
      }
      if (!PERMISSION_SCOPE_MODES.has(payload.scope.mode)) {
        return [
          failure(
            'E_PERMISSION_RESPONSE_INVALID',
            'scope.mode is invalid for permission prompt',
            '/scope/mode',
          ),
        ]
      }
      if (!isString(payload.scope.target)) {
        return [
          failure(
            'E_PERMISSION_RESPONSE_INVALID',
            'scope.target must be a string',
            '/scope/target',
          ),
        ]
      }
      if (!PERMISSION_DECISIONS.has(payload.defaultDecision)) {
        return [
          failure(
            'E_PERMISSION_RESPONSE_INVALID',
            'defaultDecision is invalid',
            '/defaultDecision',
          ),
        ]
      }
      if (!isInteger(payload.requestedAt)) {
        return [
          failure('E_FIELD_INVALID_TYPE', 'requestedAt must be an integer >= 0', '/requestedAt'),
        ]
      }
      return []
    }
    case 'task.cancel': {
      if (!RUNTIME_ORIGINS.has(payload.requestedBy)) {
        return [
          failure(
            'E_CANCELLATION_INVALID',
            'requestedBy is invalid for cancellation',
            '/requestedBy',
          ),
        ]
      }
      if (!isInteger(payload.requestedAt)) {
        return [
          failure(
            'E_CANCELLATION_INVALID',
            'requestedAt must be an integer >= 0',
            '/requestedAt',
          ),
        ]
      }
      if (typeof payload.immediate !== 'boolean') {
        return [
          failure('E_CANCELLATION_INVALID', 'immediate must be boolean', '/immediate'),
        ]
      }
      return []
    }
    default:
      return [failure('E_KIND_INVALID', 'kind is invalid or unsupported', '/kind')]
  }
}

function validateExecutionCommandContract(payload) {
  if (!isObject(payload.request)) {
    return [failure('E_FIELD_INVALID_TYPE', 'request must be an object', '/request')]
  }
  const requestFailure = validateExecutionCommandRequest(payload.request, '/request')
  if (requestFailure) {
    return [requestFailure]
  }

  if (!isObject(payload.results)) {
    return [failure('E_FIELD_INVALID_TYPE', 'results must be an object', '/results')]
  }
  for (const key of ['completed', 'failed', 'timedOut', 'cancelled']) {
    if (!isObject(payload.results[key])) {
      return [
        failure(
          'E_FIELD_REQUIRED',
          `results.${key} is required for execution.command.contract`,
          `/results/${key}`,
        ),
      ]
    }
    const resultFailure = validateExecutionCommandResult(payload.results[key], `/results/${key}`)
    if (resultFailure) {
      return [resultFailure]
    }
  }

  const expectedStatuses = {
    completed: 'completed',
    failed: 'failed',
    timedOut: 'timeout',
    cancelled: 'cancelled',
  }
  for (const [key, expectedStatus] of Object.entries(expectedStatuses)) {
    if (payload.results[key].status !== expectedStatus) {
      return [
        failure(
          'E_FIELD_INVALID_VALUE',
          `results.${key}.status must be ${expectedStatus}`,
          `/results/${key}/status`,
        ),
      ]
    }
  }

  return []
}

function validateExecutionCommandRequest(request, basePath) {
  const required = [
    'operationKind',
    'command',
    'args',
    'cwd',
    'workspaceRoot',
    'authority',
    'caller',
    'reason',
    'reportSafeCommand',
  ]
  for (const field of required) {
    if (request[field] === undefined) {
      return failure('E_FIELD_REQUIRED', `${field} is required`, `${basePath}/${field}`)
    }
  }
  if (request.operationKind !== 'command.run') {
    return failure('E_FIELD_INVALID_VALUE', 'operationKind must be command.run', `${basePath}/operationKind`)
  }
  if (
    !isString(request.command) ||
    !Array.isArray(request.args) ||
    !request.args.every(isString) ||
    !isString(request.cwd) ||
    !isString(request.workspaceRoot) ||
    !isString(request.caller) ||
    !isString(request.reason) ||
    !isString(request.reportSafeCommand)
  ) {
    return failure('E_FIELD_INVALID_TYPE', 'command request fields are invalid', basePath)
  }
  if (request.timeoutMs !== undefined && !isInteger(request.timeoutMs)) {
    return failure('E_FIELD_INVALID_TYPE', 'timeoutMs must be an integer >= 0', `${basePath}/timeoutMs`)
  }
  if (!isObject(request.authority)) {
    return failure('E_FIELD_INVALID_TYPE', 'authority must be an object', `${basePath}/authority`)
  }
  if (!EXECUTION_AUTHORITY_MODES.has(request.authority.mode)) {
    return failure('E_FIELD_INVALID_VALUE', 'authority.mode is invalid', `${basePath}/authority/mode`)
  }
  if (!EXECUTION_AUTHORITY_SOURCES.has(request.authority.source)) {
    return failure('E_FIELD_INVALID_VALUE', 'authority.source is invalid', `${basePath}/authority/source`)
  }
  if (!isString(request.authority.reason)) {
    return failure('E_FIELD_INVALID_TYPE', 'authority.reason must be a string', `${basePath}/authority/reason`)
  }
  if (hasVagueAuthorityBoolean(request)) {
    return failure('E_FIELD_INVALID_VALUE', 'execution authority must not use vague boolean fields', basePath)
  }
  return null
}

function validateExecutionCommandResult(result, basePath) {
  if (
    !EXECUTION_STATUSES.has(result.status) ||
    !(Number.isInteger(result.exitCode) || result.exitCode === null) ||
    !isString(result.stdout) ||
    !isString(result.stderr) ||
    !EXECUTION_PATHS.has(result.executionPath) ||
    !Array.isArray(result.events)
  ) {
    return failure('E_FIELD_INVALID_TYPE', 'execution result fields are invalid', basePath)
  }
  if (result.failureKind !== undefined && !EXECUTION_FAILURE_KINDS.has(result.failureKind)) {
    return failure('E_FIELD_INVALID_VALUE', 'failureKind is invalid', `${basePath}/failureKind`)
  }
  if (result.status !== 'completed' && result.failureKind === undefined) {
    return failure('E_FIELD_REQUIRED', 'failureKind is required for non-completed results', `${basePath}/failureKind`)
  }
  for (const [index, event] of result.events.entries()) {
    const eventFailure = validateExecutionEvent(event, `${basePath}/events/${index}`)
    if (eventFailure) {
      return eventFailure
    }
  }
  return null
}

function validateExecutionEvent(event, basePath) {
  if (!isObject(event)) {
    return failure('E_FIELD_INVALID_TYPE', 'execution event must be an object', basePath)
  }
  if (!EXECUTION_EVENT_KINDS.has(event.kind)) {
    return failure('E_FIELD_INVALID_VALUE', 'execution event kind is invalid', `${basePath}/kind`)
  }
  if (event.operationKind !== 'command.run') {
    return failure('E_FIELD_INVALID_VALUE', 'event operationKind must be command.run', `${basePath}/operationKind`)
  }
  if (!EXECUTION_PATHS.has(event.executionPath)) {
    return failure('E_FIELD_INVALID_VALUE', 'event executionPath is invalid', `${basePath}/executionPath`)
  }
  if (!EXECUTION_AUTHORITY_MODES.has(event.authorityMode)) {
    return failure('E_FIELD_INVALID_VALUE', 'event authorityMode is invalid', `${basePath}/authorityMode`)
  }
  if (event.kind === 'execution.started') {
    if (!isString(event.caller) || !isString(event.reportSafeCommand)) {
      return failure('E_FIELD_REQUIRED', 'started event requires caller and reportSafeCommand', basePath)
    }
    return null
  }
  if (!EXECUTION_STATUSES.has(event.status) || !(Number.isInteger(event.exitCode) || event.exitCode === null)) {
    return failure('E_FIELD_INVALID_TYPE', 'terminal event status or exitCode is invalid', basePath)
  }
  if (event.kind !== 'execution.exited' && !EXECUTION_FAILURE_KINDS.has(event.failureKind)) {
    return failure('E_FIELD_REQUIRED', 'failure event requires failureKind', `${basePath}/failureKind`)
  }
  return null
}

function hasVagueAuthorityBoolean(value) {
  if (!isObject(value)) {
    return false
  }
  for (const [key, item] of Object.entries(value)) {
    if (['allowed', 'approved', 'enabled', 'safe'].includes(key) && typeof item === 'boolean') {
      return true
    }
    if (isObject(item) && hasVagueAuthorityBoolean(item)) {
      return true
    }
  }
  return false
}
