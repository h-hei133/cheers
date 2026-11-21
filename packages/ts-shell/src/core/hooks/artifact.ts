import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import path from 'node:path';
import { isRecord } from '../values/record.js';
import { stopUnknown } from './stop/result.js';
import { hookUnknown } from './translation.js';
import type { HookDecision } from './types.js';

export interface WriteHookArtifact {
  readonly version: 1;
  readonly protocolVersion?: 2;
  readonly workerProtocol?: 1;
  readonly path: string;
  readonly sha256: string;
  readonly nodeFloor: '20.3.0';
}

export interface CompletionHookArtifact {
  readonly version: 1;
  readonly path: string;
  readonly sha256: string;
  readonly nodeFloor: '20.3.0';
}

// Parser-backed gate bundles exceed 2 MiB. Keep packaging headroom bounded.
const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;
const SHA256_HEX = /^[a-f0-9]{64}$/;

function validArtifact(value: unknown): value is WriteHookArtifact {
  return isRecord(value) && Object.keys(value).every(key => ['version', 'protocolVersion', 'workerProtocol', 'path', 'sha256', 'nodeFloor'].includes(key))
    && (value.protocolVersion === undefined || value.protocolVersion === 2)
    && (value.workerProtocol === undefined || (value.protocolVersion === 2 && value.workerProtocol === 1))
    && value.version === 1 && typeof value.path === 'string' && value.path.length > 0
    && typeof value.sha256 === 'string' && SHA256_HEX.test(value.sha256) && value.nodeFloor === '20.3.0';
}

function validCompletionArtifact(value: unknown): value is CompletionHookArtifact {
  return isRecord(value) && Object.keys(value).every(key => ['version', 'path', 'sha256', 'nodeFloor'].includes(key))
    && value.version === 1 && typeof value.path === 'string' && value.path.length > 0
    && typeof value.sha256 === 'string' && SHA256_HEX.test(value.sha256) && value.nodeFloor === '20.3.0';
}

export function writeHookProtocol(value: unknown): 1 | 2 {
  return validArtifact(value) ? value.protocolVersion ?? 1 : 1;
}

export function writeWorkerIdentity(value: unknown): string | undefined {
  return validArtifact(value) && value.workerProtocol === 1 ? value.sha256 : undefined;
}

function quote(value: string): string { return `'${value.replaceAll("'", "'\\''")}'`; }

function runtimePrefix(): string {
  // A standalone executable normally dispatches to the bundled CLI on every invocation.
  return process.versions.bun ? 'BUN_BE_BUN=1 ' : '';
}

/** The declared command and actual invocation are derived from the same pinned artifact. */
export function writeHookCommand(value: unknown, transport: 'single' | 'stdio' = 'single'): string {
  if (!validArtifact(value)) return 'false';
  return `${runtimePrefix()}exec ${quote(process.execPath)} ${quote(value.path)} gate write ${transport === 'stdio' ? '--stdio' : '--emit-result'}`;
}

export function completionHookCommand(value: unknown): string {
  if (!validCompletionArtifact(value)) return 'false';
  return `${runtimePrefix()}exec ${quote(process.execPath)} ${quote(value.path)} gate stop --emit-result`;
}

type ArtifactFailure = 'runtime_incompatible' | 'artifact_invalid' | 'version_mismatch' | 'artifact_unreadable';

function verifyPinnedArtifactFile(artifactPath: string, expectedSha256: string, workspaceRoot: string): ArtifactFailure | undefined {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major! < 20 || (major === 20 && minor! < 3)) return 'runtime_incompatible';
  let descriptor: number | undefined;
  try {
    const file = path.resolve(workspaceRoot, artifactPath);
    descriptor = openSync(file, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size > MAX_ARTIFACT_BYTES) return 'artifact_invalid';
    const chunk = Buffer.alloc(READ_CHUNK_BYTES);
    const hash = createHash('sha256');
    let bytes = 0;
    for (;;) {
      const count = readSync(descriptor, chunk, 0, Math.min(chunk.length, MAX_ARTIFACT_BYTES + 1 - bytes), bytes);
      if (count === 0) break;
      bytes += count;
      if (bytes > MAX_ARTIFACT_BYTES) return 'artifact_invalid';
      hash.update(chunk.subarray(0, count));
    }
    const after = fstatSync(descriptor);
    if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs
      || after.ctimeMs !== before.ctimeMs) return 'artifact_invalid';
    if (hash.digest('hex') !== expectedSha256) return 'version_mismatch';
  } catch { return 'artifact_unreadable'; }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
  return undefined;
}

/** Compatibility belongs to the selected artifact, never to the tool's semantic capability. */
export function checkWriteHookArtifact(value: unknown, workspaceRoot: string): HookDecision | undefined {
  if (!validArtifact(value)) return hookUnknown('version_mismatch');
  const failure = verifyPinnedArtifactFile(value.path, value.sha256, workspaceRoot);
  return failure ? hookUnknown(failure) : undefined;
}

export function checkCompletionHookArtifact(value: unknown, workspaceRoot: string): HookDecision | undefined {
  if (!validCompletionArtifact(value)) return stopUnknown('version_mismatch');
  const failure = verifyPinnedArtifactFile(value.path, value.sha256, workspaceRoot);
  return failure ? stopUnknown(failure) : undefined;
}
