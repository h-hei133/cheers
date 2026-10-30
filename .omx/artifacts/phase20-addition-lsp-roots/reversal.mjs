import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-lsp-roots');
const file = path.join(root, 'packages/ts-shell/src/language/scanner.ts');
const original = fs.readFileSync(file);
const cases = [
  { name: 'scan-primary-only',
    before: `        const scanRoots = [context.workspaceRoot, ...(context.workspaceRoots ?? []).map(root => root.path)];`,
    after: `        const scanRoots = [context.workspaceRoot];`,
    filter: 'part of the search space' },
  { name: 'symbol-absolute-paths',
    before: `function reportedSymbolPath(file: string, primary: string): string {
  const relative = path.relative(primary, file);
  return relative === '' || relative === '..' || relative.startsWith(\`..\${path.sep}\`) || path.isAbsolute(relative)
    ? file : relative.split(path.sep).join('/');
}`,
    after: `function reportedSymbolPath(file: string, _primary: string): string {
  return file;
}`,
    filter: 'part of the search space' },
  { name: 'document-symbol-primary-only',
    before: `          const fileRoot = selectWorkspaceRoot(context.workspaceRoot, context.workspaceRoots ?? [],
            path.isAbsolute(filePath) ? filePath : path.resolve(context.workspaceRoot, filePath), 'read');`,
    after: `          const fileRoot = context.workspaceRoot;`,
    filter: 'part of the search space' },
];
const receipts = [];
for (const item of cases) {
  try {
    const replaced = original.toString().replace(item.before, item.after);
    assert.notEqual(replaced, original.toString(), 'reversal must change source: ' + item.name);
    fs.writeFileSync(file, replaced);
    const result = spawnSync('rtk', ['env', 'NODE_OPTIONS=--max-old-space-size=2048', 'VITEST_MAX_THREADS=1', 'VITEST_MIN_THREADS=1',
      './node_modules/.bin/vitest', 'run', 'src/core/tools/lsp.test.ts', '-t', item.filter],
      { cwd: path.join(root, 'packages/ts-shell'), encoding: 'utf8', timeout: 60000, maxBuffer: 512 * 1024 });
    const output = result.stdout + result.stderr; fs.writeFileSync(path.join(archive, item.name + '.log'), output);
    assert.equal(result.status, 1, 'reversal must fail: ' + item.name); assert.match(output, /AssertionError/);
    receipts.push({ name: item.name, exit: result.status, tests: /Tests\s+([^\n]+)/.exec(output)?.[1],
      originalSha256: createHash('sha256').update(original).digest('hex') });
  } finally { fs.writeFileSync(file, original); assert(fs.readFileSync(file).equals(original)); }
}
fs.writeFileSync(path.join(archive, 'reversal.json'), JSON.stringify({ cases: receipts, restored: true }, null, 2) + '\n');
console.log(JSON.stringify({ reversed: receipts.length, restored: true }));
