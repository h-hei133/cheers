import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-catalog-ownership');
const cases = [
  { name: 'silent-failure', file: 'packages/ts-shell/src/core/models/catalogStore.ts',
    before: 'diagnostics: [...cached.diagnostics, ...user.diagnostics]', after: 'diagnostics: []',
    test: 'src/core/models/catalogStore.test.ts', filter: 'degrades malformed catalogue input' },
  { name: 'duplicate-owner', file: 'packages/ts-shell/src/core/models/catalogStore.ts',
    before: 'return count > 1;', after: 'return false;',
    test: 'src/core/models/catalogStore.test.ts', filter: 'warns about repeated top-level' },
  { name: 'notice-refresh', file: 'packages/ts-shell/src/cli/interactive/picker/model/publication.ts',
    before: ' && sameValue(publication.catalogDiagnostics ?? [], snapshot.diagnostics)', after: '',
    test: 'src/cli/interactive/picker/model.test.ts', filter: 'refreshes a corrected catalogue notice' },
  { name: 'file-owner', file: 'packages/ts-shell/src/cli/interactive/picker/settings.ts',
    before: 'note: neutraliseForDisplay(draft.file)', after: 'note: `${draft.scope} file`',
    test: 'src/cli/interactive/picker/settings.test.ts', filter: 'save file and keeps the model catalogue separate' },
];
const receipts = [];
for (const item of cases) {
  const target = path.join(root, item.file), original = fs.readFileSync(target);
  assert.equal(original.toString().split(item.before).length, 2);
  try {
    fs.writeFileSync(target, original.toString().replace(item.before, item.after));
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
