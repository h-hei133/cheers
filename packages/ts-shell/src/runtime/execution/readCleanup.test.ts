import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readTextFile, withVerifiedReadFiles } from './read.js'
import { readTextPage } from './page.js'
import { readDirectory } from './directory.js'
import { listWorkspaceFiles } from './fileWalk.js'
import { loadDirectoryMatcher } from './ignoreRules.js'
import type { TextFileReadExecutionRequest } from './types.js'

let root: string
let releases: Array<() => Promise<void>>
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'read-cleanup-'))
  releases = []
  await fs.writeFile(path.join(root, 'one.txt'), 'one')
  await fs.writeFile(path.join(root, '.gitignore'), '*.log\n')
})
afterEach(async () => {
  for (const release of releases.reverse()) await release()
  vi.restoreAllMocks()
  await fs.rm(root, { recursive: true, force: true })
})

function failClose(controller?: AbortController) {
  const open = fs.open
  const attempts = vi.fn()
  vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
    const handle = await open(...args)
    releases.push(handle.close.bind(handle))
    vi.spyOn(handle, 'close').mockImplementation(async () => {
      attempts()
      controller?.abort()
      throw new Error('PRIVATE_CLOSE_DIAGNOSTIC')
    })
    return handle
  })
  return attempts
}

function request(name = 'one.txt', abortSignal?: AbortSignal): TextFileReadExecutionRequest {
  return { operationKind: 'file.read', workspaceRoot: root, absolutePath: path.join(root, name),
    authority: { mode: 'read-only', source: 'tool-runtime-approval', reason: 'fixture' },
    caller: 'test', reason: 'fixture', abortSignal }
}

it.each(['file', 'page', 'directory', 'walk', 'ignore'].flatMap(kind => [false, true].map(cancel => [kind, cancel] as const)))(
  'preserves %s handle cleanup failure with cancellation=%s', async (kind, cancel) => {
    const controller = new AbortController()
    const attempts = failClose(cancel ? controller : undefined)
    const options = { abortSignal: controller.signal, respectIgnore: false }
    const pending = kind === 'file' ? readTextFile(request('one.txt', controller.signal))
      : kind === 'page' ? readTextPage(request('one.txt', controller.signal))
        : kind === 'directory' ? readDirectory(root, root, options)
          : kind === 'walk' ? listWorkspaceFiles(root, options)
            : loadDirectoryMatcher(root, root, options)
    await expect(pending).rejects.toMatchObject({ name: 'ReadCleanupError', reason: 'cleanup',
      message: 'Read failed: handle cleanup could not be verified.' })
    expect(attempts).toHaveBeenCalledTimes(1)
  },
)

it('preserves cleanup failure when both directory handles fail to close', async () => {
  failClose()
  const opendir = fs.opendir
  vi.spyOn(fs, 'opendir').mockImplementation(async (...args) => {
    const directory = await opendir(...args)
    releases.push(directory.close.bind(directory))
    vi.spyOn(directory, 'close').mockRejectedValue(new Error('PRIVATE_DIRECTORY_DIAGNOSTIC'))
    return directory
  })
  await expect(listWorkspaceFiles(root, { respectIgnore: false })).rejects.toMatchObject({
    name: 'ReadCleanupError', reason: 'cleanup', message: 'Read failed: handle cleanup could not be verified.',
  })
})

it('attempts every nested descriptor close after a cleanup failure', async () => {
  const attempts = failClose()
  await expect(withVerifiedReadFiles([request(), request('.gitignore')], async () => 'complete')).rejects.toMatchObject({
    name: 'ReadCleanupError', reason: 'cleanup',
  })
  expect(attempts).toHaveBeenCalledTimes(2)
})
