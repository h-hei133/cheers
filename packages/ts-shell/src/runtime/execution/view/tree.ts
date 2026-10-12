import fs, { promises as fsp } from 'node:fs';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { readDirectory } from '../directory.js';
import { addIgnoreContent } from '../ignore/syntax.js';
import { PRUNED_DIRECTORIES } from '../walk/policy.js';
import { ViewSources } from './source.js';
import { materializeMetadata } from './git.js';

export interface ViewSelection {
  readonly native: 'git' | 'search';
  readonly directory?: string;
  readonly recursive?: boolean;
  readonly tracked?: readonly string[];
  readonly preserveIgnored?: boolean;
  readonly ignoreCase?: boolean;
  readonly excludesFile?: string;
}

interface Rules { readonly layers: readonly Ignore[]; readonly repository: boolean }
const RULE_FILES = ['.gitignore', '.ignore', '.rgignore'];

function entries(sources: ViewSources, directory: string, depth: number) {
  const { root, budget } = sources.input;
  budget.depth(depth); budget.take('directories', 1);
  return readDirectory(root, directory, { ...sources.input, checkpoint: () => budget.check(),
    onEntry: entry => { budget.take('entries', 1); budget.take('pathBytes', Buffer.byteLength(path.join(directory, entry.name))); },
  });
}

async function directoryRules(sources: ViewSources, directory: string, inherited: Rules, selection: ViewSelection): Promise<Rules> {
  const { native } = selection;
  const metadata = await materializeMetadata(sources, directory, native);
  const boundary = !!metadata;
  const repository = boundary || inherited.repository;
  const layers = inherited.layers.map((layer, index) => {
    const matcher = ignore({ ignorecase: selection.ignoreCase ?? false });
    return boundary && index === 0 ? matcher : matcher.add(layer);
  });
  const relative = path.relative(sources.input.root, directory).split(path.sep).join('/');
  if (metadata) {
    for (const file of [selection.excludesFile, path.join(metadata.common, 'info', 'exclude')]) {
      if (!file || !fs.existsSync(sources.destination(file))) continue;
      const bytes = await fsp.readFile(sources.destination(file));
      sources.input.budget.take('ignoreBytes', bytes.length);
      addIgnoreContent(layers[0]!, bytes.toString('utf8'), relative ? `${relative}/` : '', sources.input.budget);
    }
  }
  for (let index = 0; index < (native === 'git' ? 1 : RULE_FILES.length); index++) {
    const file = path.join(directory, RULE_FILES[index]!);
    if (!fs.existsSync(file)) continue;
    let target: string;
    try { target = sources.target(file); }
    catch { sources.input.budget.check(); continue; }
    const size = fs.statSync(target).size;
    sources.input.budget.take('ignoreBytes', size);
    await sources.capture(file, size);
    // Git ignores symlinked ignore files. Keep their type instead of treating
    // the target as an ordinary rules file during pruning.
    if (fs.lstatSync(file).isSymbolicLink() || index === 0 && !repository) continue;
    const bytes = await fsp.readFile(sources.destination(file));
    addIgnoreContent(layers[index]!, bytes.toString('utf8'), relative ? `${relative}/` : '', sources.input.budget);
  }
  return { layers, repository };
}

function ignored(rules: Rules, relative: string): boolean {
  // Search-specific files override ordinary ignore files at every depth.
  for (let index = rules.layers.length - 1; index >= 0; index--) {
    const match = rules.layers[index]!.test(relative);
    if (match.ignored || match.unignored) return match.ignored;
  }
  return false;
}

/** Only names and admitted metadata are visible; native tools decide the result. */
export async function materializeView(sources: ViewSources, selection: ViewSelection): Promise<void> {
  const { root, budget } = sources.input;
  const selected = sources.target(selection.directory ?? root);
  const pruned: readonly string[] = sources.input.pruneDirectories ?? PRUNED_DIRECTORIES;
  const trackedParents = new Set<string>();
  for (const file of selection.tracked ?? []) {
    for (let parent = path.dirname(file); parent !== '.' && parent !== path.dirname(parent); parent = path.dirname(parent)) trackedParents.add(parent);
  }
  let inherited: Rules = { layers: RULE_FILES.map(() => ignore({ ignorecase: selection.ignoreCase ?? false })), repository: false };
  const ancestors: string[] = [];
  for (let current = path.dirname(selected); selected !== root && current !== path.dirname(root); current = path.dirname(current)) ancestors.unshift(current);
  for (const directory of ancestors) {
    await fsp.mkdir(sources.destination(directory), { recursive: true, mode: 0o700 });
    inherited = await directoryRules(sources, directory, inherited, selection);
  }
  async function visit(directory: string, depth: number, rules: Rules): Promise<void> {
    await fsp.mkdir(sources.destination(directory), { recursive: true, mode: 0o700 });
    rules = await directoryRules(sources, directory, rules, selection);
    for (const entry of await entries(sources, directory, depth)) {
      budget.check();
      if (entry.name === '.git' || pruned.includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (file === sources.mirror) continue;
      let target: string;
      try { target = sources.target(file); }
      catch { budget.check(); continue; }
      const relative = path.relative(root, file).split(path.sep).join('/');
      const destination = sources.destination(file);
      if (entry.isDirectory()) {
        await fsp.mkdir(destination, { recursive: true, mode: 0o700 });
        if (selection.recursive === false || !selection.preserveIgnored && !trackedParents.has(relative) && ignored(rules, `${relative}/`)) continue;
        await visit(target, depth + 1, rules);
      } else if (entry.isFile() && !fs.existsSync(destination)) {
        await fsp.writeFile(destination, '', { mode: 0o600, flag: 'wx' });
      } else if (entry.isSymbolicLink() && !fs.existsSync(destination)) {
        // Preserve native no-follow enumeration. Explicit search targets are
        // canonicalized by the caller before selection.
        await sources.link(file, target);
      }
    }
  }
  if (fs.statSync(selected).isDirectory()) await visit(selected, 0, inherited);
  else if (!fs.existsSync(sources.destination(selected))) await fsp.writeFile(sources.destination(selected), '', { mode: 0o600, flag: 'wx' });
}
