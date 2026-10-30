import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-image-back');
const cases = [
  { name: 'sync-text-only', file: 'source.ts', occurrence: 0, test: 'src/cli/interactive/picker/rewind/source.test.ts', filter: 'real image question|ambiguous image question',
    before: 'if (messageHasContent(turn.content))', after: 'if (prompt.trim())' },
  { name: 'async-text-only', file: 'source.ts', occurrence: 1, test: 'src/cli/interactive/picker/rewind/source.test.ts', filter: 'real image question|ambiguous image question',
    before: 'if (messageHasContent(turn.content))', after: 'if (prompt.trim())' },
  { name: 'blank-image-label', file: '../rewind.ts', occurrence: 0, test: 'src/cli/interactive/picker/rewind.test.ts', filter: 'image-only question visibly',
    before: "return 'Image message';", after: "return '';" },
];
const receipts = [];
for (const item of cases) {
  const file = path.join(root, 'packages/ts-shell/src/cli/interactive/picker/rewind', item.file), original = fs.readFileSync(file);
  try {
    let occurrence = -1;
    const replaced = original.toString().replaceAll(item.before, matched => ++occurrence === item.occurrence ? item.after : matched);
    assert(occurrence >= item.occurrence); assert.notEqual(replaced, original.toString()); fs.writeFileSync(file, replaced);
    const result = spawnSync('rtk', ['env', 'NODE_OPTIONS=--max-old-space-size=2048', 'VITEST_MAX_THREADS=1', 'VITEST_MIN_THREADS=1',
      './node_modules/.bin/vitest', 'run', item.test, '-t', item.filter],
      { cwd: path.join(root, 'packages/ts-shell'), encoding: 'utf8', timeout: 45000, maxBuffer: 512 * 1024 });
    const output = result.stdout + result.stderr; fs.writeFileSync(path.join(archive, item.name + '.log'), output);
    assert.equal(result.status, 1); assert.match(output, /AssertionError/);
    receipts.push({ name: item.name, exit: result.status, tests: /Tests\s+([^\n]+)/.exec(output)?.[1],
      originalSha256: createHash('sha256').update(original).digest('hex') });
  } finally { fs.writeFileSync(file, original); assert(fs.readFileSync(file).equals(original)); }
}
fs.writeFileSync(path.join(archive, 'reversal.json'), JSON.stringify({ cases: receipts, restored: true }, null, 2) + '\n');
console.log(JSON.stringify({ reversed: receipts.length, restored: true }));
