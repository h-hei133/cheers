import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { resolveUserDataFile } from '../../../core/paths/userHome.js';
import { assertProfileStorage, currentProfile, type ProfileContext } from '../../../core/paths/profile/context.js';
import { readTextFile, pathIdentity, inspectWorkspaceFile } from '../../../core/workspace/files.js';
import { withFileLock } from '../../../session/store/sessionFileStore.js';
import { commitWorkspaceFile } from '../../../edit/authority/commit.js';
import { assertAdmission, type Admission } from '../../../core/network/admission.js';
import type { ScopedMcpServerConfig } from '../../../core/mcp/types.js';
import { parseCredentials, type McpCredentials } from './record.js';

export const CREDENTIAL_BYTES = 64 * 1024;

/** Full project definitions cannot claim a user's credentials by name or URL. */
export function credentialPath(name: string, config: ScopedMcpServerConfig): string {
  const key = createHash('sha256').update(JSON.stringify([name, new URL(config.url!).href, config.scope, config.sourcePath ?? 'direct'])).digest('hex');
  return resolveUserDataFile(path.join('mcp-auth', key + '.json'));
}

export function readCredentials(target: string, profile: ProfileContext | undefined = currentProfile()): { text: string | undefined; identity: string; record: McpCredentials | undefined } {
  assertProfileStorage(target, profile);
  const text = readTextFile(target, CREDENTIAL_BYTES);
  return { text, identity: pathIdentity(target), record: parseCredentials(text) };
}

/** The sign-in/refresh owner supplies authority; the existing commit boundary publishes exact bytes. */
export function saveCredentials(target: string, baseline: { text: string | undefined; identity: string }, next: McpCredentials | undefined, admission?: Admission,
  profile: ProfileContext | undefined = currentProfile()): void {
  assertProfileStorage(target, profile);
  // Every logout publishes a fresh revocation identity, including an absent profile.
  // A late sign-in cannot mistake absent→absent logout for its original baseline.
  const content = JSON.stringify(next ?? { version: 1, revoked: true, revision: randomUUID() }, null, 2) + '\n';
  if (Buffer.byteLength(content) > CREDENTIAL_BYTES) throw new Error('MCP credential record exceeds its limit.');
  parseCredentials(content);
  let root = path.dirname(target); while (!fs.existsSync(root)) root = path.dirname(root);
  const relativePath = path.relative(root, target); const expected = inspectWorkspaceFile(root, relativePath, undefined, CREDENTIAL_BYTES);
  const check = () => {
    assertProfileStorage(target, profile);
    assertAdmission(admission);
    if (pathIdentity(target) !== baseline.identity || readTextFile(target, CREDENTIAL_BYTES) !== baseline.text) throw new Error('FILE_CONTENT_CHANGED: MCP credentials changed during authentication.');
  };
  const lock = path.join(root, `.publication-${createHash('sha256').update(target).digest('hex')}.lock`);
  assertProfileStorage(lock, profile);
  withFileLock(lock, () => {
    check(); commitWorkspaceFile({ workspaceRoot: root, relativePath, expected, content, mode: 0o600,
      assertFileAccess: () => { assertProfileStorage(target, profile); assertAdmission(admission); } });
    assertProfileStorage(target, profile);
    if (readTextFile(target, CREDENTIAL_BYTES) !== content) throw new Error('MCP credential publication is unverified.');
  }, { createParent: false });
}
