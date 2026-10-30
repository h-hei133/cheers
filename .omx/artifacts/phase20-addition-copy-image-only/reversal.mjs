import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-copy-image-only');
const file = path.join(root, 'packages/ts-shell/src/cli/interactive/picker/copy.ts');
const original = fs.readFileSync(file);
const cases = [
  { name: 'always-empty-wording',
    before: `      return source?.hasImageOnlyBlocks
        ? "The transcript holds only pictures; there is no text to copy."
        : "Nothing in the transcript to copy yet.";`,
    after: `      return "Nothing in the transcript to copy yet.";` },
];
const receipts = [];
for (const item of cases) {
  try {
    const replaced = original.toString().replace(item.before, item.after);
    assert.notEqual(replaced, original.toString());
    fs.writeFileSync(file, replaced);
    const result = spawnSync('rtk', ['env', 'NODE_OPTIONS=--max-old-space-size=2048', 'VITEST_MAX_THREADS=1', 'VITEST_MIN_THREADS=1',
      './node_modules/.bin/vitest', 'run', 'src/cli/interactive/picker/copy.test.ts', '-t', 'picture-only transcript'],
      { cwd: path.join(root, 'packages/ts-shell'), encoding: 'utf8', timeout: 60000, maxBuffer: 512 * 1024 });
    const output = result.stdout + result.stderr; fs.writeFileSync(path.join(archive, item.name + '.log'), output);
    assert.equal(result.status, 1); assert.match(output, /AssertionError/);
    receipts.push({ name: item.name, exit: result.status, tests: /Tests\s+([^\n]+)/.exec(output)?.[1],
      originalSha256: createHash('sha256').update(original).digest('hex') });
  } finally { fs.writeFileSync(file, original); assert(fs.readFileSync(file).equals(original)); }
}
fs.writeFileSync(path.join(archive, 'reversal.json'), JSON.stringify({ cases: receipts, restored: true }, null, 2) + '\n');
console.log(JSON.stringify({ reversed: receipts.length, restored: true }));
