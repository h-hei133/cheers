import fs from 'node:fs';
import path from 'node:path';
import which from 'which';
import { createHash } from 'node:crypto';
import { inspectWorkspaceFile, matchesFileState, ensureWorkspaceDirectory, type FileState } from '../../edit/authority/state.js';
import { pathIdentity } from '../../core/workspace/files.js';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import { decodeEvaluationSpec } from './manifest.js';
import type { Asset, Evaluation, FrozenEvaluation } from './model.js';

export function assetVersion(name: string, state: FileState): Asset {
  if (state.state !== 'exists') throw new Error('Evaluation inputs must be existing UTF-8 files.');
  return { path: name, state: 'exists', hash: state.hash, mode: state.mode & 0o777, identity: state.identity };
}
export function executableVersion(target: string): string {
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.size > 128 * 1024 * 1024 || fs.realpathSync(target) !== target) throw new Error('Evaluation runtime is unavailable or redirected.');
  return `${stat.dev}:${stat.ino}:${stat.mode}:${stat.size}:${stat.mtimeMs}:${createHash('sha256').update(fs.readFileSync(target)).digest('hex')}`;
}
export function captureEvaluation(root: string, manifest: string, access?: (absolute: string) => void) {
  const input = inspectWorkspaceFile(root, manifest, access, 65536);
  if (input.state !== 'exists') throw new Error('Evaluation manifest is missing.');
  const spec = decodeEvaluationSpec(JSON.parse(input.content));
  if ([...spec.evaluator, ...spec.editable, ...spec.context].includes(manifest)) throw new Error('The manifest must be outside the candidate and evaluator files.');
  let bytes = 0;
  const files = [...spec.evaluator, ...spec.editable, ...spec.context].map(name => {
    const state = inspectWorkspaceFile(root, name, access, 1024 * 1024);
    if (state.state !== 'exists') throw new Error('Evaluation input is missing.');
    bytes += Buffer.byteLength(state.content); if (bytes > 8 * 1024 * 1024) throw new Error('Evaluation inputs exceed 8 MiB.');
    return { name, state };
  });
  const executable = fs.realpathSync(which.sync(spec.runtime));
  const frozen: FrozenEvaluation = { spec, manifest: assetVersion(manifest, input), sources: files.map(file => assetVersion(file.name, file.state)),
    executable: { path: executable, version: executableVersion(executable) } };
  return { frozen, files };
}
export function assertSources(row: Evaluation, access?: (absolute: string) => void): void {
  checkSources(row, [row.frozen.manifest, ...row.frozen.sources], access);
}
export function assertFixedSources(row: Evaluation, access?: (absolute: string) => void): void {
  checkSources(row, [row.frozen.manifest, ...row.frozen.sources.filter(file => !row.frozen.spec.editable.includes(file.path))], access);
}
function checkSources(row: Evaluation, sources: readonly Asset[], access?: (absolute: string) => void): void {
  for (const file of sources) {
    if (!matchesFileState(inspectWorkspaceFile(row.scope.workspace.path, file.path, access, 1024 * 1024), file))
      throw new Error('Frozen source, evaluator or samples changed. Start a new baseline; original files were retained.');
  }
  if (executableVersion(row.frozen.executable.path) !== row.frozen.executable.version) throw new Error('Evaluation runtime changed; comparison refused.');
}
export function seedEvaluation(directory: string, captured: ReturnType<typeof captureEvaluation>) {
  pathIdentity(path.dirname(directory)); fs.mkdirSync(directory, { mode: 0o700 });
  for (const section of ['baseline', 'candidate', 'evaluator'] as const) {
    fs.mkdirSync(path.join(directory, section), { mode: 0o700 });
    const names = section === 'evaluator' ? captured.frozen.spec.evaluator : [...captured.frozen.spec.editable, ...captured.frozen.spec.context];
    for (const name of names) {
      const file = captured.files.find(file => file.name === name)!;
      ensureWorkspaceDirectory(directory, path.posix.dirname(`${section}/${name}`));
      fs.writeFileSync(path.join(directory, section, name), file.state.content, { flag: 'wx', mode: file.state.mode & 0o777 });
      fs.chmodSync(path.join(directory, section, name), file.state.mode & 0o777);
    }
  }
  const root = captureWorkspaceRoot(directory, directory, 'read'); return { path: root.path, identity: evaluationDirectoryIdentity(root.path) };
}
function evaluationDirectoryIdentity(directory: string): string {
  return ['baseline', 'candidate', 'evaluator'].map(section => pathIdentity(path.join(directory, section))).join('\n');
}
function exactFiles(root: string, names: readonly string[]): void {
  const expected = new Set(names); const parents = new Set(names.flatMap(name => name.split('/').slice(0, -1).map((_, i) => name.split('/').slice(0, i + 1).join('/'))));
  const walk = (relative: string): void => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory() && parents.has(name)) walk(name);
      else if (!entry.isFile() || !expected.delete(name)) throw new Error('Evaluation directory contains an unexpected path.');
    }
  };
  walk(''); if (expected.size) throw new Error('Evaluation files are missing.');
}
export function evaluationFiles(row: Evaluation, section: 'baseline' | 'candidate' | 'evaluator') {
  if (!row.directory || evaluationDirectoryIdentity(row.directory.path) !== row.directory.identity) throw new Error('Owned evaluation directory changed or is unavailable.');
  const names = section === 'evaluator' ? row.frozen.spec.evaluator : [...row.frozen.spec.editable, ...row.frozen.spec.context];
  const root = path.join(row.directory.path, section); exactFiles(root, names);
  return names.map(name => {
    const state = inspectWorkspaceFile(root, name, undefined, 1024 * 1024);
    const before = row.frozen.sources.find(file => file.path === name)!;
    if (state.state !== 'exists' || (state.mode & 0o777) !== before.mode || ((section !== 'candidate' || !row.frozen.spec.editable.includes(name)) && state.hash !== before.hash))
      throw new Error('Immutable evaluator, baseline or context changed. Comparison refused.');
    return { name, state, root };
  });
}
export function evaluationDigest(row: Evaluation, section: 'baseline' | 'candidate'): string {
  evaluationFiles(row, 'evaluator'); evaluationFiles(row, 'baseline');
  const files = evaluationFiles(row, section);
  return createHash('sha256').update(JSON.stringify(files.map(file => [file.name, file.state.hash, file.state.mode & 0o777]))).digest('hex');
}
