import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-workspace-write');
const defaultFile = path.join(root, 'packages/ts-shell/src/core/tools/registry.ts');
const cases = [
  { name: 'primary-root-only-write',
    before: `          const root = context.workspaceRoots?.length
            ? resolveWorkspaceRoot(context.workspaceRoot, context.workspaceRoots, target, 'write') ?? context.workspaceRoot
            : context.workspaceRoot
          const containment = verifyPathContainment(target, root)
          if (!containment.allowed) {
            throw new Error(outsideWorkspaceMessage(containment.reason, target, root))
          }
          const content = args.content as string`,
    after: `          const root = context.workspaceRoot
          const containment = verifyPathContainment(target, root)
          if (!containment.allowed) {
            throw new Error(outsideWorkspaceMessage(containment.reason, target, root))
          }
          const content = args.content as string`,
    filter: 'writes through an attached root' },
  { name: 'read-primary-only', file: 'packages/ts-shell/src/core/tools/read.ts',
    before: `        const root = context.workspaceRoots?.length
          ? resolveWorkspaceRoot(context.workspaceRoot, context.workspaceRoots, target, 'read') ?? context.workspaceRoot
          : context.workspaceRoot`,
    after: `        const root = context.workspaceRoot`,
    filter: 'reads a file through a read-only attached root' },
  { name: 'glob-primary-only', file: 'packages/ts-shell/src/core/tools/glob.ts',
    before: `      const root = context.workspaceRoots?.length
        ? resolveWorkspaceRoot(context.workspaceRoot, context.workspaceRoots, requestedTarget, 'read') ?? context.workspaceRoot
        : context.workspaceRoot`,
    after: `      const root = context.workspaceRoot`,
    filter: 'finds files under an attached root' },
  { name: 'grep-primary-only', file: 'packages/ts-shell/src/core/tools/grep.ts',
    before: `        searchRoot = context.workspaceRoots?.length
          ? resolveWorkspaceRoot(context.workspaceRoot, context.workspaceRoots, requestedTarget, 'read') ?? context.workspaceRoot
          : context.workspaceRoot;`,
    after: `        searchRoot = context.workspaceRoot;`,
    filter: 'finds content under an attached root' },
  { name: 'ledger-follows-target', file: 'packages/ts-shell/src/core/tools/registry.ts',
    before: `editIdentity: { sessionId: context.sessionId, workspaceRoot: context.artifactRoot ?? context.workspaceRoot, callId: context.taskId, correlationId: context.correlationId }`,
    after: `editIdentity: { sessionId: context.sessionId, workspaceRoot: root, callId: context.taskId, correlationId: context.correlationId }`,
    filter: 'keeps the session ledger' },
  { name: 'no-access-check',
    before: `            ? resolveWorkspaceRoot(context.workspaceRoot, context.workspaceRoots, target, 'write') ?? context.workspaceRoot`,
    after: `            ? resolveWorkspaceRoot(context.workspaceRoot, context.workspaceRoots, target, 'read') ?? context.workspaceRoot`,
    filter: 'read-only attached root' },
];
const receipts = [];
for (const item of cases) {
  const file = item.file ? path.join(root, item.file) : defaultFile;
  const original = fs.readFileSync(file);
  try {
    const replaced = original.toString().replace(item.before, item.after);
    assert.notEqual(replaced, original.toString(), 'reversal must change source: ' + item.name);
    fs.writeFileSync(file, replaced);
    const result = spawnSync('rtk', ['env', 'NODE_OPTIONS=--max-old-space-size=2048', 'VITEST_MAX_THREADS=1', 'VITEST_MIN_THREADS=1',
      './node_modules/.bin/vitest', 'run', 'src/core/tools/arguments.test.ts', '-t', item.filter],
      { cwd: path.join(root, 'packages/ts-shell'), encoding: 'utf8', timeout: 60000, maxBuffer: 512 * 1024 });
    const output = result.stdout + result.stderr; fs.writeFileSync(path.join(archive, item.name + '.log'), output);
    assert.equal(result.status, 1, 'reversal must fail: ' + item.name); assert.match(output, /AssertionError|Error/);
    receipts.push({ name: item.name, exit: result.status, tests: /Tests\s+([^\n]+)/.exec(output)?.[1],
      originalSha256: createHash('sha256').update(original).digest('hex') });
  } finally { fs.writeFileSync(file, original); assert(fs.readFileSync(file).equals(original)); }
}
fs.writeFileSync(path.join(archive, 'reversal.json'), JSON.stringify({ cases: receipts, restored: true }, null, 2) + '\n');
console.log(JSON.stringify({ reversed: receipts.length, restored: true }));
