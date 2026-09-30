/**
 * SGR run collapsing for painted rows.
 *
 * Composed rows accumulate adjacent colour sequences — a container resets, then
 * a child immediately sets its own attributes. Emitting all of them is correct
 * but multiplies frame bytes, which is what stalls a slow link. Merging a run of
 * back-to-back `CSI … m` into one sequence is byte-for-byte equivalent to the
 * terminal, because SGR parameters apply left to right within a sequence exactly
 * as they do across sequences.
 *
 * Semicolon-delimited extended colours (`38;2;r;g;b`, `48;5;n`)
 * only merge when the whole parameter list is present, so a truncated row can
 * never fuse a partial colour into its neighbour's parameters. Colon-delimited
 * groups are carried as opaque parameters; their component count is not checked.
 */

const RESET = "\x1b[0m";

/** Sequence closing every attribute and any open hyperlink for one row. */
export const LINE_TERMINATOR = "\x1b[0m\x1b]8;;\x07";

const MAX_MERGED_PARAMS = 16;

/** Whether a byte can appear inside an SGR parameter list. */
function isSgrParamByte(code: number): boolean {
  return (code >= 0x30 && code <= 0x39) || code === 0x3b || code === 0x3a;
}

/**
 * Exclusive end of the `CSI … m` sequence at `start`, or -1 when the bytes at
 * `start` are not a complete SGR sequence.
 */
function sgrSequenceEnd(line: string, start: number): number {
  if (line.charCodeAt(start) !== 0x1b || line.charCodeAt(start + 1) !== 0x5b) return -1;
  let index = start + 2;
  while (index < line.length && isSgrParamByte(line.charCodeAt(index))) index++;
  return line.charCodeAt(index) === 0x6d /* m */ ? index + 1 : -1;
}

/**
 * Whether a parameter list ends mid-way through an extended colour, which means
 * the following sequence's parameters would be absorbed as colour components.
 */
function endsWithPartialExtendedColour(params: string): boolean {
  const parts = params.split(";");
  for (let index = parts.length - 1; index >= 0; index--) {
    const token = parts[index]!;
    if (token !== "38" && token !== "48" && token !== "58") continue;
    const trailing = parts.length - index - 1;
    const mode = parts[index + 1];
    if (mode === undefined) return true;
    if (mode === "2") return trailing < 4;
    if (mode === "5") return trailing < 2;
    return false;
  }
  return false;
}

/** The row with runs of adjacent SGR sequences merged into single sequences. */
export function coalesceAdjacentSgr(line: string): string {
  if (line.length === 0 || line.indexOf("\x1b[") < 0) return line;

  let result = "";
  let index = 0;
  while (index < line.length) {
    const firstEnd = sgrSequenceEnd(line, index);
    if (firstEnd < 0) {
      const nextEsc = line.indexOf("\x1b[", index + 1);
      const stop = nextEsc < 0 ? line.length : nextEsc;
      result += line.slice(index, Math.max(stop, index + 1));
      index = Math.max(stop, index + 1);
      continue;
    }

    const params: string[] = [];
    let cursor = index;
    let end = firstEnd;
    let merged = 0;
    while (end > cursor) {
      const body = line.slice(cursor + 2, end - 1);
      const tokens = body.length === 0 ? ["0"] : body.split(";");
      if (merged > 0 && (params.length + tokens.length > MAX_MERGED_PARAMS || endsWithPartialExtendedColour(params.join(";")))) {
        break;
      }
      params.push(...tokens);
      merged++;
      cursor = end;
      end = sgrSequenceEnd(line, cursor);
      if (params.length >= MAX_MERGED_PARAMS) break;
    }

    result += merged > 1 && !endsWithPartialExtendedColour(params.join(";"))
      ? `\x1b[${params.join(";")}m`
      : line.slice(index, cursor);
    index = cursor;
  }
  return result;
}

/** Whether the row already ends with a full attribute reset. */
export function endsWithReset(line: string): boolean {
  return line.endsWith(RESET) || line.endsWith(LINE_TERMINATOR);
}
