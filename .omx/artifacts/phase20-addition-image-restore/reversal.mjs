import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-image-restore');
const cases = [
  { name: 'text-only-projection', file: 'history.ts',
    before: `      const images = imagesOf(turn.content);
      if (content.trim() || images.length > 0) {
        blocks.push(images.length > 0 ? { ...textBlock("user", content), images } : textBlock("user", content));
      }`,
    after: `      if (content.trim()) {
        blocks.push(textBlock("user", content));
      }`,
    test: 'src/cli/interactive/history.test.ts', filter: 'pictures a stored prompt|only a picture|pictures out of the editor history' },
  { name: 'picture-text-required', file: 'history.ts',
    before: 'if (content.trim() || images.length > 0) {', after: 'if (content.trim()) {',
    test: 'src/cli/interactive/history.test.ts', filter: 'only a picture' },
  { name: 'no-image-projection', file: 'multimodal.ts',
    before: `  if (!Array.isArray(content)) return [];
  return content.filter((block): block is ImageContent => block.type === "image");`,
    after: `  if (!Array.isArray(content)) return [];
  return [];`,
    test: 'src/model-adapters/multimodal.test.ts', filter: 'pictures carried by a message' },
];
const receipts = [];
for (const item of cases) {
  const file = path.join(root, 'packages/ts-shell/src/cli/interactive', item.file);
  const target = item.file === 'multimodal.ts' ? path.join(root, 'packages/ts-shell/src/model-adapters/multimodal.ts') : file;
  const original = fs.readFileSync(target);
  try {
    const replaced = original.toString().replace(item.before, item.after);
    assert.notEqual(replaced, original.toString()); fs.writeFileSync(target, replaced);
    const result = spawnSync('rtk', ['env', 'NODE_OPTIONS=--max-old-space-size=2048', 'VITEST_MAX_THREADS=1', 'VITEST_MIN_THREADS=1',
      './node_modules/.bin/vitest', 'run', item.test, '-t', item.filter],
      { cwd: path.join(root, 'packages/ts-shell'), encoding: 'utf8', timeout: 45000, maxBuffer: 512 * 1024 });
    const output = result.stdout + result.stderr; fs.writeFileSync(path.join(archive, item.name + '.log'), output);
    assert.equal(result.status, 1); assert.match(output, /AssertionError/);
    receipts.push({ name: item.name, exit: result.status, tests: /Tests\s+([^\n]+)/.exec(output)?.[1],
      originalSha256: createHash('sha256').update(original).digest('hex') });
  } finally { fs.writeFileSync(target, original); assert(fs.readFileSync(target).equals(original)); }
}
fs.writeFileSync(path.join(archive, 'reversal.json'), JSON.stringify({ cases: receipts, restored: true }, null, 2) + '\n');
console.log(JSON.stringify({ reversed: receipts.length, restored: true }));
