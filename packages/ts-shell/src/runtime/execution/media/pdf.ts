import { MediaReadError, type MediaReadRequest, type MediaReadResult } from './model.js'
import type { MediaSource } from './source.js'
import { runMediaProcess } from './process.js'

/** Extract each selected page separately and retain provenance in structured metadata. */
export async function readPdf(request: MediaReadRequest, source: MediaSource): Promise<MediaReadResult> {
  if (source.signature.subarray(0, 5).toString('ascii') !== '%PDF-') throw new MediaReadError('format')
  const offset = request.offset ?? 1, limit = request.limit ?? 5
  if (!Number.isSafeInteger(offset) || offset < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 5) throw new MediaReadError('pages')
  const info = (await runMediaProcess(source, request.workspaceRoot, 'pdfinfo', ['-enc', 'UTF-8', '/proc/self/fd/3'], 16 * 1024, request.abortSignal, 3)).toString('utf8')
  // Poppler writes document-controlled metadata first and authoritative fields
  // last. Use the last field, never a Pages/Encrypted line inside the title.
  const encrypted = [...info.matchAll(/^Encrypted:\s+(yes|no)\b.*$/gm)].at(-1)?.[1]
  if (encrypted === 'yes') throw new MediaReadError('encrypted')
  if (encrypted !== 'no') throw new MediaReadError('decode')
  const totalPages = Number([...info.matchAll(/^Pages:\s+(\d+)\s*$/gm)].at(-1)?.[1])
  if (!Number.isSafeInteger(totalPages) || totalPages < 1) throw new MediaReadError('decode')
  if (totalPages > 200 || offset > totalPages) throw new MediaReadError('pages')
  const endPage = Math.min(totalPages, offset + limit - 1)
  const pages: { page: number; status: 'text' | 'no-text'; extractedBytes: number; text: string }[] = []
  const output: string[] = [`PDF pages ${offset}-${endPage} of ${totalPages}. Source SHA-256: ${source.hash}. Text extraction only; OCR, images and layout interpretation were not performed.`]
  let remaining = 48 * 1024
  for (let page = offset; page <= endPage; page++) {
    const bytes = await runMediaProcess(source, request.workspaceRoot, 'pdftotext', ['-q', '-enc', 'UTF-8', '-eol', 'unix', '-layout', '-nopgbrk', '-f', String(page), '-l', String(page), '/proc/self/fd/3', '-'], remaining, request.abortSignal, 3)
    const text = bytes.toString('utf8').trimEnd()
    remaining -= bytes.length
    pages.push({ page, status: text.trim() ? 'text' : 'no-text', extractedBytes: bytes.length, text })
    output.push(`[Page ${page} of ${totalPages}]\n${text.trim() ? text : '[No extractable text. This page may be blank, scanned or contain unsupported text; OCR was not run.]'}`)
  }
  const nextOffset = endPage < totalPages ? endPage + 1 : undefined
  const notice = `[Selected PDF pages ${offset}-${endPage} of ${totalPages}; text extraction only.${nextOffset ? ` Use offset=${nextOffset} to continue.` : ' End of document.'} To inspect omitted current-page text, re-read offset=${offset} with limit=1 before advancing. If that page exceeds the output limit, use another document inspection tool.]`
  output.push(notice)
  return { output: output.join('\n\n'), metadata: { outputNotice: notice,
    media: { kind: 'pdf', sourceHash: source.hash, sourceBytes: source.bytes, startPage: offset, endPage, totalPages, nextOffset, extraction: 'text-only', pages } } }
}
