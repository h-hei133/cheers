import { createHash } from 'node:crypto';
import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import { assertScopedModel } from '../../config/scope/projection.js';
import { credentialIdentityFor } from '../../core/auth/account/pool.js';
import { renewStoredAccount } from '../../core/auth/account/renewal.js';
import { catalogModel, type CatalogProvider } from '../../core/models/catalog.js';
import { effortCapability } from '../../core/models/capability.js';
import { resolveRequestShape } from '../../core/models/requestShape.js';
import { outputLimitFailure, reserveLimitFailure } from '../../core/models/limits.js';
import { resolveTokenBudget } from '../../core/models/window.js';
import { admittedFetch, assertAdmission, type Admission } from '../../core/network/admission.js';
import type { CompactionProvider } from '../../core/query/compaction/summarize.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import { accountAuthFor, providerAuthorization } from '../../provider/request/authorization.js';
import { providerFetchFromTimeouts, providerTimeoutsFrom } from '../../provider/request/fetch.js';
import { endpointShape } from '../../provider/endpoints/index.js';
import { effortOutputFailure } from '../../provider/endpoints/effort.js';
import { delegatedTarget } from './target.js';
import { providerCredentialBaseUrl, providerCredentialEndpoint } from '../../core/auth/account/target.js';
import { configuredOutputLimit } from '../../provider/request/output.js';

/** Capture an exact summary role; refresh its account only when a summary is requested. */
export function captureSummaryRole(input: {
  readonly config: RuntimeConfig;
  readonly catalog: readonly CatalogProvider[];
  readonly workspaceRoot?: string;
  readonly admission?: Admission;
  readonly onCredentialPersisted?: () => void;
}): { readonly identity: string; readonly limits: Pick<CompactionProvider, 'contextWindow' | 'inputLimit' | 'maxOutputTokens' | 'reserveTokens' | 'shape'>;
  readonly resolve: () => Promise<CompactionProvider> } | undefined {
  const role = input.config.sessionModelRoles?.summary;
  if (!role) return undefined;
  const main = resolveProviderCredential({ runtimeConfig: input.config, env: {} });
  const selected = delegatedTarget(role, main, input.config, input.catalog);
  const resolution = { ...selected, baseUrl: providerCredentialBaseUrl(input.catalog, selected) };
  assertScopedModel(input.config, resolution);
  const model = catalogModel(input.catalog, role.provider, role.model, resolution.baseUrl);
  if (!model || effortCapability(input.catalog, role.provider, role.model, role.thinkingEffort ?? null, resolution.baseUrl) === 'unsupported') {
    throw new Error('The summary role model or reasoning effort is unavailable.');
  }
  const shape = resolveRequestShape(input.catalog, role.provider, role.model, role.thinkingEffort ?? undefined, resolution.baseUrl);
  const endpoint = providerCredentialEndpoint(input.catalog, selected, resolution.baseUrl);
  const maxOutputTokens = configuredOutputLimit(input.config, endpoint)
    ?? (endpointShape(endpoint).outputControl === 'provider' ? undefined : shape.maxOutputCeiling);
  const reserveTokens = resolveTokenBudget(input.config.modelTokenBudgets, role.provider, role.model, 'reserveTokens', input.config.reserveTokens, 0);
  const failure = outputLimitFailure(maxOutputTokens, model.maxTokens, model.contextWindow)
    ?? (model.contextWindow ? reserveLimitFailure(reserveTokens, model.contextWindow) : undefined)
    ?? (role.thinkingEffort ? effortOutputFailure(endpointShape(endpoint), maxOutputTokens) : undefined);
  if (failure) throw new Error(`Summary role refused: ${failure}`);
  const credential = resolution.credential!;
  const accountAuth = accountAuthFor(resolution.provider, credential);
  const identity = createHash('sha256').update(JSON.stringify([role, resolution.baseUrl, endpoint,
    credentialIdentityFor(resolution.provider, credential), model, shape, maxOutputTokens, reserveTokens])).digest('hex');
  let pending: Promise<CompactionProvider> | undefined;
  const renew = async (): Promise<CompactionProvider> => {
    assertAdmission(input.admission);
    if (!input.workspaceRoot) throw new Error('The summary role workspace is unavailable.');
    const renewed = await renewStoredAccount({ workspaceRoot: input.workspaceRoot, resolution: selected, admission: input.admission,
      fetchImpl: admittedFetch(providerFetchFromTimeouts(providerTimeoutsFrom(input.config)), input.admission) });
    if (renewed.failure) throw new Error(renewed.failure);
    if (renewed.stored) input.onCredentialPersisted?.();
    assertAdmission(input.admission);
    const auth = renewed.accountAuth ?? accountAuth;
    const identity = credentialIdentityFor(resolution.provider, { connectionId: credential.connectionId, apiKey: credential.apiKey, accountAuth: auth });
    return { providerId: role.provider, model: role.model, baseUrl: resolution.baseUrl!, endpoint,
      headers: providerAuthorization({ apiKey: credential.apiKey, accountAuth: auth, endpoint }).headers,
      ...(identity ? { credentialId: identity.credentialId, credentialGeneration: identity.generation } : {}),
      shape, contextWindow: model.contextWindow, inputLimit: model.inputLimit, maxOutputTokens, reserveTokens,
    };
  };
  return { identity, limits: { contextWindow: model.contextWindow, inputLimit: model.inputLimit, maxOutputTokens, reserveTokens, shape }, resolve: () => {
    assertAdmission(input.admission);
    // History and turn-prefix steps share one captured credential renewal.
    return pending ??= renew();
  } };
}
