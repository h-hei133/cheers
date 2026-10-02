/** Read-only appearance queries; unsupported terminals can ignore them. */
export const QUERY_APPEARANCE = "\x1b[?2031h\x1b[?996n\x1b]11;?\x1b\\";
export const STOP_APPEARANCE = "\x1b[?2031l";

/** Interpret complete, non-paste reports supplied by the stdin reassembler. */
export class AppearanceReports {
  private schemeSeen = false;

  constructor(private readonly onAppearance?: (appearance: "dark" | "light") => void) {}

  /** Once committed to a report, its timeout must never turn the tail into keys. */
  holds(sequence: string): boolean {
    return sequence.length >= 3 && ["\x1b]11;", "\x1b[?997;"].some(
      (prefix) => prefix.startsWith(sequence) || sequence.startsWith(prefix),
    );
  }

  /** A fresh escape abandons an unfinished report; preserve an OSC's ST terminator. */
  restartAt(sequence: string): number {
    if (!this.holds(sequence)) return -1;
    const index = sequence.indexOf("\x1b", 1);
    if (index < 0 || index + 1 === sequence.length) return -1;
    return sequence[index + 1] === "\\" && sequence[1] === "]" ? -1 : index;
  }

  /** Keep framing, not an oversized payload. The invalid marker prevents applying it. */
  bound(sequence: string): string {
    const osc = sequence[1] === "]";
    // The resolver proved there was no end before its cap. Retain the last byte
    // at the cap in case it starts an ST split over the boundary.
    return (osc ? "\x1b]11;\0" : "\x1b[?997;0;") + sequence.slice((osc ? MAX_STRING_BYTES : MAX_CSI_BYTES) - 1);
  }

  consume(sequence: string): boolean {
    const scheme = /^\x1b\[\?997;(1|2)n$/.exec(sequence);
    if (scheme) {
      this.schemeSeen = true;
      this.onAppearance?.(scheme[1] === "2" ? "light" : "dark");
      return true;
    }
    // A malformed report's final byte may also name a key (for example A).
    // Once this prefix identifies a report, never dispatch it as navigation.
    if (sequence.startsWith("\x1b[?997")) return true;
    const background = /^\x1b\]11;([^\x07\x1b]*)(?:\x07|\x1b\\)$/.exec(sequence);
    if (!background) return false;
    const luminance = backgroundLuminance(background[1]!);
    if (!this.schemeSeen && luminance !== undefined) this.onAppearance?.(luminance > 0.5 ? "light" : "dark");
    return true;
  }
}

/** X11 channels have 1–4 hex digits; normalize each before comparing brightness. */
function backgroundLuminance(value: string): number | undefined {
  const rgb = /^rgb:([\da-f]{1,4})\/([\da-f]{1,4})\/([\da-f]{1,4})$/i.exec(value);
  const hex = /^#([\da-f]{6}|[\da-f]{12})$/i.exec(value);
  const channels = rgb?.slice(1) ?? (hex ? hex[1]!.match(hex[1]!.length === 6 ? /.{2}/g : /.{4}/g) : undefined);
  if (!channels) return undefined;
  const [r, g, b] = channels.map((channel) => Number.parseInt(channel, 16) / (16 ** channel.length - 1));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
import { MAX_CSI_BYTES, MAX_STRING_BYTES } from "./escape.js";
