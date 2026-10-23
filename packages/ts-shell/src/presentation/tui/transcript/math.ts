/**
 * Bounded LaTeX-to-text projection for terminal math.
 *
 * The raw source stays authoritative: this module only produces a readable
 * projection, and any formula that exceeds the budget or contains a command it
 * does not know is returned unchanged so the reader can still see and copy the
 * original. Code spans, escaped dollars and currency are protected before math
 * recognition, because `$5 and $10` is money, not a formula.
 */
import { findCodeSpan } from "../text/codeSpan.js";
import { padToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";

const MAX_FORMULA_BYTES = 4096;
const MAX_TOKENS = 512;
const MAX_DEPTH = 16;
const MAX_MATRIX_ROWS = 12;
const MAX_MATRIX_COLUMNS = 12;
const MAX_MATRIX_CELLS = 64;
const MAX_DISPLAY_ROWS = 24;
const MAX_DISPLAY_BYTES = 64 * 1024;

export const MATH_ENVIRONMENTS: ReadonlySet<string> = new Set([
  "matrix", "pmatrix", "bmatrix", "vmatrix", "Vmatrix",
  "equation", "equation*", "align", "align*", "gather", "gather*", "multline", "multline*", "cases",
]);

const SYMBOLS: Readonly<Record<string, string>> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ", eta: "η", theta: "θ",
  iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", omicron: "ο", pi: "π", rho: "ρ",
  sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  times: "×", cdot: "·", pm: "±", mp: "∓", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠",
  approx: "≈", equiv: "≡", infty: "∞", sum: "∑", prod: "∏", int: "∫", partial: "∂", nabla: "∇",
  to: "→", rightarrow: "→", leftarrow: "←", in: "∈", notin: "∉", subset: "⊂", supset: "⊃",
  cup: "∪", cap: "∩", forall: "∀", exists: "∃", neg: "¬", land: "∧", lor: "∨", emptyset: "∅",
};

const SUPERSCRIPTS: Readonly<Record<string, string>> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ",
};
const SUBSCRIPTS: Readonly<Record<string, string>> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", i: "ᵢ", j: "ⱼ", k: "ₖ", n: "ₙ", o: "ₒ", p: "ₚ", u: "ᵤ", x: "ₓ",
};

interface Cursor { index: number; tokens: number }

export interface MathToken {
  readonly end: number;
  readonly text: string;
}

/**
 * Return a stateful finder for math openers in one source string.
 *
 * The cached close positions keep repeated unmatched openers linear instead of
 * rescanning the remaining text at every character.
 */
export function createMathFinder(text: string): (start: number) => MathToken | undefined {
  let nextParenClose = text.indexOf("\\)");
  let nextBracketClose = text.indexOf("\\]");
  const nextClose = (marker: string, current: number, from: number): number => {
    while (current >= 0 && current < from) current = text.indexOf(marker, current + 2);
    return current;
  };
  return (start: number): MathToken | undefined => {
    if (text[start] === "\\" && (text[start + 1] === "(" || text[start + 1] === "[")) {
      if (isEscaped(text, start)) return undefined;
      const parenthesized = text[start + 1] === "(";
      const closeMarker = parenthesized ? "\\)" : "\\]";
      const searchFrom = start + 2;
      let close = nextClose(closeMarker, parenthesized ? nextParenClose : nextBracketClose, searchFrom);
      if (parenthesized) nextParenClose = close;
      else nextBracketClose = close;
      if (close < 0) return undefined;
      const raw = text.slice(start, close + 2);
      if (close - searchFrom > MAX_FORMULA_BYTES) return { end: close + 2, text: raw };
      const converted = parenthesized
        ? latexToText(text.slice(searchFrom, close))
        : latexToDisplayText(text.slice(searchFrom, close));
      const end = close + 2;
      const next = text.indexOf(closeMarker, end);
      if (parenthesized) nextParenClose = next;
      else nextBracketClose = next;
      return { end, text: converted ?? raw };
    }
    if (text[start] !== "$" || isEscaped(text, start)) return undefined;
    const display = text[start + 1] === "$";
    const open = start + (display ? 2 : 1);
    if (!display && /[0-9]/.test(text[open] ?? "")) {
      const close = text.indexOf("$", open);
      if (close < 0 || close === open || text[close - 1] === " ") return undefined;
    }
    const close = findClose(text, open, display);
    if (close < 0) return undefined;
    const raw = text.slice(start, close + (display ? 2 : 1));
    if (close - open > MAX_FORMULA_BYTES) return { end: close + (display ? 2 : 1), text: raw };
    const converted = display
      ? latexToDisplayText(text.slice(open, close))
      : latexToInlineText(text.slice(open, close));
    return { end: close + (display ? 2 : 1), text: converted ?? raw };
  };
}

/** Convert one formula body, or return undefined when it is over budget. */
export function latexToText(body: string): string | undefined {
  if (Buffer.byteLength(body, "utf8") > MAX_FORMULA_BYTES) return undefined;
  const cursor: Cursor = { index: 0, tokens: 0 };
  const text = readGroup(body, cursor, 0, false);
  if (text === undefined) return undefined;
  return text.replace(/\s+/g, " ").trim();
}

function readGroup(source: string, cursor: Cursor, depth: number, closingRequired: boolean): string | undefined {
  if (depth > MAX_DEPTH) return undefined;
  let output = "";
  while (cursor.index < source.length) {
    if (++cursor.tokens > MAX_TOKENS) return undefined;
    const character = source[cursor.index]!;
    if (character === "}") {
      if (!closingRequired) return undefined;
      cursor.index += 1;
      return output;
    }
    if (character === "{") {
      cursor.index += 1;
      const inner = readGroup(source, cursor, depth + 1, true);
      if (inner === undefined) return undefined;
      output += inner;
      continue;
    }
    if (character === "\\") { const command = readCommand(source, cursor); if (command === undefined) return undefined; output += command; continue; }
    if (character === "^" || character === "_") {
      cursor.index += 1;
      const argument = readArgument(source, cursor, depth + 1);
      if (argument === undefined) return undefined;
      output += character === "^" ? superscript(argument) : subscript(argument);
      continue;
    }
    output += character;
    cursor.index += 1;
  }
  return closingRequired ? undefined : output;
}

function readCommand(source: string, cursor: Cursor): string | undefined {
  cursor.index += 1;
  const match = /^[A-Za-z]+/.exec(source.slice(cursor.index));
  if (!match) { const escaped = source[cursor.index] ?? ""; cursor.index += 1; return escaped; }
  const name = match[0];
  cursor.index += name.length;
  if (name === "frac") {
    const numerator = readArgument(source, cursor, 1); const denominator = readArgument(source, cursor, 1);
    return numerator === undefined || denominator === undefined ? undefined : `(${numerator})/(${denominator})`;
  }
  if (name === "sqrt") {
    const argument = readArgument(source, cursor, 1);
    return argument === undefined ? undefined : `√(${argument})`;
  }
  if (name === "text" || name === "mathrm" || name === "mathbf" || name === "operatorname") return readArgument(source, cursor, 1);
  const symbol = SYMBOLS[name];
  if (symbol) return symbol;
  // Unknown commands make the whole formula fall back to its original source.
  // A partial projection would silently mix converted and unparsed meaning.
  return undefined;
}

/** Read `{...}` or a single token after a command. */
function readArgument(source: string, cursor: Cursor, depth: number): string | undefined {
  if (depth > MAX_DEPTH) return undefined;
  while (source[cursor.index] === " ") cursor.index += 1;
  if (source[cursor.index] === "{") {
    cursor.index += 1;
    return readGroup(source, cursor, depth + 1, true);
  }
  const character = source[cursor.index];
  if (character === undefined) return undefined;
  cursor.index += 1;
  return character;
}

function superscript(text: string): string {
  return [...text].every(character => SUPERSCRIPTS[character] !== undefined)
    ? [...text].map(character => SUPERSCRIPTS[character]!).join("")
    : `^(${text})`;
}

function subscript(text: string): string {
  return [...text].every(character => SUBSCRIPTS[character] !== undefined)
    ? [...text].map(character => SUBSCRIPTS[character]!).join("")
    : `_(${text})`;
}

/** Preserve display-math structure when a whitelisted environment fits. */
export function latexToDisplayText(body: string): string | undefined {
  if (Buffer.byteLength(body, "utf8") > MAX_FORMULA_BYTES) return undefined;
  const matrix = /^\s*\\begin\{(matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\}([\s\S]*?)\\end\{\1\}\s*$/.exec(body);
  if (matrix) {
    if (matrix[2]!.includes("\\begin{")) return undefined;
    return projectMatrix(matrix[1]!, matrix[2]!);
  }
  const environment = /^\s*\\begin\{([A-Za-z]+\*?)\}([\s\S]*?)\\end\{\1\}\s*$/.exec(body);
  if (environment && MATH_ENVIRONMENTS.has(environment[1]!)) {
    if (environment[2]!.includes("\\begin{")) return undefined;
    const projected = projectEnvironment(environment[1]!, environment[2]!);
    return projected !== undefined && displayWithinBudget(projected) ? projected : undefined;
  }
  const projected = latexToText(body);
  return projected !== undefined && displayWithinBudget(projected) ? projected : undefined;
}

function projectMatrix(name: string, body: string): string | undefined {
  const rows = body.split(/\\\\/).map(row => row.trim()).filter(Boolean);
  if (rows.length === 0 || rows.length > MAX_MATRIX_ROWS) return undefined;
  const cells = rows.map(row => row.split("&").map(cell => latexToText(cell)?.trim()));
  const columns = Math.max(...cells.map(row => row.length));
  if (columns === 0 || columns > MAX_MATRIX_COLUMNS || cells.reduce((total, row) => total + row.length, 0) > MAX_MATRIX_CELLS
    || cells.some(row => row.some(cell => cell === undefined))) return undefined;
  const widths = Array.from({ length: columns }, (_, column) =>
    Math.max(...cells.map(row => visibleWidth(row[column] ?? ""))));
  const [left, right] = name === "pmatrix" ? ["(", ")"]
    : name === "bmatrix" ? ["[", "]"]
      : name === "vmatrix" ? ["|", "|"]
        : name === "Vmatrix" ? ["‖", "‖"] : ["", ""];
  const projected = cells.map(row => {
    const line = Array.from({ length: columns }, (_, column) => padToWidth(row[column] ?? "", widths[column]!)).join("  ");
    return left ? `${left} ${line.trimEnd()} ${right}` : line.trimEnd();
  }).join("\n");
  return displayWithinBudget(projected) ? projected : undefined;
}

function projectEnvironment(name: string, body: string): string | undefined {
  const rows = body.split(/\\\\/).map(row => row.trim()).filter(Boolean);
  if (rows.length === 0 || rows.length > MAX_DISPLAY_ROWS) return undefined;
  const lines = rows.map(row => {
    const cells = row.split("&").map(cell => latexToText(cell.trim()));
    if (cells.some(cell => cell === undefined)) return undefined;
    return name === "cases" ? cells.join(" | ") : cells.filter(Boolean).join(" ");
  });
  return lines.some(line => line === undefined) ? undefined : lines.join("\n");
}

function displayWithinBudget(text: string): boolean {
  return text.split("\n").length <= MAX_DISPLAY_ROWS && Buffer.byteLength(text, "utf8") <= MAX_DISPLAY_BYTES;
}

/** Inline math must remain one physical row, so matrix rows are joined explicitly. */
export function latexToInlineText(body: string): string | undefined {
  const projected = latexToDisplayText(body);
  return projected?.includes("\n") ? projected.split("\n").join(" | ") : projected;
}

/**
 * Replace inline and display math in `text`, leaving code spans, escaped dollars
 * and currency untouched. Matrices retain their rows instead of becoming one
 * linear expression; formulas outside the bounded layout remain raw.
 */
export function projectMath(text: string): string {
  const findMath = createMathFinder(text);
  let output = "";
  let index = 0;
  while (index < text.length) {
    const character = text[index]!;
    if (character === "`") {
      const span = findCodeSpan(text, index);
      if (!span) {
        const run = backtickRun(text, index);
        output += text.slice(index, index + run);
        index += run;
        continue;
      }
      output += text.slice(index, span.end);
      index = span.end;
      continue;
    }
    if (character === "\\" && text[index + 1] === "$") { output += "\\$"; index += 2; continue; }
    if (character !== "$" && character !== "\\") { output += character; index += 1; continue; }
    const math = findMath(index);
    if (math) {
      output += math.text;
      index = math.end;
      continue;
    }
    output += character;
    index += 1;
  }
  return output;
}

function findClose(text: string, from: number, display: boolean): number {
  const marker = display ? "$$" : "$";
  for (let index = from; index < text.length; index++) {
    if (text[index] === "\\") { index += 1; continue; }
    if (text[index] === "`") {
      const span = findCodeSpan(text, index);
      if (span) index = span.end - 1;
      else index += backtickRun(text, index) - 1;
      continue;
    }
    if (text.startsWith(marker, index)) return index;
  }
  return -1;
}

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor--) slashes++;
  return slashes % 2 === 1;
}

function backtickRun(text: string, start: number): number {
  let run = 1;
  while (text[start + run] === "`") run++;
  return run;
}
