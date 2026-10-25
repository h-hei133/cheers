/**
 * Mouse report decoding.
 *
 * Two encodings reach us. SGR (`CSI < b ; x ; y M|m`) is what every terminal
 * worth targeting emits once asked, and is the only one that can express columns
 * past 223. X10 (`CSI M` then three raw bytes) is the fallback some older
 * terminals still answer with, and is decoded so a stray report never reaches
 * the editor as typed text.
 *
 * Ordinary views request button-event tracking. An open picker can opt into
 * unbuttoned motion for hover without turning it into a selection gesture.
 */

/** Ask for button-event tracking with SGR coordinates. */
export const ENABLE_MOUSE = "\x1b[?1002h\x1b[?1006h";
/** Give the mouse back to the terminal, in reverse order. */
export const DISABLE_MOUSE = "\x1b[?1006l\x1b[?1002l";
export const ENABLE_MOUSE_MOTION = "\x1b[?1002l\x1b[?1003h\x1b[?1006h";
export const DISABLE_MOUSE_MOTION = "\x1b[?1003l";

export type MouseKind = "press" | "drag" | "release" | "wheel" | "move";

export interface MouseReport {
  readonly kind: MouseKind;
  /** 0 left, 1 middle, 2 right; wheel reports carry -1 up or 1 down instead. */
  readonly button: number;
  /** Zero-based screen column. */
  readonly column: number;
  /** Zero-based screen row. */
  readonly row: number;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
}

const SGR = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/;

/** Whether `sequence` is a mouse report rather than a keystroke. */
export function isMouseSequence(sequence: string): boolean {
  return SGR.test(sequence) || (sequence.length === 6 && sequence.startsWith("\x1b[M"));
}

/** Decode one mouse report, or undefined when the sequence is not one. */
export function parseMouseReport(sequence: string): MouseReport | undefined {
  const sgr = SGR.exec(sequence);
  if (sgr) {
    return decode(Number(sgr[1]), Number(sgr[2]) - 1, Number(sgr[3]) - 1, sgr[4] === "m");
  }
  if (sequence.length !== 6 || !sequence.startsWith("\x1b[M")) return undefined;
  // X10 biases every field by 32 so the payload stays printable.
  return decode(
    sequence.charCodeAt(3) - 32,
    sequence.charCodeAt(4) - 32 - 1,
    sequence.charCodeAt(5) - 32 - 1,
    false,
  );
}

function decode(flags: number, column: number, row: number, released: boolean): MouseReport {
  const shift = (flags & 4) !== 0;
  const alt = (flags & 8) !== 0;
  const ctrl = (flags & 16) !== 0;
  const moving = (flags & 32) !== 0;
  const wheeling = (flags & 64) !== 0;
  const button = flags & 3;
  const position = { column: Math.max(0, column), row: Math.max(0, row), shift, alt, ctrl };
  if (wheeling) return { kind: "wheel", button: button === 0 ? -1 : 1, ...position };
  if (moving && button === 3 && !released) return { kind: 'move', button, ...position };
  // X10 cannot report a release per button: it sets the button field to 3.
  if (released || button === 3) return { kind: "release", button, ...position };
  return { kind: moving ? "drag" : "press", button, ...position };
}
