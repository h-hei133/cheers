import fs from 'node:fs';
import path from 'node:path';
import { UnpackSync } from 'tar';
import { canonical, digest, relativePath } from '../registry/validation.js';
import { archiveJson, archivePath, assertNpmPackage, type ValidatedArchive } from './validation.js';
import { ENTRY_COUNT, FILE_BYTES, type ExtensionInventory } from './inventory.js';
import type { VersionRecord } from '../model.js';
import { assertStorageIdentity, assertStoragePath } from '../store/paths.js';

/** Only a fully validated tar reaches the mature extractor, in a private new directory. */
export function extractArchive(archive: ValidatedArchive, target: string): void {
  const extractor = new UnpackSync({ cwd: target, strict: true, chmod: false, noMtime: true,
    ...(archive.root ? { strip: 1 } : {}),
    filter: (raw, entry) => {
      if (!('type' in entry) || (entry.type !== 'File' && entry.type !== 'Directory')) return false;
      const selected = archivePath(raw, entry.type === 'Directory', archive.root);
      return selected !== undefined && (entry.type === 'Directory' ? archive.directories.includes(selected) : Object.hasOwn(archive.files, selected));
    } });
  let error: unknown;
  extractor.on('error', value => { error = value; });
  extractor.on('warn', () => { error = new Error('Archive extraction warning.'); });
  extractor.end(archive.tar);
  if (error) throw new Error('Extension archive could not be extracted safely.');
  assertInventory(target, archive);
}
/** Inventory covers every file and directory: unknown user content is never force removed. */
export function assertInventory(root: string, expected: ExtensionInventory & {
  readonly storage?: VersionRecord['storage']; readonly origin?: VersionRecord['origin'];
  readonly manifest?: VersionRecord['manifest']; readonly packageName?: string;
}): void {
  assertStoragePath(root);
  if (expected.storage) { if (expected.storage[0]?.path !== path.resolve(root)) throw new Error('Owned extension directory path changed.'); assertStorageIdentity(expected.storage); }
  const actualFiles: Record<string, string> = Object.create(null); const directories: string[] = []; let count = 0;
  let localManifest: unknown;
  let npmPackage: unknown;
  const walk = (directory: string, prefix: string) => {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Owned extension directory changed.');
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (++count > ENTRY_COUNT) throw new Error('Extension inventory exceeds its limit.');
      const local = relativePath(prefix ? `${prefix}/${entry.name}` : entry.name); const absolute = path.join(directory, entry.name);
      const info = fs.lstatSync(absolute);
      if (info.isSymbolicLink()) throw new Error('Extension contains a changed link.');
      if (info.isDirectory()) { directories.push(local); walk(absolute, local); }
      else if (info.isFile() && info.size <= FILE_BYTES) {
        const body = fs.readFileSync(absolute);
        actualFiles[local] = digest(body);
        if (expected.origin && local === 'extension.json') localManifest = archiveJson(body, 'extension.json');
        if (expected.origin === 'npm' && local === 'package.json') npmPackage = archiveJson(body, 'package.json');
      }
      else throw new Error('Extension contains an unsafe or oversized file.');
    }
  };
  walk(root, '');
  if (JSON.stringify(Object.entries(actualFiles).sort()) !== JSON.stringify(Object.entries(expected.files).sort()) || JSON.stringify(directories.sort()) !== JSON.stringify([...expected.directories].sort())) throw new Error('Extension files are dirty or unknown; user content was preserved.');
  if (expected.origin && canonical(localManifest) !== canonical(expected.manifest)) throw new Error('Installed extension manifest differs from the reviewed package.');
  if (expected.origin === 'npm') assertNpmPackage(npmPackage, { packageName: expected.packageName!, version: expected.manifest!.version });
}
