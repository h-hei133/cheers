import { currentProfile } from '../../paths/profile/context.js';
import { openAIOAuthConfig } from '../oauth/providers.js';
import type { ProviderCredentialResolution } from '../credential.js';
import { accountBinding, captureAccountEdit } from './state.js';
import { captureLeaseStore, refreshLeasesPath } from './lease.js';
import { readLeases } from './lease/state.js';
import { credentialDigest, refreshLineage } from './lineage.js';

/** Only the existing native login/rotation grant may preserve replay across tokens. */
export function accountReplayOwner(workspaceRoot: string, resolution: ProviderCredentialResolution,
  sessionId?: string): string | undefined {
  const account = resolution.credential?.accountAuth;
  if (account?.type !== 'openai-chatgpt-account' || !account.loginId?.trim() || !account.accountId?.trim()) return undefined;
  try {
    const binding = accountBinding(captureAccountEdit(workspaceRoot, resolution, sessionId));
    const state = readLeases(captureLeaseStore(refreshLeasesPath()));
    const row = state.leases[refreshLineage({ provider: resolution.provider, refreshToken: account.refreshToken })];
    const grant = row?.grant;
    if (!grant || row.active || Object.values(row.attempts).some(attempt => attempt.grantId === grant.id && attempt.phase === 'rotated-persisted')
      || !['login', 'rotation'].includes(grant.origin) || grant.owner !== binding.owner
      || grant.generation !== binding.generation || grant.storage !== binding.storage) return undefined;
    const profile = currentProfile(); const issuer = openAIOAuthConfig();
    return credentialDigest([issuer.tokenUrl, issuer.clientId, account.accountId, account.loginId,
      resolution.credential?.connectionId ?? 'config', profile?.id ?? '', profile?.root ?? '', profile?.rootIdentity ?? '']);
  } catch { return undefined; }
}
