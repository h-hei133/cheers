import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd();
const archive = path.join(root, '.omx/artifacts/phase20-addition-resume-removal');
const actions = 'packages/ts-shell/src/cli/interactive/picker/session/actions.ts';
const catalog = 'packages/ts-shell/src/session/store/catalog/index.ts';
const cases = [
  { name: 'delete-hint', file: 'packages/ts-shell/src/cli/interactive/overlay.ts', before: '"Del delete"', after: '"^D delete"',
    test: 'src/cli/interactive/overlay.test.ts', filter: 'cancels loads and ignores a stale reload' },
  { name: 'retire-source', file: actions, before: 'browser.forget(summary);', after: 'browser.close();',
    test: 'src/cli/interactive/picker/session/lifetime.test.ts', filter: 'deletes through the actual overlay' },
  { name: 'page-object', file: actions, before: 'browser.lifetime === lifetime', after: 'browser.active() === projection',
    test: 'src/cli/interactive/picker/session/lifetime.test.ts', filter: 'binds a pending deletion' },
  { name: 'detached-query', file: catalog,
    before: "if (state.mutationRevision !== mutationRevision) throw new Error('Session browse changed. Reload its current page.');",
    after: '', test: 'src/session/store/catalog/browse.test.ts', filter: 'invalidates a detached query' },
];
const receipts = [];
for (const item of cases) {
  const target = path.join(root, item.file), original = fs.readFileSync(target);
  const source = original.toString();
  assert.equal(source.split(item.before).length, 2, 'unique replacement');
  try {
    fs.writeFileSync(target, source.replace(item.before, item.after));
    const result = spawnSync('rtk', ['env', 'NODE_OPTIONS=--max-old-space-size=1536',
      'VITEST_MAX_THREADS=1', 'VITEST_MIN_THREADS=1', 'npm', 'run', 'test', '-w', 'packages/ts-shell',
      '--', item.test, '-t', item.filter], { cwd: root, encoding: 'utf8', timeout: 45000, maxBuffer: 512 * 1024 });
    const output = result.stdout + result.stderr;
    fs.writeFileSync(path.join(archive, item.name + '.log'), output);
    assert.equal(result.status, 1, 'reversal must fail tests');
    assert.match(output, /AssertionError/);
    receipts.push({ name: item.name, exit: result.status, sourceSha256: createHash('sha256').update(original).digest('hex') });
  } finally {
    fs.writeFileSync(target, original);
    assert(fs.readFileSync(target).equals(original), 'restore exact bytes');
  }
}
fs.writeFileSync(path.join(archive, 'reversal.json'), JSON.stringify({ cases: receipts, restored: true }, null, 2) + '\n');
process.stdout.write(JSON.stringify({ reversed: receipts.length, restored: true }) + '\n');
