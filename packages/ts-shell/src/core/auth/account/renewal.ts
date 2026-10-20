import { credentialDigest } from './lineage.js';
import { ConfigWriteError, type ConfigWriteState } from '../../../config/outcome.js';
import { accountAuthFor, nativeAccountProduction, renewAccountAuthIfExpiring } from '../../../provider/request/authorization.js';
import type { AccountAuthConfig } from '../../../config/runtimeConfig.js';
import type { ProviderCredentialResolution } from '../../shell/providerCredentials.js';
import { assertAdmission, type Admission } from '../../network/admission.js';
import { isExpiring } from '../oauth/flow.js';
import { accountBinding, captureAccountEdit, persistAccountEdit, readAccountRotationReceipt, type AccountEdit } from './state.js';
import type { AccountRotation } from './contract.js';
import { sameValue } from '../../../config/values.js';
import { acquireRefreshLease, finishRefreshLease, markRefreshDispatched, markRefreshUnknown, readRefreshAttempt,
  recordRefreshProduction, refreshLeasesPath, captureLeaseStore, releaseRefreshLease, type RefreshClaim } from './lease.js';

export interface StoredAccountRenewal {
  readonly accountAuth?: AccountAuthConfig;
  /** Optional in-memory proof for consumers of the credential publication. */
  readonly rotation?: AccountRotation;
  readonly stored: boolean;
  readonly writeState: ConfigWriteState;
  readonly cleanupFailed?: boolean;
  readonly failure?: string;
}

function receiptFor(edit: AccountEdit, claim: RefreshClaim): AccountRotation | undefined {
  const attempt = readRefreshAttempt(claim);
  if (attempt?.phase !== 'rotated-persisted' || !attempt.production) return undefined;
  const rotation = readAccountRotationReceipt(edit);
  return rotation && sameValue(accountBinding(edit, rotation.accountAuth), {
    owner: attempt.production.owner, generation: attempt.production.generation, storage: attempt.production.storage,
  }) ? rotation : undefined;
}

async function waitForPeerRenewal(claim: RefreshClaim, edit: AccountEdit): Promise<AccountRotation | undefined> {
  for (let attempt = 0; attempt < 25; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 200));
    const current = readRefreshAttempt(claim);
    if (current?.phase === 'rotated-persisted') return receiptFor(edit, claim);
    if (current?.phase === 'unknown') return undefined;
  }
  return undefined;
}

function failed(): StoredAccountRenewal {
  return { stored: false, writeState: 'unchanged',
    failure: 'A previous renewal may have spent this login. Reconnect with an independent login before retrying.' };
}

/** The native response is fingerprinted before storage; only exact verified storage grants its successor. */
export async function renewStoredAccount(input: {
  readonly workspaceRoot: string;
  readonly resolution: ProviderCredentialResolution;
  readonly fetchImpl: typeof fetch;
  readonly admission?: Admission;
}): Promise<StoredAccountRenewal> {
  const original = accountAuthFor(input.resolution.provider, input.resolution.credential ?? {});
  if (!original && input.resolution.credential?.accountAuth?.type === 'subscription') {
    return { stored: false, writeState: 'unchanged', failure: 'Subscription provider is unsupported or unverified. Reconnect before requests.' };
  }
  if (!original || !original.refreshToken?.trim() || !['openai', 'google', 'github-copilot'].includes(input.resolution.provider)) {
    return { accountAuth: original, stored: false, writeState: 'unchanged' };
  }
  const expiring = isExpiring(original.expiresAt);
  let claim: RefreshClaim | undefined;
  let dispatched = false;
  try {
    assertAdmission(input.admission);
    const store = captureLeaseStore(refreshLeasesPath());
    const edit = captureAccountEdit(input.workspaceRoot, input.resolution);
    const lease = acquireRefreshLease({ provider: input.resolution.provider,
      credentialId: `${input.resolution.provider}:${input.resolution.credential?.connectionId ?? 'config'}`,
      refreshToken: original.refreshToken, ...('clientId' in original ? { clientId: original.clientId } : {}),
      store, binding: accountBinding(edit), prepare: expiring });
    claim = lease.claim;
    if (lease.recovered) {
      if (original.expiresAt <= Date.now()) return { stored: false, writeState: 'unchanged',
        failure: 'Account credential storage was recovered, but its access token has expired. Retry to renew the saved login.' };
      return { accountAuth: original, stored: true, writeState: 'unchanged' };
    }
    if (!expiring) return { accountAuth: original, stored: false, writeState: 'unchanged' };
    if (lease.unknown || !claim) return failed();
    const captured = claim;
    const scope = credentialDigest([captured.file, captured.profile?.rootIdentity, captured.key, captured.grantId, captured.attemptId,
      captured.binding.owner, captured.binding.generation]);
    const result = await renewAccountAuthIfExpiring({ provider: input.resolution.provider,
      credential: input.resolution.credential ?? {}, fetchImpl: input.fetchImpl,
      renewalLease: { shareKey: scope, acquire: () => ({ acquired: lease.acquired }) },
      onDispatch: () => { markRefreshDispatched(captured); dispatched = true; } });
    if (result.leaseHeld) {
      const fresh = await waitForPeerRenewal(captured, edit);
      return fresh ? { accountAuth: fresh.accountAuth, rotation: fresh, stored: true, writeState: 'unchanged' }
        : { stored: false, writeState: 'unchanged', failure: 'Another process is renewing this login; retry shortly.' };
    }
    const proof = nativeAccountProduction(result, scope);
    if (result.failure || !result.accountAuth || !proof || sameValue(original, result.accountAuth)
      || result.accountAuth.expiresAt <= Date.now()) {
      if (dispatched) markRefreshUnknown(captured); else if (lease.acquired) releaseRefreshLease(captured);
      return { stored: false, writeState: 'unchanged',
        failure: 'Account credential renewal failed or its native response was not verified. Reconnect the account, then retry.' };
    }
    const produced = { ...accountBinding(edit, result.accountAuth), lineage: proof.lineage };
    if (produced.generation !== proof.generation) throw new Error('Native credential fingerprint mismatch.');
    recordRefreshProduction(captured, produced);
    const saved = persistAccountEdit(edit, result.accountAuth);
    try { finishRefreshLease(captured, accountBinding(edit, saved.accountAuth)); }
    catch {
      // Saved bytes are truthful, but finalization must be recovered from this exact native fingerprint.
      return { ...saved, stored: true, cleanupFailed: true };
    }
    const rotation = receiptFor(edit, captured);
    if (!rotation) throw new ConfigWriteError('verification-failed', saved.writeState);
    return { ...saved, rotation, stored: true };
  } catch (error) {
    try {
      if (claim) {
        const current = readRefreshAttempt(claim);
        if (dispatched || current?.production) markRefreshUnknown(claim); else releaseRefreshLease(claim);
      }
    } catch { /* Preserve the last verified durable state. */ }
    const state = error instanceof ConfigWriteError ? error.state : 'unchanged';
    const code = error instanceof ConfigWriteError ? error.code : 'unavailable';
    const cleanupFailed = error instanceof ConfigWriteError && error.cleanupFailed;
    return { stored: false, writeState: state, ...(cleanupFailed ? { cleanupFailed: true } : {}),
      failure: `Account credential renewal was not accepted (${code}; write state: ${state}${cleanupFailed ? '; lock cleanup failed' : ''}). Reload or reconnect before retrying.` };
  }
}
