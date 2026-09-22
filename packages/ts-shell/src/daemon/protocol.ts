import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  DaemonCancelResponse,
  DaemonErrorResponse,
  DaemonExecResponse,
  DaemonExecStartedResponse,
  DaemonExecutionResult,
  DaemonExecutionStatusResponse,
  DaemonHealthResponse,
  DaemonServeResponse,
  DaemonServeResponseType,
  UnrefableResource,
} from './types.js'

export const daemonServeResponseTypes = new Set<DaemonServeResponseType>([
  'health',
  'exec',
  'exec_started',
  'execution_status',
  'cancel',
  'error',
])

export function isDaemonServeResponseType(value: string): value is DaemonServeResponseType {
  return daemonServeResponseTypes.has(value as DaemonServeResponseType)
}

export function parseDaemonExecutionResult(raw: string): DaemonExecutionResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Failed to parse daemon execution result payload: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid daemon execution result payload: expected object')
  }

  const payload = parsed as Partial<DaemonExecutionResult>
  const status = payload.status
  if (status !== 'completed' && status !== 'failed' && status !== 'timeout' && status !== 'cancelled') {
    throw new Error(`Invalid daemon result status: ${String(status)}`)
  }

  if (payload.exitCode !== null && typeof payload.exitCode !== 'number') {
    throw new Error('Invalid daemon result exitCode: expected number or null')
  }

  if (typeof payload.stdout !== 'string' || typeof payload.stderr !== 'string') {
    throw new Error('Invalid daemon result stdout/stderr: expected strings')
  }

  const rawFailureKind = payload.failureKind
  const failureKind =
    rawFailureKind === null || rawFailureKind === undefined
      ? undefined
      : rawFailureKind
  if (
    failureKind !== undefined
    && failureKind !== 'sandbox_preflight'
    && failureKind !== 'execution_failure'
    && failureKind !== 'timeout'
    && failureKind !== 'cancelled'
  ) {
    throw new Error(`Invalid daemon result failureKind: ${String(failureKind)}`)
  }

  return {
    status,
    exitCode: payload.exitCode,
    stdout: payload.stdout,
    stderr: payload.stderr,
    ...(failureKind !== undefined ? { failureKind } : {}),
  }
}

export function parseDaemonServeResponse(raw: string): DaemonServeResponse {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Failed to parse daemon response line: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid daemon response payload: expected object')
  }

  const payload = parsed as Record<string, unknown>
  const responseType = payload.type
  if (typeof responseType !== 'string' || !isDaemonServeResponseType(responseType)) {
    throw new Error(`Invalid daemon response type: ${String(responseType)}`)
  }

  if (typeof payload.instanceId !== 'string' || typeof payload.pid !== 'number' || typeof payload.requestSeq !== 'number') {
    throw new Error(`Invalid daemon response metadata for ${responseType}`)
  }

  if (payload.type === 'health') {
    return payload as unknown as DaemonHealthResponse
  }
  if (payload.type === 'error') {
    if (typeof payload.error !== 'string') {
      throw new Error('Invalid daemon error response: error message required')
    }
    return payload as unknown as DaemonErrorResponse
  }
  if (payload.type === 'exec_started') {
    if (typeof payload.executionId !== 'string') {
      throw new Error('Invalid daemon exec_started response: executionId required')
    }
    return payload as unknown as DaemonExecStartedResponse
  }
  if (payload.type === 'execution_status') {
    const statusPayload = payload as Record<string, unknown>
    if (
      typeof statusPayload.executionId !== 'string'
      || (statusPayload.state !== 'running' && statusPayload.state !== 'finished' && statusPayload.state !== 'not_found')
    ) {
      throw new Error('Invalid daemon execution_status response')
    }
    if (
      statusPayload.terminalOutcome !== undefined
      && statusPayload.terminalOutcome !== 'completed'
      && statusPayload.terminalOutcome !== 'failed'
      && statusPayload.terminalOutcome !== 'timed_out'
      && statusPayload.terminalOutcome !== 'cancelled'
    ) {
      throw new Error('Invalid daemon execution_status response: terminalOutcome invalid')
    }
    const normalizedResult =
      statusPayload.result !== undefined && statusPayload.result !== null
        ? parseDaemonExecutionResult(JSON.stringify(statusPayload.result))
        : undefined
    if (statusPayload.state === 'finished' && !normalizedResult) {
      throw new Error('Invalid daemon execution_status response: finished state requires result payload')
    }
    return {
      ...(statusPayload as unknown as Omit<DaemonExecutionStatusResponse, 'result'>),
      ...(normalizedResult ? { result: normalizedResult } : {}),
    }
  }
  if (payload.type === 'cancel') {
    const cancelPayload = payload as Record<string, unknown>
    const validOutcome = new Set(['cancelled', 'already_finished', 'not_found', 'not_cancellable', 'internal_error'])
    if (
      typeof cancelPayload.executionId !== 'string'
      || !validOutcome.has(String(cancelPayload.outcome))
    ) {
      throw new Error('Invalid daemon cancel response')
    }
    if (
      cancelPayload.terminalOutcome !== undefined
      && cancelPayload.terminalOutcome !== 'completed'
      && cancelPayload.terminalOutcome !== 'failed'
      && cancelPayload.terminalOutcome !== 'timed_out'
      && cancelPayload.terminalOutcome !== 'cancelled'
    ) {
      throw new Error('Invalid daemon cancel response: terminalOutcome invalid')
    }
    return cancelPayload as unknown as DaemonCancelResponse
  }

  if (payload.result === undefined) {
    throw new Error('Invalid daemon exec response: result required')
  }
  return {
    ...(payload as unknown as DaemonExecResponse),
    result: parseDaemonExecutionResult(JSON.stringify(payload.result)),
  }
}

export function resolveCargoCommandCandidates(): string[] {
  const homeDir = process.env.USERPROFILE ?? process.env.HOME ?? ''
  const preferredBinary = homeDir
    ? path.join(homeDir, '.cargo', 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo')
    : ''

  const candidates = [preferredBinary, process.platform === 'win32' ? 'cargo.exe' : 'cargo', 'cargo']
  return candidates.filter((candidate, index, all) => candidate.length > 0 && all.indexOf(candidate) === index)
}

export function resolveAvailableCargoBinary(): string | null {
  for (const candidate of resolveCargoCommandCandidates()) {
    try {
      execFileSync(candidate, ['--version'], { windowsHide: true })
      return candidate
    } catch {
      continue
    }
  }

  return null
}

export function resolveCargoBinary(): string {
  return resolveAvailableCargoBinary() ?? resolveCargoCommandCandidates()[0] ?? 'cargo'
}

export function resolveRustDaemonManifestPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(moduleDir, '..', '..', '..', 'rust-core', 'Cargo.toml')
}

export function normalizePath(value: string): string {
  return path.resolve(value).toLowerCase()
}

export function unrefIfSupported(resource: unknown): void {
  if (resource && typeof resource === 'object' && 'unref' in resource && typeof resource.unref === 'function') {
    resource.unref()
  }
}
