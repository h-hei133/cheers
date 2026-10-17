import fs from 'node:fs';
import path from 'node:path';
import { resolveUserDataFile } from '../../core/paths/userHome.js';
import { inspectWorkspaceFile, pathIdentity, readTextFile } from '../../core/workspace/files.js';
import { withFileLock } from '../../session/store/sessionFileStore.js';
import { commitWorkspaceFile } from '../../edit/authority/commit.js';
import { digest, parseJson, requireValue } from '../contract/value.js';
import { WIRE_BYTES } from '../contract/model.js';
import { assertProfileStorage, currentProfile, type ProfileContext } from '../../core/paths/profile/context.js';

export function cursorPath(origin: string, principal: string, roomId: string, localIdentity: string): string {
  return resolveUserDataFile(path.join('collaboration', 'cursors', digest([origin, principal, roomId, localIdentity]) + '.json'));
}
export function readCursor(target: string, owner = currentProfile()): unknown {
  assertProfileStorage(target, owner);
  const source = readTextFile(target, WIRE_BYTES); return source === undefined ? undefined : parseJson(source, WIRE_BYTES);
}
export function saveCursor(target: string, previous: unknown, value: unknown, owner: ProfileContext | undefined = currentProfile()): void {
  assertProfileStorage(target, owner);
  const content = JSON.stringify(value) + '\n'; requireValue(Buffer.byteLength(content) <= WIRE_BYTES, 'capacity');
  let root = path.dirname(target); while (!fs.existsSync(root)) root = path.dirname(root);
  const ancestry = pathIdentity(root); const relative = path.relative(root, target);
  withFileLock(path.join(root, '.cursor-' + digest(target) + '.lock'), () => {
    assertProfileStorage(target, owner);
    requireValue(pathIdentity(root) === ancestry && digest(readCursor(target, owner)) === digest(previous), 'stale');
    const baseline = inspectWorkspaceFile(root, relative, undefined, WIRE_BYTES);
    commitWorkspaceFile({ workspaceRoot: root, relativePath: relative, expected: baseline, content, mode: 0o600 });
  }, { createParent: false });
}
