import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const executionCommandContractFixture = JSON.parse(
  fsSync.readFileSync(
    new URL('../../../../../contracts/tests/fixtures/valid/execution.command.contract.json', import.meta.url),
    'utf8',
  ),
)
import {
  createDefaultExecutionService,
  type CommandExecutionRequest,
  type CommandExecutionResult,
  type ExecutionEvent,
} from './service.js'

let workspaceRoot: string | undefined
const READ_AUTHORITY = {
  mode: 'read-only',
  source: 'tool-runtime-approval',
  reason: 'test read authority',
} as const
const WRITE_AUTHORITY = {
  mode: 'approved-for-write',
  source: 'tool-runtime-approval',
  reason: 'test write authority',
} as const
const COMMAND_AUTHORITY = {
  mode: 'command-allowlisted',
  source: 'tool-runtime-approval',
  reason: 'test command authority',
} as const

describe('execution service boundary', () => {
  afterEach(async () => {
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true })
      workspaceRoot = undefined
    }
  })

  it('runs a command through the execution boundary', async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cheers-execution-service-'))
    const service = createDefaultExecutionService()

    const result = await service.runCommand({
      operationKind: 'command.run',
      command: process.platform === 'win32' ? 'cmd' : 'sh',
      args: process.platform === 'win32' ? ['/C', 'echo execution-service'] : ['-c', 'printf execution-service'],
      cwd: workspaceRoot,
      workspaceRoot,
      authority: COMMAND_AUTHORITY,
      caller: 'execution-service-test',
      reason: 'verify TS-local command execution boundary',
      reportSafeCommand: 'printf execution-service',
      timeoutMs: 5_000,
    })

    expect(result).toMatchObject({
      status: 'completed',
      exitCode: 0,
      executionPath: 'ts-local',
      errorClass: 'success',
      stdout: expect.stringContaining('execution-service'),
    })
    expect(result.receipt).toMatchObject({
      caller: 'execution-service-test',
      operationKind: 'command.run',
      authorityMode: 'command-allowlisted',
      executionStatus: 'success',
      errorClass: 'success',
      exitCode: 0,
      notProvenClaims: expect.arrayContaining(['terminal-task-success']),
    })
    expect(result.events).toEqual([
      expect.objectContaining({
        kind: 'execution.started',
        operationKind: 'command.run',
        executionPath: 'ts-local',
        authorityMode: 'command-allowlisted',
      }),
      expect.objectContaining({
        kind: 'execution.exited',
        status: 'completed',
        exitCode: 0,
      }),
    ])
  })

  it('stops a running command when the caller aborts, and says it was cancelled', async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cheers-execution-service-'))
    const service = createDefaultExecutionService()
    const controller = new AbortController()

    // The abort is driven by the child's own first output, not by a wait: the
    // child announces it is running and the signal is raised on that event. A
    // guessed delay would either abort before the process exists (testing the
    // already-aborted branch by accident) or after it has finished.
    //
    // The child then stays alive far longer than this test's timeout. If the
    // signal is not forwarded, the run does not come back and vitest fails the
    // test on its deadline — which is the regression this pins.
    const childScript = [
      'process.stdout.write("running")',
      'setTimeout(() => {}, 60000)',
    ].join(';')

    const pending = service.runCommand({
      operationKind: 'command.run',
      command: process.execPath,
      args: ['-e', childScript],
      cwd: workspaceRoot,
      workspaceRoot,
      authority: COMMAND_AUTHORITY,
      caller: 'execution-service-test',
      reason: 'verify an aborted command is stopped rather than awaited',
      reportSafeCommand: 'node -e <long-running child>',
      timeoutMs: 120_000,
      abortSignal: controller.signal,
      onOutput: () => {
        if (!controller.signal.aborted) controller.abort()
      },
    })

    const result = await pending

    // `cancelled`, not `timeout` and not `completed`. The distinction is the whole
    // point: a stop the user asked for reported as a timeout, or worse as a
    // success, is a status nobody can act on. Before the abort signal was
    // forwarded this came back `completed` once the child finally exited.
    expect(result.status).toBe('cancelled')
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'execution.cancelled', status: 'cancelled' }),
      ]),
    )
  }, 15_000)

  it('reports a command that ran too long as a timeout, not as a failure', async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cheers-execution-service-'))
    const service = createDefaultExecutionService()

    // The other half of the abort test: `timeout` and `cancelled` and `failed`
    // are three different facts, and a command stopped by the timeout must not be
    // reported as one the user stopped or one that exited badly. The child exits
    // on its own once the timeout kills it, so no wait is needed.
    const result = await service.runCommand({
      operationKind: 'command.run',
      command: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 60000)'],
      cwd: workspaceRoot,
      workspaceRoot,
      authority: COMMAND_AUTHORITY,
      caller: 'execution-service-test',
      reason: 'verify a command past its deadline is reported as a timeout',
      reportSafeCommand: 'node -e <long-running child>',
      timeoutMs: 500,
    })

    expect(result.status).toBe('timeout')
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'execution.timed_out', status: 'timeout' }),
      ]),
    )
  }, 20_000)

  it('reports a command killed by an external signal as a failure, not a timeout', async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cheers-execution-service-'))
    const service = createDefaultExecutionService()

    // A child that signals itself is the deterministic form of "something other
    // than this code stopped the process": an operator's SIGTERM, a supervisor
    // reaping it, an OOM kill. It did not run too long, so calling it a timeout
    // points the reader at a deadline that was never reached.
    //
    // No wait is needed — the child terminates itself immediately.
    const result = await service.runCommand({
      operationKind: 'command.run',
      command: process.execPath,
      args: ['-e', 'process.kill(process.pid, "SIGTERM")'],
      cwd: workspaceRoot,
      workspaceRoot,
      authority: COMMAND_AUTHORITY,
      caller: 'execution-service-test',
      reason: 'verify an externally signalled command is not reported as a timeout',
      reportSafeCommand: 'node -e <self-terminating child>',
      timeoutMs: 30_000,
    })

    expect(result.status).toBe('failed')
  }, 20_000)

  it('centralizes basic text file side effects for tool callers', async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cheers-execution-service-'))
    const service = createDefaultExecutionService()
    const target = path.join(workspaceRoot, 'nested', 'artifact.txt')

    await service.writeTextFile({
      operationKind: 'file.write',
      absolutePath: target,
      content: 'service-owned write',
      workspaceRoot,
      authority: WRITE_AUTHORITY,
      caller: 'execution-service-test',
      reason: 'verify text write boundary',
      reportSafeTarget: target,
    })

    await expect(service.readTextFile({
      operationKind: 'file.read',
      absolutePath: target,
      workspaceRoot,
      authority: READ_AUTHORITY,
      caller: 'execution-service-test',
      reason: 'verify text read boundary',
      reportSafeTarget: target,
    })).resolves.toBe('service-owned write')
    await expect(service.listFilesRecursive({
      operationKind: 'file.list',
      absoluteRoot: workspaceRoot,
      workspaceRoot,
      authority: READ_AUTHORITY,
      caller: 'execution-service-test',
      reason: 'verify recursive file listing boundary',
      reportSafeTarget: workspaceRoot,
    })).resolves.toContain('nested/artifact.txt')
  })

  it('validates the shared execution command contract fixture against boundary semantics', () => {
    expect(executionCommandContractFixture.kind).toBe('execution.command.contract')

    const request = executionCommandContractFixture.request as CommandExecutionRequest
    expect(request).toMatchObject({
      operationKind: 'command.run',
      workspaceRoot: '/workspace',
      cwd: '/workspace',
      authority: {
        mode: 'command-allowlisted',
        source: 'tool-runtime-approval',
      },
      caller: 'core-tool:bash',
      reportSafeCommand: 'printf execution-contract',
      timeoutMs: 30_000,
    })
    expect(request.reason.length).toBeGreaterThan(0)
    expect(request.authority.reason.length).toBeGreaterThan(0)
    expect(hasVagueAuthorityBoolean(request)).toBe(false)

    const completed = executionCommandContractFixture.results.completed as CommandExecutionResult
    const failed = executionCommandContractFixture.results.failed as CommandExecutionResult
    const timedOut = executionCommandContractFixture.results.timedOut as CommandExecutionResult
    const cancelled = executionCommandContractFixture.results.cancelled as CommandExecutionResult

    expect(completed.status).toBe('completed')
    expect(completed.exitCode).toBe(0)
    expect(failed).toMatchObject({ status: 'failed', failureKind: 'execution_failure' })
    expect(timedOut).toMatchObject({ status: 'timeout', failureKind: 'timeout' })
    expect(cancelled).toMatchObject({ status: 'cancelled', failureKind: 'cancelled' })

    const allEvents = [
      ...completed.events,
      ...failed.events,
      ...timedOut.events,
      ...cancelled.events,
    ] as readonly ExecutionEvent[]
    expect(allEvents.map(event => event.kind)).toEqual(expect.arrayContaining([
      'execution.started',
      'execution.exited',
      'execution.failed',
      'execution.timed_out',
      'execution.cancelled',
    ]))
    for (const event of allEvents) {
      expect(event.operationKind).toBe('command.run')
      expect(event.authorityMode).toBe('command-allowlisted')
    }
  })
})

function hasVagueAuthorityBoolean(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  for (const [key, item] of Object.entries(value)) {
    if (['allowed', 'approved', 'enabled', 'safe'].includes(key) && typeof item === 'boolean') {
      return true
    }
    if (hasVagueAuthorityBoolean(item)) {
      return true
    }
  }
  return false
}
