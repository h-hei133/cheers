import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-team-adoption');
const cases = [
  { name: 'publication', file: 'core/tools/teamTool.ts',
    before: 'return publishTeamReport(outcome, findings, evidence, context);',
    after: 'return { success: true, output: JSON.stringify(outcome), metadata: { findings, evidence } };',
    filter: 'withholds all report surfaces' },
  { name: 'explicit-answer', file: 'core/subagents/team/adoption.ts',
    before: 'if (answer !== ADOPT)', after: 'if (false)', filter: 'does not adopt a report' },
  { name: 'late-admission', file: 'core/subagents/team/adoption.ts',
    before: 'if (changed) return withheld(changed);', after: '', filter: 'passes live turn admission' },
  { name: 'turn-admission', file: 'turn/tools.ts',
    before: '      admission: options.admission,\n      interactiveAsk: options.interactiveAsk,',
    after: '      interactiveAsk: options.interactiveAsk,', filter: 'passes live turn admission' },
];
const receipts = [];
for (const item of cases) {
  const target = path.join(root, 'packages/ts-shell/src', item.file), original = fs.readFileSync(target);
  assert.equal(original.toString().split(item.before).length, 2);
  try {
    fs.writeFileSync(target, original.toString().replace(item.before, item.after));
    const result = spawnSync('rtk', ['env', 'NODE_OPTIONS=--max-old-space-size=1536', 'VITEST_MAX_THREADS=1', 'VITEST_MIN_THREADS=1',
      'npm', 'run', 'test', '-w', 'packages/ts-shell', '--', 'src/core/tools/teamAdoption.test.ts', '-t', item.filter],
      { cwd: root, encoding: 'utf8', timeout: 45000, maxBuffer: 512 * 1024 });
    const output = (result.stdout + result.stderr).replace(/[ \t]+$/gm, '').trimEnd() + '\n';
    fs.writeFileSync(path.join(archive, item.name + '.log'), output);
    assert.equal(result.status, 1); assert.match(output, /AssertionError/);
    receipts.push({ name: item.name, exit: result.status, sourceSha256: createHash('sha256').update(original).digest('hex') });
  } finally { fs.writeFileSync(target, original); assert(fs.readFileSync(target).equals(original)); }
}
fs.writeFileSync(path.join(archive, 'reversal.json'), JSON.stringify({ cases: receipts, restored: true }, null, 2) + '\n');
process.stdout.write(JSON.stringify({ reversed: receipts.length, restored: true }) + '\n');
