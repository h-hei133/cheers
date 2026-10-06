import type { FileHandle } from 'node:fs/promises'
import { withVerifiedReadTarget } from './read.js'
import type { TextPageReadRequest, TextPageReadResult } from './types.js'

const CHUNK_BYTES = 16 * 1024
const MAX_SCAN_BYTES = 8 * 1024 * 1024
const MAX_OUTPUT_BYTES = 50 * 1024
const MAX_LINE_BYTES = 50 * 1024
const MAX_TIMEOUT_MS = 5_000

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Read bounds must be positive safe integers.')
  return value
}

/** Bounded UTF-8 pages from the same verified object used by ordinary reads. */
export async function readTextPage(request: TextPageReadRequest): Promise<TextPageReadResult> {
  const offset = positiveInteger(request.offset, 1)
  const limit = Math.min(positiveInteger(request.limit, 500), 1000)
  const budgets = {
    scanBytes: Math.min(positiveInteger(request.limits?.scanBytes, MAX_SCAN_BYTES), MAX_SCAN_BYTES),
    outputBytes: Math.min(positiveInteger(request.limits?.outputBytes, MAX_OUTPUT_BYTES), MAX_OUTPUT_BYTES),
    lineBytes: Math.min(positiveInteger(request.limits?.lineBytes, MAX_LINE_BYTES), MAX_LINE_BYTES),
    timeoutMs: Math.min(positiveInteger(request.limits?.timeoutMs, MAX_TIMEOUT_MS), MAX_TIMEOUT_MS),
  }
  const deadline = performance.now() + budgets.timeoutMs
  return withVerifiedReadTarget(request, 'file', async (handle, verify) => {
    const page = await scanPage(handle, request, offset, limit, budgets, deadline, verify)
    await verify()
    return page
  })
}

async function scanPage(
  handle: FileHandle,
  request: TextPageReadRequest,
  offset: number,
  limit: number,
  budgets: { scanBytes: number; outputBytes: number; lineBytes: number; timeoutMs: number },
  deadline: number,
  verify: () => Promise<void>,
): Promise<TextPageReadResult> {
  const buffer = Buffer.alloc(Math.min(CHUNK_BYTES, budgets.scanBytes))
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  const lines: string[] = []
  let parts: Buffer[] = []
  let lineBytes = 0
  let outputBytes = 0
  let bytesRead = 0
  let line = 1
  let totalLines: number | undefined
  let stopReason: TextPageReadResult['stopReason']
  let oversizedLine: number | undefined

  const finishLine = (): void => {
    if (line >= offset) {
      let bytes = Buffer.concat(parts)
      if (line === 1 && bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) bytes = bytes.subarray(3)
      if (bytes.length > budgets.lineBytes) { oversizedLine = line; stopReason = 'output-limit'; return }
      const size = bytes.length + (lines.length ? 1 : 0)
      if (outputBytes + size > budgets.outputBytes) { stopReason = 'output-limit'; return }
      let text: string
      try { text = decoder.decode(bytes) }
      catch { throw new Error('Read target is not valid UTF-8 text.') }
      lines.push(text)
      outputBytes += size
    }
    parts = []
    lineBytes = 0
  }

  while (!stopReason) {
    request.abortSignal?.throwIfAborted()
    if (performance.now() >= deadline) { stopReason = 'deadline'; break }
    if (bytesRead >= budgets.scanBytes) { stopReason = 'scan-limit'; break }
    await verify()
    if (performance.now() >= deadline) { stopReason = 'deadline'; break }
    const result = await handle.read({ buffer, length: Math.min(buffer.length, budgets.scanBytes - bytesRead), position: bytesRead })
    bytesRead += result.bytesRead
    request.abortSignal?.throwIfAborted()
    if (performance.now() >= deadline) { stopReason = 'deadline'; break }
    if (result.bytesRead === 0) {
      finishLine()
      if (!stopReason) totalLines = line
      break
    }
    const chunk = buffer.subarray(0, result.bytesRead)
    let position = 0
    while (position < chunk.length && !stopReason) {
      const newline = chunk.indexOf(10, position)
      const end = newline === -1 ? chunk.length : newline
      const bytes = chunk.subarray(position, end)
      if (bytes.includes(0)) throw new Error('Read target contains binary data; text paging is unavailable.')
      if (line >= offset) {
        lineBytes += bytes.length
        // Allow a UTF-8 BOM only at the start of the first logical line.
        const bomAllowance = line === 1 ? 3 : 0
        if (lineBytes > budgets.lineBytes + bomAllowance) {
          oversizedLine = line
          stopReason = 'output-limit'
          break
        }
        parts.push(Buffer.from(bytes))
      }
      if (newline === -1) break
      finishLine()
      if (stopReason) break
      line++
      if (lines.length >= limit) { stopReason = 'line-limit'; break }
      position = newline + 1
    }
  }

  return {
    text: lines.join('\n'), startLine: offset, endLine: offset + lines.length - 1,
    bytesRead, ...(totalLines === undefined ? {} : { totalLines }),
    ...(stopReason ? { stopReason } : {}),
    ...(stopReason && stopReason !== 'scan-limit' && oversizedLine === undefined && lines.length
      ? { nextOffset: offset + lines.length } : {}),
    ...(oversizedLine === undefined ? {} : { oversizedLine }),
  }
}
