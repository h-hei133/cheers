import { withMediaSource } from './source.js'
import { readImage } from './image.js'
import { readPdf } from './pdf.js'
import { MediaReadError, type MediaReadRequest, type MediaReadResult } from './model.js'

/** One process-wide reader; a termination failure seals admission until restart. */
export function createMediaReader(): (request: MediaReadRequest) => Promise<MediaReadResult> {
  let active = 0, cleanupFailed = false
  return async request => {
    request.abortSignal?.throwIfAborted()
    if (cleanupFailed) throw new MediaReadError('cleanup')
    if (active >= 2) throw new MediaReadError('busy')
    active++
    try {
      return await withMediaSource(request, source => request.kind === 'image' ? readImage(request, source) : readPdf(request, source))
    } catch (error) {
      if (processCleanupFailed(error)) cleanupFailed = true
      throw error
    } finally { active-- }
  }
}

function processCleanupFailed(error: unknown): boolean {
  return error instanceof MediaReadError && error.reason === 'cleanup' ||
    error instanceof AggregateError && error.errors.some(processCleanupFailed)
}

export const readMedia = createMediaReader()
