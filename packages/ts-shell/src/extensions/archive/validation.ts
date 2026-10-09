import { gunzipSync } from 'node:zlib';
import { Parser } from 'tar';
import { canonical, digest, relativePath } from '../registry/validation.js';
import { ARCHIVE_BYTES } from '../registry/client.js';
import type { Release } from '../model.js';

export const FILE_BYTES = 4 * 1024 * 1024;
export const TOTAL_BYTES = 32 * 1024 * 1024;
export const ENTRY_COUNT = 512;
export interface ValidatedArchive { readonly tar: Buffer; readonly files: Readonly<Record<string, string>>; readonly directories: readonly string[] }

/** Publisher signature is checked by the registry; compressed integrity precedes even parsing. */
export async function validateArchive(bytes: Buffer, release: Release): Promise<ValidatedArchive> {
  if (!bytes.length || bytes.length > ARCHIVE_BYTES || digest(bytes) !== release.digest) throw new Error('Extension archive integrity mismatch or size limit.');
  let tar: Buffer;
  try { tar = gunzipSync(bytes, { maxOutputLength: TOTAL_BYTES }); }
  catch { throw new Error('Malformed or oversized compressed extension archive.'); }
  if (tar.length > TOTAL_BYTES || tar.length > bytes.length * 100) throw new Error('Extension archive inflation limit.');
  const files: Record<string, string> = {}; const directories = new Set<string>(); const seen = new Map<string, string>();
  let count = 0; let total = 0; let manifestBytes: Buffer | undefined;
  await new Promise<void>((resolve, reject) => {
    let ended = false; let failed = false;
    const fail = (error: unknown) => { if (failed) return; failed = true; reject(error instanceof Error ? error : new Error('Malformed extension archive.')); };
    const parser = new Parser({ strict: true, maxMetaEntrySize: 16 * 1024, onReadEntry: entry => {
      try {
        if (++count > ENTRY_COUNT || !['File', 'Directory'].includes(entry.type) || entry.linkpath || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > FILE_BYTES) throw new Error('Unsafe extension archive entry.');
        const selected = relativePath(entry.type === 'Directory' ? entry.path.replace(/\/$/, '') : entry.path);
        const folded = selected.toLowerCase();
        if (seen.has(folded)) throw new Error('Duplicate or case-conflicting archive path.');
        const existingDirectory = [...directories].find(dir => dir.toLowerCase() === folded);
        if (existingDirectory && existingDirectory !== selected) throw new Error('Case-conflicting archive directory.');
        seen.set(folded, selected);
        const parents = selected.split('/'); parents.pop(); let parent = '';
        for (const part of parents) {
          parent = parent ? `${parent}/${part}` : part;
          const spelling = seen.get(parent.toLowerCase());
          const directorySpelling = [...directories].find(dir => dir.toLowerCase() === parent.toLowerCase());
          if ((spelling && spelling !== parent) || (directorySpelling && directorySpelling !== parent) || files[parent]) throw new Error('Archive file/directory collision.');
          directories.add(parent);
        }
        if (entry.type === 'Directory') { if (entry.size !== 0 || files[selected] || ((entry.mode ?? 0) & 0o7000)) throw new Error('Unsafe archive directory.'); directories.add(selected); entry.resume(); return; }
        if ((entry.mode ?? 0) & 0o7000) throw new Error('Privileged archive mode refused.');
        if (directories.has(selected) || directories.has([...directories].find(dir => dir.toLowerCase() === folded) ?? '')) throw new Error('Archive file/directory collision.');
        total += entry.size; if (total > TOTAL_BYTES) throw new Error('Extension archive total limit.');
        const chunks: Buffer[] = []; let length = 0;
        entry.on('data', (chunk: Buffer) => { length += chunk.length; if (length > entry.size || length > FILE_BYTES) fail(new Error('Archive entry exceeds its size.')); else chunks.push(chunk); });
        entry.on('end', () => {
          if (length !== entry.size) { fail(new Error('Truncated archive entry.')); return; }
          const body = Buffer.concat(chunks); files[selected] = digest(body); if (selected === 'extension.json') manifestBytes = body;
        });
      } catch (error) { entry.resume(); fail(error); }
    } });
    parser.on('error', fail);
    parser.on('ignoredEntry', () => fail(new Error('Unsupported or oversized archive entry.')));
    parser.on('meta', () => { if (++count > ENTRY_COUNT) fail(new Error('Extension archive metadata count limit.')); });
    parser.on('warn', (_code, _message) => fail(new Error('Malformed extension archive.')));
    parser.on('eof', () => { ended = true; });
    parser.on('end', () => { if (!ended || !count) fail(new Error('Malformed or incomplete extension archive.')); else if (!failed) resolve(); });
    try { parser.end(tar); } catch (error) { fail(error); }
  });
  let parsed: unknown; try { parsed = JSON.parse(manifestBytes?.toString('utf8') ?? ''); } catch { throw new Error('Archive extension.json is missing or malformed.'); }
  if (canonical(parsed) !== canonical(release.manifest)) throw new Error('Archive manifest differs from the approved signed manifest.');
  for (const entry of [...release.manifest.skills, ...release.manifest.scripts]) if (!files[entry.path]) throw new Error('Declared extension file is missing.');
  return { tar, files, directories: [...directories].sort() };
}
