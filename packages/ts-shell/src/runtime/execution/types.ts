import type { NormalizedExecutionResult } from '../../daemon/client.js'
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
export type ExecutionReceiptRedactionStatus = 'report-safe' | 'redacted'

export interface RuntimeExecutionReceiptProjection {
  readonly receiptId: string
  readonly caller: string
  readonly operationKind: ExecutionOperationKind
  readonly authorityMode: ExecutionAuthorityMode
  readonly requestedActionSummary: string
  readonly executionStatus: 'success' | 'failure'
  readonly errorClass: ExecutionErrorClass
  readonly exitCode: number | null
  readonly timedOut: boolean
  readonly cancelled: boolean
  readonly outputSummaryRedactionStatus: ExecutionReceiptRedactionStatus
  readonly evidenceCorrelationId: string
  readonly turnSnapshotId?: string
  readonly savePointId?: string
  readonly policy?: ExecutionPolicyMetadata
  readonly notProvenClaims: readonly string[]
  readonly redaction: {
    readonly status: ExecutionReceiptRedactionStatus
    readonly redactions: readonly string[]
  }
  readonly outputSummary?: string
}

export type ExecutionPath = 'ts-local' | 'rust-daemon'
export type ExecutionOperationKind =
  | 'command.run'
  | 'file.read'
  | 'file.write'
  | 'file.list'

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

export interface ExecutionAuthority {
  readonly mode: ExecutionAuthorityMode
  readonly source: ExecutionAuthoritySource
  readonly reason: string
}

export interface ExecutionPolicyMetadata {
  readonly decisionId: string
  readonly decisionStatus: string
  readonly policySource: string
  readonly authorityRequirement: ExecutionAuthorityMode
  readonly redactionStatus: 'report-safe' | 'redacted'
  readonly reportSafeSummary: string
  readonly terminalSuccessClaim: false
  readonly notProvenClaims: readonly string[]
}

export interface ExecutionRequestMetadata<K extends ExecutionOperationKind> {
  readonly operationKind: K
  readonly workspaceRoot: string
  readonly authority: ExecutionAuthority
  readonly caller: string
  readonly reason: string
  readonly reportSafeTarget?: string
  readonly policy?: ExecutionPolicyMetadata
}

export interface CommandExecutionRequest {
  readonly operationKind: 'command.run'
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly workspaceRoot: string
  readonly authority: ExecutionAuthority
  readonly caller: string
  readonly reason: string
  readonly reportSafeCommand: string
  readonly timeoutMs?: number
  readonly abortSignal?: AbortSignal
  /** Forwarded output, for a command whose progress the caller wants to show. */
  readonly onOutput?: (chunk: string) => void
  readonly policy?: ExecutionPolicyMetadata
}

export interface TextFileReadExecutionRequest extends ExecutionRequestMetadata<'file.read'> {
  readonly absolutePath: string
}

export interface TextFileWriteExecutionRequest extends ExecutionRequestMetadata<'file.write'> {
  readonly absolutePath: string
  readonly content: string
}

export interface FileListExecutionRequest extends ExecutionRequestMetadata<'file.list'> {
  readonly absoluteRoot: string
}

export type ExecutionEvent =
  | {
      readonly kind: 'execution.started'
      readonly operationKind: 'command.run'
      readonly executionPath: ExecutionPath
      readonly authorityMode: ExecutionAuthorityMode
      readonly caller: string
      readonly reportSafeCommand: string
      readonly timeoutMs?: number
    }
  | {
      readonly kind: 'execution.exited'
      readonly operationKind: 'command.run'
      readonly executionPath: ExecutionPath
      readonly authorityMode: ExecutionAuthorityMode
      readonly status: 'completed'
      readonly exitCode: number | null
    }
  | {
      readonly kind: 'execution.failed' | 'execution.timed_out' | 'execution.cancelled'
      readonly operationKind: 'command.run'
      readonly executionPath: ExecutionPath
      readonly authorityMode: ExecutionAuthorityMode
      readonly status: 'failed' | 'timeout' | 'cancelled'
      readonly exitCode: number | null
      readonly failureKind: 'sandbox_preflight' | 'execution_failure' | 'timeout' | 'cancelled'
      readonly recoveryReason?: string
    }
  | {
      readonly kind: 'file.read.completed' | 'file.write.completed'
      readonly operationKind: 'file.read' | 'file.write'
      readonly authorityMode: ExecutionAuthorityMode
      readonly caller: string
      readonly reportSafeTarget: string
    }
  | {
      readonly kind: 'file.write.denied' | 'file.write.failed'
      readonly operationKind: 'file.write'
      readonly authorityMode: ExecutionAuthorityMode
      readonly caller: string
      readonly reportSafeTarget: string
      readonly failureKind: 'execution_failure'
      readonly reason: string
    }

export interface CommandExecutionResult extends NormalizedExecutionResult {
  readonly executionPath: ExecutionPath
  readonly events: readonly ExecutionEvent[]
  readonly errorClass: ExecutionErrorClass
  readonly receipt: RuntimeExecutionReceiptProjection
  readonly daemonInstanceId?: string
  readonly daemonPid?: number
  readonly daemonRequestSeq?: number
  readonly daemonExecutionId?: string
  readonly recoveryReason?: string
}

export interface ExecutionService {
  readonly readTextFile: (request: TextFileReadExecutionRequest) => Promise<string>
  readonly writeTextFile: (request: TextFileWriteExecutionRequest) => Promise<void>
  readonly listFilesRecursive: (request: FileListExecutionRequest) => Promise<readonly string[]>
  readonly runCommand: (request: CommandExecutionRequest) => Promise<CommandExecutionResult>
}
