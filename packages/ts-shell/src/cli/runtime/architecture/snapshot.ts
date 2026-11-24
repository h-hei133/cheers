import { lstatSync, opendirSync, promises as fs, readlinkSync, realpathSync, statSync, type Dirent } from 'node:fs';
import path from 'node:path';
import { parseConfigText } from '../../../config/syntax.js';
import { snapshotRoot } from '../../../edit/recovery/root.js';
import { readDirectory } from '../../../runtime/execution/directory.js';
import { readRevision } from '../../../runtime/execution/read.js';
import { readBinarySnapshot } from '../../../runtime/execution/snapshot.js';
import type { CapturedReadSource } from '../../../runtime/execution/types.js';
import { WalkBudget } from '../../../runtime/execution/walk/budget.js';

const PRUNED = new Set(['.git', '.hg', '.svn', 'node_modules', 'dist', 'build', 'out', 'target', 'coverage',
  '.next', '.nuxt', '.venv', 'venv', '__pycache__', '.normproof', '.idea', '.vscode', '.cache', 'vendor']);
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ENTRIES = 4096;
const MAX_PATH_BYTES = 1024 * 1024;
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const DISCOVERY_FILES = new Set(['package.json', 'pnpm-workspace.yaml']);

/** A complete bounded copy of the declared source inputs, with a reusable freshness check. */
export async function captureArchitectureSource(root: string, stage: string, access: (file: string) => void,
  signal?: AbortSignal): Promise<() => void> {
  const budget = new WalkBudget(signal, { entries: MAX_ENTRIES, pathBytes: MAX_PATH_BYTES, directories: 512, depth: 32, timeoutMs: 15_000 });
  const recoveryParent = path.dirname(snapshotRoot(root));
  const omitted = (entry: Dirent, directory: string) => entry.isDirectory()
    && (PRUNED.has(entry.name) || path.join(directory, entry.name) === recoveryParent);
  const sources = new Map<string, CapturedReadSource>();
  const directories = new Map<string, readonly string[]>();
  const files = new Set<string>();
  const links = new Map<string, string>();
  let bytes = 0;
  const record = (source: CapturedReadSource) => { sources.set(source.path, source); };
  const verify = () => {
    signal?.throwIfAborted();
    for (const source of sources.values()) {
      access(source.path);
      const current = lstatSync(source.path, { bigint: true });
      if (current.isSymbolicLink() || realpathSync(source.path) !== source.target) throw changedSource();
      const revision = readRevision(current);
      if (revision === source.revision) continue;
      const listing = directories.get(source.path);
      if (!listing || !current.isDirectory() || !source.revision.startsWith(`${current.dev}:${current.ino}:`)
        || !sameListing(source.path, revision, listing, omitted, signal)) throw changedSource();
    }
    for (const [link, revision] of links) {
      access(link);
      if (linkRevision(link) !== revision) throw changedSource();
    }
  };
  const capture = async (file: string): Promise<Buffer> => {
    budget.check();
    const contents = await readBinarySnapshot({ absolutePath: file, workspaceRoot: root, assertFileAccess: access,
      abortSignal: signal, onCapturedSource: record }, Math.min(MAX_FILE_BYTES, MAX_BYTES - bytes));
    bytes += contents.byteLength;
    await fs.writeFile(path.join(stage, path.relative(root, file)), contents, { flag: 'wx', mode: 0o600 });
    return contents;
  };
  const copy = async (directory: string, depth: number): Promise<void> => {
    budget.depth(depth);
    budget.take('directories', 1);
    const destination = path.join(stage, path.relative(root, directory));
    await fs.mkdir(destination, { recursive: true, mode: 0o700 });
    const entries = (await readDirectory(root, directory, { assertFileAccess: access, abortSignal: signal,
      checkpoint: () => budget.check(), onCapturedSource: record,
      onEntry: entry => { budget.take('entries', 1); budget.take('pathBytes', Buffer.byteLength(entry.name)); } }))
      .filter(entry => !omitted(entry, directory));
    directories.set(directory, entries.map(listingEntry).sort());
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await copy(file, depth + 1);
      else if (entry.isFile()) {
        const relative = path.relative(root, file);
        if (SOURCE_EXTENSION.test(entry.name) || DISCOVERY_FILES.has(entry.name) || relative === 'AGENTS.md'
          || relative === path.join('.specify', 'memory', 'constitution.md')) await capture(file);
        else files.add(file);
      } else if (entry.isSymbolicLink()) {
        if (PRUNED.has(entry.name)) continue;
        const relative = path.relative(root, file);
        if (SOURCE_EXTENSION.test(entry.name) || DISCOVERY_FILES.has(entry.name) || relative === 'tsconfig.json'
          || relative === 'AGENTS.md' || relative === path.join('.specify', 'memory', 'constitution.md')) {
          throw new Error('An architecture input is a symbolic link. Resolve the input before initializing.');
        }
        access(file);
        links.set(file, linkRevision(file));
      } else {
        throw new Error('Architecture initialization found a source entry that cannot be captured.');
      }
    }
  };
  await copy(root, 0);
  const configs = new Set<string>();
  let config = path.join(root, 'tsconfig.json');
  while (files.has(config) && !configs.has(config) && configs.size <= 16) {
    configs.add(config);
    const { extends: parent } = parseConfigText((await capture(config)).toString('utf8'));
    if (typeof parent !== 'string' || !parent.startsWith('.') || parent.includes('\\')) break;
    config = path.resolve(path.dirname(config), parent.endsWith('.json') ? parent : `${parent}.json`);
  }
  for (const link of links.keys()) {
    // Inspect metadata only. Directory and unresolved links can hide source inputs.
    if (link === config || statSync(link).isDirectory()) {
      throw new Error('An architecture source path is a symbolic link. Resolve the input before initializing.');
    }
  }
  // Discovery counts filenames by extension, so preserve those entries without copying their contents.
  for (const file of files) {
    budget.check();
    if (!configs.has(file)) await fs.writeFile(path.join(stage, path.relative(root, file)), '', { flag: 'wx', mode: 0o600 });
  }
  verify();
  return verify;
}

function listingEntry(entry: Dirent): string {
  return `${entry.isDirectory() ? 'd' : entry.isFile() ? 'f' : entry.isSymbolicLink() ? 'l' : 'o'}:${entry.name}`;
}

function linkRevision(file: string): string {
  const link = lstatSync(file, { bigint: true });
  if (!link.isSymbolicLink()) throw changedSource();
  const target = readlinkSync(file);
  try {
    const resolved = realpathSync(file);
    return `${readRevision(link)}:${target}:${resolved}:${readRevision(statSync(resolved, { bigint: true }))}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return `${readRevision(link)}:${target}:missing`;
  }
}

function sameListing(directory: string, revision: string, expected: readonly string[],
  omitted: (entry: Dirent, directory: string) => boolean, signal?: AbortSignal): boolean {
  const cursor = opendirSync(directory, { bufferSize: 32 });
  try {
    const current: string[] = [];
    let count = 0;
    let nameBytes = 0;
    for (let entry = cursor.readSync(); entry; entry = cursor.readSync()) {
      signal?.throwIfAborted();
      nameBytes += Buffer.byteLength(entry.name);
      if (++count > MAX_ENTRIES || nameBytes > MAX_PATH_BYTES) return false;
      if (!omitted(entry, directory)) current.push(listingEntry(entry));
    }
    return current.length === expected.length && current.sort().every((entry, index) => entry === expected[index])
      && readRevision(lstatSync(directory, { bigint: true })) === revision;
  } finally { cursor.closeSync(); }
}

function changedSource(): Error {
  return new Error('Workspace changed since the architecture preview. Generate a new preview.');
}
