import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-settings-navigation');
const cases = [
  { name: 'top-placement', file: 'packages/ts-shell/src/cli/interactive/picker/settings.ts',
    before: "new CatalogNavigation(active, true, true, 'top')", after: "new CatalogNavigation(active, true, true, 'side')",
    test: 'src/cli/interactive/picker/navigation.test.ts', filter: 'clicks top categories and settings rows' },
  { name: 'top-tab-domains', file: 'packages/ts-shell/src/cli/interactive/picker/navigation.ts',
    before: "? this.sectionFocus ? ['rows', 'sections'] : ['rows']", after: "? this.sectionFocus ? ['categories', 'rows', 'sections'] : ['categories', 'rows']",
    test: 'src/cli/interactive/picker/navigation.test.ts', filter: 'keeps every top category visible' },
  { name: 'retired-chip-spans', file: 'packages/ts-shell/src/cli/interactive/overlay.ts',
    before: "private changeFilter(change: () => void): void {\n    this.optionRows.clear(); this.listRows.clear(); this.hovered = undefined;\n    this.chipRows.clear();",
    after: "private changeFilter(change: () => void): void {\n    this.optionRows.clear(); this.listRows.clear(); this.hovered = undefined;",
    test: 'src/cli/interactive/picker/navigation.test.ts', filter: 'retires top category hit spans' },
  { name: 'side-default', file: 'packages/ts-shell/src/cli/interactive/picker/navigation.ts',
    before: "readonly placement: 'side' | 'top' = 'side'", after: "readonly placement: 'side' | 'top' = 'top'",
    test: 'src/cli/interactive/picker/navigation.test.ts', filter: 'browses an unavailable provider through navigation' },
];
const receipts = [];
for (const item of cases) {
  const target = path.join(root, item.file), original = fs.readFileSync(target);
  assert.equal(original.toString().split(item.before).length, 2);
  try {
    fs.writeFileSync(target, original.toString().replace(item.before, item.after));
    const result = spawnSync('rtk', ['env', 'NODE_OPTIONS=--max-old-space-size=1536', 'VITEST_MAX_THREADS=1', 'VITEST_MIN_THREADS=1',
      'npm', 'run', 'test', '-w', 'packages/ts-shell', '--', item.test, '-t', item.filter],
      { cwd: root, encoding: 'utf8', timeout: 45000, maxBuffer: 512 * 1024 });
    const output = (result.stdout + result.stderr).replace(/[ \t]+$/gm, '');
    fs.writeFileSync(path.join(archive, item.name + '.log'), output);
    assert.equal(result.status, 1); assert.match(output, /AssertionError/);
    receipts.push({ name: item.name, exit: result.status, sourceSha256: createHash('sha256').update(original).digest('hex') });
  } finally { fs.writeFileSync(target, original); assert(fs.readFileSync(target).equals(original)); }
}
fs.writeFileSync(path.join(archive, 'reversal.json'), JSON.stringify({ cases: receipts, restored: true }, null, 2) + '\n');
process.stdout.write(JSON.stringify({ reversed: receipts.length, restored: true }) + '\n');
