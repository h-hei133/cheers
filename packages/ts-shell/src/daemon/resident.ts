import { spawn } from 'node:child_process'
import readline from 'node:readline'
import type {
  DaemonExecutionResult,
  DaemonRequestPhase,
  DaemonServeResponse,
  RemoteCancelResult,
  ResidentDaemonState,
} from './types.js'
import {
  normalizePath,
  parseDaemonServeResponse,
  resolveAvailableCargoBinary,
  resolveCargoCommandCandidates,
  resolveRustDaemonManifestPath,
  unrefIfSupported,
} from './protocol.js'

let residentDaemonState: ResidentDaemonState | null = null
let daemonShutdownHooksInstalled = false
let daemonRequestQueue: Promise<unknown> = Promise.resolve()

export function isDaemonProcessAlive(state: ResidentDaemonState | null): state is ResidentDaemonState {
  return Boolean(
    state
    && !state.process.killed
    && state.process.exitCode === null
    && state.process.signalCode === null,
  )
}

export function disposeResidentDaemonState(state: ResidentDaemonState | null): void {
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

export function installDaemonShutdownHooks(): void {
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

export function createResidentDaemonState(cargo: string, workspaceRoot: string): ResidentDaemonState {
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
  unrefIfSupported(processHandle)
  unrefIfSupported(processHandle.stdin)
  unrefIfSupported(processHandle.stdout)
  unrefIfSupported(processHandle.stderr)
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

export async function requestDaemonResponse(
  state: ResidentDaemonState,
  request: unknown,
  timeoutMs: number = 15_000,
  phase: DaemonRequestPhase = 'daemon readiness',
): Promise<DaemonServeResponse> {
  let timeoutHandle: NodeJS.Timeout | undefined
  let cleanupResponseListeners = () => {}
  const responsePromise = new Promise<string>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeoutHandle)
      state.stdoutReader.off('line', onLine)
      state.process.off('exit', onExit)
    }
    const onLine = (line: string) => {
      cleanup()
      resolve(String(line))
    }
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup()
      reject(new Error(`Rust daemon exited before responding (code=${String(code)}, signal=${String(signal)})`))
    }
    timeoutHandle = setTimeout(() => {
      cleanup()
      reject(new Error(`Rust daemon ${phase} timed out after ${timeoutMs} ms`))
    }, timeoutMs)

    cleanupResponseListeners = cleanup
    state.stdoutReader.once('line', onLine)
    state.process.once('exit', onExit)
  })
  const serialized = `${JSON.stringify(request)}\n`
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      cleanupResponseListeners()
      state.process.stdin.off('error', onError)
      reject(error)
    }
    state.process.stdin.once('error', onError)
    try {
      state.process.stdin.write(serialized, (error) => {
        state.process.stdin.off('error', onError)
        if (error) {
          cleanupResponseListeners()
          reject(error)
          return
        }
        resolve()
      })
    } catch (error) {
      cleanupResponseListeners()
      state.process.stdin.off('error', onError)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })

  const line = await responsePromise
  return parseDaemonServeResponse(line)
}

export async function ensureResidentDaemon(workspaceRoot: string): Promise<ResidentDaemonState> {
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

export async function executeViaResidentDaemon(options: {
  command: string
  args: string[]
  cwd: string
  workspaceRoot: string
  timeoutMs?: number
  abortSignal?: AbortSignal
}): Promise<DaemonExecutionResult> {
  const state = await ensureResidentDaemon(options.workspaceRoot)
  const health = await requestDaemonResponse(state, { type: 'health' }, 5_000, 'daemon readiness')
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
  }, 5_000, 'execution start request')

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
      }, 5_000, 'execution cancel request')
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
    }, 5_000, 'execution status request')
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

export function resetResidentDaemonStateForTest(): void {
  disposeResidentDaemonState(residentDaemonState)
  residentDaemonState = null
}

export function getResidentDaemonStateForTest(): ResidentDaemonState | null {
  return residentDaemonState
}

export function executeQueuedDaemonTask<T>(taskFn: () => Promise<T>): Promise<T> {
  const task = daemonRequestQueue.then(taskFn, taskFn)
  daemonRequestQueue = task.then(() => undefined, () => undefined)
  return task
}

export async function cancelRustExecution(options: {
  workspaceRoot: string
  executionId: string
}): Promise<RemoteCancelResult> {
  return executeQueuedDaemonTask(async () => {
    const state = await ensureResidentDaemon(options.workspaceRoot)
    const response = await requestDaemonResponse(state, {
      type: 'cancel',
      execution_id: options.executionId,
    }, 5_000, 'remote cancel request')

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
}
