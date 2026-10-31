import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-crash-recovery');
const file = path.join(root, 'packages/ts-shell/src/session/recovery/sessionResumeEligibility.ts');
const original = fs.readFileSync(file);
const before = `  const unclean = session.status !== "interrupted" && session.status !== "error";
  if (unclean && session.status !== "active") {`;
const after = `  const unclean = session.status !== "interrupted" && session.status !== "error";
  if (unclean) {`;
try {
  const replaced = original.toString().replace(before, after);
  assert.notEqual(replaced, original.toString());
  fs.writeFileSync(file, replaced);
  const result = spawnSync('rtk', ['env', 'NODE_OPTIONS=--max-old-space-size=2048', 'VITEST_MAX_THREADS=1', 'VITEST_MIN_THREADS=1',
    './node_modules/.bin/vitest', 'run', 'src/session/recovery/sessionResumeEligibility.test.ts', '-t', 'killed without a clean shutdown'],
    { cwd: path.join(root, 'packages/ts-shell'), encoding: 'utf8', timeout: 60000, maxBuffer: 512 * 1024 });
  const output = result.stdout + result.stderr; fs.writeFileSync(path.join(archive, 'status-only.log'), output);
  assert.equal(result.status, 1); assert.match(output, /AssertionError/);
  fs.writeFileSync(path.join(archive, 'reversal.json'), JSON.stringify({ name: 'status-only', exit: result.status,
    tests: /Tests\s+([^\n]+)/.exec(output)?.[1], originalSha256: createHash('sha256').update(original).digest('hex'), restored: true }, null, 2) + '\n');
  console.log(JSON.stringify({ reversed: 1, restored: true }));
} finally { fs.writeFileSync(file, original); assert(fs.readFileSync(file).equals(original)); }
