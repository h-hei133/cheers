import { createHash } from 'node:crypto';
import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import { sameValue } from '../../config/values.js';
import { captureAccountEdit, readAccountRotationReceipt, type AccountEdit } from '../../core/auth/account/state.js';
import { renewStoredAccount } from '../../core/auth/account/renewal.js';
import type { AccountRotation, AccountPublication } from '../../core/auth/account/contract.js';
import { isExpiring } from '../../core/auth/oauth/flow.js';
import { admittedFetch, assertAdmission, type Admission } from '../../core/network/admission.js';
import type { ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import { accountAuthFor } from '../../provider/request/authorization.js';
import { providerFetchFromTimeouts, providerTimeoutsFrom } from '../../provider/request/fetch.js';

export type { AccountRotation, AccountPublication } from '../../core/auth/account/contract.js';

/** A turn shares at most 32 owned renewals. Tokens never become cache keys or public state. */
export function delegatedRenewal(host: { readonly workspaceRoot: string; readonly sessionId?: string; readonly runtimeConfig?: RuntimeConfig;
  readonly onCredentialPersisted?: (rotation?: AccountRotation) => boolean | void }) {
  const entries = new Map<string, Promise<{ readonly fresh: ProviderCredentialResolution; readonly edit: AccountEdit; published: boolean }>>();
  return async (resolution: ProviderCredentialResolution, admission?: Admission, publication?: AccountPublication): Promise<ProviderCredentialResolution> => {
    assertAdmission(admission);
    const original = accountAuthFor(resolution.provider, resolution.credential ?? {});
    if (!original || !isExpiring(original.expiresAt)) return resolution;
    const key = createHash('sha256').update(JSON.stringify([resolution.provider, resolution.baseUrl,
      resolution.selection, resolution.credential?.source, resolution.credential?.connectionId, original])).digest('hex');
    let pending = entries.get(key);
    if (!pending) {
      if (entries.size >= 32) throw new Error('The turn account preparation limit was reached. Start a new turn.');
      pending = (async () => {
        const edit = captureAccountEdit(host.workspaceRoot, resolution, host.sessionId);
        const renewed = await renewStoredAccount({ workspaceRoot: host.workspaceRoot, sessionId: host.sessionId, resolution, admission,
          fetchImpl: admittedFetch(providerFetchFromTimeouts(providerTimeoutsFrom(host.runtimeConfig)), admission) });
        if (renewed.failure || !renewed.stored || !renewed.accountAuth) throw new Error(renewed.failure ?? 'Delegated account renewal was not verified.');
        const fresh = { ...resolution, credential: { ...resolution.credential!, accountAuth: renewed.accountAuth } };
        return { fresh, edit, published: false };
      })();
      entries.set(key, pending);
      void pending.catch(() => { if (entries.get(key) === pending) entries.delete(key); });
    }
    const entry = await pending;
    const { fresh } = entry;
    // Every consumer rechecks the saved owner; a cached token cannot survive logout or relogin.
    const rotation = readAccountRotationReceipt(entry.edit);
    if (!rotation || !sameValue(rotation.accountAuth, fresh.credential?.accountAuth)
      || fresh.credential!.accountAuth!.expiresAt <= Date.now()) throw new Error('Delegated account preparation became stale. Start a new turn.');
    if (!entry.published) {
      entry.published = true;
      const publish = () => host.onCredentialPersisted?.(rotation);
      if (publication) publication(rotation, publish); else publish();
    }
    assertAdmission(admission);
    return { ...resolution, credential: { ...resolution.credential!, accountAuth: fresh.credential!.accountAuth } };
  };
}
