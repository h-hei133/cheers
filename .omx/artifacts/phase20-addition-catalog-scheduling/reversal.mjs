import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-catalog-scheduling');
const projection = 'packages/ts-shell/src/session/store/catalog/projection.ts';
const index = 'packages/ts-shell/src/session/store/catalog/index.ts';
const chrome = 'packages/ts-shell/src/presentation/tui/surface/chrome.ts';
const previous = spawnSync('rtk', ['proxy', 'git', 'show', '4c646ae3cbf4777718e3a40001530cb51e36c45f:' + chrome], { cwd: root });
assert.equal(previous.status, 0);
const cases = [
  { name: 'sync-parser', file: projection,
    replace: text => text.replace('parseTranscriptAsync, projectBranchMessages', 'parseTranscript, projectBranchMessages')
      .replace('await parseTranscriptAsync(transcriptText, undefined, signal)', 'parseTranscript(transcriptText)'),
    test: 'src/session/store/catalog/projection.test.ts', filter: 'yields during catalog' },
  { name: 'parser-cancellation', file: projection,
    before: 'await parseTranscriptAsync(transcriptText, undefined, signal)', after: 'await parseTranscriptAsync(transcriptText)',
    test: 'src/session/store/catalog/projection.test.ts', filter: 'cancellation=true' },
  { name: 'source-version', file: index,
    before: "if (after?.version !== before.version) { this.cache.delete(id); throw new Error('Session changed while listing.'); }", after: '',
    test: 'src/session/store/catalog/browse.test.ts', filter: 'changes across catalog decode suspension' },
  { name: 'hidden-ambient', file: chrome, replace: () => previous.stdout,
    test: 'src/presentation/tui/surface/view.test.ts', filter: 'reads ambient facts only for a visible hint row' },
  { name: 'status-peer-refresh', file: 'packages/ts-shell/src/cli/interactive/interactiveMode.ts',
    before: 'readPeerSessionCount(this.options.runtimeContext.session.id, { refresh: !this.pager.active && !this.overlay.active })',
    after: 'readAmbientFacts(this.options.runtimeContext.session.id).peerSessions',
    test: 'src/cli/interactive/interactiveMode.test.ts', filter: 'suspends peer scans' },
  { name: 'cache-only-peer', file: 'packages/ts-shell/src/cli/interactive/ambientFacts.ts',
    before: 'if (options.refresh === false) return peerCount?.sessionId === sessionId ? peerCount.count : undefined;', after: '',
    test: 'src/cli/interactive/ambientFacts.test.ts', filter: 'hidden peer reads' },
];
const receipts = [];
for (const item of cases) {
  const target = path.join(root, item.file), original = fs.readFileSync(target);
  if (item.before) assert.equal(original.toString().split(item.before).length, 2);
  try {
    fs.writeFileSync(target, item.replace ? item.replace(original.toString()) : original.toString().replace(item.before, item.after));
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
