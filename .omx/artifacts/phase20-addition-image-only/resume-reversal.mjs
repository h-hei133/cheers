import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-image-only');
const file = path.join(root, 'packages/ts-shell/src/core/shell/recovery.ts'), original = fs.readFileSync(file);
const before = 'return Boolean(summary?.pendingPrompt?.trim()) || summary?.autoResumeReady === true;';
let receipt;
try {
  assert.equal(original.toString().split(before).length, 2);
  fs.writeFileSync(file, original.toString().replace(before, 'return Boolean(summary?.pendingPrompt?.trim());'));
  const result = spawnSync('rtk', ['env', 'NODE_OPTIONS=--max-old-space-size=2048', 'VITEST_MAX_THREADS=1', 'VITEST_MIN_THREADS=1',
    './node_modules/.bin/vitest', 'run', 'src/core/shell/continueShellActionRuntime.test.ts', '-t', 'image-only interrupted|empty text-only current'],
    { cwd: path.join(root, 'packages/ts-shell'), encoding: 'utf8', timeout: 45000, maxBuffer: 512 * 1024 });
  const output = result.stdout + result.stderr;
  fs.writeFileSync(path.join(archive, 'resume-reversal.log'), output);
  assert.equal(result.status, 1); assert.match(output, /AssertionError/);
  receipt = { name: 'current-session-text-only-pending', exit: result.status,
    tests: /Tests\s+([^\n]+)/.exec(output)?.[1], originalSha256: createHash('sha256').update(original).digest('hex') };
} finally { fs.writeFileSync(file, original); assert(fs.readFileSync(file).equals(original)); }
fs.writeFileSync(path.join(archive, 'resume-reversal.json'), JSON.stringify({ ...receipt, restored: true }, null, 2) + '\n');
console.log(JSON.stringify({ reversed: 1, restored: true }));
