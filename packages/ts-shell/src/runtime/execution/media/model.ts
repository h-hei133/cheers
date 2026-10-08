export type { MediaReadRequest, MediaReadResult } from '../types.js'

export class MediaReadError extends Error {
  constructor(readonly reason: 'unavailable' | 'busy' | 'format' | 'bytes' | 'pixels' | 'pages' | 'output' | 'deadline' | 'decode' | 'changed' | 'cleanup' | 'encrypted') {
    const detail = {
      unavailable: 'The bounded native media reader is unavailable. Linux requires prlimit, FFmpeg/ffprobe for images, and Poppler pdfinfo/pdftotext for PDF.',
      busy: 'The bounded native media reader is busy (at most two extractions per process). Retry this source sequentially.',
      format: 'The file signature does not match a supported image or PDF format.',
      bytes: 'The media file exceeds the 16MiB input limit.',
      pixels: 'The image exceeds the 16-megapixel or 16,384-pixel side limit.',
      pages: 'The PDF page range is invalid or the document exceeds 200 pages. Read at most five pages at a time.',
      output: 'Media extraction exceeded its output limit. Request fewer PDF pages or a smaller image.',
      deadline: 'Media extraction exceeded its shared 15-second deadline.',
      decode: 'The media could not be decoded. No visual or document content was returned.',
      changed: 'The media file changed during extraction. Read it again.',
      cleanup: 'Media extraction failed: process cleanup could not be verified. Further media extraction is blocked until the runtime restarts.',
      encrypted: 'Encrypted PDF content is unavailable; no password or access restriction was bypassed.',
    }[reason]
    super(detail)
    this.name = 'MediaReadError'
  }
}
