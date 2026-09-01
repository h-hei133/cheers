/**
 * Keystroke normalisation.
 *
 * A complete escape sequence goes in, one canonical key event comes out. The
 * point of the canonical form is that every consumer can compare against a
 * stable `keyId` such as `ctrl+a` or `shift+enter` without knowing whether the
 * terminal reported the key as a legacy CSI sequence, an SS3 sequence, or a
 * modern CSI-u report from the enhanced keyboard protocol.
 */

export interface ParsedKeyEvent {
  /** Canonical `[modifier+]*name`, lowercase. Empty when the input decoded to nothing. */
  readonly keyId: string;
  readonly name: string;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
  /** Text to insert when this event is a printable character, otherwise "". */
  readonly text: string;
  readonly raw: string;
}

interface Modifiers {
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}

const NO_MODIFIERS: Modifiers = { ctrl: false, shift: false, alt: false, meta: false };

/** CSI sequences whose final byte is `~`, keyed by the leading parameter. */
const TILDE_KEYS: Record<string, string> = {
  "1": "home",
  "2": "insert",
  "3": "delete",
  "4": "end",
  "5": "pageup",
  "6": "pagedown",
  "7": "home",
  "8": "end",
  "11": "f1",
  "12": "f2",
  "13": "f3",
  "14": "f4",
  "15": "f5",
  "17": "f6",
  "18": "f7",
  "19": "f8",
  "20": "f9",
  "21": "f10",
  "23": "f11",
  "24": "f12",
};

/** CSI and SS3 sequences identified by their final byte. */
const FINAL_KEYS: Record<string, string> = {
  A: "up",
  B: "down",
  C: "right",
  D: "left",
  E: "center",
  F: "end",
  H: "home",
  P: "f1",
  Q: "f2",
  R: "f3",
  S: "f4",
  Z: "tab",
};

/** CSI-u code points that name a key rather than a character. */
const CSI_U_KEYS: Record<number, string> = {
  8: "backspace",
  9: "tab",
  13: "enter",
  27: "escape",
  127: "backspace",
  57414: "enter",
  57417: "left",
  57418: "right",
  57419: "up",
  57420: "down",
};

function decodeModifiers(parameter: string | undefined): Modifiers {
  const mask = parameter === undefined || parameter === "" ? 0 : Number.parseInt(parameter, 10) - 1;
  if (!Number.isFinite(mask) || mask <= 0) return NO_MODIFIERS;
  return {
    shift: (mask & 1) !== 0,
    alt: (mask & 2) !== 0,
    ctrl: (mask & 4) !== 0,
    meta: (mask & 8) !== 0,
  };
}

function formatKeyId(name: string, modifiers: Modifiers): string {
  let id = "";
  if (modifiers.ctrl) id += "ctrl+";
  if (modifiers.alt) id += "alt+";
  if (modifiers.shift) id += "shift+";
  if (modifiers.meta) id += "meta+";
  return id + name;
}

function keyEvent(name: string, raw: string, modifiers: Modifiers = NO_MODIFIERS, text = ""): ParsedKeyEvent {
  return { keyId: formatKeyId(name, modifiers), name, ...modifiers, text, raw };
}

/** Canonical event for one complete keystroke sequence. */
export function parseKeyEvent(data: string): ParsedKeyEvent {
  if (!data) return keyEvent("", "");
  if (data.charCodeAt(0) === 0x1b) return parseEscapeSequence(data);
  if (data.length <= 2 && data.codePointAt(0)! < 0x20) return parseControl(data);
  if (data === "\x7f") return keyEvent("backspace", data);
  return keyEvent(data.toLowerCase(), data, NO_MODIFIERS, data);
}

function parseEscapeSequence(data: string): ParsedKeyEvent {
  if (data === "\x1b") return keyEvent("escape", data);
  const second = data.charCodeAt(1);
  if (second === 0x5b /* [ */) return parseCsi(data);
  if (second === 0x4f /* O */) {
    const name = FINAL_KEYS[data.slice(2)] ?? "";
    return name ? keyEvent(name, data) : keyEvent("", data);
  }
  // Legacy meta chord: ESC followed by the unmodified key.
  const inner = parseKeyEvent(data.slice(1));
  if (!inner.keyId) return keyEvent("", data);
  return {
    ...inner,
    alt: true,
    keyId: formatKeyId(inner.name, { ctrl: inner.ctrl, shift: inner.shift, alt: true, meta: inner.meta }),
    text: "",
    raw: data,
  };
}

function parseCsi(data: string): ParsedKeyEvent {
  const body = data.slice(2, -1);
  const final = data.slice(-1);
  if (final === "u") return parseCsiU(body, data);
  if (final === "M" || final === "m") return keyEvent("mouse", data);
  const parameters = body.split(";");
  if (final === "~") {
    const name = TILDE_KEYS[parameters[0] ?? ""];
    return name ? keyEvent(name, data, decodeModifiers(parameters[1])) : keyEvent("", data);
  }
  const name = FINAL_KEYS[final];
  if (!name) return keyEvent("", data);
  const modifiers = decodeModifiers(parameters[1]);
  if (final === "Z") return keyEvent("tab", data, { ...modifiers, shift: true });
  return keyEvent(name, data, modifiers);
}

/** CSI-u: `ESC [ code[:shifted[:base]] [; modifiers[:event]] u`. */
function parseCsiU(body: string, raw: string): ParsedKeyEvent {
  const [codeField, modifierField] = body.split(";");
  const code = Number.parseInt((codeField ?? "").split(":")[0] ?? "", 10);
  if (!Number.isFinite(code)) return keyEvent("", raw);
  const eventType = (modifierField ?? "").split(":")[1];
  if (eventType === "3") return keyEvent("", raw);
  const modifiers = decodeModifiers((modifierField ?? "").split(":")[0]);
  const named = CSI_U_KEYS[code];
  if (named) return keyEvent(named, raw, modifiers);
  if (code < 32) return keyEvent("", raw);
  const char = String.fromCodePoint(code);
  const printable = !modifiers.ctrl && !modifiers.alt && !modifiers.meta;
  return keyEvent(char.toLowerCase(), raw, modifiers, printable ? char : "");
}

function parseControl(data: string): ParsedKeyEvent {
  if (data === "\r" || data === "\n") return keyEvent("enter", data);
  if (data === "\t") return keyEvent("tab", data);
  if (data === "\x00") return keyEvent("space", data, { ...NO_MODIFIERS, ctrl: true });
  const code = data.charCodeAt(0);
  if (code >= 1 && code <= 26) {
    return keyEvent(String.fromCharCode(code + 96), data, { ...NO_MODIFIERS, ctrl: true });
  }
  return keyEvent("", data);
}

/** Whether `data` decodes to the given canonical key id. */
export function matchesKey(data: string, keyId: string): boolean {
  return parseKeyEvent(data).keyId === keyId.toLowerCase().trim();
}
