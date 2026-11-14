export const MAX_RENDER_WRITE_BYTES = 1024 * 1024;

export interface TerminalWriteSink {
  write(data: string, onWritten?: () => void): void;
}

function chunkBoundary(value: string, offset: number, capacity: number): { end: number; bytes: number } {
  let end = offset;
  let bytes = 0;
  while (end < value.length) {
    const point = value.codePointAt(end)!;
    const width = point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
    if (bytes + width > capacity) break;
    bytes += width;
    end += point > 0xffff ? 2 : 1;
  }
  return { end, bytes };
}

/**
 * Buffers at most 1 MiB of UTF-8 output. Callers append rows instead of first
 * constructing a complete frame; adjacent fragments may split a surrogate pair.
 */
export class BoundedTerminalWriter {
  private buffer = "";
  private bufferBytes = 0;
  private heldSurrogate = "";
  private writtenChars = 0;
  private readonly maxBytes: number;

  constructor(
    private readonly sink: TerminalWriteSink,
    maxBytes: number = MAX_RENDER_WRITE_BYTES,
  ) {
    this.maxBytes = Number.isFinite(maxBytes) ? Math.max(4, Math.floor(maxBytes)) : MAX_RENDER_WRITE_BYTES;
  }

  append(value: string): void {
    if (!value) return;
    value = this.heldSurrogate + value;
    this.heldSurrogate = "";
    const last = value.charCodeAt(value.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) {
      this.heldSurrogate = value.slice(-1);
      value = value.slice(0, -1);
    }
    let offset = 0;
    while (offset < value.length) {
      const capacity = this.maxBytes - this.bufferBytes;
      if (capacity <= 0) {
        this.drain();
        continue;
      }
      const { end, bytes } = chunkBoundary(value, offset, capacity);
      if (end === offset) {
        this.drain();
        continue;
      }
      this.buffer += value.slice(offset, end);
      this.bufferBytes += bytes;
      offset = end;
      if (this.bufferBytes >= this.maxBytes && offset < value.length) {
        this.drain();
      }
    }
  }

  flush(onWritten?: () => void): void {
    if (this.heldSurrogate) {
      if (this.bufferBytes + 3 > this.maxBytes) this.drain();
      this.buffer += this.heldSurrogate;
      this.bufferBytes += 3;
      this.heldSurrogate = "";
    }
    this.drain(onWritten);
  }

  private drain(onWritten?: () => void): void {
    if (!this.buffer) {
      if (onWritten) this.sink.write("", onWritten);
      return;
    }
    this.sink.write(this.buffer, onWritten);
    this.writtenChars += this.buffer.length;
    this.buffer = "";
    this.bufferBytes = 0;
  }

  get length(): number {
    return this.writtenChars + this.buffer.length + this.heldSurrogate.length;
  }
}

/** Write a rendered frame buffer to `sink` in <= 1 MiB surrogate-safe chunks. */
export function writeBoundedFrame(
  sink: TerminalWriteSink,
  data: string,
  onWritten?: () => void,
  maxBytes: number = MAX_RENDER_WRITE_BYTES,
): void {
  const limit = Number.isFinite(maxBytes) ? Math.max(4, Math.floor(maxBytes)) : MAX_RENDER_WRITE_BYTES;
  if (Buffer.byteLength(data) <= limit) {
    sink.write(data, onWritten);
    return;
  }
  const writer = new BoundedTerminalWriter(sink, limit);
  writer.append(data);
  writer.flush(onWritten);
}
