import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-paste-retention');
const file = path.join(root, 'packages/ts-shell/src/presentation/tui/pastes.ts');
const original = fs.readFileSync(file), source = original.toString();
const start = source.indexOf('    while (this.issued.size > MAX_ISSUED) {');
const end = source.indexOf('\n  }\n}', start);
assert(start > 0 && end > start);
const eviction = source.slice(start, end);
const cases = [
  { name: 'fifo-signatures', file: 'src/presentation/tui/editor/draftStash.test.ts', filter: 'signed .* token|both payload types',
    before: eviction, after: '    while (this.issued.size > MAX_ISSUED) this.issued.delete(this.issued.keys().next().value!);' },
  { name: 'unbounded-signatures', file: 'src/presentation/tui/pastes.test.ts', filter: 'finite signature bound', before: eviction, after: '' },
  { name: 'forged-label', file: 'src/presentation/tui/pastes.test.ts', filter: 'keeps live signatures',
    before: 'if (!this.issued.get(id)?.has(whole)) return whole;', after: 'if (!this.issued.has(id)) return whole;' },
];
const receipts = [];
for (const item of cases) {
  try {
    assert.equal(source.split(item.before).length, 2);
    fs.writeFileSync(file, source.replace(item.before, item.after));
    const result = spawnSync('rtk', ['env', 'NODE_OPTIONS=--max-old-space-size=2048', 'VITEST_MAX_THREADS=1', 'VITEST_MIN_THREADS=1',
      './node_modules/.bin/vitest', 'run', item.file, '-t', item.filter],
      { cwd: path.join(root, 'packages/ts-shell'), encoding: 'utf8', timeout: 45000, maxBuffer: 512 * 1024 });
    const output = result.stdout + result.stderr; fs.writeFileSync(path.join(archive, item.name + '.log'), output);
    assert.equal(result.status, 1); assert.match(output, /AssertionError/);
    receipts.push({ name: item.name, exit: result.status, tests: /Tests\s+([^\n]+)/.exec(output)?.[1] });
  } finally { fs.writeFileSync(file, original); assert(fs.readFileSync(file).equals(original)); }
}
const sha256 = createHash('sha256').update(original).digest('hex');
fs.writeFileSync(path.join(archive, 'reversal.json'), JSON.stringify({ cases: receipts, sourceSha256: sha256,
  restoredSha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'), restored: true }, null, 2) + '\n');
console.log(JSON.stringify({ reversed: receipts.length, restored: true }));
