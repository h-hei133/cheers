import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { executeLocally } from '../../runtime/execution/local.js'
import { createDefaultExecutionService } from '../../runtime/execution/service.js'
import { createCoreToolRegistry } from './registry.js'
import { forgetRipgrepBinary, searchWithRipgrep } from './grepRipgrep.js'

vi.mock('../../runtime/execution/local.js', () => ({ executeLocally: vi.fn() }))
vi.mock('which', () => ({ default: { sync: () => null } }))

let root: string
let releases: Array<() => Promise<void>>
const original = 'export function needle() {}\n'
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-read-cleanup-'))
  releases = []
  await fs.writeFile(path.join(root, 'one.ts'), original)
  forgetRipgrepBinary()
})
afterEach(async () => {
  for (const release of releases) await release()
  vi.restoreAllMocks()
  forgetRipgrepBinary()
  await fs.rm(root, { recursive: true, force: true })
})

function runtime(native: boolean, cancel: boolean, processFailure = false): AbortController {
  vi.mocked(executeLocally).mockImplementation(async input => {
    if (input.command === 'git') return { status: 'failed', exitCode: 128, stdout: '', stderr: '' }
    if (!native) return { status: 'failed', exitCode: null, spawnErrorCode: 'ENOENT', stdout: '', stderr: '' }
    if (input.args.includes('--files')) input.onStdout?.(Buffer.from('one.ts\0'))
    else if (!input.args.includes('--version')) input.onStdout?.(Buffer.from(JSON.stringify({ type: 'match', data: {
      path: { text: '/proc/self/fd/3' }, lines: { text: original }, line_number: 1,
    } }) + '\n'))
    if (processFailure && !input.args.includes('--version') && !input.args.includes('--files')) {
      return { status: 'failed', exitCode: 1, failureKind: 'execution_failure', stdout: '', stderr: 'PRIVATE_PROCESS_DIAGNOSTIC' }
    }
    return { status: 'completed', exitCode: 0, stdout: '', stderr: '' }
  })
  const controller = new AbortController()
  const open = fs.open
  vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
    const handle = await open(...args)
    if (args[0] !== path.join(root, 'one.ts')) return handle
    releases.push(handle.close.bind(handle))
    vi.spyOn(handle, 'close').mockImplementation(async () => {
      if (cancel) controller.abort()
      throw new Error('PRIVATE_HANDLE_DIAGNOSTIC')
    })
    return handle
  })
  return controller
}

it.each(['read', 'grep', 'lsp'].flatMap(tool => [false, true].map(cancel => [tool, cancel] as const)))(
  '%s cannot turn failed cleanup into success with cancellation=%s', async (tool, cancel) => {
    const controller = runtime(false, cancel)
    const args = tool === 'read' ? { path: 'one.ts' } : tool === 'grep' ? { pattern: 'needle' }
      : { operation: 'workspaceSymbol', symbol: 'needle' }
    await expect(createCoreToolRegistry().get(tool)!.execute(args, {
      workspaceRoot: root, taskId: 'cleanup', abortSignal: controller.signal,
    })).rejects.toMatchObject({ name: 'ReadCleanupError', reason: 'cleanup',
      message: 'Read failed: handle cleanup could not be verified.' })
  },
)

it.each([false, true])('native search keeps file cleanup distinct from process failure with cancellation=%s', async cancel => {
  const controller = runtime(true, cancel)
  expect(await searchWithRipgrep({ pattern: 'needle', workspaceRoot: root, searchPath: '', limit: 10,
    assertFileAccess: () => {}, abortSignal: controller.signal,
  })).toEqual({ ok: false, reason: 'read-cleanup-failed' })
})

it.each([false, true])('native grep reports safe file cleanup failure without fallback with cancellation=%s', async cancel => {
  const controller = runtime(true, cancel)
  const service = createDefaultExecutionService()
  const fallback = vi.spyOn(service, 'listFilesRecursive')
  const result = await createCoreToolRegistry({ executionService: service }).get('grep')!.execute({ pattern: 'needle' }, {
    workspaceRoot: root, taskId: 'cleanup', assertFileAccess: () => {}, abortSignal: controller.signal,
  })
  expect(result.success).toBe(false)
  expect(result.error).toBe('Search stopped: file handle cleanup could not be verified.')
  expect(JSON.stringify(result)).not.toContain('PRIVATE_HANDLE_DIAGNOSTIC')
  expect(fallback).not.toHaveBeenCalled()
})

it.each([false, true])('retains both process and file cleanup failures with cancellation=%s', async cancel => {
  const controller = runtime(true, cancel, true)
  expect(await searchWithRipgrep({ pattern: 'needle', workspaceRoot: root, searchPath: '', limit: 10,
    assertFileAccess: () => {}, abortSignal: controller.signal,
  })).toEqual({ ok: false, reason: 'execution-failure', readCleanupFailed: true })
})

it.each([false, true])('reports both cleanup failures to the model with cancellation=%s', async cancel => {
  const controller = runtime(true, cancel, true)
  const result = await createCoreToolRegistry().get('grep')!.execute({ pattern: 'needle' }, {
    workspaceRoot: root, taskId: 'cleanup', assertFileAccess: () => {}, abortSignal: controller.signal,
  })
  expect(result.success).toBe(false)
  expect(result.error).toBe('Search stopped: execution failed; process cleanup could not be verified. File handle cleanup also could not be verified.')
  expect(JSON.stringify(result)).not.toContain('PRIVATE_')
})

it.each(['write', 'edit'])('%s leaves the target unchanged after pre-read cleanup failure', async tool => {
  runtime(false, false)
  const service = createDefaultExecutionService()
  const write = vi.spyOn(service, 'writeTextFile')
  const args = tool === 'write' ? { path: 'one.ts', content: 'changed' }
    : { path: 'one.ts', oldText: 'needle', newText: 'changed' }
  await expect(createCoreToolRegistry({ executionService: service }).get(tool)!.execute(args, {
    workspaceRoot: root, taskId: 'cleanup',
  })).rejects.toMatchObject({ name: 'ReadCleanupError', reason: 'cleanup' })
  expect(write).not.toHaveBeenCalled()
  expect(await fs.readFile(path.join(root, 'one.ts'), 'utf8')).toBe(original)
})
