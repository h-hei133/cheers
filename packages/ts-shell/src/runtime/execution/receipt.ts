import {
  classifyCommandExecutionOutcome,
  sanitizeExecutionReportText,
  type ExecutionErrorClass,
} from './error.js'
import type {
  CommandExecutionRequest,
  CommandExecutionResult,
  ExecutionAuthorityMode,
  ExecutionOperationKind,
  ExecutionPolicyMetadata,
  ExecutionReceiptRedactionStatus,
  RuntimeExecutionReceiptProjection,
} from './types.js'

export type { ExecutionReceiptRedactionStatus, RuntimeExecutionReceiptProjection } from './types.js'

export function createCommandExecutionReceipt(input: {
  readonly request: CommandExecutionRequest
  readonly result: Pick<
    CommandExecutionResult,
    'status' | 'exitCode' | 'failureKind' | 'stdout' | 'stderr' | 'recoveryReason'
  >
  readonly turnSnapshotId?: string
  readonly savePointId?: string
}): RuntimeExecutionReceiptProjection {
  const redactions = new Set<string>()
  const requestedActionSummary = sanitizeWithTracking(
    input.request.reportSafeCommand,
    redactions,
    180,
  )
  const caller = sanitizeWithTracking(input.request.caller, redactions, 120)
  const outputSummary = summarizeCommandOutput(input.result, redactions)
  const policy = input.request.policy
    ? sanitizeExecutionPolicy(input.request.policy, redactions)
    : undefined
  const classification = classifyCommandExecutionOutcome({
    status: input.result.status,
    exitCode: input.result.exitCode,
    failureKind: input.result.failureKind,
    authorityMode: input.request.authority.mode,
    stderr: input.result.stderr,
    recoveryReason: input.result.recoveryReason,
  })
  const receiptId = [
    'execution-receipt',
    input.request.operationKind,
    input.request.caller,
    input.result.status,
    classification.errorClass,
    requestedActionSummary,
  ].map(normalizeReceiptIdPart).filter(Boolean).join(':').slice(0, 180)
  const redactionStatus = redactions.size > 0 ? 'redacted' : 'report-safe'

  return Object.freeze({
    receiptId: receiptId || 'execution-receipt:command',
    caller,
    operationKind: input.request.operationKind,
    authorityMode: input.request.authority.mode,
    requestedActionSummary,
    executionStatus: classification.executionStatus,
    errorClass: classification.errorClass,
    exitCode: input.result.exitCode,
    timedOut: input.result.status === 'timeout',
    cancelled: input.result.status === 'cancelled',
    outputSummaryRedactionStatus: redactionStatus,
    evidenceCorrelationId: `execution-receipt:${classification.errorClass}:${input.result.status}`,
    ...(input.turnSnapshotId ? { turnSnapshotId: input.turnSnapshotId } : {}),
    ...(input.savePointId ? { savePointId: input.savePointId } : {}),
    ...(policy ? { policy } : {}),
    notProvenClaims: Object.freeze([
      'terminal-task-success',
      'provider-success',
      'verification-success',
      'repair-success',
      ...(policy?.notProvenClaims ?? []),
    ]),
    redaction: Object.freeze({
      status: redactionStatus,
      redactions: Object.freeze(Array.from(redactions).sort()),
    }),
    ...(outputSummary ? { outputSummary } : {}),
  })
}

function sanitizeExecutionPolicy(
  policy: ExecutionPolicyMetadata,
  redactions: Set<string>,
): ExecutionPolicyMetadata {
  return Object.freeze({
    decisionId: sanitizeWithTracking(policy.decisionId, redactions, 160),
    decisionStatus: sanitizeWithTracking(policy.decisionStatus, redactions, 80),
    policySource: sanitizeWithTracking(policy.policySource, redactions, 120),
    authorityRequirement: policy.authorityRequirement,
    redactionStatus: policy.redactionStatus,
    reportSafeSummary: sanitizeWithTracking(policy.reportSafeSummary, redactions, 180),
    terminalSuccessClaim: false,
    notProvenClaims: Object.freeze([...policy.notProvenClaims]),
  })
}

function summarizeCommandOutput(
  result: Pick<CommandExecutionResult, 'stdout' | 'stderr' | 'recoveryReason'>,
  redactions: Set<string>,
): string | undefined {
  const combined = [result.recoveryReason, result.stderr, result.stdout]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n')
  if (!combined.trim()) {
    return undefined
  }
  return sanitizeWithTracking(combined, redactions, 240)
}

function sanitizeWithTracking(value: string, redactions: Set<string>, maxLength: number): string {
  const sanitized = sanitizeExecutionReportText(value, maxLength)
  if (sanitized !== value.replace(/\s+/g, ' ').trim().slice(0, maxLength)) {
    redactions.add('unsafe-content-redacted')
  }
  if (value.length > maxLength) {
    redactions.add('output-truncated')
  }
  return sanitized
}

function normalizeReceiptIdPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '')
}
