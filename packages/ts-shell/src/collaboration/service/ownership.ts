import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { inspectWorkspaceFile } from '../../core/workspace/files.js';
import { withFileLock } from '../../session/store/sessionFileStore.js';
import { commitWorkspaceFile } from '../../edit/authority/commit.js';
import { integer, object, parseJson, requireValue } from '../contract/value.js';

/** Exactly one foreground listener may own a state file; only a provably dead local PID is recovered. */
export function claimService(target: string): () => void {
  const root = path.dirname(target); const relative = path.basename(target) + '.owner'; const token = randomUUID();
  const content = JSON.stringify({ version: 1, token, pid: process.pid, hostname: os.hostname() }) + '\n';
  withFileLock(target + '.ownership.lock', () => {
    const previous = inspectWorkspaceFile(root, relative, undefined, 4096);
    if (previous.state === 'exists') {
      const owner = object(parseJson(previous.content, 4096)); requireValue(owner.version === 1 && owner.hostname === os.hostname(), 'busy');
      const pid = integer(owner.pid, 1, 2147483647); let dead = false;
      try { process.kill(pid, 0); } catch (error) { dead = (error as NodeJS.ErrnoException).code === 'ESRCH'; }
      requireValue(dead, 'busy');
    }
    commitWorkspaceFile({ workspaceRoot: root, relativePath: relative, expected: previous, content, mode: 0o600 });
  }, { createParent: false });
  return () => withFileLock(target + '.ownership.lock', () => {
    const current = inspectWorkspaceFile(root, relative, undefined, 4096); requireValue(current.state === 'exists' && current.content === content, 'unknown');
    commitWorkspaceFile({ workspaceRoot: root, relativePath: relative, expected: current, content: undefined });
  }, { createParent: false });
}
