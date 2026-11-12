import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { checkWriteHookArtifact } from './artifact.js';

let root: string;
beforeEach(() => {
  const temporaryRoot = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(temporaryRoot, { recursive: true });
  root = fs.mkdtempSync(path.join(temporaryRoot, 'hook-artifact-'));
});
afterEach(() => { vi.restoreAllMocks(); syncBuiltinESMExports(); fs.rmSync(root, { recursive: true, force: true }); });

function artifact(bytes: number) {
  const command = '\nprocess.stdout.write(JSON.stringify({decision:"allow",reasonCode:"no_violation"}));\n';
  const content = '/*' + ' '.repeat(bytes - Buffer.byteLength(command) - 4) + '*/' + command;
  const file = path.join(root, 'gate.mjs'); fs.writeFileSync(file, content);
  return { version: 1, path: file, sha256: createHash('sha256').update(content).digest('hex'), nodeFloor: '20.3.0' };
}

describe('pinned write hook artifact', () => {
  it('accepts a parser-sized 3.6 MiB artifact with its matching digest', () => {
    expect(checkWriteHookArtifact(artifact(Math.ceil(3.6 * 1024 * 1024)), root)).toBeUndefined();
  });

  it('accepts the 8 MiB boundary and rejects its next byte', () => {
    expect(checkWriteHookArtifact(artifact(8 * 1024 * 1024), root)).toBeUndefined();
    expect(checkWriteHookArtifact(artifact(8 * 1024 * 1024 + 1), root))
      .toMatchObject({ decision: 'block', hookVerdict: { status: 'unknown', reasonCode: 'artifact_invalid' } });
  });

  it('rejects a parser-sized artifact with a mismatched digest', () => {
    const declaration = artifact(Math.ceil(3.6 * 1024 * 1024));
    expect(checkWriteHookArtifact({ ...declaration, sha256: '0'.repeat(64) }, root))
      .toMatchObject({ decision: 'block', hookVerdict: { status: 'unknown', reasonCode: 'version_mismatch' } });
  });

  it('bounds reading when an artifact grows after its opened size check', () => {
    const declaration = artifact(128);
    const nativeRead = fs.readSync;
    let reads = 0, requestedBytes = 0;
    vi.spyOn(fs, 'readSync').mockImplementation((...args: Parameters<typeof fs.readSync>) => {
      if (reads++ === 0) fs.appendFileSync(declaration.path, Buffer.alloc(8 * 1024 * 1024));
      requestedBytes += args[3] as number;
      return nativeRead(...args);
    });
    syncBuiltinESMExports();
    expect(checkWriteHookArtifact(declaration, root))
      .toMatchObject({ decision: 'block', hookVerdict: { status: 'unknown', reasonCode: 'artifact_invalid' } });
    expect(requestedBytes).toBe(8 * 1024 * 1024 + 1);
  });
});
