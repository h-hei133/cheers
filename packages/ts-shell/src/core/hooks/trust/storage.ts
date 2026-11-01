import fs from 'node:fs';
import path from 'node:path';
import { assertProfileStorage, type ProfileContext } from '../../paths/profile/context.js';
import { isTrustFileMissing } from '../../security/trust/source.js';
import { isRecord } from '../../values/record.js';
import { withFileLock, writeTextFileAtomic } from '../../../session/store/sessionFileStore.js';

export interface HookTrustState {
  readonly version: 2;
  readonly approved: Record<string, string>;
  readonly sources: Record<string, { readonly sourcePath: string; readonly revision: string }>;
  readonly withdrawals: Record<string, string>;
}

export class HookTrustUpdateError extends Error {
  constructor(readonly publicationVerified: boolean) {
    super('Hook trust update did not finish normally.');
  }
}

function stringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(item => typeof item === 'string');
}

/** Missing is empty; damaged or unreadable state must never become a writable empty store. */
export function readHookTrust(file: string, profile: ProfileContext | undefined): HookTrustState {
  assertProfileStorage(file, profile);
  let raw: string;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && isTrustFileMissing(file)) {
      return { version: 2, approved: {}, sources: {}, withdrawals: {} };
    }
    throw new Error('Hook trust state is unavailable.');
  }
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || ![1, 2].includes(value.version as number) || !stringRecord(value.approved)) {
    throw new Error('Hook trust state is invalid.');
  }
  if (value.version === 1) return { version: 2, approved: value.approved, sources: {}, withdrawals: {} };
  if (!isRecord(value.sources) || !stringRecord(value.withdrawals)
    || !Object.entries(value.withdrawals).every(([source, revision]) => path.resolve(source) === source && revision.length > 0)
    || !Object.values(value.sources).every(item => isRecord(item) && typeof item.sourcePath === 'string'
      && path.resolve(item.sourcePath) === item.sourcePath && typeof item.revision === 'string')) {
    throw new Error('Hook trust state is invalid.');
  }
  return value as unknown as HookTrustState;
}

/** All writers reread under the same process lock and verify the actual publication. */
export function updateHookTrust<T>(file: string, profile: ProfileContext | undefined,
  change: (state: HookTrustState) => { readonly value: T; readonly state?: HookTrustState }): T {
  assertProfileStorage(file, profile);
  assertProfileStorage(file + '.lock', profile);
  let publicationVerified = false;
  try { return withFileLock(file + '.lock', () => {
    const before = readHookTrust(file, profile), next = change(before);
    if (next.state) {
      const text = JSON.stringify(next.state, null, 2);
      assertProfileStorage(file, profile);
      writeTextFileAtomic(file, text, 0o600);
      assertProfileStorage(file, profile);
      if (fs.readFileSync(file, 'utf8') !== text) throw new Error('Hook trust publication is unverified.');
      publicationVerified = true;
    }
    return next.value;
  }, { recovery: 'local-dead' }); }
  catch { throw new HookTrustUpdateError(publicationVerified); }
}
