import fs from 'node:fs';
import path from 'node:path';
import { userDataDir } from '../../core/paths/userHome.js';
import { hashContent, inspectWorkspaceFile, pathIdentity } from '../../core/workspace/files.js';
import { commitWorkspaceFile } from '../../edit/authority/commit.js';
import { withFileLock } from '../../session/store/sessionFileStore.js';
import { validateToolArguments } from '../../core/tools/arguments.js';
import type { ResetAttempt } from '../../core/auth/account/usage/model.js';

const text = { type: 'string', minLength: 1, maxLength: 512 };
const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const schema = { type: 'object', additionalProperties: false, required: ['attempts'], properties: { attempts: { type: 'array', maxItems: 128, items: { type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'id', 'accountKey', 'credentialKey', 'sessionId', 'credit', 'createdAt', 'expiresAt', 'status'], properties: {
    schemaVersion: { const: 1 }, id: text, accountKey: digest, credentialKey: digest, sessionId: text, createdAt: text, expiresAt: text,
    status: { enum: ['prepared', 'pending', 'reset', 'refused', 'unknown'] }, code: { enum: ['reset', 'no_credit', 'nothing_to_reset', 'already_redeemed'] },
    credit: { type: 'object', additionalProperties: false, required: ['id', 'resetType', 'expiresAt'], properties: { id: text, resetType: text, expiresAt: text } },
  } } } } };

function location(accountKey: string): { root: string; relative: string; lock: string } {
  if (!/^[a-f0-9]{64}$/.test(accountKey)) throw new Error('Account reset identity is invalid.');
  const root = userDataDir(); const relative = path.join('accounts', 'resets', `${accountKey}.json`);
  pathIdentity(path.join(root, relative));
  return { root, relative, lock: path.join(root, 'accounts', 'resets', `${accountKey}.lock`) };
}
function decode(content: string | undefined, accountKey: string): readonly ResetAttempt[] {
  const value: unknown = content === undefined ? [] : JSON.parse(content);
  validateToolArguments(schema, { attempts: value });
  const attempts = value as ResetAttempt[];
  if (new Set(attempts.map(attempt => attempt.id)).size !== attempts.length
    || attempts.some(attempt => attempt.accountKey !== accountKey || !Number.isFinite(Date.parse(attempt.createdAt)) || !Number.isFinite(Date.parse(attempt.expiresAt)))) throw new Error('Account reset receipts are invalid.');
  return attempts;
}
export function readResetAttempts(accountKey: string): readonly ResetAttempt[] {
  const { root, relative } = location(accountKey);
  if (!fs.existsSync(root)) return [];
  const state = inspectWorkspaceFile(root, relative, undefined, 128 * 1024);
  return decode(state.state === 'exists' ? state.content : undefined, accountKey);
}
/** Short synchronous CAS sections fence the account while the remote call runs outside the lock. */
export function updateResetAttempts(accountKey: string, change: (attempts: readonly ResetAttempt[]) => readonly ResetAttempt[]): readonly ResetAttempt[] {
  const { root, relative, lock } = location(accountKey);
  fs.mkdirSync(path.dirname(lock), { recursive: true, mode: 0o700 }); pathIdentity(lock);
  return withFileLock(lock, () => {
    pathIdentity(lock); const before = inspectWorkspaceFile(root, relative, undefined, 128 * 1024);
    const next = change(decode(before.state === 'exists' ? before.content : undefined, accountKey));
    const text = JSON.stringify(next); decode(text, accountKey);
    commitWorkspaceFile({ workspaceRoot: root, relativePath: relative, expected: before, content: text, mode: 0o600, maxBytes: 128 * 1024 });
    const saved = inspectWorkspaceFile(root, relative, undefined, 128 * 1024);
    if (saved.state !== 'exists' || saved.hash !== hashContent(text)) throw new Error('Account reset publication is unconfirmed.');
    return next;
  }, { createParent: false, recovery: 'local-dead' });
}
