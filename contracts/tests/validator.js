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
  'rust',
  'python',
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

const KIND_REQUIRED_FIELDS = {
  'command.request': [
    'commandId',
    'taskId',
    'commandName',
    'args',
    'requestedBy',
    'issuedAt',
  ],
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
