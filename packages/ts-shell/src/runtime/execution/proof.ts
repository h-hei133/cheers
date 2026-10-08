import { createHash, randomUUID } from 'node:crypto';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';

export interface NativeCommandStart {
  readonly schemaVersion: 1;
  readonly invocationId: string;
  readonly callId: string;
  readonly sessionId: string;
  readonly commandDigest: string;
  readonly cwd: { readonly path: string; readonly identity: string };
  readonly startedAt: string;
}
export interface NativeCommandProof extends NativeCommandStart {
  readonly settledAt: string;
  readonly status: 'completed' | 'failed' | 'timeout' | 'cancelled';
  readonly exitCode: number | null;
}
export interface CommandProofObserver {
  started(proof: NativeCommandStart, assertFileAccess: ((absolute: string) => void) | undefined): void;
  settled(proof: NativeCommandProof, assertFileAccess: ((absolute: string) => void) | undefined): void;
}
/** Trusted per-invocation identity is generated at the native execution boundary, never by a model. */
export function startCommandProof(command: string, context: { readonly sessionId?: string; readonly taskId: string; readonly workspaceRoot: string }): NativeCommandStart {
  const root = captureWorkspaceRoot(context.workspaceRoot, context.workspaceRoot, 'read');
  return { schemaVersion: 1, invocationId: randomUUID(), callId: context.taskId, sessionId: context.sessionId ?? '',
    commandDigest: createHash('sha256').update(command, 'utf8').digest('hex'), cwd: { path: root.path, identity: root.identity },
    startedAt: new Date().toISOString() };
}
