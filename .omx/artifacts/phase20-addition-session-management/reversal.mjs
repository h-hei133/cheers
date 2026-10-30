import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-session-management');
const lifecycle = 'packages/ts-shell/src/session/lifecycle/management.ts';
const store = 'packages/ts-shell/src/session/store/management.ts';
const prior = spawnSync('rtk', ['proxy', 'git', 'show', 'db36da4432916d9465f9d085ebef3e9a574ae878:' + lifecycle], { cwd: root });
assert.equal(prior.status, 0);
const cases = [
  { name: 'picker-read', file: 'packages/ts-shell/src/cli/interactive/picker/session/actions.ts',
    before: "action === 'delete' || action === 'rename' ? browser.active()?.summaries.get(id) : options.sessionManager.getSession(id)",
    after: 'options.sessionManager.getSession(id)',
    test: 'src/session/lifecycle/management.test.ts', filter: 'cached picker mutation at the native writer boundary' },
  { name: 'full-record', file: lifecycle, replace: () => prior.stdout,
    test: 'src/session/lifecycle/management.test.ts', filter: 'without synchronously acquiring conversation' },
  { name: 'source-version', file: store,
    before: "if (readSessionFileVersion(layout) !== version) throw new Error('The saved session changed while reading management state.');", after: '',
    test: 'src/session/store/management.test.ts', filter: 'replacement during the metadata/state read' },
  { name: 'project-agreement', file: store,
    before: '!projectRoot || metadataRoot && stateRoot && metadataRoot !== stateRoot', after: '!projectRoot',
    test: 'src/session/store/management.test.ts', filter: 'root-mismatch' },
];
const receipts = [];
for (const item of cases) {
  const target = path.join(root, item.file), original = fs.readFileSync(target);
  if (item.before) assert.equal(original.toString().split(item.before).length, 2);
  try {
    fs.writeFileSync(target, item.replace ? item.replace() : original.toString().replace(item.before, item.after));
    const result = spawnSync('rtk', ['env', 'NODE_OPTIONS=--max-old-space-size=1536', 'VITEST_MAX_THREADS=1', 'VITEST_MIN_THREADS=1',
      'npm', 'run', 'test', '-w', 'packages/ts-shell', '--', item.test, '-t', item.filter],
      { cwd: root, encoding: 'utf8', timeout: 45000, maxBuffer: 512 * 1024 });
    const output = (result.stdout + result.stderr).replace(/[ \t]+$/gm, '');
    fs.writeFileSync(path.join(archive, item.name + '.log'), output);
    assert.equal(result.status, 1); assert.match(output, /AssertionError/);
    receipts.push({ name: item.name, exit: result.status, sourceSha256: createHash('sha256').update(original).digest('hex') });
  } finally { fs.writeFileSync(target, original); assert(fs.readFileSync(target).equals(original)); }
}
fs.writeFileSync(path.join(archive, 'reversal.json'), JSON.stringify({ cases: receipts, restored: true }, null, 2) + '\n');
process.stdout.write(JSON.stringify({ reversed: receipts.length, restored: true }) + '\n');
