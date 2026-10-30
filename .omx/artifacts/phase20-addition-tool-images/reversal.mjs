import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-tool-images');
const cases = [
  { name: 'projection-drops-images', file: 'packages/ts-shell/src/turn/projection.ts',
    before: '            ...(images.length > 0 ? { images } : {}),', after: '',
    test: 'src/turn/projection.test.ts', filter: "tool result's pictures" },
  { name: 'durable-keeps-display-images', file: 'packages/ts-shell/src/session/sessionEventCodec.ts',
    before: 'event: durableQueryEvent(input.event),', after: 'event: input.event,',
    test: 'src/session/transcript/sessionQueryEventPersistence.test.ts', filter: 'display-only pictures' },
  { name: 'cards-drop-images', file: 'packages/ts-shell/src/cli/interactive/toolCards.ts',
    before: '      if (images?.length) current.images = images;', after: '',
    test: 'src/cli/interactive/toolCards.test.ts', filter: "tool's pictures" },
  { name: 'renderer-hides-tool-images', file: 'packages/ts-shell/src/presentation/tui/transcript/blocks.ts',
    before: `    rows.push(...toolImageRows(block, width, options));
    rows.push("");
    return rows;
  }

  // Expanded`, after: `    rows.push("");
    return rows;
  }

  // Expanded`,
    test: 'src/presentation/tui/transcript/blocks.test.ts', filter: 'screenshot result even while' },
  { name: 'history-drops-tool-images', file: 'packages/ts-shell/src/cli/interactive/history.ts',
    before: '          if (images.length > 0) toolBlock.images = images;', after: '',
    test: 'src/cli/interactive/history.test.ts', filter: "tool result's pictures" },
];
const receipts = [];
for (const item of cases) {
  const file = path.join(root, item.file), original = fs.readFileSync(file);
  try {
    const replaced = original.toString().replace(item.before, item.after);
    assert.notEqual(replaced, original.toString(), 'reversal must change source: ' + item.name);
    fs.writeFileSync(file, replaced);
    const result = spawnSync('rtk', ['env', 'NODE_OPTIONS=--max-old-space-size=2048', 'VITEST_MAX_THREADS=1', 'VITEST_MIN_THREADS=1',
      './node_modules/.bin/vitest', 'run', item.test, '-t', item.filter],
      { cwd: path.join(root, 'packages/ts-shell'), encoding: 'utf8', timeout: 45000, maxBuffer: 512 * 1024 });
    const output = result.stdout + result.stderr; fs.writeFileSync(path.join(archive, item.name + '.log'), output);
    assert.equal(result.status, 1, 'reversal must fail: ' + item.name); assert.match(output, /AssertionError/);
    receipts.push({ name: item.name, exit: result.status, tests: /Tests\s+([^\n]+)/.exec(output)?.[1],
      originalSha256: createHash('sha256').update(original).digest('hex') });
  } finally { fs.writeFileSync(file, original); assert(fs.readFileSync(file).equals(original)); }
}
fs.writeFileSync(path.join(archive, 'reversal.json'), JSON.stringify({ cases: receipts, restored: true }, null, 2) + '\n');
console.log(JSON.stringify({ reversed: receipts.length, restored: true }));
