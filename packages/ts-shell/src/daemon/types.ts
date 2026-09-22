import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type readline from 'node:readline'

export interface DaemonExecutionResult {
  readonly status: 'completed' | 'failed' | 'timeout' | 'cancelled'
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
  readonly failureKind?: 'sandbox_preflight' | 'execution_failure' | 'timeout' | 'cancelled'
  readonly daemonInstanceId?: string
  readonly daemonPid?: number
  readonly daemonRequestSeq?: number
  readonly daemonExecutionId?: string
}

export interface DaemonAvailability {
  readonly available: boolean
  readonly reason?: string
}

export type NormalizedExecutionResult = DaemonExecutionResult

export interface DaemonHealthResponse {
  readonly type: 'health'
  readonly instanceId: string
  readonly pid: number
  readonly requestSeq: number
}

export interface DaemonExecResponse {
  readonly type: 'exec'
  readonly instanceId: string
  readonly pid: number
  readonly requestSeq: number
  readonly result: DaemonExecutionResult
}

export interface DaemonExecStartedResponse {
  readonly type: 'exec_started'
  readonly instanceId: string
  readonly pid: number
  readonly requestSeq: number
  readonly executionId: string
}

export interface DaemonExecutionStatusResponse {
  readonly type: 'execution_status'
  readonly instanceId: string
  readonly pid: number
  readonly requestSeq: number
  readonly executionId: string
  readonly state: 'running' | 'finished' | 'not_found'
  readonly terminalOutcome?: 'completed' | 'failed' | 'timed_out' | 'cancelled'
  readonly result?: DaemonExecutionResult
}

export interface DaemonCancelResponse {
  readonly type: 'cancel'
  readonly instanceId: string
  readonly pid: number
  readonly requestSeq: number
  readonly executionId: string
  readonly outcome: 'cancelled' | 'already_finished' | 'not_found' | 'not_cancellable' | 'internal_error'
  readonly terminalOutcome?: 'completed' | 'failed' | 'timed_out' | 'cancelled'
}

export interface DaemonErrorResponse {
  readonly type: 'error'
  readonly instanceId: string
  readonly pid: number
  readonly requestSeq: number
  readonly error: string
}

export type DaemonServeResponse =
  | DaemonHealthResponse
  | DaemonExecResponse
  | DaemonExecStartedResponse
  | DaemonExecutionStatusResponse
  | DaemonCancelResponse
  | DaemonErrorResponse

export type DaemonServeResponseType = DaemonServeResponse['type']

export type DaemonRequestPhase =
  | 'daemon readiness'
  | 'execution start request'
  | 'execution status request'
  | 'execution cancel request'
  | 'remote cancel request'

export interface RemoteCancelResult {
  readonly executionId?: string
  readonly outcome?: DaemonCancelResponse['outcome']
  readonly daemonInstanceId?: string
  readonly daemonPid?: number
  readonly daemonRequestSeq?: number
}

export interface ResidentDaemonState {
  readonly process: ChildProcessWithoutNullStreams
  readonly stdoutReader: readline.Interface
  readonly workspaceRoot: string
  readonly cargo: string
  readonly startedAt: number
}

export interface UnrefableResource {
  unref?: () => void
}
