/**
 * OSC 10 / 11 / 4 terminal color query, parsing, and DA1-fenced collection.
 *
 * Queries the terminal's foreground (OSC 10), background (OSC 11), and 16 ANSI
 * palette entries (OSC 4;0..15) followed by a primary device attributes (DA1)
 * sentinel (`\x1b[c`). Because every terminal answers DA1, its arrival signals
 * that any terminal-supported color replies have already been delivered.
 */

import { parseOscColorResponse, type OscColorTarget, type RgbColor, type TerminalColors } from './color.js';
import { StdinBuffer } from './stdinBuffer.js';
import { isProgramStatusReply } from './programStatus.js';
export { parseOscColorResponse, parseOscColorValue, isColorReplyPrefix, type RgbColor, type TerminalColors, type OscColorTarget } from './color.js';

const PALETTE_COUNT = 16;
const COLOR_QUERY_PARTS = [
  "\x1b]10;?\x1b\\",
  "\x1b]11;?\x1b\\",
  ...Array.from({ length: PALETTE_COUNT }, (_, i) => `\x1b]4;${i};?\x1b\\`),
];

/** Query batch for OSC 10/11/4;0..15 plus a trailing DA1 sentinel. */
export const TERMINAL_COLOR_QUERY = `${COLOR_QUERY_PARTS.join("")}\x1b[c`;

const DA1_REPLY = /^\x1b\[\?[\d;]*c$/;

export interface ColorQueryOptions {
  readonly timeoutMs?: number;
  readonly onLateReply?: (colors: TerminalColors) => void;
  readonly onCancel?: () => void;
  readonly setTimer?: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

/** Collects an OSC 10/11/4 query until all 18 replies arrive, DA1 arrives, or timeout expires. */
export class PendingColorQuery {
  private foreground: RgbColor | undefined;
  private background: RgbColor | undefined;
  private readonly palette = new Array<RgbColor | undefined>(PALETTE_COUNT);
  private paletteSeen = 0;
  private settled = false;
  private cancelled = false;
  private timer: unknown;
  private readonly onLateReply?: (colors: TerminalColors) => void;
  private readonly onCancel?: () => void;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly resolveFn: (colors: TerminalColors) => void;

  constructor(resolveFn: (colors: TerminalColors) => void, options: ColorQueryOptions = {}) {
    this.resolveFn = resolveFn;
    this.onLateReply = options.onLateReply;
    this.onCancel = options.onCancel;
    const setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    const timeoutMs = options.timeoutMs ?? 500;
    this.timer = setTimer(() => this.finish(), timeoutMs);
  }

  consume(sequence: string): boolean {
    if (this.cancelled) return false;
    if (DA1_REPLY.test(sequence)) {
      const wasPending = !this.settled;
      this.finish();
      return wasPending;
    }
    const parsed = parseOscColorResponse(sequence);
    if (!parsed) return false;
    return this.consumeColor(parsed);
  }

  consumeColor(parsed: OscColorTarget): boolean {
    if (this.cancelled) return false;
    if (parsed.kind === "foreground") {
      this.foreground = parsed.color;
    } else if (parsed.kind === "background") {
      this.background = parsed.color;
    } else {
      if (this.palette[parsed.index] === undefined) this.paletteSeen += 1;
      this.palette[parsed.index] = parsed.color;
    }
    if (this.settled) {
      this.onLateReply?.(this.snapshot());
      return true;
    }
    if (this.foreground && this.background && this.paletteSeen >= PALETTE_COUNT) {
      this.finish();
    }
    return true;
  }

  get isSettled(): boolean {
    return this.settled;
  }

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    try { this.onCancel?.(); } catch { /* Optional observers cannot prevent cancellation. */ }
    this.finish();
  }

  snapshot(): TerminalColors {
    return Object.freeze({
      ...(this.foreground ? { foreground: Object.freeze({ ...this.foreground }) } : {}),
      ...(this.background ? { background: Object.freeze({ ...this.background }) } : {}),
      ...(this.paletteSeen ? { palette: Object.freeze(this.palette.map(color => color && Object.freeze({ ...color }))) } : {}),
    });
  }

  private finish(): void {
    if (this.settled) return;
    this.settled = true;
    if (this.timer !== undefined) {
      this.clearTimer(this.timer);
      this.timer = undefined;
    }
    this.resolveFn(this.snapshot());
  }
}

/** Observe only complete non-paste reports framed by the ordinary input owner. */
export function consumeTerminalReply(sequence: string, colorQuery: PendingColorQuery | undefined,
  onProgramStatusReply?: () => void): boolean {
  if (onProgramStatusReply && isProgramStatusReply(sequence)) { onProgramStatusReply(); return true; }
  if (!colorQuery?.consume(sequence)) return false;
  // AppearanceReports owns OSC11 luminance and DEC997 precedence at every stage.
  return !sequence.startsWith('\x1b]11;');
}

/** Standalone devices reuse StdinBuffer framing rather than pre-scanning pasted text. */
export class TerminalProtocolReader {
  private output = '';
  private processing = false;
  private colorQuery?: PendingColorQuery;
  private onProgramStatusReply?: () => void;
  private readonly input = new StdinBuffer({ framingOnly: true, maxPasteBytes: 0,
    onPartialHold: prefix => this.holdSequence?.(prefix) === true, onSequence: (sequence, pasted) => {
    if (pasted || !(this.consumeSequence?.(sequence) || consumeTerminalReply(sequence, this.colorQuery, this.onProgramStatusReply))) {
      if (this.processing) this.output += sequence;
      else this.onForward?.(sequence);
    }
  } });

  constructor(private readonly onForward?: (data: string) => void,
    private readonly consumeSequence?: (sequence: string) => boolean,
    private readonly holdSequence?: (prefix: string) => boolean) {}

  process(chunk: string, colorQuery: PendingColorQuery | undefined, onProgramStatusReply?: () => void): string {
    this.colorQuery = colorQuery; this.onProgramStatusReply = onProgramStatusReply;
    this.processing = true;
    try { this.input.feed(chunk); } finally { this.processing = false; }
    const result = this.output; this.output = ''; return result;
  }

  flush(): string {
    this.processing = true;
    try { this.input.flush(); } finally { this.processing = false; }
    const result = this.output; this.output = ''; return result;
  }

  flushPartial(matches: (prefix: string) => boolean, discard = false): string {
    this.processing = true;
    try { this.input.flushPartial(matches, discard); } finally { this.processing = false; }
    const result = this.output; this.output = ''; return result;
  }

  dispose(): void { this.input.dispose(); this.output = ''; }
}
