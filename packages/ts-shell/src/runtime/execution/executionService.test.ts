import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultExecutionService } from './executionService.js'

const originalDaemonEnabled = process.env.DAEMON_ENABLED
let workspaceRoot: string | undefined

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
      command: process.platform === 'win32' ? 'cmd' : 'sh',
      args: process.platform === 'win32' ? ['/C', 'echo execution-service'] : ['-c', 'printf execution-service'],
      cwd: workspaceRoot,
      workspaceRoot,
      timeoutMs: 5_000,
    })

    expect(result).toMatchObject({
      status: 'completed',
      exitCode: 0,
      executionPath: 'ts-local',
      stdout: expect.stringContaining('execution-service'),
    })
  })

  it('centralizes basic text file side effects for tool callers', async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'private-agents-execution-service-'))
    const service = createDefaultExecutionService()
    const target = path.join(workspaceRoot, 'nested', 'artifact.txt')

    await service.writeTextFile(target, 'service-owned write')

    await expect(service.readTextFile(target)).resolves.toBe('service-owned write')
    await expect(service.listFilesRecursive(workspaceRoot)).resolves.toContain(target)
  })
})
