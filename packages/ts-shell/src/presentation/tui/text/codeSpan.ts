export interface CodeSpan {
  readonly run: number;
  readonly close: number;
  readonly end: number;
}

/**
 * Find a Markdown code span opened by the backtick run at `start`.
 *
 * A matching close must have the same run length. Returning undefined means the
 * opener is literal text, not an unterminated code span that swallows the rest
 * of the line.
 */
export function findCodeSpan(text: string, start: number): CodeSpan | undefined {
  if (text[start] !== "`" || isEscaped(text, start)) return undefined;
  let run = 1;
  while (text[start + run] === "`") run++;
  let index = start + run;
  while (index < text.length) {
    const close = text.indexOf("`", index);
    if (close < 0) return undefined;
    let closeRun = 1;
    while (text[close + closeRun] === "`") closeRun++;
    if (closeRun === run) return { run, close, end: close + run };
    index = close + closeRun;
  }
  return undefined;
}

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor--) slashes++;
  return slashes % 2 === 1;
}
