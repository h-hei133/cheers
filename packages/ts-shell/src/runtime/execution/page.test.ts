import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readTextPage } from './page.js'
import type { TextPageReadRequest } from './types.js'
import { execFileSync } from 'node:child_process'

let root: string
let request: TextPageReadRequest
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'read-page-'))
  request = { operationKind: 'file.read', absolutePath: path.join(root, 'text'), workspaceRoot: root,
    authority: { mode: 'read-only', source: 'tool-runtime-approval', reason: 'fixture' }, caller: 'test', reason: 'fixture' }
})
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }) })

it('rejects a page rather than returning mixed revisions after a child rewrites the source', async () => {
  const original = ('A'.repeat(511) + '\n').repeat(100)
  await fs.writeFile(request.absolutePath, original)
  const open = fs.open
  let captured: Awaited<ReturnType<typeof open>> | undefined
  vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
    const handle = await open(...args); captured = handle
    const read = handle.read.bind(handle)
    vi.spyOn(handle, 'read').mockImplementationOnce(async (...options: any[]) => {
      const content = await read(...options as [any])
      execFileSync(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], process.argv[2])', request.absolutePath, original.replaceAll('A', 'B')])
      return content
    })
    return handle
  })
  await expect(readTextPage({ ...request, limit: 1000 })).rejects.toMatchObject({ name: 'ReadChangedError' })
  expect(captured?.fd).toBe(-1)
})

it.each(['', 'one', 'one\n', '\uFEFFone\r\ntwo\r\n', 'a'.repeat(16_383) + '中文\nlast'])('preserves complete UTF-8 text and CRLF (%#)', async text => {
  await fs.writeFile(request.absolutePath, text)
  const result = await readTextPage(request)
  expect(result.text).toBe(text.replace(/^\uFEFF/, ''))
  expect(result.totalLines).toBe(text.split('\n').length)
  expect(result.stopReason).toBeUndefined()
})

it('stops at the requested line count without pretending to have counted the remainder', async () => {
  await fs.writeFile(request.absolutePath, 'one\r\ntwo\r\nthree\r\nfour')
  expect(await readTextPage({ ...request, offset: 2, limit: 2 })).toMatchObject({
    text: 'two\r\nthree\r', startLine: 2, endLine: 3, stopReason: 'line-limit', nextOffset: 4,
  })
  expect((await readTextPage({ ...request, offset: 2, limit: 2 })).totalLines).toBeUndefined()
})

it('keeps EOF unknown when the scan budget ends exactly at the file size', async () => {
  await fs.writeFile(request.absolutePath, 'one\ntwo')
  const result = await readTextPage({ ...request, limits: { scanBytes: 7 } })
  expect(result).toMatchObject({ text: 'one', endLine: 1, bytesRead: 7, stopReason: 'scan-limit' })
  expect(result.nextOffset).toBeUndefined()
  expect(result.totalLines).toBeUndefined()
})

it('does not offer an offset continuation onto a known oversized line', async () => {
  await fs.writeFile(request.absolutePath, 'one\n' + 'x'.repeat(100))
  const result = await readTextPage({ ...request, limits: { lineBytes: 8 } })
  expect(result).toMatchObject({ text: 'one', endLine: 1, stopReason: 'output-limit', oversizedLine: 2 })
  expect(result.nextOffset).toBeUndefined()
})

it('strips only a first-line BOM and keeps later line content unchanged', async () => {
  await fs.writeFile(request.absolutePath, '\uFEFFone\n\uFEFFtwo')
  expect(await readTextPage({ ...request, offset: 2 })).toMatchObject({ text: '\uFEFFtwo', totalLines: 2 })
})

it('does not split UTF-8 characters or retain a line beyond the output byte budget', async () => {
  await fs.writeFile(request.absolutePath, '中\n文字\nlast')
  expect(await readTextPage({ ...request, limits: { outputBytes: 8 } })).toMatchObject({
    text: '中', startLine: 1, endLine: 1, stopReason: 'output-limit', nextOffset: 2,
  })
})

it('stops buffering a giant selected line and identifies the incomplete line', async () => {
  await fs.writeFile(request.absolutePath, 'x'.repeat(1024 * 1024))
  const result = await readTextPage(request)
  expect(result).toMatchObject({ text: '', stopReason: 'output-limit', oversizedLine: 1 })
  expect(result.totalLines).toBeUndefined()
  expect(result.bytesRead).toBeLessThanOrEqual(64 * 1024)
})

it('honors a tightened line limit even when a first line is within the BOM allowance', async () => {
  await fs.writeFile(request.absolutePath, '123456789')
  expect(await readTextPage({ ...request, limits: { lineBytes: 8 } })).toMatchObject({
    text: '', stopReason: 'output-limit', oversizedLine: 1,
  })
})

it('bounds scanning before a distant offset without retaining skipped line contents', async () => {
  await fs.writeFile(request.absolutePath, 'x'.repeat(1000) + '\ntarget')
  expect(await readTextPage({ ...request, offset: 2, limits: { scanBytes: 32 } })).toMatchObject({
    text: '', bytesRead: 32, stopReason: 'scan-limit', startLine: 2,
  })
})

it('does not let a caller raise the fixed scan or line budgets', async () => {
  await fs.writeFile(request.absolutePath, 'x'.repeat(9 * 1024 * 1024) + '\ntarget')
  const result = await readTextPage({ ...request, offset: 2, limits: { scanBytes: 32 * 1024 * 1024 } })
  expect(result).toMatchObject({ text: '', bytesRead: 8 * 1024 * 1024, stopReason: 'scan-limit' })
  const line = await readTextPage({ ...request, limits: { lineBytes: 1024 * 1024, outputBytes: 1024 * 1024 } })
  expect(line).toMatchObject({ text: '', oversizedLine: 1, stopReason: 'output-limit' })
  expect(line.bytesRead).toBeLessThanOrEqual(64 * 1024)
})

it.each([Buffer.from([0, 1, 2]), Buffer.from([0xff, 0xfe, 65, 0]), Buffer.from([0xc3, 0x28])])('rejects binary or invalid UTF-8 bytes (%#)', async bytes => {
  await fs.writeFile(request.absolutePath, bytes)
  await expect(readTextPage(request)).rejects.toThrow(/binary|UTF-8/)
})

it('does not open an already cancelled request', async () => {
  const open = vi.spyOn(fs, 'open')
  const controller = new AbortController()
  controller.abort()
  await expect(readTextPage({ ...request, abortSignal: controller.signal })).rejects.toThrow()
  expect(open).not.toHaveBeenCalled()
})

it.each(['cancel', 'replace', 'deadline'])('closes the verified handle after %s during a read', async mode => {
  await fs.writeFile(request.absolutePath, 'first\nsecond')
  const open = fs.open
  const controller = new AbortController()
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  let clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
    handle = await open(...args)
    const read = handle.read.bind(handle)
    vi.spyOn(handle, 'read').mockImplementation(async (...options: any[]) => {
      const result = await read(...options as [any])
      if (mode === 'cancel') controller.abort()
      if (mode === 'replace') {
        await fs.rename(request.absolutePath, path.join(root, 'original'))
        await fs.writeFile(request.absolutePath, 'replacement')
      }
      if (mode === 'deadline') clock = 10_000
      return result
    })
    return handle
  })
  // The page ends in this read, so a replacement must be caught by the final
  // verification rather than a check before another chunk.
  const pending = readTextPage({ ...request, limit: 1, abortSignal: controller.signal })
  if (mode === 'deadline') expect(await pending).toMatchObject({ text: '', stopReason: 'deadline', bytesRead: 12 })
  else await expect(pending).rejects.toThrow()
  expect(handle?.fd).toBe(-1)
})

it.each([0, -1, 1.5, Infinity, NaN])('rejects invalid direct bounds %s before opening', async offset => {
  const open = vi.spyOn(fs, 'open')
  await expect(readTextPage({ ...request, offset })).rejects.toThrow('positive safe integers')
  expect(open).not.toHaveBeenCalled()
})
