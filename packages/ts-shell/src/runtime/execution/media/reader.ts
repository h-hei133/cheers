import { withMediaSource, withInlineMediaSource } from './source.js'
import { runMediaProcess } from './process.js'
import { MediaReadError, type MediaReadRequest, type MediaReadResult } from './model.js'
import { canonicalImageMime, imageMime } from '../../../model-adapters/image/input.js'
import type { ImageContent } from '../../../model-adapters/multimodal.js'
import type { ModelImageResizeOptions } from '../../../core/models/modalities.js'
import type { MediaPorts, MediaProcess } from '@cheers/media'

export interface MediaReader {
  (request: MediaReadRequest): Promise<MediaReadResult>
  resize(image: ImageContent, resize: ModelImageResizeOptions, cwd: string, signal?: AbortSignal): Promise<ImageContent>
}

async function loadDecoders(): Promise<typeof import('@cheers/media')> {
  try {
    return await import('@cheers/media')
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') throw new MediaReadError('unavailable')
    throw error
  }
}

/** One process-wide reader; a termination failure seals admission until restart. */
export function createReader(run: MediaProcess = runMediaProcess): MediaReader {
  const ports: MediaPorts = { run, canonicalImageMime, imageMime,
    fail: reason => { throw new MediaReadError(reason) },
    isOutputLimit: error => error instanceof MediaReadError && error.reason === 'output' }
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
    () => withMediaSource(request, async source => {
      const decoders = await loadDecoders()
      return request.kind === 'image' ? decoders.readImage(ports, request, source) : decoders.readPdf(ports, request, source)
    }))
  return Object.assign(read, {
    resize: (image: ImageContent, resize: ModelImageResizeOptions, cwd: string, signal?: AbortSignal): Promise<ImageContent> =>
      admitted(signal, () => withInlineMediaSource(image.data, signal, async source =>
        (await loadDecoders()).resizeInlineImage(ports, image, source, resize, cwd, signal))),
  })
}

export function processCleanupFailed(error: unknown): boolean {
  return error instanceof MediaReadError && error.reason === 'cleanup' ||
    error instanceof AggregateError && error.errors.some(processCleanupFailed)
}
