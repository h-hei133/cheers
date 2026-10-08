import { detectLineEnding, splitByteOrderMark } from '../../runtime/execution/fileText.js';
import type { PatchHunk } from './types.js';
import { patchLimits } from './parse.js';

/** Exact unique matching against the original, preserving untouched raw lines and text shape. */
export function applyHunks(content: string, hunks: readonly PatchHunk[]): string {
  const { bom, text } = splitByteOrderMark(content);
  if (text.includes('\0') || text.replace(/\r\n/g, '').includes('\r')) throw new Error('Patch target is not supported text.');
  const raw = text.match(/[^\n]*(?:\n|$)/g)?.filter(line => line !== '') ?? [];
  if (raw.length > patchLimits.lines) throw new Error('Patch target exceeds the line limit.');
  const lines = raw.map(line => line.replace(/\r?\n$/, ''));
  const result: string[] = [];
  const ending = detectLineEnding(content);
  let cursor = 0;
  for (const hunk of hunks) {
    let start = cursor;
    if (hunk.changeContext !== undefined) start = uniqueMatch(lines, [hunk.changeContext], start, false) + 1;
    const old = hunk.lines.filter(line => line.kind !== 'add').map(line => line.text);
    const at = old.length ? uniqueMatch(lines, old, start, hunk.isEndOfFile === true)
      : hunk.isEndOfFile ? lines.length : hunk.changeContext !== undefined || !lines.length ? start : -1;
    if (at < start) throw new Error('An insertion requires an exact context anchor or End of File.');
    result.push(...raw.slice(cursor, at));
    let original = at;
    const replacement: string[] = [];
    for (const line of hunk.lines) {
      if (line.kind === 'context') replacement.push(raw[original++]!);
      else if (line.kind === 'remove') original++;
      else replacement.push(line.text + ending);
    }
    if (original === raw.length && raw.length && !text.endsWith('\n') && replacement.length) {
      replacement[replacement.length - 1] = replacement[replacement.length - 1]!.replace(/\r?\n$/, '');
    }
    result.push(...replacement);
    cursor = original;
  }
  const output = [...result, ...raw.slice(cursor)];
  return bom + output.map((line, index) => index + 1 < output.length && !line.endsWith('\n') ? line + ending : line).join('');
}

function uniqueMatch(lines: readonly string[], pattern: readonly string[], start: number, eof: boolean): number {
  let found = -1;
  for (let index = start; index <= lines.length - pattern.length; index++) {
    if (eof && index + pattern.length !== lines.length) continue;
    if (!pattern.every((line, offset) => lines[index + offset] === line)) continue;
    if (found !== -1) throw new Error('Patch context is ambiguous; include a unique anchor.');
    found = index;
  }
  if (found === -1) throw new Error('Patch context does not match the file.');
  return found;
}
