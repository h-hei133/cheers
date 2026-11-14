import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the configured lint gate rejects duplicate object keys and accepts an ordinary module', () => {
  const base = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(base, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(base, 'lint-'));
  const file = path.join(fixture, 'packages/ts-shell/src/index.ts');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(path.join(root, 'biome.json'), path.join(fixture, 'biome.json'));
  const run = input => {
    fs.writeFileSync(file, input);
    return spawnSync(process.execPath,
      [path.join(root, 'node_modules/@biomejs/biome/bin/biome'), 'lint', '--vcs-enabled=false', file],
      { cwd: fixture, encoding: 'utf8' });
  };
  try {
    const refused = run('export const settings = { enabled: true, enabled: false };\n');
    assert.equal(refused.status, 1, refused.stderr);
    assert.match(refused.stderr, /noDuplicateObjectKeys/);
    const allowed = run('export const settings = { enabled: true };\n');
    assert.equal(allowed.status, 0, allowed.stderr);
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
});
