import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import executionCommandContractFixture from '../../../../../contracts/tests/fixtures/valid/execution.command.contract.json'
import {
  createDefaultExecutionService,
  type CommandExecutionRequest,
  type CommandExecutionResult,
  type ExecutionEvent,
} from './executionService.js'

const originalDaemonEnabled = process.env.DAEMON_ENABLED
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
    process.env.DAEMON_ENABLED = originalDaemonEnabled
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true })
      workspaceRoot = undefined
    }
  })

  it('routes command execution through the TS-local boundary when the daemon is disabled', async () => {
    process.env.DAEMON_ENABLED = '0'
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'private-agents-execution-service-'))
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
      stdout: expect.stringContaining('execution-service'),
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

  it('centralizes basic text file side effects for tool callers', async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'private-agents-execution-service-'))
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
    })).resolves.toContain(target)
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
