import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-image-only');
const cases = [
  { name: 'text-only-content', file: 'model-adapters/multimodal.ts', tests: 'src/model-adapters/multimodal.test.ts', filter: 'multimodal content admission',
    before: ': block.data.length > 0', after: ': false' },
  { name: 'missing-image-admission', file: 'session/recovery/scope.ts', tests: 'src/session/recovery/branch.test.ts', filter: 'refuses image-only recovery after missing|refuses image-only recovery after empty-image',
    before: '  if (!state.pendingPrompt.trim() && (messages.length !== 1 || !messageHasContent(messages[0]!.content))) return undefined;', after: '' },
  { name: 'text-only-eligibility', file: 'session/recovery/sessionResumeEligibility.ts', tests: 'src/session/recovery/sessionResumeEligibility.test.ts', filter: 'image-only pending',
    before: '(snapshot.pendingPrompt.trim().length > 0 || messageToText(snapshot.lastUserMessage?.content) === snapshot.pendingPrompt\n      && messageHasContent(snapshot.lastUserMessage?.content))', after: 'snapshot.pendingPrompt.trim().length > 0' },
  { name: 'truthy-pending', file: 'core/shell/recovery.ts', tests: 'src/core/shell/continueShellActionRuntime.test.ts', filter: 'image-only interrupted',
    before: '(pendingPrompt !== undefined || recoverySnapshot.runPhase === "turn-active")', after: '(pendingPrompt || recoverySnapshot.runPhase === "turn-active")' },
  { name: 'text-only-effective', file: 'core/shell/recovery.ts', tests: 'src/core/shell/continueShellActionRuntime.test.ts', filter: 'image-only interrupted',
    before: 'if (effectivePrompt !== undefined)', after: 'if (effectivePrompt?.trim())' },
  { name: 'text-only-conversation', file: 'session/presentation/sessionReentrySurface.ts', tests: 'src/session/SessionManager.test.ts', filter: 'retains an image-only conversation',
    before: '&& messageHasContent(turn.content)', after: '&& messageToText(turn.content).trim().length > 0' },
];
const receipts = [];
for (const item of cases) {
  const file = path.join(root, 'packages/ts-shell/src', item.file), original = fs.readFileSync(file);
  try {
    assert.equal(original.toString().split(item.before).length, 2);
    fs.writeFileSync(file, original.toString().replace(item.before, item.after));
    const result = spawnSync('rtk', ['env', 'NODE_OPTIONS=--max-old-space-size=2048', 'VITEST_MAX_THREADS=1', 'VITEST_MIN_THREADS=1',
      './node_modules/.bin/vitest', 'run', item.tests, '-t', item.filter], { cwd: path.join(root, 'packages/ts-shell'),
      encoding: 'utf8', timeout: 45000, maxBuffer: 512 * 1024 });
    const output = result.stdout + result.stderr; fs.writeFileSync(path.join(archive, item.name + '.log'), output);
    assert.equal(result.status, 1); assert.match(output, /AssertionError/);
    receipts.push({ name: item.name, exit: result.status, tests: /Tests\s+([^\n]+)/.exec(output)?.[1],
      file: item.file, originalSha256: createHash('sha256').update(original).digest('hex') });
  } finally { fs.writeFileSync(file, original); assert(fs.readFileSync(file).equals(original)); }
}
fs.writeFileSync(path.join(archive, 'reversal.json'), JSON.stringify({ cases: receipts, restored: true }, null, 2) + '\n');
console.log(JSON.stringify({ reversed: receipts.length, restored: true }));
