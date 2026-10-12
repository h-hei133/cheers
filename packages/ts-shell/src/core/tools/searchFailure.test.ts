import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { executeLocally } from '../../runtime/execution/local.js'
import { createDefaultExecutionService } from '../../runtime/execution/service.js'
import { createGrepToolDefinition } from './grep.js'
import { forgetRipgrepBinary, searchWithRipgrep } from './grepRipgrep.js'
import { completeNativeRead } from '../../test-utils/native.js'
import { execFileSync } from 'node:child_process'

vi.mock('../../runtime/execution/local.js', () => ({ executeLocally: vi.fn() }))

let root: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'search-failure-'))
  fs.writeFileSync(path.join(root, 'public.txt'), 'needle')
  forgetRipgrepBinary()
  vi.mocked(executeLocally).mockReset()
})
afterEach(() => { forgetRipgrepBinary(); vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }) })

const stages = ['probe', 'candidates', 'contents'] as const
type Stage = typeof stages[number]
const success = { status: 'completed' as const, exitCode: 0, stdout: '', stderr: '' }

it.each([false, true])('does not publish changed native inputs or erase execution failure=%s', async executionFailure => {
  vi.mocked(executeLocally).mockImplementation(async input => {
    if (input.args.includes('--files')) input.onStdout?.(Buffer.from('public.txt\0'))
    else if (!input.args.includes('--version')) {
      input.onStdout?.(Buffer.from(JSON.stringify({ type: 'match', data: {
        path: { text: '/proc/self/fd/3' }, lines: { text: 'PRIVATE_MATCH_DETAIL\n' }, line_number: 1,
      } }) + '\n'))
      execFileSync(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], "change")', path.join(root, 'public.txt')])
      if (executionFailure) return { ...success, status: 'failed', exitCode: 1, failureKind: 'execution_failure' }
    }
    completeNativeRead(input)
    return success
  })
  const service = createDefaultExecutionService()
  const fallback = vi.spyOn(service, 'listFilesRecursive')
  const result = await createGrepToolDefinition(service).execute({ pattern: 'needle' }, { workspaceRoot: root, taskId: 'fixture' })
  expect(result.success).toBe(false)
  expect(result.error).toBe(executionFailure ? 'Search stopped: execution failed; process cleanup could not be verified.'
    : 'Search stopped: a source file changed during reading. Retry with a stable source.')
  expect(JSON.stringify(result)).not.toContain('PRIVATE_MATCH_DETAIL')
  expect(fallback).not.toHaveBeenCalled()
})

function injectFailure(stage: Stage, trigger: 'none' | 'parent' | 'limit', controller: AbortController): void {
  vi.mocked(executeLocally).mockImplementation(async input => {
    const current = input.args.includes('--version') ? 'probe' : input.args.includes('--files') ? 'candidates' : 'contents'
    if (current === 'candidates') input.onStdout?.(Buffer.from('public.txt\0'))
    if (current !== stage) { completeNativeRead(input); return success }
    if (trigger === 'parent') controller.abort()
    if (trigger === 'limit') {
      if (stage === 'candidates') input.onStdout?.(Buffer.alloc(17 * 1024 * 1024, 120))
      else input.onStdout?.(Buffer.from(JSON.stringify({ type: 'match', data: {
        path: { text: input.readDescriptors ? '/proc/self/fd/3' : 'public.txt' },
        lines: { text: 'needle\n' }, line_number: 1,
      } }) + '\n'))
      expect(input.abortSignal?.aborted).toBe(true)
    }
    return { status: 'failed', exitCode: 1, failureKind: 'execution_failure', stdout: '', stderr: 'PRIVATE_DIAGNOSTIC' }
  })
}

it.each(stages.flatMap(stage => ['none', 'parent'].map(trigger => [stage, trigger] as const)))(
  'keeps %s execution failure ahead of %s cancellation and exit-one success', async (stage, trigger) => {
    const controller = new AbortController()
    injectFailure(stage, trigger as 'none' | 'parent', controller)
    expect(await searchWithRipgrep({ pattern: 'needle', searchPath: '', limit: 1,
      workspaceRoot: root, assertFileAccess: () => {}, abortSignal: controller.signal,
    })).toEqual({ ok: false, reason: 'execution-failure' })
    expect(executeLocally).toHaveBeenCalledTimes(stages.indexOf(stage) + 1)
  },
)

it.each(['candidates', 'contents'] as const)('does not hide failed cleanup behind the %s limit', async stage => {
  const controller = new AbortController()
  injectFailure(stage, 'limit', controller)
  expect(await searchWithRipgrep({ pattern: 'needle', searchPath: '', limit: 1,
    workspaceRoot: root, assertFileAccess: () => {}, abortSignal: controller.signal,
  })).toEqual({ ok: false, reason: 'execution-failure' })
})

it.each(stages)('reports %s cleanup failure at the tool boundary even after parent cancellation', async stage => {
  const controller = new AbortController()
  injectFailure(stage, 'parent', controller)
  const service = createDefaultExecutionService()
  const fallback = vi.spyOn(service, 'listFilesRecursive')
  const result = await createGrepToolDefinition(service).execute({ pattern: 'needle' }, {
    workspaceRoot: root, taskId: 'fixture', assertFileAccess: () => {}, abortSignal: controller.signal,
  })
  expect(result.success).toBe(false)
  expect(result.error).toBe('Search stopped: execution failed; process cleanup could not be verified.')
  expect(JSON.stringify(result)).not.toContain('PRIVATE_DIAGNOSTIC')
  expect(fallback).not.toHaveBeenCalled()
})

it('does not cache an unverified probe as an installed or absent executable', async () => {
  injectFailure('probe', 'none', new AbortController())
  const input = { pattern: 'needle', searchPath: '', limit: 1, workspaceRoot: root }
  expect(await searchWithRipgrep(input)).toEqual({ ok: false, reason: 'execution-failure' })
  vi.mocked(executeLocally).mockReset().mockImplementation(async input => { completeNativeRead(input); return success })
  expect(await searchWithRipgrep(input)).toEqual({ ok: true, matches: [] })
  expect(vi.mocked(executeLocally).mock.calls[0]![0].args).toContain('--version')
})

it('retains execution failure when the native status handle also fails cleanup', async () => {
  injectFailure('candidates', 'none', new AbortController())
  const open = fsp.open
  vi.spyOn(fsp, 'open').mockImplementation(async (...args) => {
    const handle = await open(...args)
    if (args[1] === 'ax+') {
      const close = handle.close.bind(handle)
      vi.spyOn(handle, 'close').mockImplementation(async () => { await close(); throw new Error('PRIVATE_STATUS_CLEANUP') })
    }
    return handle
  })
  expect(await searchWithRipgrep({ pattern: 'needle', searchPath: '', limit: 10, workspaceRoot: root }))
    .toEqual({ ok: false, reason: 'execution-failure', readCleanupFailed: true })
})
