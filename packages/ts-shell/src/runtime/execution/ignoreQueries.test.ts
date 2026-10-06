import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { executeLocally } from './local.js'
import { listDirectoryEntries, listWorkspaceFiles } from './fileWalk.js'

vi.mock('./local.js', async () => {
  const actual = await vi.importActual<typeof import('./local.js')>('./local.js')
  return { ...actual, executeLocally: vi.fn(actual.executeLocally) }
})

let root: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ignore-queries-'))
  fs.writeFileSync(path.join(root, 'public.txt'), 'public')
  vi.mocked(executeLocally).mockClear()
})
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }) })

it.each(['files', 'directory'])('cancels an in-flight %s Git query without starting fallback reads', async kind => {
  const actual = await vi.importActual<typeof import('./local.js')>('./local.js')
  const controller = new AbortController()
  let started = false
  let nativeStatus: string | undefined
  vi.mocked(executeLocally).mockImplementation(input => {
    expect(input.command).toBe('git')
    return actual.executeLocally({ ...input, command: process.execPath,
      args: ['-e', 'process.stdout.write("READY"); setTimeout(() => process.exit(0), 2000)'],
      onStdout: chunk => {
        started = true
        controller.abort()
        input.onStdout?.(chunk)
      },
    }).then(result => { nativeStatus = result.status; return result })
  })
  const options = { abortSignal: controller.signal }
  const query = kind === 'files' ? listWorkspaceFiles(root, options) : listDirectoryEntries(root, root, options)
  await expect(query).rejects.toThrow()
  expect(started).toBe(true)
  expect(nativeStatus).toBe('cancelled')
  expect(executeLocally).toHaveBeenCalledTimes(1)
})

it.each(['files', 'directory'])('does not launch %s Git work when already cancelled', async kind => {
  const controller = new AbortController()
  controller.abort()
  const options = { abortSignal: controller.signal }
  await expect(kind === 'files' ? listWorkspaceFiles(root, options) : listDirectoryEntries(root, root, options)).rejects.toThrow()
  expect(executeLocally).not.toHaveBeenCalled()
})

it('discards oversized Git output and uses the existing file walk', async () => {
  vi.mocked(executeLocally).mockImplementation(async input => {
    const chunk = Buffer.alloc(1024 * 1024, 120)
    for (let i = 0; i < 65; i++) {
      input.onStdout?.(chunk)
      input.onOutput?.(chunk.toString())
    }
    expect(input.abortSignal?.aborted).toBe(true)
    return { status: 'cancelled', exitCode: null, stdout: '', stderr: '' }
  })
  expect(await listWorkspaceFiles(root)).toEqual(['public.txt'])
  expect(executeLocally).toHaveBeenCalledTimes(1)
})

it('decodes split UTF-8 only after the complete Git output arrives', async () => {
  const name = '中文.txt'
  fs.writeFileSync(path.join(root, name), 'public')
  vi.mocked(executeLocally).mockImplementation(async input => {
    for (const byte of Buffer.from(`${name}\0`)) input.onStdout?.(Buffer.from([byte]))
    return { status: 'completed', exitCode: 0, stdout: '', stderr: '' }
  })
  expect(await listWorkspaceFiles(root)).toEqual([name])
})

it('does not treat a timeout with exit one as a valid empty ignore answer', async () => {
  fs.writeFileSync(path.join(root, '.ignore'), 'public.txt\n')
  vi.mocked(executeLocally).mockResolvedValue({ status: 'timeout', exitCode: 1, stdout: '', stderr: 'fixture failure' })
  const listing = await listDirectoryEntries(root, root)
  expect(listing.entries.map(entry => entry.name)).not.toContain('public.txt')
  expect(executeLocally).toHaveBeenCalledTimes(1)
})

it.each(['none', 'parent', 'output'])('reports unverified execution before %s cancellation or fallback', async cancellation => {
  const controller = new AbortController()
  vi.mocked(executeLocally).mockImplementation(async input => {
    if (cancellation === 'parent') controller.abort()
    if (cancellation === 'output') input.onStdout?.(Buffer.alloc(65 * 1024 * 1024))
    return { status: 'failed', exitCode: 1, failureKind: 'execution_failure', stdout: '', stderr: 'PRIVATE_DIAGNOSTIC' }
  })
  await expect(listDirectoryEntries(root, root, { abortSignal: controller.signal })).rejects.toThrow(
    'Git query failed: input delivery or process cleanup could not be verified.',
  )
})

it('propagates cancellation that arrives as Git finishes, without returning the late list', async () => {
  const controller = new AbortController()
  vi.mocked(executeLocally).mockImplementation(async input => {
    input.onStdout?.(Buffer.from('public.txt\0'))
    controller.abort()
    return { status: 'completed', exitCode: 0, stdout: '', stderr: '' }
  })
  await expect(listWorkspaceFiles(root, { abortSignal: controller.signal })).rejects.toThrow()
})
