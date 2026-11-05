import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
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
  try {
    const file = path.resolve(workspaceRoot, value.path);
    const stat = statSync(file);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) return hookUnknown('artifact_invalid');
    if (createHash('sha256').update(readFileSync(file)).digest('hex') !== value.sha256) return hookUnknown('version_mismatch');
  } catch { return hookUnknown('artifact_unreadable'); }
  return undefined;
}
