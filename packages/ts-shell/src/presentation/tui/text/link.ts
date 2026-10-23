import { ESC, ansiSequenceEnd } from "./ansi.js";

const HYPERLINK_OPEN = "\x1b]8;;";
const HYPERLINK_CLOSE = "\x1b]8;;\x07";
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/** A link target with terminal control bytes removed, for visible fallback text. */
export function displayLinkUrl(value: string): string {
  return value.trim().replace(CONTROL, "");
}

/** A URL safe for terminal or HTML link output, or nothing for a refused scheme. */
export function safeLinkUrl(value: string): string | undefined {
  const trimmed = displayLinkUrl(value);
  if (trimmed === "") return undefined;
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(trimmed);
  if (!scheme) return trimmed;
  return /^(https?|mailto)$/i.test(scheme[1]!) ? trimmed : undefined;
}

/** Wrap visible terminal text in OSC8, unless the URL policy refuses its target. */
export function terminalHyperlink(label: string, href: string): string {
  const url = safeLinkUrl(href);
  return url === undefined ? label : `${HYPERLINK_OPEN}${url}\x07${label}${HYPERLINK_CLOSE}`;
}

/** Close a hyperlink left open by slicing or truncating a rendered row. */
export function closeTerminalHyperlink(text: string): string {
  let open = false;
  let index = 0;
  while (index < text.length) {
    const start = text.indexOf(ESC, index);
    if (start < 0) break;
    const end = ansiSequenceEnd(text, start);
    const sequence = text.slice(start, end);
    if (sequence.startsWith(HYPERLINK_OPEN)) {
      const terminator = sequence.endsWith("\x1b\\") ? 2 : sequence.endsWith("\x07") ? 1 : 0;
      const payload = sequence.slice(HYPERLINK_OPEN.length, sequence.length - terminator);
      open = payload !== "";
    }
    index = end;
  }
  return open ? text + HYPERLINK_CLOSE : text;
}
