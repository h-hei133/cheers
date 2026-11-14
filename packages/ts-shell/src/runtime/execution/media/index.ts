import { withMediaSource, withInlineMediaSource } from './source.js'
import { readImage, resizeInlineImage } from './image.js'
import { readPdf } from './pdf.js'
import { MediaReadError, type MediaReadRequest, type MediaReadResult } from './model.js'
import type { ImageContent } from '../../../model-adapters/multimodal.js'
import type { ModelImageResizeOptions } from '../../../core/models/modalities.js'

/** One process-wide reader; a termination failure seals admission until restart. */
export function createMediaReader(): ((request: MediaReadRequest) => Promise<MediaReadResult>) & {
  resize(image: ImageContent, resize: ModelImageResizeOptions, cwd: string, signal?: AbortSignal): Promise<ImageContent>
} {
  let active = 0, cleanupFailed = false
  const admitted = async <T>(signal: AbortSignal | undefined, consume: () => Promise<T>): Promise<T> => {
    signal?.throwIfAborted()
    if (cleanupFailed) throw new MediaReadError('cleanup')
    if (active >= 2) throw new MediaReadError('busy')
    active++
    try {
      return await consume()
    } catch (error) {
      if (processCleanupFailed(error)) cleanupFailed = true
      throw error
    } finally { active-- }
  }
  const read = (request: MediaReadRequest): Promise<MediaReadResult> => admitted(request.abortSignal,
    () => withMediaSource(request, source => request.kind === 'image' ? readImage(request, source) : readPdf(request, source)))
  return Object.assign(read, {
    resize: (image: ImageContent, resize: ModelImageResizeOptions, cwd: string, signal?: AbortSignal): Promise<ImageContent> =>
      admitted(signal, () => withInlineMediaSource(image.data, signal, source => resizeInlineImage(image, source, resize, cwd, signal))),
  })
}

export function processCleanupFailed(error: unknown): boolean {
  return error instanceof MediaReadError && error.reason === 'cleanup' ||
    error instanceof AggregateError && error.errors.some(processCleanupFailed)
}

export const readMedia = createMediaReader()
