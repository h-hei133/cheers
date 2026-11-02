import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import { assertScopedModel } from '../../config/scope/projection.js';
import { providerCredentialBaseUrl, providerCredentialEndpoint } from '../../core/auth/account/target.js';
import { renewStoredAccount } from '../../core/auth/account/renewal.js';
import { catalogProvider, type CatalogProvider } from '../../core/models/catalog.js';
import { resolveRequestShape } from '../../core/models/requestShape.js';
import { admittedFetch, assertAdmission, type Admission } from '../../core/network/admission.js';
import { credentialBlockMessage, type ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import { refreshShellRuntimeConfig, type ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import { endpointShape } from '../../provider/endpoints/index.js';
import { accountAuthFor } from '../../provider/request/authorization.js';
import { providerFetchFromTimeouts, providerTimeoutsFrom } from '../../provider/request/fetch.js';
import type { CompactionProvider } from '../runtime/compaction.js';
import { requestServiceTier } from '../../core/models/serviceTier.js';
import { providerRequestTarget } from './requestTarget.js';
import { captureSummaryRole } from './summary.js';
import { configuredOutputLimit } from '../../provider/request/output.js';

export interface ProviderRenewal {
  readonly provider?: CompactionProvider;
  readonly failure?: string;
}

export type CompactionAvailability =
  | { readonly available: true }
  | { readonly available: false; readonly reason: string };

/** Resolve prerequisites without publishing credentials or account-bound addresses. */
function resolveCompactionTarget(resolved: ProviderCredentialResolution, catalog: readonly CatalogProvider[]) {
  const unavailable = (reason: string) => ({ available: false as const, target: undefined, reason });
  if (resolved.blocked) return unavailable(credentialBlockMessage(resolved.blocked));
  let baseUrl: string | undefined;
  let endpoint: string | undefined;
  try {
    baseUrl = providerCredentialBaseUrl(catalog, resolved);
    if (catalogProvider(catalog, resolved.provider, baseUrl).ambiguous) {
      return unavailable('More than one model catalogue matches the selected provider endpoint.');
    }
    endpoint = providerCredentialEndpoint(catalog, resolved, baseUrl);
  } catch {
    // Boundary failures must remain a refusal, including in a read-only report.
    return unavailable('The selected provider endpoint cannot be verified against its credential binding.');
  }
  const credential = resolved.credential;
  const accountAuth = accountAuthFor(resolved.provider, credential ?? {});
  if (!credential?.apiKey && !accountAuth && !endpointShape(endpoint).signer) {
    return unavailable('The selected provider has no usable credential. Sign in or configure a connection.');
  }
  const model = resolved.model ?? credential?.model;
  if (!baseUrl) return unavailable('No endpoint is configured for the selected provider.');
  if (!model) return unavailable('No model is selected for the provider.');
  return { available: true as const,
    target: { provider: resolved.provider, apiKey: credential?.apiKey, accountAuth, endpoint, baseUrl, model } };
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
  const compactionTarget = (resolved: ProviderCredentialResolution, catalog: readonly CatalogProvider[]) =>
    resolveCompactionTarget(resolved, catalog).target;
  const availability = (resolved: ProviderCredentialResolution, catalog: readonly CatalogProvider[], config?: RuntimeConfig): CompactionAvailability => {
    const selected = resolveCompactionTarget(resolved, catalog);
    if (!selected.available) return { available: false, reason: selected.reason };
    if (config) {
      try {
        configuredOutputLimit(config, selected.target.endpoint);
      } catch {
        return { available: false, reason: 'The selected provider does not accept the configured output limit for compaction.' };
      }
      if (!config.sessionModelRoles?.summary) {
        try {
          requestServiceTier(config, resolved, catalog, selected.target.baseUrl, selected.target.endpoint);
        } catch {
          return { available: false, reason: 'The selected provider service tier is unavailable for compaction.' };
        }
      }
    }
    if (config?.sessionModelRoles?.summary) {
      try {
        captureSummaryRole({ config, catalog, workspaceRoot: input.runtimeContext.projectRoot });
      } catch {
        return { available: false, reason: 'The configured summary model is unavailable for compaction.' };
      }
    }
    return { available: true };
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
    const requestTarget = providerRequestTarget({ workspaceRoot: input.runtimeContext.projectRoot,
      sessionId: input.runtimeContext.session.id, resolution: resolved, baseUrl: target.baseUrl,
      ...(target.endpoint ? { endpoint: target.endpoint } : {}) });
    return {
      headers: requestTarget.headers,
      baseUrl: target.baseUrl,
      model: target.model,
      providerId: target.provider,
      replayBinding: requestTarget.replayBinding,
      ...(target.endpoint ? { endpoint: target.endpoint } : {}),
      ...(requestTarget.credentialId ? { credentialId: requestTarget.credentialId,
        credentialGeneration: requestTarget.credentialGeneration } : {}),
      supportsTemperature: shape.supportsTemperature,
      shape,
    };
  };

  /** The same, with an expiring account token replaced before the request is built. */
  const renewedProvider = async (resolved: ProviderCredentialResolution, config: RuntimeConfig, admission: Admission, catalog: readonly CatalogProvider[], reportFailure = true): Promise<ProviderRenewal> => {
    assertAdmission(admission);
    assertScopedModel(config, resolved);
    const selected = resolveCompactionTarget(resolved, catalog);
    if (!selected.available) return { failure: selected.reason };
    const target = selected.target;
    const serviceTier = requestServiceTier(config, resolved, catalog, target.baseUrl, target.endpoint);
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
    const shape = resolveRequestShape(catalog, target.provider, target.model, undefined, target.baseUrl, target.endpoint);
    const requestTarget = providerRequestTarget({ workspaceRoot: input.runtimeContext.projectRoot,
      sessionId: input.runtimeContext.session.id, baseUrl: target.baseUrl,
      resolution: { ...resolved, ...(resolved.credential ? { credential: { ...resolved.credential,
        ...(renewed.accountAuth ? { accountAuth: renewed.accountAuth } : {}) } } : {}) },
      ...(target.endpoint ? { endpoint: target.endpoint } : {}) });
    return { provider: {
      headers: requestTarget.headers,
      baseUrl: target.baseUrl,
      model: target.model,
      providerId: target.provider,
      replayBinding: requestTarget.replayBinding,
      serviceTier,
      shape,
      supportsTemperature: shape.supportsTemperature,
      ...(target.endpoint ? { endpoint: target.endpoint } : {}),
      ...(requestTarget.credentialId ? { credentialId: requestTarget.credentialId,
        credentialGeneration: requestTarget.credentialGeneration } : {}),
    } };
  };
  const reportCredentialPublication = () => {
    const result = refreshShellRuntimeConfig(input.runtimeContext);
    if (result.status !== 'applied') input.renderer.renderLine('Credential saved; configuration was not applied. Reload status: ' + result.status + '.');
    return result.status === 'applied';
  };
  return { target: compactionTarget, provider: compactionProvider, availability, renew: renewedProvider, publication: reportCredentialPublication };
}
