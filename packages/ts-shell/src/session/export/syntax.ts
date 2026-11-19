import { Tokenizer, type MarkedExtension, type Token } from "marked";
import { findCodeSpan } from "../../core/text/codeSpan.js";
import { createMathFinder, latexToDisplayText, MATH_ENVIRONMENTS } from "../../presentation/tui/transcript/math.js";

const MATH_OPEN = /^ {0,3}(\$\$|\\\[|\\begin\{([A-Za-z]+\*?)\})[ \t]*(?:\n|$)/;
const MATH_START = new RegExp(MATH_OPEN.source, "m");
const MATH_END = { "$$": "\\$\\$", "\\[": "\\\\\\]" } as const;
const MAX_TABLE_CELLS = 64 * 1024;

function displayMath(source: string) {
  const opener = MATH_OPEN.exec(source);
  if (!opener) return undefined;
  const environment = opener[2];
  if (environment && !MATH_ENVIRONMENTS.has(environment)) return undefined;
  const end = environment ? `\\\\end\\{${environment.replace("*", "\\*")}\\}` : MATH_END[opener[1] as keyof typeof MATH_END];
  const rest = source.slice(opener[0].length);
  const closer = new RegExp(`^ {0,3}${end}[ \\t]*(?:\\n|$)`, "m").exec(rest);
  if (!closer) return undefined;
  const raw = source.slice(0, opener[0].length + closer.index + closer[0].length);
  const body = environment ? raw : rest.slice(0, closer.index);
  return { type: "displayMath", raw, text: latexToDisplayText(body) ?? raw.replace(/\n$/, "") };
}

/** Keep a literal pipe inside inline code from creating another table column. */
function protectPipes(line: string): string {
  const result: string[] = [];
  let through = 0;
  for (const marker of line.matchAll(/`+/g)) {
    if (marker.index < through) continue;
    const code = findCodeSpan(line, marker.index);
    if (!code) continue;
    const start = marker.index + code.run;
    result.push(line.slice(through, start));
    result.push(line.slice(start, code.close).replace(/\\*\|/g, pipe =>
      pipe.length % 2 === 0 ? pipe : `\\${pipe}`));
    result.push(line.slice(code.close, code.end));
    through = code.end;
  }
  return result.length ? result.join("") + line.slice(through) : line;
}

export function exportSyntax(escapeHtml: (text: string) => string): MarkedExtension {
  const mathByTokens = new WeakMap<Token[], {
    readonly sourceLength: number;
    readonly find: ReturnType<typeof createMathFinder>;
  }>();
  return {
    extensions: [
      {
        name: "displayMath",
        level: "block",
        start(source) {
          const match = MATH_START.exec(source);
          if (!match?.[2] || MATH_ENVIRONMENTS.has(match[2])) return match?.index;
        },
        tokenizer: displayMath,
        renderer: token => `<div class="math">${escapeHtml(token.text)}</div>`,
      },
      {
        name: "inlineLiteral",
        level: "inline",
        start: source => source.indexOf("$"),
        tokenizer(source, tokens) {
          if (this.lexer.state.inRawBlock) return undefined;
          if (source.startsWith("\\`")) {
            return { type: "inlineLiteral", raw: "\\`", text: "\\`" };
          }
          const escapedOpener = source.startsWith("\\(") || source.startsWith("\\[");
          if (source[0] !== "$" && !escapedOpener) return undefined;
          let math = mathByTokens.get(tokens);
          if (!math) {
            math = { sourceLength: source.length, find: createMathFinder(source) };
            mathByTokens.set(tokens, math);
          }
          const offset = math.sourceLength - source.length;
          const projection = math.find(offset);
          if (!projection && !escapedOpener) return undefined;
          const raw = source.slice(0, projection ? projection.end - offset : 2);
          return { type: "inlineLiteral", raw, text: projection?.text ?? raw };
        },
        renderer: token => escapeHtml(token.text),
      },
    ],
    tokenizer: {
      table(source) {
        const table = this.rules.block.table.exec(source);
        if (!table) return false;
        const raw = table[0].replace(/\n+$/, "");
        const columns = table[2]!.split("|").length;
        const rows = table[3]?.split("\n").length ?? 0;
        if (columns * (rows + 1) > MAX_TABLE_CELLS) throw new RangeError("Export table exceeds the cell budget.");
        if (!raw.includes("`")) return false;
        const normalized = raw.split("\n").map((line, index) => index === 1 ? line : protectPipes(line)).join("\n");
        if (normalized === raw) return false;
        const token = Tokenizer.prototype.table.call(this, normalized);
        return token ? { ...token, raw } : false;
      },
    },
  };
}
