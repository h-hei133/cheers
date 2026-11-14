/**
 * Incremental, tolerant JSON parser for streamed payloads.
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonPath = readonly (string | number)[];
type JsonContainer = { [key: string]: JsonValue } | JsonValue[];

type Slot =
  | { readonly kind: "root" }
  | { readonly kind: "member"; readonly key: string }
  | { readonly kind: "element"; readonly index: number };

export type JsonChange =
  | { readonly kind: "set"; readonly path: JsonPath; readonly value: JsonValue }
  | { readonly kind: "append"; readonly path: JsonPath; readonly text: string };

type OpenChange =
  | { kind: "set"; readonly path: JsonPath; value: JsonValue }
  | { kind: "append"; readonly path: JsonPath; text: string };

interface Frame {
  readonly container: JsonContainer;
  readonly slot: Slot;
  readonly path: JsonPath | undefined;
  readonly reportsInside: boolean;
  size: number;
  key: string | undefined;
  phase: "key" | "colon" | "value" | "comma";
}

interface OpenString {
  readonly target: "key" | "value";
  readonly slot: Slot | undefined;
  text: string;
  escape: string;
  readonly path: JsonPath | undefined;
  change: OpenChange | undefined;
}

const MAX_REPORTED_DEPTH = 32;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ROOT_SLOT: Slot = { kind: "root" };
const CREDIT_PER_APPEND = 256;
const CREDIT_PER_CHARACTER = 8;
const MAX_PENDING_SCALAR_LENGTH = 64;
const NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const NUMBER_WITHOUT_EXP_RE = /^(-?(?:0|[1-9]\d*)(?:\.\d+)?)[eE][+-]?$/;
const LITERALS: readonly [string, JsonValue][] = [
  ["true", true],
  ["false", false],
  ["null", null],
];
const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};
const QUOTE = 0x22;
const BACKSLASH = 0x5c;

function scalarValue(token: string): JsonValue | undefined {
  for (const [word, value] of LITERALS) {
    if (token === word) return value;
  }
  if (NUMBER_RE.test(token)) {
    const num = Number(token);
    return Number.isFinite(num) ? num : undefined;
  }
  return undefined;
}

function pendingScalarValue(token: string): JsonValue | undefined {
  const complete = scalarValue(token);
  if (complete !== undefined) return complete;
  const match = NUMBER_WITHOUT_EXP_RE.exec(token);
  if (match) {
    const num = Number(match[1]);
    return Number.isFinite(num) ? num : undefined;
  }
  for (const [word, value] of LITERALS) {
    if (word.startsWith(token)) return value;
  }
  return undefined;
}

function setContainerSlot(container: JsonContainer, slot: Slot, value: JsonValue): void {
  if (slot.kind === "element") {
    (container as JsonValue[])[slot.index] = value;
  } else if (slot.kind === "member" && slot.key !== "__proto__") {
    (container as { [key: string]: JsonValue })[slot.key] = value;
  }
}

export class StreamingJsonParser {
  #root: JsonValue | undefined = undefined;
  #done = false;
  readonly #stack: Frame[] = [];
  #string: OpenString | undefined = undefined;
  #scalar = "";
  #scalarSlot: Slot | undefined = undefined;
  #pathCost = 0;
  #credit = 0;
  #dirty = false;
  #snapshot: JsonValue | undefined = undefined;
  #changes: OpenChange[] = [];

  append(text: string): readonly JsonChange[] {
    this.#credit += CREDIT_PER_APPEND + CREDIT_PER_CHARACTER * text.length;
    this.#changes = [];
    if (this.#string !== undefined) this.#string.change = undefined;
    let index = 0;
    while (index < text.length && !this.#done) {
      const open = this.#string;
      if (open !== undefined) index = this.#readString(open, text, index);
      else if (this.#scalar !== "") index = this.#readScalar(text, index);
      else this.#structural(text[index++]!);
    }
    return this.#changes;
  }

  snapshot(): JsonValue | undefined {
    if (!this.#dirty) return this.#snapshot;
    const slot = this.#scalarSlot;
    const token = this.#scalar;
    const pendingVal =
      slot !== undefined && token !== "" && token.length <= MAX_PENDING_SCALAR_LENGTH
        ? pendingScalarValue(token)
        : undefined;
    const pending = pendingVal !== undefined && slot !== undefined ? { slot, value: pendingVal } : undefined;
    const cost = this.#pathCost + (pending === undefined ? 0 : 1);
    if (cost > this.#credit) return this.#snapshot;
    this.#credit -= cost;
    this.#dirty = false;
    this.#snapshot = this.#copyOpenPath(pending);
    return this.#snapshot;
  }

  #readString(open: OpenString, text: string, start: number): number {
    let runStart = start;
    for (let index = start; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if (open.escape !== "") {
        if (this.#continueEscape(open, text[index]!)) {
          runStart = index + 1;
          continue;
        }
        runStart = index;
      }
      if (code === QUOTE) {
        if (index > runStart) this.#appendString(open, text.slice(runStart, index));
        this.#string = undefined;
        const frame = this.#stack.at(-1);
        if (open.target === "key") {
          if (frame !== undefined) {
            frame.key = open.text;
            frame.phase = "colon";
          }
        } else if (frame === undefined) {
          if (this.#root !== undefined) this.#done = true;
        } else {
          frame.phase = "comma";
        }
        return index + 1;
      }
      if (code === BACKSLASH) {
        if (index > runStart) this.#appendString(open, text.slice(runStart, index));
        open.escape = "\\";
        runStart = index + 1;
      }
    }
    if (text.length > runStart) this.#appendString(open, text.slice(runStart));
    return text.length;
  }

  #readScalar(text: string, start: number): number {
    let end = start;
    while (end < text.length) {
      const ch = text[end]!;
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "," || ch === "}" || ch === "]" || ch === ":" || ch === '"') {
        break;
      }
      end++;
    }
    if (end > start) {
      this.#scalar += text.slice(start, end);
      if (this.#scalarSlot !== undefined) this.#dirty = true;
    }
    if (end < text.length) {
      const token = this.#scalar;
      const slot = this.#scalarSlot;
      this.#scalar = "";
      this.#scalarSlot = undefined;
      const value = scalarValue(token);
      if (value !== undefined) {
        this.#place(slot, value);
        const path = this.#reportedPath(slot);
        if (path !== undefined) this.#changes.push({ kind: "set", path, value });
      }
      const frame = this.#stack.at(-1);
      if (frame === undefined) {
        if (this.#root !== undefined) this.#done = true;
      } else {
        frame.phase = "comma";
      }
    }
    return end;
  }

  #structural(char: string): void {
    switch (char) {
      case " ":
      case "\t":
      case "\n":
      case "\r":
        return;
      case '"':
        this.#startString();
        return;
      case "{":
      case "[":
        this.#openContainer(char === "{" ? {} : []);
        return;
      case "}":
      case "]":
        this.#closeContainer();
        return;
      case ":": {
        const frame = this.#stack.at(-1);
        if (frame !== undefined && !Array.isArray(frame.container) && frame.phase === "colon") frame.phase = "value";
        return;
      }
      case ",": {
        const frame = this.#stack.at(-1);
        if (frame !== undefined) frame.phase = Array.isArray(frame.container) ? "value" : "key";
        return;
      }
      default:
        this.#scalar = char;
        this.#scalarSlot = this.#valueSlot();
        if (this.#scalarSlot !== undefined) this.#dirty = true;
    }
  }

  #valueSlot(): Slot | undefined {
    const frame = this.#stack.at(-1);
    if (frame === undefined) return this.#root === undefined ? ROOT_SLOT : undefined;
    if (Array.isArray(frame.container)) return { kind: "element", index: frame.container.length };
    if ((frame.phase === "value" || frame.phase === "colon") && frame.key !== undefined) {
      return { kind: "member", key: frame.key };
    }
    return undefined;
  }

  #startString(): void {
    const frame = this.#stack.at(-1);
    if (frame !== undefined && !Array.isArray(frame.container) && (frame.phase === "key" || frame.phase === "comma")) {
      this.#string = { target: "key", slot: undefined, text: "", escape: "", path: undefined, change: undefined };
      return;
    }
    const slot = this.#valueSlot();
    const path = this.#reportedPath(slot);
    this.#string = { target: "value", slot, text: "", escape: "", path, change: undefined };
    this.#place(slot, "");
    if (path !== undefined) {
      const change: OpenChange = { kind: "set", path, value: "" };
      this.#changes.push(change);
      this.#string.change = change;
    }
  }

  #reportedPath(slot: Slot | undefined): JsonPath | undefined {
    if (slot === undefined) return undefined;
    if (slot.kind === "root") return [];
    if (slot.kind === "member" && UNSAFE_KEYS.has(slot.key)) return undefined;
    const frame = this.#stack.at(-1)!;
    if (!frame.reportsInside) return undefined;
    return [...frame.path!, slot.kind === "member" ? slot.key : slot.index];
  }

  #continueEscape(open: OpenString, char: string): boolean {
    if (open.escape === "\\") {
      const decoded = SIMPLE_ESCAPES[char];
      if (decoded !== undefined) {
        open.escape = "";
        this.#appendString(open, decoded);
        return true;
      }
      if (char === "u") {
        open.escape = "\\u";
        return true;
      }
      open.escape = "";
      this.#appendString(open, "\\");
      return false;
    }
    if ((char >= "0" && char <= "9") || (char >= "a" && char <= "f") || (char >= "A" && char <= "F")) {
      open.escape += char;
      if (open.escape.length < 6) return true;
      const decoded = String.fromCharCode(Number.parseInt(open.escape.slice(2), 16));
      open.escape = "";
      this.#appendString(open, decoded);
      return true;
    }
    const literal = open.escape;
    open.escape = "";
    this.#appendString(open, literal);
    return false;
  }

  #appendString(open: OpenString, text: string): void {
    open.text += text;
    if (open.target !== "value") return;
    this.#place(open.slot, open.text);
    if (open.path === undefined) return;
    const change = open.change;
    if (change !== undefined && this.#changes.at(-1) === change) {
      if (change.kind === "set") change.value = (change.value as string) + text;
      else change.text += text;
      return;
    }
    const next: OpenChange = { kind: "append", path: open.path, text };
    this.#changes.push(next);
    open.change = next;
  }

  #openContainer(container: JsonContainer): void {
    const slot = this.#valueSlot();
    if (slot === undefined) return;
    const path = this.#reportedPath(slot);
    this.#place(slot, container);
    this.#stack.push({
      container,
      slot,
      path,
      reportsInside: path !== undefined && path.length < MAX_REPORTED_DEPTH,
      size: 0,
      key: undefined,
      phase: Array.isArray(container) ? "value" : "key",
    });
    this.#pathCost += 1;
    this.#dirty = true;
    if (path !== undefined) this.#changes.push({ kind: "set", path, value: Array.isArray(container) ? [] : {} });
  }

  #closeContainer(): void {
    const frame = this.#stack.pop();
    if (frame === undefined) return;
    this.#pathCost -= frame.size + 1;
    this.#dirty = true;
    if (frame.path !== undefined && !frame.reportsInside) {
      this.#changes.push({ kind: "set", path: frame.path, value: frame.container });
    }
    const parent = this.#stack.at(-1);
    if (parent === undefined) {
      if (this.#root !== undefined) this.#done = true;
    } else {
      parent.phase = "comma";
    }
  }

  #place(slot: Slot | undefined, value: JsonValue): void {
    if (slot === undefined) return;
    this.#dirty = true;
    if (slot.kind === "root") {
      this.#root = value;
      return;
    }
    const frame = this.#stack.at(-1)!;
    if (slot.kind === "element") {
      const elements = frame.container as JsonValue[];
      if (slot.index === elements.length) {
        frame.size++;
        this.#pathCost++;
      }
      elements[slot.index] = value;
      return;
    }
    const members = frame.container as { [key: string]: JsonValue };
    if (UNSAFE_KEYS.has(slot.key)) return;
    if (!Object.hasOwn(members, slot.key)) {
      frame.size++;
      this.#pathCost++;
    }
    members[slot.key] = value;
  }

  #copyOpenPath(pending: { readonly slot: Slot; readonly value: JsonValue } | undefined): JsonValue | undefined {
    if (this.#stack.length === 0) return pending?.slot.kind === "root" ? pending.value : this.#root;
    let child: JsonValue | undefined;
    let childSlot: Slot | undefined;
    for (let depth = this.#stack.length - 1; depth >= 0; depth--) {
      const frame = this.#stack[depth]!;
      const copy: JsonContainer = Array.isArray(frame.container) ? frame.container.slice() : { ...frame.container };
      if (depth === this.#stack.length - 1 && pending !== undefined) setContainerSlot(copy, pending.slot, pending.value);
      if (child !== undefined && childSlot !== undefined) setContainerSlot(copy, childSlot, child);
      child = copy;
      childSlot = frame.slot;
    }
    return childSlot?.kind === "root" ? child : this.#root;
  }
}
