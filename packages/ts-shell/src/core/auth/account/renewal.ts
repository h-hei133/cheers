import { createHash, randomUUID } from 'node:crypto';
import { accountAuthKey } from '../../providers/facts.js';
import { getRuntimeConfig, type AccountAuthConfig } from '../../../config/runtimeConfig.js';
import { ConfigWriteError, type ConfigWriteState } from '../../../config/outcome.js';
import { accountAuthFor, renewAccountAuthIfExpiring } from '../../../provider/request/authorization.js';
import type { ProviderCredentialResolution } from '../../shell/providerCredentials.js';
import { assertAdmission, type Admission } from '../../network/admission.js';
import { isExpiring } from '../oauth/flow.js';
import { captureAccountEdit, persistAccountEdit } from './state.js';
import { acquireRefreshLease, finishRefreshLease, markRefreshDispatched, markRefreshUnknown,
  readRefreshLease, refreshLineage, releaseRefreshLease } from './lease.js';

export interface StoredAccountRenewal {
  readonly accountAuth?: AccountAuthConfig;
  /** The returned token was confirmed in its captured storage identity. */
  readonly stored: boolean;
  readonly writeState: ConfigWriteState;
  readonly cleanupFailed?: boolean;
  readonly failure?: string;
}

function credentialId(resolution: ProviderCredentialResolution): string {
  return `${resolution.provider}:${resolution.credential?.connectionId ?? 'config'}`;
}

/** The same lineage identity the pool uses, derived from the credential material. */
function generation(account: AccountAuthConfig): string {
  return createHash('sha256').update(JSON.stringify(account)).digest('hex').slice(0, 16);
}

/** Re-read the stored slot after another process finished; never invent a token. */
function storedAccountAuth(workspaceRoot: string, resolution: ProviderCredentialResolution): AccountAuthConfig | undefined {
  const slot = accountAuthKey(resolution.provider);
  if (!slot) return undefined;
  const config = getRuntimeConfig(workspaceRoot);
  const connectionId = resolution.credential?.connectionId;
  if (connectionId) {
    const connection = config.providerConnections.find(candidate => candidate.id === connectionId);
    const auth = connection?.accountAuth?.[slot];
    if (auth) return auth;
  }
  return config.providerCredentials[resolution.provider]?.accountAuth?.[slot];
}

async function waitForPeerRenewal(key: string, workspaceRoot: string, resolution: ProviderCredentialResolution,
  original: AccountAuthConfig): Promise<AccountAuthConfig | undefined> {
  for (let attempt = 0; attempt < 25; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 200));
    const lease = readRefreshLease(key);
    if (lease?.phase === 'unknown') return undefined;
    if (lease) continue;
    const fresh = storedAccountAuth(workspaceRoot, resolution);
    return fresh && fresh.refreshToken !== original.refreshToken ? fresh : undefined;
  }
  return undefined;
}

/** A spent token is conditionally saved even if the initiating operation ended.
 * Permission to dispatch the next request remains the caller's admission check. */
export async function renewStoredAccount(input: {
  readonly workspaceRoot: string;
  readonly resolution: ProviderCredentialResolution;
  readonly fetchImpl: typeof fetch;
  readonly admission?: Admission;
}): Promise<StoredAccountRenewal> {
  const original = accountAuthFor(input.resolution.provider, input.resolution.credential ?? {});
  if (!original || !isExpiring(original.expiresAt)) return { accountAuth: original, stored: false, writeState: 'unchanged' };

  const owner = randomUUID();
  const lineage = { provider: input.resolution.provider, credentialId: credentialId(input.resolution),
    generation: generation(original), refreshToken: original.refreshToken };
  const key = refreshLineage(lineage);
  let ownsLease = false;
  let dispatched = false;
  try {
    assertAdmission(input.admission);
    const edit = captureAccountEdit(input.workspaceRoot, input.resolution);
    const result = await renewAccountAuthIfExpiring({ provider: input.resolution.provider,
      credential: input.resolution.credential ?? {}, fetchImpl: input.fetchImpl,
      renewalLease: { acquire: () => {
        try {
          const lease = acquireRefreshLease({ ...lineage, owner });
          ownsLease = lease.acquired;
          return { acquired: lease.acquired, ...(lease.unknown ? { unknown: true } : {}) };
        } catch { return { acquired: false, unknown: true }; }
      } },
      onDispatch: () => { markRefreshDispatched(key, owner); dispatched = true; } });
    if (result.leaseHeld) {
      const fresh = await waitForPeerRenewal(key, input.workspaceRoot, input.resolution, original);
      return fresh ? { accountAuth: fresh, stored: true, writeState: 'unchanged' }
        : { stored: false, writeState: 'unchanged', failure: 'Another process is renewing this login; retry shortly.' };
    }
    if (result.leaseUnknown) return { stored: false, writeState: 'unchanged',
      failure: 'A previous renewal may have spent this login. Reconnect the account before retrying.' };
    if (result.failure || !result.accountAuth) {
      if (dispatched) markRefreshUnknown(key, owner); else if (ownsLease) releaseRefreshLease(key, owner);
      // Provider error text is not repeated here: it can carry request material.
      return { stored: false, writeState: 'unchanged',
        failure: 'Account credential renewal failed. Reconnect the account, then retry.' };
    }
    let saved: { accountAuth: AccountAuthConfig; writeState: 'unchanged' | 'persisted' };
    try { saved = persistAccountEdit(edit, result.accountAuth); }
    catch (error) {
      // The server may have rotated the token while storage refused it.
      if (dispatched) markRefreshUnknown(key, owner);
      throw error;
    }
    try { finishRefreshLease(key, lineage.generation); }
    catch { return { ...saved, stored: true, cleanupFailed: true }; }
    return { ...saved, stored: true };
  } catch (error) {
    try { if (dispatched) markRefreshUnknown(key, owner); else releaseRefreshLease(key, owner); } catch { /* The durable state stays as written. */ }
    const state = error instanceof ConfigWriteError ? error.state : 'unchanged';
    const code = error instanceof ConfigWriteError ? error.code : 'unavailable';
    const cleanupFailed = error instanceof ConfigWriteError && error.cleanupFailed;
    return { stored: false, writeState: state,
      ...(cleanupFailed ? { cleanupFailed: true } : {}),
      failure: `Account credential renewal was not accepted (${code}; write state: ${state}${cleanupFailed ? '; lock cleanup failed' : ''}). Reload or reconnect before retrying.` };
  }
}
