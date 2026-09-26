/**
 * Reading the binary event stream one endpoint answers with.
 *
 * Not every streaming protocol is text. One frames each event as a length-prefixed
 * binary message with its own checksums, which is a different job from splitting
 * on blank lines: the boundaries are counted rather than searched for, and a
 * message can arrive in pieces or several at once.
 *
 * The framing is all big-endian. Each message carries two checksums — one over
 * its own length header, one over everything before the trailing field — so a
 * truncated or corrupted frame is detected here rather than surfacing later as a
 * confusing parse error in the caller.
 */

/** One decoded message: its typed headers and its payload. */
export interface EventMessage {
  /**
   * The message's headers, by name.
   *
   * Names keep their casing — the framing uses a leading colon on the ones the
   * protocol defines, and callers match on them verbatim.
   */
  readonly headers: Readonly<Record<string, string>>;
  readonly payload: Uint8Array;
}

/** A frame that is not well formed, with what was wrong. */
export class EventStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventStreamError";
  }
}

const PRELUDE_LENGTH = 8;
const PRELUDE_CRC_LENGTH = 4;
const MESSAGE_CRC_LENGTH = 4;
const HEADER_BLOCK_OFFSET = PRELUDE_LENGTH + PRELUDE_CRC_LENGTH;
const MINIMUM_MESSAGE_LENGTH = HEADER_BLOCK_OFFSET + MESSAGE_CRC_LENGTH;

/**
 * The lookup table for CRC-32, built once.
 *
 * The polynomial is the one every zlib-style CRC uses, reflected: each byte's
 * eight bits are shifted through it. Node has this built in, but not at the
 * runtime version this package supports — it arrived after our floor — so the
 * table is computed here. It is twenty lines of arithmetic and it removes a
 * version constraint from the whole feature.
 */
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

/** The CRC-32 of some bytes, as the framing defines it. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** A signed 64-bit big-endian value, which does not fit a JS number. */
function readBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  // Two's complement: a value with its top bit set is negative.
  if (bytes.length === 8 && bytes[0]! & 0x80) value -= 1n << 64n;
  return value;
}

/**
 * Decode one complete message.
 *
 * Both checksums are verified rather than skipped. They exist to catch a stream
 * that arrived damaged, and a decoder that ignored them would turn a corrupted
 * payload into a plausible-looking event — the failure mode being avoided is a
 * wrong answer rather than an error.
 */
export function decodeMessage(frame: Uint8Array): EventMessage {
  if (frame.length < MINIMUM_MESSAGE_LENGTH) {
    throw new EventStreamError(`frame of ${frame.length} bytes is below the minimum ${MINIMUM_MESSAGE_LENGTH}`);
  }
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const total = view.getUint32(0, false);
  if (total !== frame.length) {
    throw new EventStreamError(`frame declares ${total} bytes but ${frame.length} were given`);
  }
  const headersLength = view.getUint32(4, false);
  const declaredPreludeCrc = view.getUint32(8, false);
  const actualPreludeCrc = crc32(frame.subarray(0, PRELUDE_LENGTH));
  if (actualPreludeCrc !== declaredPreludeCrc) {
    throw new EventStreamError("prelude checksum does not match");
  }
  const declaredMessageCrc = view.getUint32(total - MESSAGE_CRC_LENGTH, false);
  const actualMessageCrc = crc32(frame.subarray(0, total - MESSAGE_CRC_LENGTH));
  if (actualMessageCrc !== declaredMessageCrc) {
    throw new EventStreamError("message checksum does not match");
  }

  const headerEnd = HEADER_BLOCK_OFFSET + headersLength;
  if (headerEnd > total - MESSAGE_CRC_LENGTH) {
    throw new EventStreamError(`header block of ${headersLength} bytes runs past the frame`);
  }
  return {
    headers: decodeHeaders(frame.subarray(HEADER_BLOCK_OFFSET, headerEnd)),
    payload: frame.subarray(headerEnd, total - MESSAGE_CRC_LENGTH),
  };
}

/**
 * The header block, as name/value pairs.
 *
 * Each entry is a length-prefixed name, a one-byte type, and a value whose width
 * that type decides. Everything is surfaced as a string: the values the protocol
 * defines are names and identifiers, and a caller comparing them wants text
 * rather than a union of ten numeric widths.
 */
function decodeHeaders(block: Uint8Array): Record<string, string> {
  const headers: Record<string, string> = {};
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
  const decoder = new TextDecoder();
  let at = 0;
  while (at < block.length) {
    const nameLength = view.getUint8(at);
    at += 1;
    const name = decoder.decode(block.subarray(at, at + nameLength));
    at += nameLength;
    const type = view.getUint8(at);
    at += 1;

    switch (type) {
      case 0:
        headers[name] = "true";
        break;
      case 1:
        headers[name] = "false";
        break;
      case 2:
        headers[name] = String(view.getInt8(at));
        at += 1;
        break;
      case 3:
        headers[name] = String(view.getInt16(at, false));
        at += 2;
        break;
      case 4:
        headers[name] = String(view.getInt32(at, false));
        at += 4;
        break;
      case 5:
        // A 64-bit value does not survive a JS number, so it stays a string.
        headers[name] = readBigInt(block.subarray(at, at + 8)).toString();
        at += 8;
        break;
      case 6: {
        const length = view.getUint16(at, false);
        at += 2;
        headers[name] = Buffer.from(block.subarray(at, at + length)).toString("base64");
        at += length;
        break;
      }
      case 7: {
        const length = view.getUint16(at, false);
        at += 2;
        headers[name] = decoder.decode(block.subarray(at, at + length));
        at += length;
        break;
      }
      case 8:
        headers[name] = new Date(Number(readBigInt(block.subarray(at, at + 8)))).toISOString();
        at += 8;
        break;
      case 9: {
        const hex: string[] = [];
        for (const byte of block.subarray(at, at + 16)) hex.push(byte.toString(16).padStart(2, "0"));
        headers[name] = `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
        at += 16;
        break;
      }
      default:
        throw new EventStreamError(`unknown header value type ${type}`);
    }
  }
  return headers;
}

/**
 * Every message in a stream, as it arrives.
 *
 * Chunk boundaries have nothing to do with message boundaries: one read may end
 * mid-header and another may carry three whole messages. What is left over is
 * held until the rest arrives, and a stream that ends with a partial message is
 * an error rather than a silent truncation.
 */
export async function* readEventStream(
  source: ReadableStream<Uint8Array>,
): AsyncGenerator<EventMessage, void, undefined> {
  const reader = source.getReader();
  let pending = new Uint8Array(0);
  let finished = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value && value.length > 0) {
        const merged = new Uint8Array(pending.length + value.length);
        merged.set(pending);
        merged.set(value, pending.length);
        pending = merged;
      }
      let consumed = 0;
      while (pending.length - consumed >= 4) {
        const view = new DataView(pending.buffer, pending.byteOffset + consumed, pending.length - consumed);
        const total = view.getUint32(0, false);
        if (total < MINIMUM_MESSAGE_LENGTH) {
          throw new EventStreamError(`frame declares ${total} bytes, below the minimum ${MINIMUM_MESSAGE_LENGTH}`);
        }
        if (pending.length - consumed < total) break;
        yield decodeMessage(pending.subarray(consumed, consumed + total));
        consumed += total;
      }
      if (consumed > 0) pending = pending.slice(consumed);
      if (done) break;
    }
    if (pending.length > 0) {
      throw new EventStreamError(`stream ended with ${pending.length} bytes of an incomplete message`);
    }
    finished = true;
  } finally {
    // A consumer that stopped early leaves the connection draining; cancelling
    // releases it now rather than when the body is collected.
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
