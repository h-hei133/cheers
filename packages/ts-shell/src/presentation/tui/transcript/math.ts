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

const MAX_FORMULA_BYTES = 4096;
const MAX_TOKENS = 512;
const MAX_DEPTH = 16;

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

/** Convert one formula body, or return undefined when it is over budget. */
export function latexToText(body: string): string | undefined {
  if (Buffer.byteLength(body, "utf8") > MAX_FORMULA_BYTES) return undefined;
  const cursor: Cursor = { index: 0, tokens: 0 };
  const text = readGroup(body, cursor, 0);
  if (text === undefined) return undefined;
  return text.replace(/\s+/g, " ").trim();
}

function readGroup(source: string, cursor: Cursor, depth: number): string | undefined {
  if (depth > MAX_DEPTH) return undefined;
  let output = "";
  while (cursor.index < source.length) {
    if (++cursor.tokens > MAX_TOKENS) return undefined;
    const character = source[cursor.index]!;
    if (character === "}") return output;
    if (character === "{") { cursor.index += 1; const inner = readGroup(source, cursor, depth + 1); if (inner === undefined) return undefined; if (source[cursor.index] === "}") cursor.index += 1; output += inner; continue; }
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
  return output;
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
  // Unknown commands keep their spelling and argument; silently dropping either
  // loses meaning the reader may need to copy.
  if (source[cursor.index] === "{") {
    let depth = 0;
    for (let index = cursor.index; index < source.length; index++) {
      if (source[index] === "{") depth += 1;
      else if (source[index] === "}") { depth -= 1; if (depth === 0) { const raw = source.slice(cursor.index, index + 1); cursor.index = index + 1; return `\\${name}${raw}`; } }
    }
  }
  return `\\${name}`;
}

/** Read `{...}` or a single token after a command. */
function readArgument(source: string, cursor: Cursor, depth: number): string | undefined {
  if (depth > MAX_DEPTH) return undefined;
  while (source[cursor.index] === " ") cursor.index += 1;
  if (source[cursor.index] === "{") {
    cursor.index += 1;
    const inner = readGroup(source, cursor, depth + 1);
    if (inner === undefined) return undefined;
    if (source[cursor.index] === "}") cursor.index += 1;
    return inner;
  }
  const character = source[cursor.index];
  if (character === undefined) return "";
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

/**
 * Replace inline and single-line display math in `text`, leaving code spans,
 * escaped dollars and currency untouched.
 */
export function projectMath(text: string): string {
  let output = "";
  let index = 0;
  let nextParenClose = text.indexOf("\\)");
  let nextBracketClose = text.indexOf("\\]");
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
    if (character === "\\" && (text[index + 1] === "(" || text[index + 1] === "[")) {
      const parenthesized = text[index + 1] === "(";
      const closeMarker = parenthesized ? "\\)" : "\\]";
      const searchFrom = index + 2;
      let close = parenthesized ? nextParenClose : nextBracketClose;
      while (close >= 0 && close < searchFrom) {
        close = text.indexOf(closeMarker, close + 2);
        if (parenthesized) nextParenClose = close;
        else nextBracketClose = close;
      }
      if (close >= 0 && close - searchFrom <= MAX_FORMULA_BYTES) {
        const converted = latexToText(text.slice(index + 2, close));
        output += converted ?? text.slice(index, close + 2);
        index = close + 2;
        const next = text.indexOf(closeMarker, index);
        if (parenthesized) nextParenClose = next;
        else nextBracketClose = next;
        continue;
      }
      output += text.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (character !== "$") { output += character; index += 1; continue; }
    const display = text[index + 1] === "$";
    const open = index + (display ? 2 : 1);
    // Currency: a digit right after the opener is money unless a closing dollar
    // follows a non-space; `$5 and $10` has no such pair.
    if (!display && /[0-9]/.test(text[open] ?? "")) {
      const close = text.indexOf("$", open);
      if (close < 0 || close === open || text[close - 1] === " ") { output += character; index += 1; continue; }
    }
    const close = findClose(text, open, display);
    if (close < 0) { output += character; index += 1; continue; }
    const body = text.slice(open, close);
    const converted = latexToText(body);
    if (converted === undefined) { output += text.slice(index, close + (display ? 2 : 1)); index = close + (display ? 2 : 1); continue; }
    output += display ? converted : converted;
    index = close + (display ? 2 : 1);
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

function backtickRun(text: string, start: number): number {
  let run = 1;
  while (text[start + run] === "`") run++;
  return run;
}
