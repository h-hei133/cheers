import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createCoreToolRegistry } from './registry.js'
import type { ExecutionService } from '../../runtime/execution/types.js'
import { ArtifactManager } from '../session/artifactManager.js'
import { createToolResultMessage } from '../agent/tools.js'

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

it.each(['completed', 'failed'])('retains a verified raw-output artifact through the %s tool receipt byte bound', async status => {
  const stdout = `${'界'.repeat(160)}\n`.repeat(180)
  const result = await run(serviceReturning(status === 'completed' ? completed(stdout) : failed(stdout, 'command failed')))
  expect(result.success).toBe(status === 'completed')
  const notice = result.metadata?.outputNotice
  expect(typeof notice).toBe('string')
  const locator = typeof notice === 'string' ? /artifact:\/\/\d+/.exec(notice)?.[0] : undefined
  expect(locator).toBeDefined()
  const artifactPath = ArtifactManager.getShared(root, 'result').resolve(locator!)
  expect(artifactPath).not.toBeNull()
  expect(await fs.readFile(artifactPath!, 'utf8')).toContain(stdout)
  const message = createToolResultMessage('bash', result.success ? result.output! : result.error!, result.metadata)
  expect(message.content).toContain(locator)
  expect(Buffer.byteLength(message.content as string, 'utf8')).toBeLessThanOrEqual(50 * 1024)
  expect(message.metadata).toMatchObject({ status, outputNotice: notice })
})
