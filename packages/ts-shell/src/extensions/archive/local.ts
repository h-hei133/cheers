import fs from 'node:fs';
import path from 'node:path';
import { workspaceRelativePath } from '../../core/workspace/files.js';
import { readRevision } from '../../runtime/execution/read.js';
import { readBinarySnapshot } from '../../runtime/execution/snapshot.js';
import { digest, manifest, relativePath } from '../registry/validation.js';
import { assertStoragePath } from '../store/paths.js';
import { assertManifestFiles, ENTRY_COUNT, FILE_BYTES, inventoryDigest, TOTAL_BYTES, type ExtensionInventory } from './inventory.js';
import type { ExtensionManifest } from '../model.js';

interface LocalPackage extends ExtensionInventory {
  readonly manifest: ExtensionManifest;
  readonly digest: string;
  readonly check: () => void;
  readonly stage: (target: string) => void;
}

export function isLocalPackage(input: string): boolean {
  return input === '.' || input.startsWith(`.${path.sep}`) || path.isAbsolute(input);
}

export function localPackagePath(root: string, input: string): string {
  if (!input || input.length > 2048 || /[\x00-\x1f\x7f]/.test(input) || input.split(path.sep).includes('..')) {
    throw new Error('A bounded local package path without parent traversal is required.');
  }
  const absolute = path.resolve(root, input);
  workspaceRelativePath(root, absolute);
  assertStoragePath(absolute);
  return absolute;
}

export async function captureLocalPackage(root: string, directory: string, checkAccess: (target: string) => void,
  signal?: AbortSignal): Promise<LocalPackage> {
  const fileBytes = new Map<string, Buffer>();
  const revisions = new Map<string, string>();
  const folded = new Set<string>();
  const files: Record<string, string> = Object.create(null);
  const directories: string[] = [];
  let bytes = 0;

  const revision = (target: string, directory: boolean): string => {
    signal?.throwIfAborted();
    assertStoragePath(target);
    checkAccess(target);
    const stat = fs.lstatSync(target, { bigint: true });
    if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1n)
      || (stat.mode & 0o7000n) !== 0n) throw new Error('Local extension contains an unsafe file or directory.');
    return readRevision(stat);
  };
  const check = (): void => {
    for (const [target, expected] of revisions) {
      const local = path.relative(directory, target).split(path.sep).join('/');
      if (revision(target, !local || !Object.hasOwn(files, local)) !== expected) throw new Error('Local extension source changed.');
    }
  };
  const walk = async (target: string, prefix: string): Promise<void> => {
    revisions.set(target, revision(target, true));
    const handle = await fs.promises.opendir(target);
    try {
      for (;;) {
        signal?.throwIfAborted();
        const entry = await handle.read();
        if (!entry) break;
        if (folded.size >= ENTRY_COUNT) throw new Error('Local extension contains too many entries.');
        const name = relativePath(prefix ? `${prefix}/${entry.name}` : entry.name);
        const key = name.toLowerCase();
        if (folded.has(key)) throw new Error('Case-conflicting local extension paths.');
        folded.add(key);
        const child = path.join(target, entry.name);
        if (entry.isDirectory()) { directories.push(name); await walk(child, name); continue; }
        const before = revision(child, false);
        const body = await readBinarySnapshot({ absolutePath: child, workspaceRoot: root, abortSignal: signal,
          assertFileAccess: actual => {
            if (actual !== child || revision(child, false) !== before) throw new Error('Local extension source changed.');
          } }, Math.min(FILE_BYTES, TOTAL_BYTES - bytes));
        bytes += body.length;
        fileBytes.set(name, body);
        files[name] = digest(body);
        revisions.set(child, before);
      }
    } finally { await handle.close(); }
  };
  await walk(directory, '');
  check();
  const body = fileBytes.get('extension.json');
  const manifestText = body?.toString('utf8');
  if (!body || !manifestText || !body.equals(Buffer.from(manifestText, 'utf8'))) throw new Error('Local extension.json is missing or is not UTF-8.');
  let parsed: unknown;
  try { parsed = JSON.parse(manifestText); } catch { throw new Error('Local extension.json is malformed.'); }
  const extension = manifest(parsed);
  assertManifestFiles(extension, files);
  const inventory = { files, directories: directories.sort() };
  return { ...inventory, manifest: extension, digest: inventoryDigest(inventory), check, stage: target => {
    for (const name of inventory.directories) fs.mkdirSync(path.join(target, name), { mode: 0o700 });
    for (const [name, body] of fileBytes) fs.writeFileSync(path.join(target, name), body, { flag: 'wx', mode: 0o600 });
  } };
}
