import type { CommandExecutionResult, ExecutionAuthorityMode } from './service.js'

export type ExecutionErrorClass =
  | 'success'
  | 'command_failed'
  | 'command_not_allowed'
  | 'command_unavailable'
  | 'timeout'
  | 'cancelled'
  | 'environment_error'
  | 'filesystem_error'
  | 'permission_denied'
  | 'policy_blocked'
  | 'invalid_request'
  | 'unknown_error'

export interface ExecutionOutcomeClassification {
  readonly executionStatus: 'success' | 'failure'
  readonly errorClass: ExecutionErrorClass
  readonly reportSafeReason: string
}

export function classifyCommandExecutionOutcome(input: {
  readonly status: CommandExecutionResult['status']
  readonly exitCode: number | null
  readonly failureKind?: CommandExecutionResult['failureKind']
  readonly authorityMode: ExecutionAuthorityMode
  readonly stderr?: string
  readonly recoveryReason?: string
}): ExecutionOutcomeClassification {
  if (input.status === 'completed' && (input.exitCode === 0 || input.exitCode === null)) {
    return {
      executionStatus: 'success',
      errorClass: 'success',
      reportSafeReason: 'Command execution completed.',
    }
  }

  if (input.status === 'timeout' || input.failureKind === 'timeout') {
    return failure('timeout', 'Command execution timed out.')
  }

  if (input.status === 'cancelled' || input.failureKind === 'cancelled') {
    return failure('cancelled', 'Command execution was cancelled.')
  }

  if (input.authorityMode === 'denied') {
    return failure('command_not_allowed', 'Command execution was denied before dispatch.')
  }

  if (input.authorityMode === 'sandbox-rejected' || input.failureKind === 'sandbox_preflight') {
    return failure('policy_blocked', 'Command execution was blocked by runtime policy.')
  }

  const reason = `${input.recoveryReason ?? ''}\n${input.stderr ?? ''}`.toLowerCase()
  if (/\b(eacces|eperm|permission denied|operation not permitted)\b/.test(reason)) {
    return failure('permission_denied', 'Command execution hit a permission boundary.')
  }

  if (/\b(enoent|not found|command not found|no such file or directory)\b/.test(reason)) {
    return failure('command_unavailable', 'Command runtime or executable was unavailable.')
  }

  if (/\b(eisdir|enotdir|filesystem|file system|read-only file system)\b/.test(reason)) {
    return failure('filesystem_error', 'Command execution hit a filesystem boundary.')
  }

  if (input.recoveryReason) {
    return failure('environment_error', sanitizeExecutionReportText(input.recoveryReason))
  }

  if (input.status === 'failed') {
    return failure('command_failed', 'Command execution returned a failing result.')
  }

  return failure('unknown_error', 'Command execution failed for an unknown reason.')
}

export function sanitizeExecutionReportText(value: string, maxLength = 240): string {
  return value
    .replace(/<html[\s\S]*?<\/html>/gi, '[raw-content-excluded]')
    .replace(/<body[\s\S]*?<\/body>/gi, '[raw-content-excluded]')
    .replace(/\b(raw\s+provider\s+output|hidden\s+reasoning|chain[-\s]?of[-\s]?thought|transcript dump)\b/gi, '[unsafe-content-excluded]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[secret-redacted]')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]')
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[secret-redacted]')
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, '[redacted-real-provider-home]')
    .replace(/\b(oldText|newText)\b\s*[:=]\s*("[^"]*"|'[^']*'|\S+)/gi, '$1=[raw-edit-content-excluded]')
    .replace(/(?:^|\n)(?:[^\n]{0,200}\n){40,}/g, '\n[long-output-excluded]\n')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function failure(
  errorClass: Exclude<ExecutionErrorClass, 'success'>,
  reportSafeReason: string,
): ExecutionOutcomeClassification {
  return {
    executionStatus: 'failure',
    errorClass,
    reportSafeReason: sanitizeExecutionReportText(reportSafeReason),
  }
}
