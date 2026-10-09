import fs from 'node:fs';
import path from 'node:path';

export interface StorageDirectory { readonly path: string; readonly identity: string }
export type StorageIdentity = readonly StorageDirectory[];

/** Every ancestor participates in ownership; lstat of the leaf alone follows parent links. */
export function assertStoragePath(selected: string): void {
  const absolute = path.resolve(selected); const parts = absolute.split(path.sep); let current = path.parse(absolute).root;
  for (const part of parts.slice(1)) {
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Extension storage contains a changed symbolic link.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  }
}
export function storageIdentity(selected: string): StorageIdentity {
  assertStoragePath(selected); const proof: StorageDirectory[] = []; let current = path.resolve(selected);
  while (true) {
    try { const stat = fs.lstatSync(current, { bigint: true }); if (stat.isDirectory()) proof.push({ path: current, identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}` }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
  return proof;
}
export function assertStorageIdentity(proof: StorageIdentity): void {
  for (const expected of proof) {
    assertStoragePath(expected.path);
    const stat = fs.lstatSync(expected.path, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink() || `${stat.dev}:${stat.ino}:${stat.birthtimeMs}` !== expected.identity) throw new Error('Approved extension storage directory changed identity.');
  }
}
