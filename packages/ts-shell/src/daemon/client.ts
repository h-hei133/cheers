import { execFile, execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { getRuntimeConfig } from '../config/runtimeConfig.js'

const execFileAsync = promisify(execFile)

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

interface DaemonHealthResponse {
  readonly type: 'health'
  readonly instanceId: string
  readonly pid: number
  readonly requestSeq: number
}

interface DaemonExecResponse {
  readonly type: 'exec'
  readonly instanceId: string
  readonly pid: number
  readonly requestSeq: number
  readonly result: DaemonExecutionResult
}

interface DaemonExecStartedResponse {
  readonly type: 'exec_started'
  readonly instanceId: string
  readonly pid: number
  readonly requestSeq: number
  readonly executionId: string
}

interface DaemonExecutionStatusResponse {
  readonly type: 'execution_status'
  readonly instanceId: string
  readonly pid: number
  readonly requestSeq: number
  readonly executionId: string
  readonly state: 'running' | 'finished' | 'not_found'
  readonly terminalOutcome?: 'completed' | 'failed' | 'timed_out' | 'cancelled'
  readonly result?: DaemonExecutionResult
}

interface DaemonCancelResponse {
  readonly type: 'cancel'
  readonly instanceId: string
  readonly pid: number
  readonly requestSeq: number
  readonly executionId: string
  readonly outcome: 'cancelled' | 'already_finished' | 'not_found' | 'not_cancellable' | 'internal_error'
  readonly terminalOutcome?: 'completed' | 'failed' | 'timed_out' | 'cancelled'
}

interface DaemonErrorResponse {
  readonly type: 'error'
  readonly instanceId: string
  readonly pid: number
  readonly requestSeq: number
  readonly error: string
}

type DaemonServeResponse =
  | DaemonHealthResponse
  | DaemonExecResponse
  | DaemonExecStartedResponse
  | DaemonExecutionStatusResponse
  | DaemonCancelResponse
  | DaemonErrorResponse

interface ResidentDaemonState {
  readonly process: ChildProcessWithoutNullStreams
  readonly stdoutReader: readline.Interface
  readonly workspaceRoot: string
  readonly cargo: string
  readonly startedAt: number
}

export interface RemoteCancelResult {
  readonly executionId: string
  readonly outcome: 'cancelled' | 'already_finished' | 'not_found' | 'not_cancellable' | 'internal_error'
  readonly daemonInstanceId: string
  readonly daemonPid: number
  readonly daemonRequestSeq: number
}

let residentDaemonState: ResidentDaemonState | null = null
let daemonRequestQueue: Promise<void> = Promise.resolve()
let daemonShutdownHooksInstalled = false

function parseDaemonExecutionResult(raw: string): DaemonExecutionResult {
  const parsed = JSON.parse(raw) as Partial<DaemonExecutionResult>
  const validStatus = new Set(['completed', 'failed', 'timeout', 'cancelled'])
  const validFailureKind = new Set([
    'sandbox_preflight',
    'execution_failure',
    'timeout',
    'cancelled',
  ])

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid daemon result: expected object payload')
  }

  if (!validStatus.has(String(parsed.status))) {
    throw new Error(`Invalid daemon result status: ${String(parsed.status)}`)
  }

  if (typeof parsed.stdout !== 'string' || typeof parsed.stderr !== 'string') {
    throw new Error('Invalid daemon result: stdout/stderr must be strings')
  }

  if (!(parsed.exitCode === null || typeof parsed.exitCode === 'number')) {
    throw new Error('Invalid daemon result: exitCode must be number|null')
  }

  if (
    parsed.failureKind !== undefined &&
    parsed.failureKind !== null &&
    !validFailureKind.has(String(parsed.failureKind))
  ) {
    throw new Error(`Invalid daemon result failureKind: ${String(parsed.failureKind)}`)
  }

  return {
    ...(parsed as DaemonExecutionResult),
    failureKind: parsed.failureKind === null ? undefined : parsed.failureKind,
  }
}

function parseDaemonServeResponse(raw: string): DaemonServeResponse {
  const parsed = JSON.parse(raw) as Partial<DaemonServeResponse>
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid daemon response: expected object payload')
  }
  if (
    parsed.type !== 'health'
    && parsed.type !== 'exec'
    && parsed.type !== 'exec_started'
    && parsed.type !== 'execution_status'
    && parsed.type !== 'cancel'
    && parsed.type !== 'error'
  ) {
    throw new Error(`Invalid daemon response type: ${String(parsed.type)}`)
  }

  if (typeof parsed.instanceId !== 'string' || typeof parsed.pid !== 'number' || typeof parsed.requestSeq !== 'number') {
    throw new Error('Invalid daemon response envelope: instanceId/pid/requestSeq required')
  }

  if (parsed.type === 'health') {
    return parsed as DaemonHealthResponse
  }
  if (parsed.type === 'error') {
    if (typeof parsed.error !== 'string') {
      throw new Error('Invalid daemon error response: error message required')
    }
    return parsed as DaemonErrorResponse
  }

  if (parsed.type === 'exec_started') {
    if (typeof (parsed as Partial<DaemonExecStartedResponse>).executionId !== 'string') {
      throw new Error('Invalid daemon exec_started response: executionId required')
    }
    return parsed as DaemonExecStartedResponse
  }

  if (parsed.type === 'execution_status') {
    const statusPayload = parsed as Partial<DaemonExecutionStatusResponse>
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
    if (statusPayload.result !== undefined && statusPayload.result !== null) {
      statusPayload.result = parseDaemonExecutionResult(JSON.stringify(statusPayload.result))
    }
    if (statusPayload.state === 'finished' && !statusPayload.result) {
      throw new Error('Invalid daemon execution_status response: finished state requires result payload')
    }
    return statusPayload as DaemonExecutionStatusResponse
  }

  if (parsed.type === 'cancel') {
    const cancelPayload = parsed as Partial<DaemonCancelResponse>
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
    return cancelPayload as DaemonCancelResponse
  }

  const execPayload = parsed as Partial<DaemonExecResponse>
  if (execPayload.result === undefined) {
    throw new Error('Invalid daemon exec response: result required')
  }
  return {
    ...(parsed as DaemonExecResponse),
    result: parseDaemonExecutionResult(JSON.stringify(execPayload.result)),
  }
}

function resolveCargoCommandCandidates(): string[] {
  const homeDir = process.env.USERPROFILE ?? process.env.HOME ?? ''
  const preferredBinary = homeDir
    ? path.join(homeDir, '.cargo', 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo')
    : ''

  const candidates = [preferredBinary, process.platform === 'win32' ? 'cargo.exe' : 'cargo', 'cargo']
  return candidates.filter((candidate, index, all) => candidate.length > 0 && all.indexOf(candidate) === index)
}

function resolveAvailableCargoBinary(): string | null {
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

function resolveCargoBinary(): string {
  return resolveAvailableCargoBinary() ?? resolveCargoCommandCandidates()[0] ?? 'cargo'
}

function resolveRustDaemonManifestPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(moduleDir, '..', '..', '..', 'rust-core', 'Cargo.toml')
}

function isDaemonProcessAlive(state: ResidentDaemonState | null): state is ResidentDaemonState {
  return Boolean(
    state
    && !state.process.killed
    && state.process.exitCode === null
    && state.process.signalCode === null,
  )
}

function disposeResidentDaemonState(state: ResidentDaemonState | null): void {
  if (!state) {
    return
  }
  try {
    state.stdoutReader.close()
  } catch {}
  if (state.process.exitCode === null && !state.process.killed) {
    state.process.kill()
  }
}

function installDaemonShutdownHooks(): void {
  if (daemonShutdownHooksInstalled) {
    return
  }
  daemonShutdownHooksInstalled = true
  const shutdown = () => {
    disposeResidentDaemonState(residentDaemonState)
    residentDaemonState = null
  }
  process.once('exit', shutdown)
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

function createResidentDaemonState(cargo: string, workspaceRoot: string): ResidentDaemonState {
  const commandArgs = [
    'run',
    '--manifest-path',
    resolveRustDaemonManifestPath(),
    '--bin',
    'daemon',
    '--',
    'serve-stdio',
  ]

  const processHandle = spawn(cargo, commandArgs, {
    cwd: workspaceRoot,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  processHandle.stdin.on('error', () => {
    // Transport write errors are handled per-request; suppress process-level unhandled events.
  })
  processHandle.unref()
  processHandle.stdin.unref()
  processHandle.stdout.unref()
  processHandle.stderr.unref()
  const stdoutReader = readline.createInterface({
    input: processHandle.stdout,
    crlfDelay: Infinity,
  })

  return {
    process: processHandle,
    stdoutReader,
    workspaceRoot,
    cargo,
    startedAt: Date.now(),
  }
}

async function requestDaemonResponse(
  state: ResidentDaemonState,
  request: unknown,
  timeoutMs: number = 15_000,
): Promise<DaemonServeResponse> {
  const linePromise = once(state.stdoutReader, 'line').then(([line]) => String(line))
  const exitPromise = once(state.process, 'exit').then(([code, signal]) => {
    throw new Error(`Rust daemon exited before responding (code=${String(code)}, signal=${String(signal)})`)
  })
  const timeoutPromise = new Promise<string>((_resolve, reject) => {
    const handle = setTimeout(() => {
      reject(new Error(`Rust daemon response timed out after ${timeoutMs} ms`))
    }, timeoutMs)
    exitPromise.finally(() => clearTimeout(handle)).catch(() => clearTimeout(handle))
    linePromise.finally(() => clearTimeout(handle)).catch(() => clearTimeout(handle))
  })
  const serialized = `${JSON.stringify(request)}\n`
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      state.process.stdin.off('error', onError)
      reject(error)
    }
    state.process.stdin.once('error', onError)
    try {
      state.process.stdin.write(serialized, (error) => {
        state.process.stdin.off('error', onError)
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    } catch (error) {
      state.process.stdin.off('error', onError)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })

  const line = await Promise.race([linePromise, exitPromise, timeoutPromise]) as string
  return parseDaemonServeResponse(line)
}

async function ensureResidentDaemon(workspaceRoot: string): Promise<ResidentDaemonState> {
  installDaemonShutdownHooks()
  const cargo = resolveAvailableCargoBinary()
  if (!cargo) {
    throw new Error(`Cargo executable not available. Checked: ${resolveCargoCommandCandidates().join(', ')}`)
  }

  if (
    isDaemonProcessAlive(residentDaemonState)
    && normalizePath(residentDaemonState.workspaceRoot) === normalizePath(workspaceRoot)
  ) {
    return residentDaemonState
  }

  disposeResidentDaemonState(residentDaemonState)
  residentDaemonState = createResidentDaemonState(cargo, workspaceRoot)
  return residentDaemonState
}

function normalizePath(value: string): string {
  return path.resolve(value).toLowerCase()
}

async function executeViaResidentDaemon(options: {
  command: string
  args: string[]
  cwd: string
  workspaceRoot: string
  timeoutMs?: number
  abortSignal?: AbortSignal
}): Promise<DaemonExecutionResult> {
  const state = await ensureResidentDaemon(options.workspaceRoot)
  const health = await requestDaemonResponse(state, { type: 'health' }, 5_000)
  if (health.type !== 'health') {
    throw new Error(`Unexpected daemon response type for health request: ${health.type}`)
  }
  const startResponse = await requestDaemonResponse(state, {
    type: 'exec_start',
    request: {
      command: options.command,
      args: options.args,
      cwd: options.cwd,
      workspaceRoot: options.workspaceRoot,
      timeoutMs: options.timeoutMs ?? 30_000,
    },
  }, 5_000)

  if (startResponse.type === 'error') {
    throw new Error(startResponse.error)
  }
  if (startResponse.type !== 'exec_started') {
    throw new Error(`Unexpected daemon response type for exec_start request: ${startResponse.type}`)
  }

  let cancelIssued = false

  while (true) {
    if (options.abortSignal?.aborted && !cancelIssued) {
      const cancelResult = await requestDaemonResponse(state, {
        type: 'cancel',
        execution_id: startResponse.executionId,
      }, 5_000)
      if (cancelResult.type === 'error') {
        throw new Error(cancelResult.error)
      }
      if (cancelResult.type !== 'cancel') {
        throw new Error(`Unexpected daemon response type for cancel request: ${cancelResult.type}`)
      }
      cancelIssued = true
    }

    const statusResponse = await requestDaemonResponse(state, {
      type: 'execution_status',
      execution_id: startResponse.executionId,
    }, 5_000)
    if (statusResponse.type === 'error') {
      throw new Error(statusResponse.error)
    }
    if (statusResponse.type !== 'execution_status') {
      throw new Error(`Unexpected daemon response type for execution_status request: ${statusResponse.type}`)
    }
    if (statusResponse.state === 'running') {
      await new Promise(resolve => setTimeout(resolve, 25))
      continue
    }
    if (statusResponse.state === 'not_found') {
      throw new Error(`Execution id not found in daemon: ${startResponse.executionId}`)
    }
    if (!statusResponse.result) {
      throw new Error(`Execution finished without result payload: ${startResponse.executionId}`)
    }
    return {
      ...statusResponse.result,
      daemonInstanceId: statusResponse.instanceId,
      daemonPid: statusResponse.pid,
      daemonRequestSeq: statusResponse.requestSeq,
      daemonExecutionId: startResponse.executionId,
    }
  }
}

export async function executeViaRustDaemon(options: {
  command: string
  args: string[]
  cwd: string
  workspaceRoot: string
  timeoutMs?: number
  abortSignal?: AbortSignal
}): Promise<DaemonExecutionResult> {
  const queuedExecution = async (): Promise<DaemonExecutionResult> => {
    try {
      return await executeViaResidentDaemon(options)
    } catch (initialError) {
      const message = initialError instanceof Error ? initialError.message : String(initialError)
      const needsRestart =
        !isDaemonProcessAlive(residentDaemonState)
        || /epipe|broken pipe|timed out|exited before responding/i.test(message)
        || normalizePath(residentDaemonState.workspaceRoot) !== normalizePath(options.workspaceRoot)
      if (!needsRestart) {
        throw initialError
      }
      residentDaemonState = null
      return executeViaResidentDaemon(options)
    }
  }

  const task = daemonRequestQueue.then(queuedExecution, queuedExecution)
  daemonRequestQueue = task.then(() => undefined, () => undefined)
  return task
}

export async function cancelRustExecution(options: {
  workspaceRoot: string
  executionId: string
}): Promise<RemoteCancelResult> {
  const task = daemonRequestQueue.then(async () => {
    const state = await ensureResidentDaemon(options.workspaceRoot)
    const response = await requestDaemonResponse(state, {
      type: 'cancel',
      execution_id: options.executionId,
    }, 5_000)

    if (response.type === 'error') {
      throw new Error(response.error)
    }
    if (response.type !== 'cancel') {
      throw new Error(`Unexpected daemon response type for cancel request: ${response.type}`)
    }

    return {
      executionId: response.executionId,
      outcome: response.outcome,
      daemonInstanceId: response.instanceId,
      daemonPid: response.pid,
      daemonRequestSeq: response.requestSeq,
    } satisfies RemoteCancelResult
  })

  daemonRequestQueue = task.then(() => undefined, () => undefined)
  return task
}

export async function executeLocally(options: {
  command: string
  args: string[]
  cwd: string
  timeoutMs?: number
}): Promise<NormalizedExecutionResult> {
  const childPromise = execFileAsync(options.command, options.args, {
    cwd: options.cwd,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    timeout: options.timeoutMs,
  })

  try {
    const { stdout, stderr } = await childPromise
    return {
      status: 'completed',
      exitCode: 0,
      stdout,
      stderr,
    }
  } catch (error) {
    const execError = error as {
      stdout?: string
      stderr?: string
      code?: number | string | null
      killed?: boolean
      signal?: string | null
      message?: string
    }

    if (execError.killed || execError.signal === 'SIGTERM') {
      return {
        status: 'timeout',
        exitCode: typeof execError.code === 'number' ? execError.code : null,
        stdout: execError.stdout ?? '',
        stderr: execError.stderr || execError.message || 'Command timed out',
      }
    }

    return {
      status: 'failed',
      exitCode: typeof execError.code === 'number' ? execError.code : null,
      stdout: execError.stdout ?? '',
      stderr: execError.stderr || execError.message || 'Command failed',
    }
  }
}

export function isRustDaemonEnabled(): boolean {
  return getRuntimeConfig().daemonEnabled
}

export function checkRustDaemonAvailability(): DaemonAvailability {
  const cargo = resolveAvailableCargoBinary()
  if (cargo) {
    return { available: true }
  }

  return {
    available: false,
    reason: `Cargo executable not available. Checked: ${resolveCargoCommandCandidates().join(', ')}`,
  }
}
