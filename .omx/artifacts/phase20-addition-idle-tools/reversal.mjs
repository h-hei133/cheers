import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-idle-tools');
const cases = [
  { name: 'idle-history', file: 'packages/ts-shell/src/workflow/git/operation/intent.ts',
    before: 'if (!capture) return [];\n    const current = this.current();',
    after: 'const current = this.current();\n    if (!capture) return [];',
    test: 'src/workflow/git/operation/intent.test.ts', filter: 'does not acquire',
    failure: /Session history must not be loaded/ },
  { name: 'armed-origin', file: 'packages/ts-shell/src/workflow/git/operation/intent.ts',
    before: " || current.prompt.metadata?.source !== 'git-commit' || current.prompt.metadata.gitCommitId !== capture.id", after: '',
    test: 'src/workflow/git/operation/intent.test.ts', filter: 'authoritative prompt', failure: /AssertionError/ },
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
    assert.equal(result.status, 1); assert.match(output, item.failure);
    receipts.push({ name: item.name, exit: result.status, sourceSha256: createHash('sha256').update(original).digest('hex') });
  } finally { fs.writeFileSync(target, original); assert(fs.readFileSync(target).equals(original)); }
}
fs.writeFileSync(path.join(archive, 'reversal.json'), JSON.stringify({ cases: receipts, restored: true }, null, 2) + '\n');
process.stdout.write(JSON.stringify({ reversed: receipts.length, restored: true }) + '\n');
