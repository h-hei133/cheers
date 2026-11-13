export const MAX_RENDER_WRITE_CHARS = 1024 * 1024;

export interface TerminalWriteSink {
  write(data: string, onWritten?: () => void): void;
}

function safeChunkEnd(value: string, offset: number, capacity: number): number {
  let end = Math.min(value.length, offset + capacity);
  if (
    end < value.length &&
    end > offset &&
    value.charCodeAt(end - 1) >= 0xd800 &&
    value.charCodeAt(end - 1) <= 0xdbff &&
    value.charCodeAt(end) >= 0xdc00 &&
    value.charCodeAt(end) <= 0xdfff
  ) {
    end--;
  }
  return end;
}

/**
 * Streams terminal output in <= 1 MiB UTF-16-safe chunks so oversized frames
 * never exceed V8 string limits or split surrogate pairs across writes.
 */
export class BoundedTerminalWriter {
  private buffer = "";
  private writtenChars = 0;
  private readonly maxChars: number;

  constructor(
    private readonly sink: TerminalWriteSink,
    maxChars: number = MAX_RENDER_WRITE_CHARS,
  ) {
    this.maxChars = Number.isFinite(maxChars) ? Math.max(2, Math.floor(maxChars)) : MAX_RENDER_WRITE_CHARS;
  }

  append(value: string): void {
    let offset = 0;
    while (offset < value.length) {
      const capacity = this.maxChars - this.buffer.length;
      if (capacity <= 0) {
        this.flush();
        continue;
      }
      let end = safeChunkEnd(value, offset, capacity);
      if (end === offset) {
        if (this.buffer.length > 0) {
          this.flush();
          continue;
        }
        end = Math.min(value.length, offset + 2);
      }
      this.buffer += value.slice(offset, end);
      offset = end;
      if (this.buffer.length >= this.maxChars && offset < value.length) {
        this.flush();
      }
    }
  }

  flush(onWritten?: () => void): void {
    if (!this.buffer) {
      if (onWritten) this.sink.write("", onWritten);
      return;
    }
    this.sink.write(this.buffer, onWritten);
    this.writtenChars += this.buffer.length;
    this.buffer = "";
  }

  get length(): number {
    return this.writtenChars + this.buffer.length;
  }
}

/** Write a rendered frame buffer to `sink` in <= 1 MiB surrogate-safe chunks. */
export function writeBoundedFrame(
  sink: TerminalWriteSink,
  data: string,
  onWritten?: () => void,
  maxChars: number = MAX_RENDER_WRITE_CHARS,
): void {
  const limit = Number.isFinite(maxChars) ? Math.max(2, Math.floor(maxChars)) : MAX_RENDER_WRITE_CHARS;
  if (data.length <= limit) {
    sink.write(data, onWritten);
    return;
  }
  const writer = new BoundedTerminalWriter(sink, limit);
  writer.append(data);
  writer.flush(onWritten);
}
