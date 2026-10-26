import { findCodeSpan } from '../text/codeSpan.js';

/** Prompt literals cannot authorize methods while a code span or fence is open. */
export function promptCodeEnd(text: string, start: number): number | undefined {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  if (/^[ \t]*$/.test(text.slice(lineStart, start))) {
    const lineEnd = text.indexOf('\n', start);
    const line = text.slice(start, lineEnd < 0 ? text.length : lineEnd);
    const fence = /^(`{3,})([^`\r\n]*)\r?$|^(~{3,})[^\r\n]*\r?$/.exec(line);
    if (fence) {
      const marker = fence[1] ?? fence[3]!;
      const close = new RegExp(`^[ \\t]*${marker[0]}{${marker.length},}[ \\t]*\\r?$`);
      let cursor = lineEnd < 0 ? text.length : lineEnd + 1;
      while (cursor < text.length) {
        const newline = text.indexOf('\n', cursor);
        const end = newline < 0 ? text.length : newline;
        if (close.test(text.slice(cursor, end))) return end;
        cursor = newline < 0 ? text.length : newline + 1;
      }
      return text.length;
    }
  }
  if (text[start] === '`') return findCodeSpan(text, start)?.end ?? text.length;
  return undefined;
}
