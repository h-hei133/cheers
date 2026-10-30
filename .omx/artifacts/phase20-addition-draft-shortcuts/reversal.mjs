import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-draft-shortcuts');
const host = 'packages/ts-shell/src/cli/interactive/interactiveMode.ts', preferences = 'packages/ts-shell/src/cli/interactive/inputPreferences.ts';
const cases = [
  { name: 'hardcoded-notices', file: host, filter: 'draft shortcut',
    replace: () => execFileSync('rtk', ['proxy', 'git', 'show', 'ff084423:' + host]) },
  { name: 'conflict-filter', file: preferences, filter: 'draft shortcut.*conflicted|draft shortcut after.*conflicted',
    before: '.find(key => this.bindings.actionFor(key) === actionId)', after: '[0]' },
  { name: 'unbound-fallback', file: preferences, filter: 'draft shortcut.*unbound',
    before: '.find(key => this.bindings.actionFor(key) === actionId)',
    after: ".find(key => this.bindings.actionFor(key) === actionId) ?? (actionId === 'tui.editor.undo' ? 'ctrl+z' : 'ctrl+s')" },
];
const receipts = [];
for (const item of cases) {
  const file = path.join(root, item.file), original = fs.readFileSync(file);
  try {
    if (item.before) assert.equal(original.toString().split(item.before).length, 2);
    fs.writeFileSync(file, item.replace ? item.replace() : original.toString().replace(item.before, item.after));
    const result = spawnSync('rtk', ['env', 'NODE_OPTIONS=--max-old-space-size=1536', 'VITEST_MAX_THREADS=1', 'VITEST_MIN_THREADS=1',
      'npm', 'run', 'test', '-w', 'packages/ts-shell', '--', 'src/cli/interactive/interactiveMode.test.ts', '-t', item.filter],
      { cwd: root, encoding: 'utf8', timeout: 45000, maxBuffer: 512 * 1024 });
    const output = result.stdout + result.stderr; fs.writeFileSync(path.join(archive, item.name + '.log'), output);
    assert.equal(result.status, 1); assert.match(output, /AssertionError/);
    receipts.push({ name: item.name, exit: result.status, tests: /Tests\s+([^\n]+)/.exec(output)?.[1], sourceSha256: createHash('sha256').update(original).digest('hex') });
  } finally { fs.writeFileSync(file, original); assert(fs.readFileSync(file).equals(original)); }
}
fs.writeFileSync(path.join(archive, 'reversal.json'), JSON.stringify({ cases: receipts, restored: true }, null, 2) + '\n');
console.log(JSON.stringify({ reversed: receipts.length, restored: true }));
