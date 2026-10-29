import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import { assertScopedModel } from '../../config/scope/projection.js';
import { credentialIdentityFor } from '../../core/auth/account/pool.js';
import { providerCredentialBaseUrl, providerCredentialEndpoint } from '../../core/auth/account/target.js';
import { renewStoredAccount } from '../../core/auth/account/renewal.js';
import { catalogProvider, type CatalogProvider } from '../../core/models/catalog.js';
import { resolveRequestShape } from '../../core/models/requestShape.js';
import { admittedFetch, assertAdmission, type Admission } from '../../core/network/admission.js';
import type { ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import { refreshShellRuntimeConfig, type ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import { endpointShape } from '../../provider/endpoints/index.js';
import { accountAuthFor, providerAuthorization } from '../../provider/request/authorization.js';
import { providerFetchFromTimeouts, providerTimeoutsFrom } from '../../provider/request/fetch.js';
import type { CompactionProvider } from '../runtime/compaction.js';

export interface ProviderRenewal {
  readonly provider?: CompactionProvider;
  readonly failure?: string;
}

/** Provider capture and renewal shared by automatic and explicit compaction. */
export function createCompactionProviders(input: {
  readonly runtimeContext: ShellRuntimeContext;
  readonly renderer: StreamingRenderer;
}) {
  /**
   * The provider both compaction paths summarize with, or nothing when none is
   * configured.
   *
   * Authentication may be a static key, an account token, or an endpoint signer
   * that resolves credentials at dispatch. A signer needs no key in this snapshot.
   *
   * The renewal runs on the explicit paths because they are request paths of their
   * own: `/compact` and the abandoned-turn summary do not pass through the
   * invocation path where the turn's own token is renewed, so an expired account
   * token would be carried into a summarization request and come back as a provider
   * refusal. The turn's own path has already renewed by the time it gets here.
   */
  const compactionTarget = (resolved: ProviderCredentialResolution, catalog: readonly CatalogProvider[]) => {
    if (resolved.blocked) return undefined;
    const baseUrl = providerCredentialBaseUrl(catalog, resolved);
    if (catalogProvider(catalog, resolved.provider, baseUrl).ambiguous) return undefined;
    const credential = resolved.credential;
    const accountAuth = accountAuthFor(resolved.provider, credential ?? {});
    if (!credential?.apiKey && !accountAuth && !endpointShape(providerCredentialEndpoint(catalog, resolved, baseUrl)).signer) return undefined;
    const model = resolved.model ?? credential?.model;
    if (!baseUrl || !model) return undefined;
    return {
      provider: resolved.provider,
      apiKey: credential?.apiKey,
      accountAuth,
      endpoint: providerCredentialEndpoint(catalog, resolved, baseUrl),
      baseUrl,
      model,
    };
  };

  /** The provider the turn's own compaction summarizes with. */
  const compactionProvider = (resolved: ProviderCredentialResolution, catalog: readonly CatalogProvider[]): CompactionProvider | undefined => {
    const target = compactionTarget(resolved, catalog);
    if (!target) return undefined;
    // Resolved from the catalogue the way the turn resolves it, so a model
    // that rejects a temperature does not get one in its summary request
    // either. The compaction body carries no temperature of its own; the flag
    // is what the protocols gate on.
    const shape = resolveRequestShape(catalog, target.provider, target.model, undefined, target.baseUrl, target.endpoint);
    const identity = credentialIdentityFor(target.provider, { connectionId: resolved.credential?.connectionId,
      accountAuth: target.accountAuth, apiKey: target.apiKey });
    return {
      headers: providerAuthorization({
        apiKey: target.apiKey,
        accountAuth: target.accountAuth,
        ...(target.endpoint ? { endpoint: target.endpoint } : {}),
      }).headers,
      baseUrl: target.baseUrl,
      model: target.model,
      providerId: target.provider,
      ...(target.endpoint ? { endpoint: target.endpoint } : {}),
      ...(identity ? { credentialId: identity.credentialId, credentialGeneration: identity.generation } : {}),
      supportsTemperature: shape.supportsTemperature,
      shape,
    };
  };

  /** The same, with an expiring account token replaced before the request is built. */
  const renewedProvider = async (resolved: ProviderCredentialResolution, config: RuntimeConfig, admission: Admission, catalog: readonly CatalogProvider[], reportFailure = true): Promise<ProviderRenewal> => {
    assertAdmission(admission);
    assertScopedModel(config, resolved);
    const target = compactionTarget(resolved, catalog);
    if (!target) return {};
    const renewed = await renewStoredAccount({
      workspaceRoot: input.runtimeContext.projectRoot,
      sessionId: input.runtimeContext.session.id,
      resolution: resolved,
      admission,
      fetchImpl: admittedFetch(providerFetchFromTimeouts(providerTimeoutsFrom(config)), admission),
    });
    if (renewed.failure) {
      if (reportFailure) input.renderer.renderLine(renewed.failure);
      return { failure: renewed.failure };
    }
    if (renewed.stored) reportCredentialPublication();
    assertAdmission(admission);
    const identity = credentialIdentityFor(target.provider, { connectionId: resolved.credential?.connectionId,
      accountAuth: renewed.accountAuth ?? target.accountAuth, apiKey: target.apiKey });
    const shape = resolveRequestShape(catalog, target.provider, target.model, undefined, target.baseUrl, target.endpoint);
    return { provider: {
      headers: providerAuthorization({
        apiKey: target.apiKey,
        accountAuth: renewed.accountAuth ?? target.accountAuth,
        ...(target.endpoint ? { endpoint: target.endpoint } : {}),
      }).headers,
      baseUrl: target.baseUrl,
      model: target.model,
      providerId: target.provider,
      shape,
      supportsTemperature: shape.supportsTemperature,
      ...(target.endpoint ? { endpoint: target.endpoint } : {}),
      ...(identity ? { credentialId: identity.credentialId, credentialGeneration: identity.generation } : {}),
    } };
  };
  const reportCredentialPublication = () => {
    const result = refreshShellRuntimeConfig(input.runtimeContext);
    if (result.status !== 'applied') input.renderer.renderLine('Credential saved; configuration was not applied. Reload status: ' + result.status + '.');
    return result.status === 'applied';
  };
  return { target: compactionTarget, provider: compactionProvider, renew: renewedProvider, publication: reportCredentialPublication };
}
