import { gunzipSync } from 'node:zlib';
import { Header, Parser } from 'tar';
import { isRecord } from '../../core/values/record.js';
import { canonical, digest, manifest, relativePath } from '../registry/validation.js';
import { ARCHIVE_BYTES } from '../registry/client.js';
import { verifyNpmIntegrity, type NpmRelease } from '../registry/npm.js';
import { gitArchiveRoot, type GitRelease } from '../registry/git.js';
import type { ExtensionManifest, Release } from '../model.js';
import { assertManifestFiles, ENTRY_COUNT, FILE_BYTES, TOTAL_BYTES, type ExtensionInventory } from './inventory.js';
export { ENTRY_COUNT, FILE_BYTES, TOTAL_BYTES } from './inventory.js';

export interface ValidatedArchive extends ExtensionInventory { readonly tar: Buffer; readonly root?: string }

/** Publisher signature is checked by the registry; compressed integrity precedes even parsing. */
export async function validateArchive(bytes: Buffer, release: Release): Promise<ValidatedArchive> {
  if (!bytes.length || bytes.length > ARCHIVE_BYTES || digest(bytes) !== release.digest) throw new Error('Extension archive integrity mismatch or size limit.');
  const { archive, manifestBytes } = await readArchive(bytes);
  if (canonical(archiveJson(manifestBytes, 'extension.json')) !== canonical(release.manifest)) throw new Error('Archive manifest differs from the approved signed manifest.');
  assertManifestFiles(release.manifest, archive.files);
  return archive;
}

export async function validateNpmArchive(bytes: Buffer, release: NpmRelease): Promise<{
  readonly archive: ValidatedArchive; readonly manifest: ExtensionManifest; readonly digest: string;
}> {
  if (!bytes.length || bytes.length > ARCHIVE_BYTES) throw new Error('Npm archive exceeds its size limit.');
  verifyNpmIntegrity(bytes, release.integrity);
  const { archive, manifestBytes, packageBytes } = await readArchive(bytes, 'package');
  const extension = manifest(archiveJson(manifestBytes, 'extension.json'));
  assertNpmPackage(archiveJson(packageBytes, 'package.json'), release);
  if (extension.version !== release.version) throw new Error('Npm extension manifest version differs from the requested package version.');
  assertManifestFiles(extension, archive.files);
  return { archive, manifest: extension, digest: digest(bytes) };
}

export async function validateGitArchive(bytes: Buffer, release: GitRelease): Promise<{
  readonly archive: ValidatedArchive; readonly manifest: ExtensionManifest; readonly digest: string;
}> {
  if (!bytes.length || bytes.length > ARCHIVE_BYTES) throw new Error('Git archive exceeds its size limit.');
  const { archive, manifestBytes } = await readArchive(bytes, gitArchiveRoot(release), release.commit);
  const extension = manifest(archiveJson(manifestBytes, 'extension.json'));
  assertManifestFiles(extension, archive.files);
  return { archive, manifest: extension, digest: digest(bytes) };
}

function assertGitCommit(tar: Buffer, commit: string): void {
  const comment = Buffer.from(`52 comment=${commit}\n`);
  if (tar.length >= 1024) {
    const header = new Header(tar);
    if (header.cksumValid && header.type === 'GlobalExtendedHeader' && header.size === comment.length
      && tar.subarray(512, 512 + comment.length).equals(comment)) return;
  }
  throw new Error('Git archive does not identify the complete requested commit.');
}

export function assertNpmPackage(value: unknown, release: Pick<NpmRelease, 'packageName' | 'version'>): void {
  if (!isRecord(value) || value.name !== release.packageName || value.version !== release.version) {
    throw new Error('Npm archive package identity differs from the exact registry release.');
  }
}

export function archivePath(raw: string, directory: boolean, root?: ValidatedArchive['root']): string | undefined {
  const selected = relativePath(directory ? raw.replace(/\/$/, '') : raw);
  if (!root) return selected;
  if (selected === root && directory) return undefined;
  if (!selected.startsWith(`${root}/`)) throw new Error('Archive entries must be inside the expected package directory.');
  return relativePath(selected.slice(root.length + 1));
}

export function archiveJson(bytes: Buffer | undefined, file: 'package.json' | 'extension.json'): unknown {
  try {
    const text = bytes?.toString('utf8');
    if (!bytes || !text || !bytes.equals(Buffer.from(text, 'utf8'))) throw new Error();
    return JSON.parse(text);
  } catch { throw new Error(`Archive ${file} is missing or malformed.`); }
}

async function readArchive(bytes: Buffer, root?: ValidatedArchive['root'], commit?: string): Promise<{
  readonly archive: ValidatedArchive; readonly manifestBytes?: Buffer; readonly packageBytes?: Buffer;
}> {
  let tar: Buffer;
  try { tar = gunzipSync(bytes, { maxOutputLength: TOTAL_BYTES }); }
  catch { throw new Error('Malformed or oversized compressed extension archive.'); }
  if (tar.length > TOTAL_BYTES || tar.length > bytes.length * 100) throw new Error('Extension archive inflation limit.');
  if (commit !== undefined) assertGitCommit(tar, commit);
  const files: Record<string, string> = Object.create(null); const directories = new Set<string>(); const seen = new Map<string, string>();
  let count = 0; let total = 0; let manifestBytes: Buffer | undefined; let packageBytes: Buffer | undefined;
  let rootSeen = false;
  await new Promise<void>((resolve, reject) => {
    let ended = false; let failed = false;
    const fail = (error: unknown) => { if (failed) return; failed = true; reject(error instanceof Error ? error : new Error('Malformed extension archive.')); };
    const parser = new Parser({ strict: true, maxMetaEntrySize: 16 * 1024, onReadEntry: entry => {
      try {
        if (++count > ENTRY_COUNT || !['File', 'Directory'].includes(entry.type) || entry.linkpath || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > FILE_BYTES) throw new Error('Unsafe extension archive entry.');
        const directory = entry.type === 'Directory';
        const selected = archivePath(entry.path, directory, root);
        if (selected === undefined) {
          if (rootSeen || entry.size !== 0 || ((entry.mode ?? 0) & 0o7000)) throw new Error('Unsafe archive root.');
          rootSeen = true; entry.resume(); return;
        }
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
          const body = Buffer.concat(chunks); files[selected] = digest(body);
          if (selected === 'extension.json') manifestBytes = body;
          if (root && selected === 'package.json') packageBytes = body;
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
  return { archive: { tar, files, directories: [...directories].sort(), ...(root ? { root } : {}) }, manifestBytes, packageBytes };
}
