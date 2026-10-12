import fs, { promises as fsp } from 'node:fs';
import path from 'node:path';
import { ViewSourceError, ViewSources } from './source.js';
import { materializeMetadata, repositoryMarker, type GitMetadata } from './git.js';
import { conditionApplies } from './condition.js';

type Query = (args: readonly string[], detached?: boolean) => Promise<string | null>;

function configRecords(output: string): { origin: string; key: string; value: string }[] {
  const fields = output.split('\0');
  if (fields.pop() !== '' || fields.length % 2) throw new ViewSourceError();
  const records: { origin: string; key: string; value: string }[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const field = fields[index + 1]!;
    const newline = field.indexOf('\n');
    records.push({ origin: fields[index]!, key: newline === -1 ? field : field.slice(0, newline),
      value: newline === -1 ? '' : field.slice(newline + 1) });
  }
  return records;
}

async function admitConfiguration(sources: ViewSources, metadata: GitMetadata, query: Query): Promise<void> {
  const pending = [path.join(metadata.common, 'config'), path.join(metadata.directory, 'config.worktree')];
  const inspected = new Set<string>();
  for (let index = 0; index < pending.length; index++) {
    const file = pending[index]!;
    if (inspected.has(file)) continue;
    inspected.add(file);
    if (inspected.size > 4096) throw new ViewSourceError();
    await sources.capture(file);
    if (!fs.existsSync(sources.destination(file))) continue;
    // No repository discovery, global config, or include evaluation can run
    // before each dependency is admitted. The cwd is an empty sandbox root.
    const output = await query(['config', '--no-includes', '--file', file, '--show-origin', '--null', '--list'], true);
    if (output === null) throw new ViewSourceError();
    for (const record of configRecords(output)) {
      if (record.key === 'core.worktree') {
        if (record.value.startsWith('~')) throw new ViewSourceError();
        sources.target(path.resolve(metadata.directory, record.value));
      }
      const condition = /^includeif\.(.+)\.path$/.exec(record.key)?.[1];
      if (record.key !== 'include.path' && condition === undefined) continue;
      if (condition !== undefined && !await conditionApplies(sources, metadata, file, condition, query)) continue;
      if (!record.origin.startsWith('file:') || record.value.startsWith('~')) throw new ViewSourceError();
      const origin = record.origin.slice(5);
      const included = path.resolve(path.dirname(origin), record.value);
      sources.target(included);
      pending.push(included);
    }
  }
}

/** Native Git keeps config precedence; all source dependencies are admitted first. */
export async function configureGitView(sources: ViewSources, directory: string, query: Query): Promise<{ ignoreCase: boolean; excludesFile?: string } | null> {
  const marker = repositoryMarker(sources.input.root, directory);
  if (!marker) return null;
  const metadata = await materializeMetadata(sources, path.dirname(marker));
  if (!metadata) throw new ViewSourceError();
  await admitConfiguration(sources, metadata, query);
  await fsp.mkdir(sources.destination(directory), { recursive: true, mode: 0o700 });
  for (const args of [['rev-parse', '--absolute-git-dir'], ['rev-parse', '--path-format=absolute', '--git-common-dir'], ['rev-parse', '--show-toplevel']]) {
    const output = await query(args);
    // A malformed or placeholder `.git` entry is the same "no repository"
    // answer Git would give outside a work tree. Let the caller use the
    // in-process matcher; execution uncertainty still throws from runGitOutput.
    if (!output) return null;
    sources.target(output.replace(/\n$/, ''));
  }
  const output = await query(['config', '--includes', '--show-origin', '--null', '--list']);
  if (output === null) throw new ViewSourceError();
  let excludes: string | undefined;
  for (const record of configRecords(output)) if (record.key === 'core.excludesfile') excludes = record.value;
  let excludesFile: string | undefined;
  if (excludes) {
    if (excludes.startsWith('~')) throw new ViewSourceError();
    excludesFile = path.resolve(directory, excludes);
    await sources.capture(excludesFile);
  }
  const ignoreCase = await query(['config', '--includes', '--bool', '--get', 'core.ignorecase']);
  return { ignoreCase: ignoreCase?.trim() === 'true', excludesFile };
}
