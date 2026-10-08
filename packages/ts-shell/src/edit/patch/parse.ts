import type { PatchFileOperation, PatchHunk, PatchLineChange } from './types.js';

export const patchLimits = { inputBytes: 256 * 1024, files: 64, fileBytes: 1024 * 1024, totalBytes: 4 * 1024 * 1024, lines: 20000, previewBytes: 512 * 1024 } as const;

/** Strict public text protocol. Shell wrappers, fuzzy whitespace and unknown directives are rejected. */
export function parsePatch(input: string): readonly PatchFileOperation[] {
  if (typeof input !== 'string' || Buffer.byteLength(input) > patchLimits.inputBytes || input.includes('\0')) throw new Error('Patch is not bounded text.');
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  if (lines.length > patchLimits.lines || lines[0] !== '*** Begin Patch' || lines[lines.length - 1] !== '*** End Patch') throw new Error('Patch must have exact Begin Patch and End Patch markers.');
  const operations: PatchFileOperation[] = [];
  let cursor = 1;
  while (cursor < lines.length - 1) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(lines[cursor++]!);
    if (!header) throw new Error(`Invalid file header at patch line ${cursor}.`);
    const target = patchPath(header[2]!);
    if (header[1] === 'Delete') operations.push({ kind: 'delete', path: target });
    else if (header[1] === 'Add') {
      const content: string[] = [];
      while (lines[cursor]?.startsWith('+')) content.push(lines[cursor++]!.slice(1));
      if (!content.length) throw new Error('Add File requires at least one + line.');
      operations.push({ kind: 'add', path: target, content: content.join('\n') + '\n' });
    } else {
      const move = lines[cursor]?.startsWith('*** Move to: ') ? patchPath(lines[cursor++]!.slice(13)) : undefined;
      const hunks: PatchHunk[] = [];
      while (cursor < lines.length - 1 && lines[cursor]!.startsWith('@@')) {
        const marker = lines[cursor++]!;
        if (marker !== '@@' && !marker.startsWith('@@ ')) throw new Error('Invalid hunk marker.');
        const changes: PatchLineChange[] = [];
        while (cursor < lines.length - 1 && /^[ +\-]/.test(lines[cursor]!)) {
          const line = lines[cursor++]!;
          changes.push({ kind: line[0] === '+' ? 'add' : line[0] === '-' ? 'remove' : 'context', text: line.slice(1) });
        }
        const eof = lines[cursor] === '*** End of File';
        if (eof) cursor++;
        if (!changes.length || !changes.some(line => line.kind !== 'context')) throw new Error('Hunk must contain a change.');
        hunks.push({ lines: changes, ...(marker === '@@' ? {} : { changeContext: marker.slice(3) }), ...(eof ? { isEndOfFile: true } : {}) });
        if (eof && lines[cursor]?.startsWith('@@')) throw new Error('End of File must finish the update.');
      }
      if (!hunks.length && !move) throw new Error('Update File requires a hunk or a rename.');
      operations.push(move ? { kind: 'move', path: target, moveTo: move, hunks } : { kind: 'update', path: target, hunks });
    }
    if (operations.length > patchLimits.files) throw new Error('Patch contains too many files.');
  }
  if (!operations.length) throw new Error('Patch contains no operations.');
  return operations;
}

function patchPath(value: string): string {
  if (!value || value.length > 4096 || /[\x00-\x1f\x7f-\x9f]/.test(value) || value.trim() !== value) throw new Error('Patch path is invalid.');
  return value;
}
