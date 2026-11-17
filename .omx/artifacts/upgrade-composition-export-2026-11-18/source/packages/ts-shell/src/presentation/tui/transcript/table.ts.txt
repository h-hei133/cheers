/**
 * Split one Markdown table row without treating escaped or code-span pipes as
 * column boundaries. The terminal and exported page share this parser so the
 * same source produces the same cells in both views.
 */
import { findCodeSpan } from "../text/codeSpan.js";

export type TableAlignment = "left" | "center" | "right" | undefined;

export function splitTableRow(line: string): string[] {
  const inner = line.trim();
  const cells: string[] = [];
  let current = "";
  let codeSpanClose = -1;
  for (let index = 0; index < inner.length; index++) {
    const character = inner[index]!;
    if (character === "\\" && codeSpanClose < 0) {
      let run = 1;
      while (inner[index + run] === "\\") run += 1;
      if (inner[index + run] === "|") {
        current += "\\".repeat(Math.floor(run / 2));
        if (run % 2 === 1) {
          current += "|";
          index += run;
          continue;
        }
        index += run - 1;
        continue;
      }
      current += "\\".repeat(run);
      index += run - 1;
      continue;
    }
    if (character === "`") {
      let runLength = 1;
      while (inner[index + runLength] === "`") runLength += 1;
      if (codeSpanClose < 0) {
        const span = findCodeSpan(inner, index);
        if (span) codeSpanClose = span.close;
      } else if (index === codeSpanClose) {
        codeSpanClose = -1;
      }
      current += inner.slice(index, index + runLength);
      index += runLength - 1;
      continue;
    }
    if (character === "|" && codeSpanClose < 0) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  cells.push(current.trim());
  if (inner.startsWith("|")) cells.shift();
  // An escaped trailing pipe belongs to its cell, so a final empty cell is the
  // evidence that the final pipe was an actual optional outer delimiter.
  if (inner.endsWith("|") && cells.at(-1) === "") cells.pop();
  return cells;
}

/** A delimiter row must account for every header cell; alignment is source data. */
export function tableAlignments(header: string, delimiter: string): readonly TableAlignment[] | undefined {
  if (!header.includes("|") || !delimiter.includes("|")) return undefined;
  const headings = splitTableRow(header);
  const cells = splitTableRow(delimiter);
  if (headings.length !== cells.length || cells.length === 0 || cells.some(cell => !/^:?-{3,}:?$/.test(cell))) return undefined;
  return cells.map(cell => cell.startsWith(":")
    ? cell.endsWith(":") ? "center" : "left"
    : cell.endsWith(":") ? "right" : undefined);
}
