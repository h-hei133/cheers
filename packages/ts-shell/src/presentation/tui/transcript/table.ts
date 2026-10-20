/**
 * Split one Markdown table row without treating escaped or code-span pipes as
 * column boundaries. The terminal and exported page share this parser so the
 * same source produces the same cells in both views.
 */
export function splitTableRow(line: string): string[] {
  const inner = /^\s*\|(.+)\|\s*$/.exec(line)?.[1] ?? "";
  const cells: string[] = [];
  let current = "";
  let codeSpanRun = 0;
  for (let index = 0; index < inner.length; index++) {
    const character = inner[index]!;
    if (character === "\\" && inner[index + 1] === "|" && codeSpanRun === 0) {
      current += "|";
      index += 1;
      continue;
    }
    if (character === "`") {
      let runLength = 1;
      while (inner[index + runLength] === "`") runLength += 1;
      if (codeSpanRun === 0) codeSpanRun = runLength;
      else if (runLength === codeSpanRun) codeSpanRun = 0;
      current += inner.slice(index, index + runLength);
      index += runLength - 1;
      continue;
    }
    if (character === "|" && codeSpanRun === 0) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  cells.push(current.trim());
  return cells;
}
