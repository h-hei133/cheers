/**
 * OSC 10 / 11 / 4 terminal color query, parsing, and DA1-fenced collection.
 *
 * Queries the terminal's foreground (OSC 10), background (OSC 11), and 16 ANSI
 * palette entries (OSC 4;0..15) followed by a primary device attributes (DA1)
 * sentinel (`\x1b[c`). Because every terminal answers DA1, its arrival signals
 * that any terminal-supported color replies have already been delivered.
 */

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface TerminalColors {
  readonly foreground?: RgbColor;
  readonly background?: RgbColor;
  readonly palette?: readonly RgbColor[];
}

export type OscColorTarget =
  | { readonly kind: "foreground"; readonly color: RgbColor }
  | { readonly kind: "background"; readonly color: RgbColor }
  | { readonly kind: "palette"; readonly index: number; readonly color: RgbColor };

const PALETTE_COUNT = 16;
const COLOR_QUERY_PARTS = [
  "\x1b]10;?\x1b\\",
  "\x1b]11;?\x1b\\",
  ...Array.from({ length: PALETTE_COUNT }, (_, i) => `\x1b]4;${i};?\x1b\\`),
];

/** Query batch for OSC 10/11/4;0..15 plus a trailing DA1 sentinel. */
export const TERMINAL_COLOR_QUERY = `${COLOR_QUERY_PARTS.join("")}\x1b[c`;

const OSC_COLOR_REPORT = /^\x1b\](10|11|4);(?:(\d+);)?([^\x07\x1b]*)(?:\x07|\x1b\\)$/;
const DA1_REPLY = /^\x1b\[\?[\d;]*c$/;

function parseOscHexChannel(channel: string): number | undefined {
  if (!/^[0-9a-f]+$/i.test(channel)) return undefined;
  const max = 16 ** channel.length - 1;
  if (max <= 0) return undefined;
  return Math.round((Number.parseInt(channel, 16) / max) * 255);
}

export function parseOscColorValue(value: string): RgbColor | undefined {
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      const r = parseOscHexChannel(hex.slice(0, 2));
      const g = parseOscHexChannel(hex.slice(2, 4));
      const b = parseOscHexChannel(hex.slice(4, 6));
      return r !== undefined && g !== undefined && b !== undefined ? { r, g, b } : undefined;
    }
    if (/^[0-9a-f]{12}$/i.test(hex)) {
      const r = parseOscHexChannel(hex.slice(0, 4));
      const g = parseOscHexChannel(hex.slice(4, 8));
      const b = parseOscHexChannel(hex.slice(8, 12));
      return r !== undefined && g !== undefined && b !== undefined ? { r, g, b } : undefined;
    }
    return undefined;
  }
  if (!/^rgba?:/i.test(trimmed)) return undefined;
  const normalized = trimmed.replace(/^rgba?:/i, "");
  const [red, green, blue] = normalized.split("/");
  if (red === undefined || green === undefined || blue === undefined) return undefined;
  const r = parseOscHexChannel(red);
  const g = parseOscHexChannel(green);
  const b = parseOscHexChannel(blue);
  return r !== undefined && g !== undefined && b !== undefined ? { r, g, b } : undefined;
}

/** Parse a complete OSC 10, OSC 11, or OSC 4 color reply sequence. */
export function parseOscColorResponse(sequence: string): OscColorTarget | undefined {
  const match = OSC_COLOR_REPORT.exec(sequence);
  if (!match) return undefined;
  const code = match[1];
  const indexRaw = match[2];
  const value = match[3] ?? "";
  const color = parseOscColorValue(value);
  if (!color) return undefined;
  if (code === "10" && indexRaw === undefined) return { kind: "foreground", color };
  if (code === "11" && indexRaw === undefined) return { kind: "background", color };
  if (code === "4" && indexRaw !== undefined) {
    const index = Number.parseInt(indexRaw, 10);
    if (index >= 0 && index < PALETTE_COUNT) return { kind: "palette", index, color };
  }
  return undefined;
}

/** Whether `sequence` starts with an OSC 10, 11, or 4 color reply header. */
export function isColorReplyPrefix(sequence: string): boolean {
  if (sequence.length < 3) return false;
  if (["\x1b]10;", "\x1b]11;", "\x1b]4;"].some((prefix) => prefix.startsWith(sequence) || sequence.startsWith(prefix))) {
    return true;
  }
  return false;
}

export interface ColorQueryOptions {
  readonly timeoutMs?: number;
  readonly onLateReply?: (colors: TerminalColors) => void;
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
  private timer: unknown;
  private readonly onLateReply?: (colors: TerminalColors) => void;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly resolveFn: (colors: TerminalColors) => void;

  constructor(resolveFn: (colors: TerminalColors) => void, options: ColorQueryOptions = {}) {
    this.resolveFn = resolveFn;
    this.onLateReply = options.onLateReply;
    const setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    const timeoutMs = options.timeoutMs ?? 500;
    this.timer = setTimer(() => this.finish(), timeoutMs);
  }

  consume(sequence: string): boolean {
    if (DA1_REPLY.test(sequence)) {
      const wasPending = !this.settled;
      this.finish();
      return wasPending;
    }
    const parsed = parseOscColorResponse(sequence);
    if (!parsed) return false;
    if (parsed.kind === "foreground") {
      this.foreground = parsed.color;
    } else if (parsed.kind === "background") {
      this.background = parsed.color;
    } else if (this.palette[parsed.index] === undefined) {
      this.palette[parsed.index] = parsed.color;
      this.paletteSeen += 1;
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
    this.finish();
  }

  snapshot(): TerminalColors {
    const hasFullPalette = this.paletteSeen >= PALETTE_COUNT && this.palette.every((c) => c !== undefined);
    return {
      ...(this.foreground ? { foreground: this.foreground } : {}),
      ...(this.background ? { background: this.background } : {}),
      ...(hasFullPalette ? { palette: this.palette as RgbColor[] } : {}),
    };
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

const PROTOCOL_REPLY_TOKEN = /\x1b\](?:10|11|4);[^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\]7501;\?(?::[^\x07\x1b]*)?(?:\x07|\x1b\\)|\x1b\[\?[\d;]*c/g;
const HELD_PROTOCOL_PREFIXES = ["\x1b]10;", "\x1b]11;", "\x1b]4;", "\x1b]7501;", "\x1b[?"];
const MAX_PROTOCOL_HOLD = 512;

function trailingProtocolHoldIndex(text: string): number {
  const lastEsc = text.lastIndexOf("\x1b");
  if (lastEsc < 0) return -1;
  const tail = text.slice(lastEsc);
  if (tail.length > MAX_PROTOCOL_HOLD) return -1;
  if (tail === "\x1b" || tail === "\x1b]" || tail === "\x1b[") return lastEsc;
  if (HELD_PROTOCOL_PREFIXES.some((prefix) => prefix.startsWith(tail) || tail.startsWith(prefix))) {
    if (!/\x07|\x1b\\|c$/.test(tail) || tail.endsWith("\x1b")) return lastEsc;
  }
  return -1;
}

/** Stateful chunk filter that extracts OSC 10/11/4, DA1, and OSC 7501 replies even across split chunks. */
export class TerminalProtocolReader {
  private held = "";

  process(
    chunk: string,
    colorQuery: PendingColorQuery | undefined,
    onProgramStatusReply?: () => void,
  ): string {
    if (!colorQuery && !onProgramStatusReply) {
      const prefix = this.held;
      this.held = "";
      return prefix + chunk;
    }
    let combined = this.held + chunk;
    this.held = "";
    const holdAt = trailingProtocolHoldIndex(combined);
    if (holdAt >= 0) {
      this.held = combined.slice(holdAt);
      combined = combined.slice(0, holdAt);
    }
    return combined.replace(PROTOCOL_REPLY_TOKEN, (seq) => {
      if (onProgramStatusReply && seq.startsWith("\x1b]7501;")) {
        onProgramStatusReply();
        return "";
      }
      if (colorQuery) {
        const wasSettled = colorQuery.isSettled;
        if (colorQuery.consume(seq)) {
          // Once the startup query settles, keep forwarding OSC 11 so DEC 2031 live theme reports reach StdinBuffer.
          if (wasSettled && seq.startsWith("\x1b]11;")) return seq;
          return "";
        }
      }
      return seq;
    });
  }

  flush(): string {
    const held = this.held;
    this.held = "";
    return held;
  }
}
