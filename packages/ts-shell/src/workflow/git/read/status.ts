import type { GitFile } from './model.js';
/** Porcelain v2 NUL records retain literal spaces, tabs and rename destinations. */
export function parseGitStatus(text: string): GitFile[] {
  const records = text.split('\0');
  const files: GitFile[] = [];
  for (let index = 0; index < records.length; index++) {
    const record = records[index]!;
    if (!record) continue;
    if (record.startsWith('? ')) { files.push({ path: record.slice(2), index: '?', worktree: '?', conflict: false, submodule: false }); continue; }
    if (record.startsWith('# ') || record.startsWith('! ')) continue;
    const count = record[0] === '1' ? 8 : record[0] === '2' ? 9 : record[0] === 'u' ? 10 : 0;
    if (!count) throw new Error('Git status returned an unknown record.');
    const fields = record.split(' ');
    const xy = fields[1]!;
    const filePath = fields.slice(count).join(' ');
    if (!filePath || xy.length !== 2) throw new Error('Git status returned an incomplete record.');
    const originalPath = record[0] === '2' ? records[++index] : undefined;
    if (record[0] === '2' && !originalPath) throw new Error('Git rename source is missing.');
    files.push({ path: filePath, ...(originalPath ? { originalPath } : {}), index: xy[0]!, worktree: xy[1]!,
      conflict: record[0] === 'u', submodule: fields[2] !== 'N...' });
  }
  return files;
}
