import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-image-history');
const runtime = 'packages/ts-shell/src/core/shell/sessionRuntime.ts', barrier = 'packages/ts-shell/src/session/lifecycle/sessionPromptBarrier.ts';
const cases = [
  { name: 'drop-runtime-images', file: runtime, tests: ['src/core/shell/sessionRuntime.test.ts'], filter: 'submitted images',
    before: 'sessionId, prompt, options.promptMetadata, options.attachments.images', after: 'sessionId, prompt, options.promptMetadata' },
  { name: 'drop-facade-images', file: 'packages/ts-shell/src/session/lifecycle/sessionLifecycleWrites.ts', tests: ['src/session/SessionManager.test.ts'], filter: 'persisted image prompt blocks',
    before: '      metadata,\n      images,', after: '      metadata,' },
  { name: 'flatten-barrier-content', file: barrier, tests: ['src/session/lifecycle/sessionPromptBarrier.test.ts'], filter: 'preserves image prompt',
    before: 'input.images?.length ? [{ type: "text", text: input.prompt }, ...input.images.map(image => ({ ...image }))] : input.prompt', after: 'input.prompt' },
  { name: 'share-mutable-image', file: barrier, tests: ['src/session/lifecycle/sessionPromptBarrier.test.ts'], filter: 'preserves image prompt',
    before: '...input.images.map(image => ({ ...image }))', after: '...input.images' },
];
const receipts = [];
for (const item of cases) {
  const file = path.join(root, item.file), original = fs.readFileSync(file);
  try {
    assert.equal(original.toString().split(item.before).length, 2);
    fs.writeFileSync(file, original.toString().replace(item.before, item.after));
    const result = spawnSync('rtk', ['env', 'NODE_OPTIONS=--max-old-space-size=2048', 'VITEST_MAX_THREADS=1', 'VITEST_MIN_THREADS=1',
      './node_modules/.bin/vitest', 'run', ...item.tests, '-t', item.filter], { cwd: path.join(root, 'packages/ts-shell'),
      encoding: 'utf8', timeout: 45000, maxBuffer: 512 * 1024 });
    const output = result.stdout + result.stderr; fs.writeFileSync(path.join(archive, item.name + '.log'), output);
    assert.equal(result.status, 1); assert.match(output, /AssertionError/);
    receipts.push({ name: item.name, exit: result.status, tests: /Tests\s+([^\n]+)/.exec(output)?.[1],
      file: item.file, originalSha256: createHash('sha256').update(original).digest('hex') });
  } finally { fs.writeFileSync(file, original); assert(fs.readFileSync(file).equals(original)); }
}
fs.writeFileSync(path.join(archive, 'reversal.json'), JSON.stringify({ cases: receipts, restored: true }, null, 2) + '\n');
console.log(JSON.stringify({ reversed: receipts.length, restored: true }));
