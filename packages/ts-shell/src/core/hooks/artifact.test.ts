import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {
  checkCompletionHookArtifact,
  checkWriteHookArtifact,
  completionHookCommand,
  writeHookCommand,
  writeHookProtocol,
} from './artifact.js';

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
  it('runs the artifact as a script when the host is a standalone executable', () => {
    const previous = Object.getOwnPropertyDescriptor(process.versions, 'bun');
    Object.defineProperty(process.versions, 'bun', { configurable: true, value: '1.3.0' });
    try {
      const pinned = { ...artifact(128), protocolVersion: 2, workerProtocol: 1 };
      expect(writeHookCommand(pinned)).toMatch(/^BUN_BE_BUN=1 exec .+ gate write --emit-result$/);
      expect(writeHookCommand(pinned, 'stdio')).toMatch(/^BUN_BE_BUN=1 exec .+ gate write --stdio$/);
      expect(completionHookCommand(artifact(128))).toMatch(/^BUN_BE_BUN=1 exec .+ gate stop --emit-result$/);
    } finally {
      if (previous) Object.defineProperty(process.versions, 'bun', previous);
      else Reflect.deleteProperty(process.versions, 'bun');
    }
  });

  it('selects joint patch support from the admitted artifact protocol', () => {
    const legacy = artifact(128);
    expect(writeHookProtocol(legacy)).toBe(1);
    const current = { ...legacy, protocolVersion: 2 };
    expect(checkWriteHookArtifact(current, root)).toBeUndefined();
    expect(writeHookProtocol(current)).toBe(2);
    expect(checkWriteHookArtifact({ ...current, protocolVersion: 3 }, root))
      .toMatchObject({ decision: 'block', reasonCode: 'version_mismatch' });
  });

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

  it('verifies pinned completion hook artifacts and fails closed on mismatch or extra fields', () => {
    const declaration = artifact(Math.ceil(3.8 * 1024 * 1024));
    expect(checkCompletionHookArtifact(declaration, root)).toBeUndefined();
    expect(checkCompletionHookArtifact({ ...declaration, sha256: '0'.repeat(64) }, root))
      .toEqual({ decision: 'unknown', reasonCode: 'version_mismatch', proofVerdict: 'unknown' });
    expect(checkCompletionHookArtifact({ ...declaration, protocolVersion: 2 }, root))
      .toEqual({ decision: 'unknown', reasonCode: 'version_mismatch', proofVerdict: 'unknown' });
    expect(checkCompletionHookArtifact({ ...declaration, path: path.join(root, 'missing.mjs') }, root))
      .toEqual({ decision: 'unknown', reasonCode: 'artifact_unreadable', proofVerdict: 'unknown' });
  });
});
