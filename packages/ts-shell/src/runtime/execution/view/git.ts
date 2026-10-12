import fs, { promises as fsp } from 'node:fs';
import path from 'node:path';
import { ViewSourceError, ViewSources } from './source.js';
import { readDirectory } from '../directory.js';

const REQUIRED_METADATA_FILES = new Set(['HEAD', 'config', 'config.worktree', 'index', 'commondir']);
export interface GitMetadata { readonly directory: string; readonly common: string }
const repositories = new WeakMap<ViewSources, Map<string, GitMetadata>>();

/** Capture only the selected repository; linked metadata must share its read grant. */
export async function materializeMetadata(sources: ViewSources, directory: string, mode: 'git' | 'search' = 'git'): Promise<GitMetadata | undefined> {
  const marker = path.join(directory, '.git');
  if (!fs.existsSync(marker)) return undefined;
  const target = sources.target(marker);
  const cache = repositories.get(sources) ?? new Map<string, GitMetadata>();
  repositories.set(sources, cache);
  const key = `${mode}:${marker}`;
  if (cache.has(key)) return cache.get(key);
  let metadata = target;
  if (fs.statSync(target).isFile()) {
    await sources.capture(marker);
    const content = await fsp.readFile(sources.destination(marker), 'utf8');
    if (!content.startsWith('gitdir: ')) throw new ViewSourceError();
    metadata = sources.target(path.resolve(directory, content.slice(8).trimEnd()));
  }
  const visited = new Set<string>();
  await captureDirectory(sources, metadata, visited, 0, mode, metadata);
  const common = path.join(metadata, 'commondir');
  let shared = metadata;
  if (fs.existsSync(sources.destination(common))) {
    const content = await fsp.readFile(sources.destination(common), 'utf8');
    shared = sources.target(path.resolve(metadata, content.trimEnd()));
    await captureDirectory(sources, shared, visited, 0, mode, shared);
  }
  if (fs.statSync(target).isDirectory()) await sources.link(marker, target);
  const result = { directory: metadata, common: shared };
  cache.set(key, result);
  return result;
}

async function captureDirectory(sources: ViewSources, directory: string, visited: Set<string>, depth: number, mode: 'git' | 'search', base = directory): Promise<void> {
  const target = sources.target(directory);
  if (visited.has(target)) { await sources.link(directory, target); return; }
  visited.add(target);
  const { root, budget } = sources.input;
  budget.depth(depth); budget.take('directories', 1);
  await fsp.mkdir(sources.destination(target), { recursive: true, mode: 0o700 });
  if (mode === 'search') {
    for (const relative of ['commondir', 'info/exclude']) {
      const file = path.join(target, relative);
      if (fs.existsSync(file)) await sources.capture(file);
    }
    await sources.link(directory, target);
    return;
  }
  const entries = await readDirectory(root, target, { ...sources.input, checkpoint: () => budget.check(),
    onEntry: entry => { budget.take('entries', 1); budget.take('pathBytes', Buffer.byteLength(path.join(target, entry.name))); },
  });
  for (const entry of entries) {
    const file = path.join(target, entry.name);
    const relative = path.relative(base, file).split(path.sep).join('/');
    if (mode === 'git' && entry.isDirectory() && relative !== 'info') {
      // Git validates its metadata layout even for read-only queries. Preserve
      // directory names as empty placeholders without exposing their contents.
      await fsp.mkdir(sources.destination(file), { recursive: true, mode: 0o700 });
      continue;
    }
    if (mode === 'git' && !entry.isDirectory() && !REQUIRED_METADATA_FILES.has(relative)
      && !/^sharedindex\.[a-f0-9]+$/.test(relative) && relative !== 'info/exclude') continue;
    const checked = sources.target(file);
    const stat = fs.statSync(checked);
    if (stat.isDirectory()) await captureDirectory(sources, file, visited, depth + 1, mode, base);
    else if (stat.isFile()) await sources.capture(file);
    else throw new ViewSourceError();
  }
  await sources.link(directory, target);
}

export function repositoryMarker(root: string, directory: string): string | undefined {
  let current = directory;
  for (;;) {
    const marker = path.join(current, '.git');
    if (fs.existsSync(marker)) return marker;
    if (current === root) return undefined;
    const parent = path.dirname(current);
    if (parent === current) throw new ViewSourceError();
    current = parent;
  }
}
