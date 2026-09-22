/**
 * ANSI escape sequence boundaries inside a rendered terminal line.
 *
 * Every consumer that measures, slices, or repaints a line needs to know where
 * escape sequences start and end so their bytes are carried through without
 * being counted as visible cells. A single scanner owns that knowledge: CSI
 * terminates on any final byte in 0x40..0x7E (not just `m`), and the string
 * families (OSC/DCS/APC/SOS/PM) terminate on BEL or ST.
 */

export const ESC = "\x1b";

const CSI_FINAL_MIN = 0x40;
const CSI_FINAL_MAX = 0x7e;

/**
 * Exclusive end index of the escape sequence starting at `start`, where
 * `line[start]` is ESC. Returns `line.length` for a sequence that runs past the
 * end of the string, and `start + 1` for a trailing lone ESC.
 */
export function ansiSequenceEnd(line: string, start: number): number {
  const next = line.charCodeAt(start + 1);
  if (Number.isNaN(next)) return start + 1;
  switch (next) {
    case 0x5b /* [ */:
      return csiEnd(line, start + 2);
    case 0x5d /* ] */:
    case 0x50 /* P */:
    case 0x5f /* _ */:
    case 0x58 /* X */:
    case 0x5e /* ^ */:
      return stringSequenceEnd(line, start + 2);
    case 0x4f /* O */:
      return Math.min(line.length, start + 3);
    default:
      return start + 2;
  }
}

function csiEnd(line: string, from: number): number {
  for (let index = from; index < line.length; index++) {
    const code = line.charCodeAt(index);
    if (code >= CSI_FINAL_MIN && code <= CSI_FINAL_MAX) return index + 1;
  }
  return line.length;
}

function stringSequenceEnd(line: string, from: number): number {
  for (let index = from; index < line.length; index++) {
    const code = line.charCodeAt(index);
    if (code === 0x07 /* BEL */) return index + 1;
    if (code === 0x1b && line.charCodeAt(index + 1) === 0x5c /* \ */) return index + 2;
  }
  return line.length;
}

/** Whether the line holds any escape byte at all (fast reject for hot paths). */
export function hasAnsi(line: string): boolean {
  return line.indexOf(ESC) >= 0;
}

/** The line with every escape sequence removed. */
export function stripAnsi(line: string): string {
  if (!line) return "";
  if (!hasAnsi(line)) return line;
  let result = "";
  let index = 0;
  while (index < line.length) {
    if (line.charCodeAt(index) === 0x1b) {
      index = ansiSequenceEnd(line, index);
      continue;
    }
    const nextEsc = line.indexOf(ESC, index);
    if (nextEsc < 0) {
      result += line.slice(index);
      break;
    }
    result += line.slice(index, nextEsc);
    index = nextEsc;
  }
  return result;
}
