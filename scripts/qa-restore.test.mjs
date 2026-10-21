import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { seedRestoreSnapshot, assertRestoreUnchanged } from './qa/restore.mjs';

test('restore acceptance compares exact workspace, record and blob bytes', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "qa-restore ' "));
  try {
    const fixture = seedRestoreSnapshot(project);
    assert.doesNotThrow(() => assertRestoreUnchanged(fixture));
    for (const [file, bytes] of fixture.originals) {
      fs.writeFileSync(file, Buffer.concat([bytes, Buffer.from('\n')]));
      assert.throws(() => assertRestoreUnchanged(fixture), /changed fixture bytes/);
      fs.writeFileSync(file, bytes);
    }
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});
