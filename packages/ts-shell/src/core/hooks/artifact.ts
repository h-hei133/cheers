import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import path from 'node:path';
import { isRecord } from '../values/record.js';
import { hookUnknown } from './translation.js';
import type { HookDecision } from './types.js';

export interface WriteHookArtifact {
  readonly version: 1;
  readonly path: string;
  readonly sha256: string;
  readonly nodeFloor: '20.3.0';
}

// Parser-backed gate bundles exceed 2 MiB. Keep packaging headroom bounded.
const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;

function validArtifact(value: unknown): value is WriteHookArtifact {
  return isRecord(value) && Object.keys(value).every(key => ['version', 'path', 'sha256', 'nodeFloor'].includes(key))
    && value.version === 1 && typeof value.path === 'string' && value.path.length > 0
    && typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256) && value.nodeFloor === '20.3.0';
}

function quote(value: string): string { return `'${value.replaceAll("'", "'\\''")}'`; }

/** The declared command and actual invocation are derived from the same pinned artifact. */
export function writeHookCommand(value: unknown): string {
  return validArtifact(value) ? `exec ${quote(process.execPath)} ${quote(value.path)} gate write --emit-result` : 'false';
}

/** Compatibility belongs to the selected artifact, never to the tool's semantic capability. */
export function checkWriteHookArtifact(value: unknown, workspaceRoot: string): HookDecision | undefined {
  if (!validArtifact(value)) return hookUnknown('version_mismatch');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major! < 20 || (major === 20 && minor! < 3)) return hookUnknown('runtime_incompatible');
  let descriptor: number | undefined;
  try {
    const file = path.resolve(workspaceRoot, value.path);
    descriptor = openSync(file, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size > MAX_ARTIFACT_BYTES) return hookUnknown('artifact_invalid');
    const chunk = Buffer.alloc(READ_CHUNK_BYTES);
    const hash = createHash('sha256');
    let bytes = 0;
    for (;;) {
      const count = readSync(descriptor, chunk, 0, Math.min(chunk.length, MAX_ARTIFACT_BYTES + 1 - bytes), bytes);
      if (count === 0) break;
      bytes += count;
      if (bytes > MAX_ARTIFACT_BYTES) return hookUnknown('artifact_invalid');
      hash.update(chunk.subarray(0, count));
    }
    const after = fstatSync(descriptor);
    if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs
      || after.ctimeMs !== before.ctimeMs) return hookUnknown('artifact_invalid');
    if (hash.digest('hex') !== value.sha256) return hookUnknown('version_mismatch');
  } catch { return hookUnknown('artifact_unreadable'); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
  return undefined;
}
