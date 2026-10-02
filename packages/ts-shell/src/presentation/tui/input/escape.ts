/**
 * Escape sequence boundary resolution for a raw stdin buffer.
 *
 * Raw mode delivers whatever the kernel had ready, so one keypress can arrive
 * split across chunks and several can arrive fused into one. Splitting the
 * buffer therefore needs an explicit answer to "is this sequence finished yet",
 * distinct from "is it valid" — a partial sequence must be held for its tail,
 * never guessed at, or its bytes leak into the editor as typed text.
 */

export const ESC = "\x1b";

/** A sequence that is complete but longer than any real keypress could be. */
export const MAX_CSI_BYTES = 256;
export const MAX_STRING_BYTES = 4096;

export const ESCAPE_INCOMPLETE = -1;
export const ESCAPE_OVERLONG = -2;

/**
 * Exclusive end index of the escape sequence at `start`, where `buffer[start]`
 * is ESC.
 *
 * Returns {@link ESCAPE_INCOMPLETE} while more bytes are needed,
 * {@link ESCAPE_OVERLONG} once the prefix has outgrown its per-family cap and
 * should be released rather than held forever, and -1 for a leading `ESC ESC`,
 * which only the caller can disambiguate between a meta chord and two keys.
 */
export function resolveEscapeEnd(buffer: string, start: number): number {
  const length = buffer.length;
  if (start + 1 >= length) return ESCAPE_INCOMPLETE;
  switch (buffer.charCodeAt(start + 1)) {
    case 0x1b /* ESC */:
      return ESCAPE_INCOMPLETE;
    case 0x5b /* [ */:
      return resolveCsi(buffer, start, length);
    case 0x5d /* ] */:
    case 0x50 /* P */:
    case 0x5f /* _ */:
    case 0x58 /* X */:
    case 0x5e /* ^ */:
      return resolveStringSequence(buffer, start, length);
    case 0x4f /* O */:
      return start + 3 <= length ? start + 3 : ESCAPE_INCOMPLETE;
    default:
      return start + 2;
  }
}

/** CSI: `ESC [` parameters, then one final byte in 0x40..0x7E. */
function resolveCsi(buffer: string, start: number, length: number): number {
  if (start + 2 >= length) return ESCAPE_INCOMPLETE;
  // X10 mouse reporting encodes three arbitrary bytes after `ESC [ M`, any of
  // which may fall in the final-byte range.
  if (buffer.charCodeAt(start + 2) === 0x4d /* M */) {
    return start + 6 <= length ? start + 6 : ESCAPE_INCOMPLETE;
  }
  const cap = Math.min(length, start + MAX_CSI_BYTES);
  for (let index = start + 2; index < cap; index++) {
    const code = buffer.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) return index + 1;
  }
  return length - start >= MAX_CSI_BYTES ? ESCAPE_OVERLONG : ESCAPE_INCOMPLETE;
}

/** OSC/DCS/APC/SOS/PM: payload terminated by BEL or ST (`ESC \`). */
function resolveStringSequence(buffer: string, start: number, length: number): number {
  const cap = Math.min(length, start + MAX_STRING_BYTES);
  for (let index = start + 2; index < cap; index++) {
    const code = buffer.charCodeAt(index);
    if (code === 0x07 /* BEL */) return index + 1;
    if (code === 0x1b && index + 1 < cap && buffer.charCodeAt(index + 1) === 0x5c /* \ */) {
      return index + 2;
    }
  }
  return length - start >= MAX_STRING_BYTES ? ESCAPE_OVERLONG : ESCAPE_INCOMPLETE;
}

/**
 * Length of the Unicode scalar at `index`, so a surrogate pair is never split
 * into two lone halves that each look like an unknown character.
 */
export function scalarLength(buffer: string, index: number): number {
  const code = buffer.codePointAt(index);
  return code !== undefined && code > 0xffff ? 2 : 1;
}
