import fs from 'node:fs';
import path from 'node:path';
import { inspectWorkspaceFile, pathIdentity } from '../../core/workspace/files.js';
import { assertProfileStorage, type ProfileContext } from '../../core/paths/profile/context.js';
import { withFileLock } from '../../session/store/sessionFileStore.js';
import { commitWorkspaceFile } from '../../edit/authority/commit.js';
import { digest, parseJson, requireValue } from '../contract/value.js';
import { WIRE_BYTES } from '../contract/model.js';

export function readRelayRecord(target: string, owner: ProfileContext | undefined): unknown {
  assertProfileStorage(target, owner);
  const resolved = path.resolve(target);
  const root = path.parse(resolved).root;
  const prior = inspectWorkspaceFile(root, path.relative(root, resolved), undefined, WIRE_BYTES);
  if (prior.state === 'absent') return undefined;
  requireValue((prior.mode & 0o077) === 0, 'denied');
  return parseJson(prior.content, WIRE_BYTES);
}

/** Reuse the storage lock and verified commit for both local relay records. */
export function saveRelayRecord(target: string, previous: unknown, value: unknown, owner: ProfileContext | undefined): void {
  assertProfileStorage(target, owner);
  const content = JSON.stringify(value) + '\n'; requireValue(Buffer.byteLength(content) <= WIRE_BYTES, 'capacity');
  let root = path.dirname(target); while (!fs.existsSync(root)) root = path.dirname(root);
  const ancestry = pathIdentity(root); const relative = path.relative(root, target);
  const check = () => {
    assertProfileStorage(target, owner);
    requireValue(pathIdentity(root) === ancestry, 'stale');
  };
  withFileLock(path.join(root, '.cursor-' + digest(target) + '.lock'), () => {
    check();
    const baseline = inspectWorkspaceFile(root, relative, check, WIRE_BYTES);
    if (baseline.state === 'exists') requireValue((baseline.mode & 0o077) === 0, 'denied');
    requireValue(digest(previous) === digest(baseline.state === 'exists' ? parseJson(baseline.content, WIRE_BYTES) : undefined), 'stale');
    commitWorkspaceFile({ workspaceRoot: root, relativePath: relative, expected: baseline, content, mode: 0o600,
      maxBytes: WIRE_BYTES, assertFileAccess: check });
  }, { createParent: false, recovery: 'local-dead' });
}
