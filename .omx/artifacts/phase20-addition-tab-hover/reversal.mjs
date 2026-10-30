import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-tab-hover');
const cases = [
  { name: 'tab-routing', file: 'cli/interactive/overlay.ts',
    before: "?? (chip ? { id: chip.id, chip: true } : undefined)", after: '', count: 1,
    filter: 'highlights a painted settings tab' },
  { name: 'tab-paint', file: 'presentation/tui/chrome/chips.ts',
    before: ": chip.id === hoveredId ? defaultTheme.bg('statusBandBg', ` ${text} `) : defaultTheme.dim(` ${text} `)",
    after: ': defaultTheme.dim(` ${text} `)', count: 1, filter: 'highlights a painted settings tab' },
  { name: 'tab-identity', file: 'cli/interactive/overlay.ts',
    before: 'this.hovered?.sidebar || this.hovered?.chip ? undefined : this.hovered?.id',
    after: 'this.hovered?.sidebar ? undefined : this.hovered?.id', count: 2,
    filter: 'chip hover separate from an identically named option' },
  { name: 'category-return', file: 'cli/interactive/overlay.ts',
    before: 'this.picker.navigation?.focus(this.model.current()?.id);\n        const update = this.picker.navigation?.select(chip.id);',
    after: 'const update = this.picker.navigation?.select(chip.id);', count: 1,
    filter: 'retains the current row when clicking' },
];
const receipts = [];
for (const item of cases) {
  const target = path.join(root, 'packages/ts-shell/src', item.file), original = fs.readFileSync(target);
  assert.equal(original.toString().split(item.before).length, item.count + 1);
  try {
    fs.writeFileSync(target, original.toString().replaceAll(item.before, item.after));
    const result = spawnSync('rtk', ['env', 'NODE_OPTIONS=--max-old-space-size=1536', 'VITEST_MAX_THREADS=1', 'VITEST_MIN_THREADS=1',
      'npm', 'run', 'test', '-w', 'packages/ts-shell', '--', 'src/cli/interactive/overlay/hover.test.ts', '-t', item.filter],
      { cwd: root, encoding: 'utf8', timeout: 45000, maxBuffer: 512 * 1024 });
    const output = (result.stdout + result.stderr).replace(/[ \t]+$/gm, '');
    fs.writeFileSync(path.join(archive, item.name + '.log'), output);
    assert.equal(result.status, 1); assert.match(output, /AssertionError/);
    receipts.push({ name: item.name, exit: result.status, sourceSha256: createHash('sha256').update(original).digest('hex') });
  } finally { fs.writeFileSync(target, original); assert(fs.readFileSync(target).equals(original)); }
}
fs.writeFileSync(path.join(archive, 'reversal.json'), JSON.stringify({ cases: receipts, restored: true }, null, 2) + '\n');
process.stdout.write(JSON.stringify({ reversed: receipts.length, restored: true }) + '\n');
