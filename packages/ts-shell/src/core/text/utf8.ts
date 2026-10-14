/** A valid prefix may need later bytes; malformed bytes retain ordinary replacement decoding. */
function sequenceEnd(bytes: Uint8Array, start: number): number {
  const lead = bytes[start]!;
  const length = lead >= 0xc2 && lead <= 0xdf ? 2 : lead >= 0xe0 && lead <= 0xef ? 3 : lead >= 0xf0 && lead <= 0xf4 ? 4 : 1;
  for (let index = start + 1; index < Math.min(start + length, bytes.length); index++) {
    const byte = bytes[index]!;
    if ((byte & 0xc0) !== 0x80 || index === start + 1 && (
      lead === 0xe0 && byte < 0xa0 || lead === 0xed && byte > 0x9f
      || lead === 0xf0 && byte < 0x90 || lead === 0xf4 && byte > 0x8f)) return index;
  }
  return start + length;
}

function boundaryStart(bytes: Uint8Array, position: number, includeIncomplete: boolean): number {
  for (let start = Math.max(0, position - 3); start < position; start++) {
    const end = sequenceEnd(bytes, start);
    if (end > position && (includeIncomplete || end <= bytes.length)) return start;
  }
  return position;
}

/** An open stream leaves an unfinished character at the returned cursor for the next read. */
export function utf8PageEnd(bytes: Uint8Array, offset: number, limit: number, streamOpen = false): number {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > bytes.length
    || !Number.isSafeInteger(limit) || limit < 4) throw new Error('Output page bounds are invalid.');
  if (offset === bytes.length) return offset;
  if (boundaryStart(bytes, offset, true) !== offset) throw new Error('Output offset splits a UTF-8 character. Use the previous page cursor.');
  const end = Math.min(bytes.length, offset + limit);
  return boundaryStart(bytes, end, end < bytes.length || streamOpen);
}
