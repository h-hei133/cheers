import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, type TruncationResult, truncateTail } from './truncation.js'

export interface OutputAccumulatorOptions {
  readonly maxLines?: number
  readonly maxBytes?: number
  /** Optional streaming sink notified when total decoded output first overflows budget and for subsequent chunks. */
  readonly onOverflowSpill?: (chunk: string) => void
}

export interface OutputAccumulatorSnapshot {
  readonly content: string
  readonly truncation: TruncationResult
  readonly totalRawBytes: number
  readonly totalDecodedBytes: number
  readonly totalLines: number
}

function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8')
}

/**
 * Incrementally tracks streaming command output with bounded rolling tail memory.
 *
 * Chunks are decoded via a streaming UTF-8 TextDecoder while maintaining only a
 * bounded rolling tail (`2 * maxBytes`) for display and context truncation.
 */
export class OutputAccumulator {
  private readonly maxLines: number
  private readonly maxBytes: number
  private readonly maxRollingBytes: number
  private readonly decoder = new TextDecoder()

  private tailText = ''
  private tailBytes = 0
  private tailStartsAtLineBoundary = true
  private totalRawBytes = 0
  private totalDecodedBytes = 0
  private completedLines = 0
  private totalLines = 0
  private currentLineBytes = 0
  private hasOpenLine = false
  private finished = false
  private spilled = false
  private spillBuffer = ''
  private readonly onOverflowSpill?: (chunk: string) => void

  constructor(options: OutputAccumulatorOptions = {}) {
    this.maxLines = options.maxLines ?? DEFAULT_MAX_LINES
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
    this.maxRollingBytes = Math.max(this.maxBytes * 2, 1)
    this.onOverflowSpill = options.onOverflowSpill
  }

  append(chunk: string | Buffer | Uint8Array): void {
    if (this.finished) {
      throw new Error('Cannot append to a finished OutputAccumulator.')
    }
    if (typeof chunk === 'string') {
      const bytes = utf8ByteLength(chunk)
      this.totalRawBytes += bytes
      this.appendDecodedText(chunk)
      return
    }
    this.totalRawBytes += chunk.byteLength
    this.appendDecodedText(this.decoder.decode(chunk, { stream: true }))
  }

  finish(): void {
    if (this.finished) return
    this.finished = true
    this.appendDecodedText(this.decoder.decode())
  }

  getLastLineBytes(): number {
    return this.currentLineBytes
  }

  snapshot(): OutputAccumulatorSnapshot {
    const hasNewline = this.tailText.includes('\n')
    const snapshotText = this.tailStartsAtLineBoundary || !hasNewline
      ? this.tailText
      : this.getSnapshotText()
    const tailTruncation = truncateTail(snapshotText, {
      maxLines: this.maxLines,
      maxBytes: this.maxBytes,
    })
    const truncated =
      tailTruncation.truncated ||
      this.totalLines > this.maxLines ||
      this.totalDecodedBytes > this.maxBytes
    const truncation: TruncationResult = {
      ...tailTruncation,
      truncated,
      direction: truncated ? 'tail' : 'none',
      originalLines: Math.max(this.totalLines, tailTruncation.originalLines),
      originalBytes: Math.max(this.totalDecodedBytes, tailTruncation.originalBytes),
    }
    return {
      content: truncation.content,
      truncation,
      totalRawBytes: this.totalRawBytes,
      totalDecodedBytes: this.totalDecodedBytes,
      totalLines: this.totalLines,
    }
  }

  private appendDecodedText(text: string): void {
    if (text.length === 0) return
    const bytes = utf8ByteLength(text)
    this.totalDecodedBytes += bytes
    this.tailText += text
    this.tailBytes += bytes
    if (this.onOverflowSpill) {
      if (this.spilled) {
        this.onOverflowSpill(text)
      } else {
        this.spillBuffer += text
        if (this.totalDecodedBytes > this.maxBytes) {
          this.spilled = true
          const initial = this.spillBuffer
          this.spillBuffer = ''
          this.onOverflowSpill(initial)
        }
      }
    }
    if (this.tailBytes > this.maxRollingBytes * 2) {
      this.trimTail()
    }
    let newlines = 0
    let lastNewline = -1
    for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
      newlines++
      lastNewline = i
    }
    if (newlines === 0) {
      this.currentLineBytes += bytes
      this.hasOpenLine = true
    } else {
      this.completedLines += newlines
      const tail = text.slice(lastNewline + 1)
      this.currentLineBytes = utf8ByteLength(tail)
      this.hasOpenLine = tail.length > 0
    }
    this.totalLines = this.completedLines + (this.hasOpenLine ? 1 : 0)
  }

  private trimTail(): void {
    const buffer = Buffer.from(this.tailText, 'utf8')
    if (buffer.length <= this.maxRollingBytes) {
      this.tailBytes = buffer.length
      return
    }
    let start = buffer.length - this.maxRollingBytes
    while (start < buffer.length && (buffer[start]! & 0xc0) === 0x80) {
      start++
    }
    this.tailStartsAtLineBoundary =
      start === 0 ? this.tailStartsAtLineBoundary : buffer[start - 1] === 0x0a
    this.tailText = buffer.subarray(start).toString('utf8')
    this.tailBytes = utf8ByteLength(this.tailText)
  }

  private getSnapshotText(): string {
    if (this.tailStartsAtLineBoundary) return this.tailText
    const firstNewline = this.tailText.indexOf('\n')
    return firstNewline === -1 ? this.tailText : this.tailText.slice(firstNewline + 1)
  }
}
