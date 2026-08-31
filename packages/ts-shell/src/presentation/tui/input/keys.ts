/**
 * Keystroke Parser, Kitty Keyboard Protocol & Sequence Disambiguation
 * (Benchmarked against Pi Agent's `packages/tui/src/keys.ts`)
 *
 * Handles:
 * 1. Single-byte control codes (Ctrl+A..Z, Esc, Tab, Enter)
 * 2. ANSI CSI / SS3 escape sequences (Arrows, Home, End, F1..F12)
 * 3. Kitty Keyboard Protocol (CSI unicode ; modifier u)
 * 4. Alt/Meta key combinations
 */

export interface ParsedKeyEvent {
  readonly keyId: string;
  readonly name: string;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
  readonly raw: string;
}

export function parseKeyEvent(data: string): ParsedKeyEvent {
  if (!data || typeof data !== "string") {
    return { keyId: "", name: "", ctrl: false, shift: false, alt: false, meta: false, raw: "" };
  }

  // 1. Check Kitty Keyboard Protocol: \x1b[<codepoint>;<modifiers>u
  const kittyMatch = data.match(/^\x1b\[(\d+)(?:;(\d+))?u$/);
  if (kittyMatch) {
    const codepoint = parseInt(kittyMatch[1], 10);
    const modMask = kittyMatch[2] ? parseInt(kittyMatch[2], 10) - 1 : 0;
    const shift = Boolean(modMask & 1);
    const alt = Boolean(modMask & 2);
    const ctrl = Boolean(modMask & 4);
    const meta = Boolean(modMask & 8);

    const char = String.fromCodePoint(codepoint).toLowerCase();
    const keyId = formatKeyId(char, ctrl, alt, shift, meta);
    return { keyId, name: char, ctrl, shift, alt, meta, raw: data };
  }

  // 2. Check Alt + Character: \x1b<char>
  if (data.length === 2 && data[0] === "\x1b") {
    const char = data[1].toLowerCase();
    const keyId = `alt+${char}`;
    return { keyId, name: char, ctrl: false, shift: false, alt: true, meta: false, raw: data };
  }

  // 3. Check Standard ANSI CSI Sequences (Arrows, PageUp/Down)
  if (data === "\x1b[A" || data === "\x1bOA") {
    return { keyId: "up", name: "up", ctrl: false, shift: false, alt: false, meta: false, raw: data };
  }
  if (data === "\x1b[B" || data === "\x1bOB") {
    return { keyId: "down", name: "down", ctrl: false, shift: false, alt: false, meta: false, raw: data };
  }
  if (data === "\x1b[C" || data === "\x1bOC") {
    return { keyId: "right", name: "right", ctrl: false, shift: false, alt: false, meta: false, raw: data };
  }
  if (data === "\x1b[D" || data === "\x1bOD") {
    return { keyId: "left", name: "left", ctrl: false, shift: false, alt: false, meta: false, raw: data };
  }

  // 4. Check Single Byte Control Codes
  if (data === "\r" || data === "\n") {
    return { keyId: "enter", name: "enter", ctrl: false, shift: false, alt: false, meta: false, raw: data };
  }
  if (data === "\t") {
    return { keyId: "tab", name: "tab", ctrl: false, shift: false, alt: false, meta: false, raw: data };
  }
  if (data === "\x1b") {
    return { keyId: "escape", name: "escape", ctrl: false, shift: false, alt: false, meta: false, raw: data };
  }
  if (data === "\x7f" || data === "\b") {
    return { keyId: "backspace", name: "backspace", ctrl: false, shift: false, alt: false, meta: false, raw: data };
  }

  // Check Ctrl+A through Ctrl+Z (ASCII 1 to 26)
  const code = data.charCodeAt(0);
  if (data.length === 1 && code >= 1 && code <= 26) {
    const char = String.fromCharCode(code + 96);
    return { keyId: `ctrl+${char}`, name: char, ctrl: true, shift: false, alt: false, meta: false, raw: data };
  }

  // Plain printable characters
  const name = data.toLowerCase();
  return { keyId: name, name, ctrl: false, shift: false, alt: false, meta: false, raw: data };
}

function formatKeyId(char: string, ctrl: boolean, alt: boolean, shift: boolean, meta: boolean): string {
  const parts: string[] = [];
  if (ctrl) parts.push("ctrl");
  if (alt) parts.push("alt");
  if (shift) parts.push("shift");
  if (meta) parts.push("meta");
  parts.push(char);
  return parts.join("+");
}

export function matchesKey(data: string, expectedKeyId: string): boolean {
  const parsed = parseKeyEvent(data);
  return parsed.keyId === expectedKeyId.toLowerCase().trim();
}
