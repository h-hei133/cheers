import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-model-order');
const cases = [
  { name: 'provider-alphabet', file: 'packages/ts-shell/src/cli/interactive/picker/model/order.ts',
    before: "|| (left.label || left.id).localeCompare(right.label || right.id) ", after: '',
    test: 'src/cli/interactive/picker/model/category.test.ts', filter: 'sorts exact provider and model groups' },
  { name: 'model-alphabet', file: 'packages/ts-shell/src/cli/interactive/picker/model/order.ts',
    before: '|| left.label.localeCompare(right.label)', after: '',
    test: 'src/cli/interactive/picker/model/category.test.ts', filter: 'sorts exact provider and model groups' },
  { name: 'heading-keyboard', file: 'packages/ts-shell/src/cli/interactive/picker/navigation.ts',
    before: 'const categories = this.categories.filter(item => !item.disabled);', after: 'const categories = this.categories;',
    test: 'src/cli/interactive/picker/model/category.test.ts', filter: 'sorts exact provider and model groups' },
  { name: 'heading-pointer', file: 'packages/ts-shell/src/presentation/tui/chrome/navigation.ts',
    before: "if (item.disabled) {\n      rows.push(defaultTheme.dim(padToWidth(truncateToWidth(`  ${label}`, navWidth), navWidth)));\n      continue;\n    }", after: '',
    test: 'src/presentation/tui/chrome/navigation.test.ts', filter: 'paints group headings' },
  { name: 'heading-admission', file: 'packages/ts-shell/src/cli/interactive/picker/navigation.ts',
    before: 'if (!this.categories.some(item => !item.disabled && item.id === id)) return undefined;',
    after: 'if (!this.categories.some(item => item.id === id)) return undefined;',
    test: 'src/cli/interactive/picker/model/category.test.ts', filter: 'sorts exact provider and model groups' },
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
