import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertProfileStorage, currentProfile, withProfile } from '../../core/paths/profile/context.js';
import { assertDirectoryIdentity, directoryIdentity, isWithin, type DirectoryIdentity } from '../../core/paths/profile/identity.js';
import type { StructuredLogEntry } from '../types.js';
import type { StoredSpan } from './types.js';

export interface TraceReadScope {
  readonly sessionId?: string;
  readonly projectRoot?: string;
  readonly workspaceRoot?: string;
  readonly admission?: () => string | undefined;
}

/** Trace and log readers share the original source and read admission. */
export function captureTraceReadScope(scope: TraceReadScope, directory: string, currentPath: string) {
  const profile = currentProfile();
  const checkDirectory = captureLogDirectory(directory);
  const sessionId = scope.sessionId;
  const projectRoot = scope.projectRoot ?? process.cwd();
  const workspaceRoot = scope.workspaceRoot;
  const admission = scope.admission;
  return Object.freeze({ profile, sessionId, projectRoot, workspaceRoot,
    admit: (): boolean => {
      try {
        if (!isWithin(directory, currentPath)) return false;
        if (profile) assertProfileStorage(directory, profile);
        checkDirectory();
        return (profile && admission ? withProfile(profile, admission) : admission?.()) === undefined;
      } catch { return false; }
    },
  });
}

function captureLogDirectory(directory: string): () => void {
  let ancestor = path.resolve(directory);
  let parent: DirectoryIdentity;
  for (;;) {
    try { parent = directoryIdentity(fs.realpathSync(ancestor)); break; }
    catch (error) {
      const next = path.dirname(ancestor);
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || next === ancestor) throw error;
      ancestor = next;
    }
  }
  const target = path.resolve(parent.path, path.relative(ancestor, directory));
  let captured: DirectoryIdentity | undefined = target === parent.path ? parent : undefined;
  return () => {
    assertDirectoryIdentity(parent);
    if (fs.realpathSync(ancestor) !== parent.path) throw new Error('Trace storage changed identity.');
    if (captured) { assertDirectoryIdentity(captured); return; }
    // A fresh profile may acquire its log directory on the first write.
    let physical: string;
    try { physical = fs.realpathSync(directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    if (physical !== target) throw new Error('Trace storage changed identity.');
    captured = directoryIdentity(target);
  };
}

export function sessionLog(entry: StructuredLogEntry, sessionId: string | undefined, workspaceRoot?: string): boolean {
  if (sessionId !== undefined && entry.fields.sessionId !== sessionId) return false;
  if (workspaceRoot === undefined) return true;
  const identity = entry.fields.workspaceIdentity;
  return typeof identity === 'string' ? identity === workspaceIdentity(workspaceRoot)
    : entry.fields.workspaceRoot === workspaceRoot;
}

export function sessionSpan(span: StoredSpan, sessionId: string | undefined, workspaceRoot?: string): boolean {
  if (sessionId !== undefined && span.attributes.sessionId !== sessionId) return false;
  if (workspaceRoot === undefined) return true;
  const identity = span.attributes.workspaceIdentity;
  return typeof identity === 'string' ? identity === workspaceIdentity(workspaceRoot)
    : span.attributes.workspaceRoot === workspaceRoot;
}

export function workspaceIdentity(workspaceRoot: string): string {
  return createHash('sha256').update(workspaceRoot, 'utf8').digest('hex');
}
