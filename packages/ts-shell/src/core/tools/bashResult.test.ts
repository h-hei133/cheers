import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createCoreToolRegistry } from './registry.js'
import type { ExecutionService } from '../../runtime/execution/types.js'

let root: string
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'bash-result-')) })
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }) })

function serviceReturning(result: Record<string, unknown>): ExecutionService {
  return { runCommand: vi.fn(async () => result) } as unknown as ExecutionService
}

function completed(stdout: string, stderr = '') {
  return { status: 'completed', exitCode: 0, stdout, stderr, executionPath: 'ts-local',
    errorClass: 'success', events: [], receipt: {} }
}

function failed(stdout: string, stderr: string) {
  return { status: 'failed', exitCode: 1, stdout, stderr, executionPath: 'ts-local',
    errorClass: 'command_failed', failureKind: 'execution_failure', events: [], receipt: {} }
}

async function run(service: ExecutionService) {
  const bash = createCoreToolRegistry({ executionService: service }).get('bash')!
  return bash.execute({ command: 'synthetic' }, { taskId: 'result', workspaceRoot: root, sessionId: 'result' })
}

it('stores a successful command result once, in the message text and not in metadata', async () => {
  const stdout = 'line\n'.repeat(2_000)
  const result = await run(serviceReturning(completed(stdout)))
  expect(result.success).toBe(true)
  expect(result.output).toContain('line')
  // Provenance a later reader branches on stays.
  expect(result.metadata).toMatchObject({ status: 'completed', exitCode: 0,
    executionPath: 'ts-local', errorClass: 'success' })
  // The raw stream does not: `output` already carries it, and a second copy
  // would be written into the transcript beside every command result.
  expect(result.metadata).not.toHaveProperty('stdout')
  expect(result.metadata).not.toHaveProperty('stderr')
  expect(JSON.stringify(result.metadata)).not.toContain('line\nline')
})

it('does not duplicate a failed command stream either, while keeping the failure facts', async () => {
  const stderr = 'PRIVATE_STDERR\n'.repeat(1_000)
  const result = await run(serviceReturning(failed('partial output\n', stderr)))
  expect(result.success).toBe(false)
  expect(result.error).toContain('PRIVATE_STDERR')
  expect(result.error).toContain('partial output')
  expect(result.metadata).toMatchObject({ status: 'failed', exitCode: 1, failureKind: 'execution_failure' })
  expect(result.metadata).not.toHaveProperty('stdout')
  expect(result.metadata).not.toHaveProperty('stderr')
  expect(JSON.stringify(result.metadata)).not.toContain('PRIVATE_STDERR')
})
