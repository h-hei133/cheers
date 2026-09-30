/**
 * Multi-Tier Streaming JSON Repair Engine
 *
 * Tier 1: Native JSON.parse (fast path for complete payloads)
 * Tier 2: repairJson (escapes raw ASCII control chars inside strings, doubles
 *         invalid backslashes) then parse
 * Tier 3: partial-json style parser for incomplete unclosed arrays/objects
 * Tier 4: partial-json over repaired JSON
 * Tier 5: empty-object fallback for initial empty deltas
 */

const VALID_JSON_ESCAPES = new Set(['"', "\\", "/", "b", "f", "n", "r", "t", "u"]);

function isControlCharacter(char: string): boolean {
  const codePoint = char.codePointAt(0);
  return codePoint !== undefined && codePoint >= 0x00 && codePoint <= 0x1f;
}

function escapeControlCharacter(char: string): string {
  switch (char) {
    case "\b":
      return "\\b";
    case "\f":
      return "\\f";
    case "\n":
      return "\\n";
    case "\r":
      return "\\r";
    case "\t":
      return "\\t";
    default:
      return `\\u${char.codePointAt(0)?.toString(16).padStart(4, "0") ?? "0000"}`;
  }
}

/**
 * Repairs malformed JSON string literals by:
 * - escaping raw control characters inside strings
 * - doubling backslashes before invalid escape characters
 */
export function repairJson(json: string): string {
  let repaired = "";
  let inString = false;

  for (let index = 0; index < json.length; index++) {
    const char = json[index];

    if (!inString) {
      repaired += char;
      if (char === '"') {
        inString = true;
      }
      continue;
    }

    if (char === '"') {
      repaired += char;
      inString = false;
      continue;
    }

    if (char === "\\") {
      const nextChar = json[index + 1];
      if (nextChar === undefined) {
        repaired += "\\\\";
        continue;
      }

      if (nextChar === "u") {
        const unicodeDigits = json.slice(index + 2, index + 6);
        if (/^[0-9a-fA-F]{4}$/.test(unicodeDigits)) {
          repaired += `\\u${unicodeDigits}`;
          index += 5;
          continue;
        }
      }

      if (VALID_JSON_ESCAPES.has(nextChar)) {
        repaired += `\\${nextChar}`;
        index += 1;
        continue;
      }

      repaired += "\\\\";
      continue;
    }

    repaired += isControlCharacter(char) ? escapeControlCharacter(char) : char;
  }

  return repaired;
}

/**
 * Tries to parse a possibly incomplete JSON fragment. Handles the common
 * streaming truncation shapes: unclosed arrays, unclosed objects, and
 * unterminated string literals.
 *
 * This is a lightweight local stand-in for the `partial-json` package.
 * Returns undefined when the fragment cannot be meaningfully recovered.
 */
function partialParse(rawJson: string): unknown {
  const trimmed = rawJson.trim();
  if (!trimmed) return undefined;

  // Fast path: complete JSON parses.
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to structural repair.
  }

  // Repair unterminated trailing string literal (e.g. {"a":"abc -> {"a":"abc"
  const closedQuote = closeUnterminatedString(trimmed);
  if (closedQuote !== trimmed) {
    try {
      return JSON.parse(closedQuote);
    } catch {
      // Fall through
    }
  }

  // Close unclosed brackets/braces greedily from the end.
  const stack: string[] = [];
  let inString = false;
  let inEscape = false;
  for (const ch of closedQuote) {
    if (inEscape) {
      inEscape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") inEscape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let repairedStructure = closedQuote;
  for (let i = stack.length - 1; i >= 0; i--) {
    repairedStructure += stack[i] === "{" ? "}" : "]";
  }

  if (repairedStructure === trimmed) return undefined;
  try {
    return JSON.parse(repairedStructure);
  } catch {
    return undefined;
  }
}

function closeUnterminatedString(json: string): string {
  let inString = false;
  let inEscape = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (inEscape) {
      inEscape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") inEscape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
  }
  return inString ? `${json}"` : json;
}

export function parseJsonWithRepair<T>(json: string): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    const repairedJson = repairJson(json);
    if (repairedJson !== json) {
      try {
        return JSON.parse(repairedJson) as T;
      } catch {
        // fall through to partial parse
      }
    }
    const partial = partialParse(json);
    if (partial !== undefined) {
      return partial as T;
    }
    const repairedPartial = partialParse(repairedJson);
    if (repairedPartial !== undefined) {
      return repairedPartial as T;
    }
    throw new Error(`Unable to parse JSON payload: ${json.slice(0, 200)}`);
  }
}

