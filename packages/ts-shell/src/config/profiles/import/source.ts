import fs from 'node:fs';
import path from 'node:path';
import { assertProfileIdentity } from '../../../core/paths/profile/context.js';
import { assertDirectoryIdentity, assertUnlinkedPath, directoryIdentity, type DirectoryIdentity } from '../../../core/paths/profile/identity.js';
import { profileSearchDirs } from '../../../core/paths/userHome.js';
import { inspectWorkspaceFile } from '../../../core/workspace/files.js';
import { IMPORT_LIMITS, type ImportRequest, type ImportSource } from './model.js';

export interface SourceCapture {
  readonly sources: ImportSource[];
  readonly roots: readonly DirectoryIdentity[];
  read(absolute: string): string | undefined;
  first(relative: string): string | undefined;
  entries(directory: string, depth?: number): readonly string[];
  check(): void;
}

export function captureSources(request: ImportRequest): SourceCapture {
  const sources: ImportSource[] = [];
  let bytes = 0;
  const paths = profileSearchDirs(request.source);
  const roots = paths.filter(target => fs.existsSync(target)).map(target => {
    assertUnlinkedPath(target); return directoryIdentity(target);
  });
  const check = () => {
    assertProfileIdentity(request.source); assertProfileIdentity(request.target); assertDirectoryIdentity(request.workspace);
    for (const root of roots) assertDirectoryIdentity(root);
    const current = paths.filter(target => fs.existsSync(target));
    if (current.length !== roots.length || current.some((target, index) => target !== roots[index]!.path)) throw new Error('Import source roots changed.');
  };
  const read = (absolute: string) => {
    check(); assertUnlinkedPath(absolute);
    const root = roots.find(item => absolute.startsWith(item.path + path.sep));
    if (!root) throw new Error('Import source is outside its captured roots.');
    const state = inspectWorkspaceFile(root.path, path.relative(root.path, absolute), check, IMPORT_LIMITS.fileBytes);
    if (state.state === 'absent') return undefined;
    const previous = sources.find(item => item.path === absolute);
    if (previous && (previous.hash !== state.hash || previous.identity !== state.identity)) throw new Error('Import source changed during inspection.');
    if (!previous) {
      bytes += Buffer.byteLength(state.content);
      if (sources.length >= IMPORT_LIMITS.files || bytes > IMPORT_LIMITS.bytes) throw new Error('Import source exceeds its file or byte limit.');
      sources.push({ path: absolute, hash: state.hash, identity: state.identity });
    }
    return state.content;
  };
  const first = (relative: string) => {
    for (const root of roots) {
      const text = read(path.join(root.path, relative));
      if (text !== undefined) return text;
    }
    return undefined;
  };
  const entries = (directory: string, depth = 0): readonly string[] => {
    check(); assertUnlinkedPath(directory);
    if (!fs.existsSync(directory)) return [];
    if (depth > IMPORT_LIMITS.depth) throw new Error('Import definition nesting exceeds its depth limit.');
    const result: string[] = []; const handle = fs.opendirSync(directory);
    try {
      let entry: fs.Dirent | null;
      while ((entry = handle.readSync())) {
        if (result.length >= IMPORT_LIMITS.files) throw new Error('Import directory exceeds its entry limit.');
        result.push(entry.name);
      }
    } finally { handle.closeSync(); }
    check(); return result.sort();
  };
  check();
  return { sources, roots, read, first, entries, check };
}
