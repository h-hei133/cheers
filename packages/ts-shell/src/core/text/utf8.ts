/** Byte cursors remain exact while independently decoded pages end at character boundaries. */
export function utf8PageEnd(bytes: Uint8Array, offset: number, limit: number): number {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > bytes.length
    || !Number.isSafeInteger(limit) || limit < 4) throw new Error('Output page bounds are invalid.');
  if (offset < bytes.length && (bytes[offset]! & 0xc0) === 0x80) throw new Error('Output offset splits a UTF-8 character. Use the previous page cursor.');
  let end = Math.min(bytes.length, offset + limit);
  while (end > offset && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
  if (end === offset && offset < bytes.length) throw new Error('Output has no UTF-8 boundary within the page limit.');
  return end;
}
