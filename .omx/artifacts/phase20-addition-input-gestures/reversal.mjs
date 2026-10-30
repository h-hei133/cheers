import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-input-gestures');
const cases = [
  { name: 'paste-expiry', file: 'packages/ts-shell/src/presentation/tui/pastes.ts',
    before: ' || age > REPEAT_PASTE_MS', after: '',
    test: 'src/presentation/tui/pastes.test.ts', filter: 'bounds fresh end' },
  { name: 'paste-revision', file: 'packages/ts-shell/src/presentation/tui/pastes.ts',
    before: 'revision !== fresh.revision || ', after: '',
    test: 'src/presentation/tui/pastes.test.ts', filter: 'invalidates the fresh end after' },
  { name: 'host-insertion', file: 'packages/ts-shell/src/cli/interactive/interactiveMode.ts',
    before: 'this.state.pastes.arm(inserted.text, inserted.cursor, this.state.editor.textRevision);', after: '',
    test: 'src/cli/interactive/interactiveMode.test.ts', filter: 'immediate repeat paste' },
  { name: 'pointer-movement', file: 'packages/ts-shell/src/cli/interactive/pointer.ts',
    before: 'report.row !== this.composerClick.row || report.column !== this.composerClick.column ||', after: '',
    test: 'src/cli/interactive/pointer.test.ts', filter: 'does not request a caret move' },
  { name: 'pointer-stale', file: 'packages/ts-shell/src/cli/interactive/pointer.ts',
    before: 'if (this.composerAnchor && !sameComposer(this.context.view().composerGeometry?.(), this.composerAnchor)) {', after: 'if (false) {',
    test: 'src/cli/interactive/pointer.test.ts', filter: 'stale painted coordinates' },
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
