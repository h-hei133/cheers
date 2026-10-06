import type { AccountAuthConfig } from '../../../config/runtimeConfig.js';
import { ConfigWriteError, type ConfigWriteState } from '../../../config/outcome.js';
import { accountAuthFor, renewAccountAuthIfExpiring } from '../../../provider/request/authorization.js';
import type { ProviderCredentialResolution } from '../../shell/providerCredentials.js';
import { assertAdmission, type Admission } from '../../network/admission.js';
import { isExpiring } from '../oauth/flow.js';
import { captureAccountEdit, persistAccountEdit } from './state.js';

export interface StoredAccountRenewal {
  readonly accountAuth?: AccountAuthConfig;
  /** The returned token was confirmed in its captured storage identity. */
  readonly stored: boolean;
  readonly writeState: ConfigWriteState;
  readonly cleanupFailed?: boolean;
  readonly failure?: string;
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
  try {
    assertAdmission(input.admission);
    const edit = captureAccountEdit(input.workspaceRoot, input.resolution);
    const result = await renewAccountAuthIfExpiring({ provider: input.resolution.provider,
      credential: input.resolution.credential ?? {}, fetchImpl: input.fetchImpl });
    if (result.failure || !result.accountAuth) return { stored: false, writeState: 'unchanged',
      failure: 'Account credential renewal failed. Reconnect the account, then retry.' };
    // Shared callers may receive changed tokens with renewed:false. Each must
    // verify the complete durable result instead of relying on another caller.
    const saved = persistAccountEdit(edit, result.accountAuth);
    return { ...saved, stored: true };
  } catch (error) {
    const state = error instanceof ConfigWriteError ? error.state : 'unchanged';
    const code = error instanceof ConfigWriteError ? error.code : 'unavailable';
    const cleanupFailed = error instanceof ConfigWriteError && error.cleanupFailed;
    return { stored: false, writeState: state,
      ...(cleanupFailed ? { cleanupFailed: true } : {}),
      failure: `Account credential renewal was not accepted (${code}; write state: ${state}${cleanupFailed ? '; lock cleanup failed' : ''}). Reload or reconnect before retrying.` };
  }
}
