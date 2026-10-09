import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { freezeDeep } from '../../core/values/freeze.js';
import { assertSnapshot, digest, exactFile, snapshotFile, workspaceIdentity } from './source.js';
import type { ScanPlan } from './model.js';

export interface PlanInput { readonly root: string; readonly executable: string; readonly version: string; readonly rules: string; readonly files: readonly string[]; readonly home: string; readonly sourceAccess?: (absolute: string) => void }
export function prepareScan(input: PlanInput): ScanPlan {
  const root = realpathSync(input.root);
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(input.version) || !path.isAbsolute(input.executable)) throw new Error('Select an absolute analyzer executable and exact semantic version.');
  if (!input.files.length || input.files.length > 256) throw new Error('Select between 1 and 256 explicit source files.');
  let executable;
  try { executable = snapshotFile(realpathSync(input.executable), 160 * 1024 * 1024, false).snapshot; }
  catch { throw new Error('Security analyzer is unavailable or exceeds its executable budget.'); }
  const rulesPath = exactFile(root, input.rules); input.sourceAccess?.(rulesPath);
  const rule = snapshotFile(rulesPath, 512 * 1024);
  if (!/^rules\s*:/m.test(rule.text) || /\b(?:include|extends|ruleset|imports?|validators?)\s*:/i.test(rule.text)) throw new Error('Only self-contained local rules are admitted; remote rules and rule imports are refused.');
  const sources = [...new Set(input.files.map(file => exactFile(root, file)))].sort().map(file => {
    input.sourceAccess?.(file); return snapshotFile(file, 512 * 1024, false).snapshot;
  });
  if (sources.reduce((total, source) => total + source.bytes, 0) > 4 * 1024 * 1024) throw new Error('Security source scope exceeds its 4 MiB budget.');
  const env = { PATH: `${path.dirname(executable.path)}:/usr/bin:/bin`, HOME: input.home, USERPROFILE: input.home,
    TMPDIR: input.home, LANG: 'C.UTF-8', OPENGREP_ENABLE_VERSION_CHECK: '0', SEMGREP_ENABLE_VERSION_CHECK: '0' };
  const common = ['scan', '--config', rulesPath, '--disable-version-check', '--quiet', '--no-git-ignore', '--no-rewrite-rule-ids',
    '--disable-nosem', '--x-ignore-semgrepignore-files', '--jobs', '1', '--timeout', '10'];
  const argv = [['--version'], [...common, '--sarif', ...sources.map(source => source.path)], [...common, '--json', ...sources.map(source => source.path)]];
  const selection = { root, rootIdentity: workspaceIdentity(root), executable, version: input.version, rules: rule.snapshot, sources,
    sourceDigest: digest(JSON.stringify(sources.map(source => [source.path, source.digest]))), env, argv };
  return freezeDeep({ ...selection, id: randomUUID(), fingerprint: digest(JSON.stringify(selection)) });
}
export function recheckPlan(plan: ScanPlan, sourceAccess?: (absolute: string) => void): void {
  if (workspaceIdentity(plan.root) !== plan.rootIdentity || realpathSync(plan.root) !== plan.root) throw new Error('Security workspace changed after preparation.');
  assertSnapshot(plan.executable, 160 * 1024 * 1024);
  for (const source of [plan.rules, ...plan.sources]) { exactFile(plan.root, source.path); sourceAccess?.(source.path); assertSnapshot(source, 512 * 1024); }
  const expected = prepareScan({ root: plan.root, executable: plan.executable.path, version: plan.version, rules: plan.rules.path,
    files: plan.sources.map(source => source.path), home: plan.env.HOME!, sourceAccess });
  if (expected.fingerprint !== plan.fingerprint || JSON.stringify(expected.env) !== JSON.stringify(plan.env)
    || JSON.stringify(expected.argv) !== JSON.stringify(plan.argv)) throw new Error('Security manifest changed or is unsupported.');
}
export function reprepareScan(plan: ScanPlan, sourceAccess?: (absolute: string) => void): ScanPlan {
  const refreshed = prepareScan({ root: plan.root, executable: plan.executable.path, version: plan.version, rules: plan.rules.path,
    files: plan.sources.map(source => source.path), home: plan.env.HOME!, sourceAccess });
  if (refreshed.rules.digest !== plan.rules.digest || refreshed.executable.digest !== plan.executable.digest) throw new Error('Verification requires the original rule bytes and analyzer version/executable.');
  return refreshed;
}
export function planPreview(plan: ScanPlan): string {
  return [`Security scan plan ${plan.id}`, `Fingerprint: ${plan.fingerprint}`, `Analyzer: ${JSON.stringify(plan.executable.path)} (${plan.version}) SHA-256 ${plan.executable.digest}`,
    `Rules: ${JSON.stringify(plan.rules.path)} SHA-256 ${plan.rules.digest}`, `Workspace: ${JSON.stringify(plan.root)} (${plan.rootIdentity})`,
    `Environment: ${JSON.stringify(plan.env)}`, ...plan.argv.map(args => `Literal arguments: ${JSON.stringify(args)}`),
    ...plan.sources.map(source => `Source grant: ${JSON.stringify(source.path)} SHA-256 ${source.digest}`),
    'Native executable code has OS process permissions; these file grants do not establish a kernel sandbox.',
    'No execution has run. Scanning requires separate ordinary execution approval. Zero findings do not prove the repository secure.'].join('\n');
}
