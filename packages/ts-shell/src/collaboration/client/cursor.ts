import fs from 'node:fs';
import path from 'node:path';
import { resolveUserDataFile } from '../../core/paths/userHome.js';
import { inspectWorkspaceFile, pathIdentity, readTextFile } from '../../core/workspace/files.js';
import { withFileLock } from '../../session/store/sessionFileStore.js';
import { commitWorkspaceFile } from '../../edit/authority/commit.js';
import { digest, parseJson, requireValue } from '../contract/value.js';
import { WIRE_BYTES } from '../contract/model.js';

export function cursorPath(origin: string, principal: string, roomId: string, localIdentity: string): string {
  return resolveUserDataFile(path.join('collaboration', 'cursors', digest([origin, principal, roomId, localIdentity]) + '.json'));
}
export function readCursor(target: string): unknown {
  const source = readTextFile(target, WIRE_BYTES); return source === undefined ? undefined : parseJson(source, WIRE_BYTES);
}
export function saveCursor(target: string, previous: unknown, value: unknown): void {
  const content = JSON.stringify(value) + '\n'; requireValue(Buffer.byteLength(content) <= WIRE_BYTES, 'capacity');
  let root = path.dirname(target); while (!fs.existsSync(root)) root = path.dirname(root);
  const ancestry = pathIdentity(root); const relative = path.relative(root, target);
  withFileLock(path.join(root, '.cursor-' + digest(target) + '.lock'), () => {
    requireValue(pathIdentity(root) === ancestry && digest(readCursor(target)) === digest(previous), 'stale');
    const baseline = inspectWorkspaceFile(root, relative, undefined, WIRE_BYTES);
    commitWorkspaceFile({ workspaceRoot: root, relativePath: relative, expected: baseline, content, mode: 0o600 });
  }, { createParent: false });
}
