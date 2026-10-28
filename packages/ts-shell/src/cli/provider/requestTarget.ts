import type { EndpointKind } from '../../provider/endpoints/index.js';
import type { ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import { accountAuthFor, providerAuthorization } from '../../provider/request/authorization.js';
import { accountReplayOwner } from '../../core/auth/account/replay.js';
import { credentialIdentityFor } from '../../core/auth/account/pool.js';
import { requestReplayBinding } from '../../provider/request/replay.js';

export interface ProviderRequestTarget {
  readonly headers: Readonly<Record<string, string>>;
  readonly replayOwner?: string;
  readonly credentialId?: string;
  readonly credentialGeneration?: string;
  readonly replayBinding: string;
}

/** Capture every non-secret field that can change provider request or replay shape. */
export function providerRequestTarget(input: {
  readonly workspaceRoot: string;
  readonly sessionId?: string;
  readonly resolution: ProviderCredentialResolution;
  readonly baseUrl: string;
  readonly endpoint?: EndpointKind;
}): ProviderRequestTarget {
  const { resolution, endpoint } = input;
  const headers = providerAuthorization({
    apiKey: resolution.credential?.apiKey,
    accountAuth: accountAuthFor(resolution.provider, resolution.credential ?? {}),
    ...(endpoint ? { endpoint } : {}),
  }).headers;
  const replayOwner = accountReplayOwner(input.workspaceRoot, resolution, input.sessionId);
  const credential = credentialIdentityFor(resolution.provider, resolution.credential);
  const replayBinding = requestReplayBinding({
    provider: resolution.provider,
    ...(endpoint ? { endpoint } : {}),
    baseUrl: input.baseUrl,
    headers,
    ...(replayOwner ? { replayOwner } : {}),
    ...(credential ? { credentialId: credential.credentialId, credentialGeneration: credential.generation } : {}),
  });
  return {
    headers,
    replayBinding,
    ...(replayOwner ? { replayOwner } : {}),
    ...(credential ? { credentialId: credential.credentialId, credentialGeneration: credential.generation } : {}),
  };
}
