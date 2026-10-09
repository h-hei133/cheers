import type { WalkLimits } from './walk/budget.js'

export interface FileWalkOptions {
  readonly assertFileAccess?: (absolutePath: string) => void
  readonly abortSignal?: AbortSignal
  /** Directory names never entered, replacing the default set. */
  readonly pruneDirectories?: readonly string[]
  /** Whether ignore rules are honoured at all. Default true. */
  readonly respectIgnore?: boolean
  /** Internal callers may tighten, never raise, cumulative traversal budgets. */
  readonly limits?: WalkLimits
}

/**
 * What a command run reports, before it is given an execution path and a receipt.
 *
 * Every field is something the runner observed. `status` is the outcome, not a
 * judgement about it: a non-zero exit is `failed` here and becomes a classified
 * error only in `error.ts`.
 */
export interface NormalizedExecutionResult {
  readonly status: 'completed' | 'failed' | 'timeout' | 'cancelled'
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
  /** OS error when the process could not be spawned; not an exit status. */
  readonly spawnErrorCode?: string
  /** A failed process-tree cleanup must block consumers from claiming shutdown. */
  readonly terminationFailed?: true
  readonly failureKind?: 'sandbox_preflight' | 'execution_failure' | 'timeout' | 'cancelled'
}

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

export type ExecutionPath = 'ts-local'
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
  /**
   * The environment the command runs with.
   *
   * Carried rather than read from `process.env` at the spawn site because the
   * values describe the session, not the process: the tool layer knows which
   * model is answering, and the spawn site does not.
   */
  readonly env?: Readonly<Record<string, string>>
  /** Forwarded output, for a command whose progress the caller wants to show. */
  readonly onOutput?: (chunk: string) => void
  /** Duplex consumers use the same spawn, cancellation and process-tree owner. */
  readonly onStdin?: (input: ExecutionInput) => void
  readonly onStdout?: (chunk: Buffer) => void
  readonly onStderr?: (chunk: Buffer) => void
  readonly captureOutput?: boolean
  /** Long-lived duplex services must clean their group even after a normal leader exit. */
  readonly cleanupTreeOnExit?: boolean
  readonly policy?: ExecutionPolicyMetadata
}

/** Bounded writes settle only after the pipe has consumed the supplied bytes. */
export interface ExecutionInput {
  write(chunk: Buffer): Promise<void>
  end(): void
}

export interface TextFileReadExecutionRequest extends ExecutionRequestMetadata<'file.read'> {
  /** Callers may require a bounded complete read instead of an incomplete page. */
  readonly maxBytes?: number
  readonly absolutePath: string
  /** Narrows workspace access to the calling artifact store; never widens it. */
  readonly artifactDirectory?: string
  readonly assertFileAccess?: (absolutePath: string) => void
  readonly abortSignal?: AbortSignal
}

export interface TextFileWriteExecutionRequest extends ExecutionRequestMetadata<'file.write'> {
  readonly editIdentity?: import('../../edit/recovery/operation/model.js').EditOperationIdentity
  readonly assertFileAccess?: (absolutePath: string) => void
  readonly abortSignal?: AbortSignal
  readonly absolutePath: string
  readonly content: string
  /** Exact text read to compute this edit, including BOM and line endings. */
  readonly expectedContent?: string
}

export interface TextPageReadRequest extends TextFileReadExecutionRequest {
  readonly offset?: number
  readonly limit?: number
  /** Internal callers may tighten, never raise, the read budgets. */
  readonly limits?: {
    readonly scanBytes?: number
    readonly outputBytes?: number
    readonly lineBytes?: number
    readonly timeoutMs?: number
  }
}

export interface TextPageReadResult {
  readonly text: string
  readonly startLine: number
  readonly endLine: number
  /** Known only after observing EOF; stat size does not prove a line count. */
  readonly totalLines?: number
  readonly bytesRead: number
  readonly stopReason?: 'line-limit' | 'output-limit' | 'scan-limit' | 'deadline'
  readonly nextOffset?: number
  readonly oversizedLine?: number
}

export interface FileListExecutionRequest extends ExecutionRequestMetadata<'file.list'> {
  readonly assertFileAccess?: (absolutePath: string) => void
  readonly abortSignal?: AbortSignal
  readonly absoluteRoot: string
  /**
   * How the walk decides what to include.
   *
   * Absent means the workspace defaults: prune the directories that hold no
   * source, and honour the repository's ignore rules. A caller passes this only
   * when it has a reason to differ, which keeps the three tools that share this
   * walk from each deciding for themselves.
   */
  readonly walkOptions?: FileWalkOptions
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
  readonly recoveryReason?: string
}

export interface ExecutionService {
  readonly readMedia: (request: MediaReadRequest) => Promise<MediaReadResult>
  readonly readTextFile: (request: TextFileReadExecutionRequest) => Promise<string>
  readonly readTextPage: (request: TextPageReadRequest) => Promise<TextPageReadResult>
  readonly writeTextFile: (request: TextFileWriteExecutionRequest) => Promise<void>
  readonly listFilesRecursive: (request: FileListExecutionRequest) => Promise<readonly string[]>
  readonly runCommand: (request: CommandExecutionRequest) => Promise<CommandExecutionResult>
}

export interface MediaReadRequest extends TextFileReadExecutionRequest {
  readonly kind: 'image' | 'pdf'
  readonly offset?: number
  readonly limit?: number
}

export interface MediaReadResult {
  readonly output: string
  readonly images?: readonly import('../../model-adapters/multimodal.js').ImageContent[]
  readonly metadata: Record<string, unknown>
}
