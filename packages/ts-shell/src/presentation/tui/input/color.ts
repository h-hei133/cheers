export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface TerminalColors {
  readonly foreground?: RgbColor;
  readonly background?: RgbColor;
  readonly palette?: readonly (RgbColor | undefined)[];
}

export type OscColorTarget =
  | { readonly kind: "foreground"; readonly color: RgbColor }
  | { readonly kind: "background"; readonly color: RgbColor }
  | { readonly kind: "palette"; readonly index: number; readonly color: RgbColor };

const PALETTE_COUNT = 16;

const OSC_COLOR_REPORT = /^\x1b\](10|11|4);(?:(\d+);)?([^\x07\x1b]*)(?:\x07|\x1b\\)$/;

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
