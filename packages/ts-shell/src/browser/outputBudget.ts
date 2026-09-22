/**
 * Byte-accurate output budgeting for browser runner processes.
 *
 * The manifests name this limit `outputBudgetBytes`, and it is read from a
 * caller-supplied JSON manifest, so the field name is an external contract and
 * cannot be renamed. The enforcement was measuring `String.length` instead,
 * which counts UTF-16 code units rather than UTF-8 bytes. A page or runner
 * response that is mostly Chinese or emoji occupies three to four bytes per
 * character, so real output could reach roughly four times the stated budget
 * before any limit applied.
 *
 * These helpers measure what the field name promises. They live here rather
 * than in `core/tools/truncation.ts` because that module truncates by lines and
 * direction across a whole transcript, whereas a runner stream must cap a single
 * accumulating string; importing core here would also add a dependency edge the
 * browser domain does not otherwise need.
 */

/** UTF-8 byte width of a single code point. */
function codePointByteWidth(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

/** Whether `value` exceeds `maxBytes` once encoded as UTF-8. */
export function exceedsByteBudget(value: string, maxBytes: number): boolean {
  if (value.length <= maxBytes) {
    // Code units bound byte length from below, so this is already inside budget
    // unless the string carries multi-byte characters.
    if (!/[\u0080-\uffff]/.test(value)) return false;
  }
  return Buffer.byteLength(value, "utf8") > maxBytes;
}

/**
 * Appends `next` to `current` and cuts the result to `maxBytes` of UTF-8, never
 * splitting a multi-byte character: the cut lands on the last character
 * boundary that fits.
 */
export function appendWithinByteBudget(
  current: string,
  next: string,
  maxBytes: number,
): string {
  const merged = `${current}${next}`;
  if (!exceedsByteBudget(merged, maxBytes)) return merged;

  let bytes = 0;
  let end = 0;
  for (const char of merged) {
    const width = codePointByteWidth(char.codePointAt(0) ?? 0);
    if (bytes + width > maxBytes) break;
    bytes += width;
    end += char.length;
  }
  return merged.slice(0, end);
}
