import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import { assertScopedModel } from '../../config/scope/projection.js';
import { scopeAdmission } from '../../config/scope/admission.js';
import type { ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import { catalogProvider, type CatalogProvider } from '../../core/models/catalog.js';
import type { ModelRoute, VirtualModelRegistry } from '../../core/models/virtualModels.js';
import { assertAdmission, type Admission } from '../../core/network/admission.js';
import { snapshotData } from '../../core/values/data.js';
import { providerCredentialBaseUrl } from '../../core/auth/account/target.js';
import { credentialDigest } from '../../core/auth/account/lineage.js';
import type { StepTarget } from '../../turn/context/contract.js';
import { delegatedTarget } from './target.js';
import { delegatedRenewal, type AccountRotation } from './renewal.js';

interface RouteHost {
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly providerCredentialResolution: ProviderCredentialResolution;
  readonly runtimeConfig?: RuntimeConfig;
  readonly providerCatalog: readonly CatalogProvider[];
  readonly virtualModels: VirtualModelRegistry;
  readonly admission?: Admission;
  readonly onCredentialPersisted?: (rotation?: AccountRotation) => boolean | void;
}

function authorityIdentity(host: RouteHost): string {
  const config = host.runtimeConfig;
  return credentialDigest(snapshotData({ resolution: host.providerCredentialResolution,
    provider: config?.provider, connection: config?.sessionConnection, active: config?.activeProviderConnectionId,
    credentials: config?.providerCredentials, connections: config?.providerConnections, pool: config?.accountPool,
    allowedModels: config?.allowedModels }, { bytes: 1024 * 1024, nodes: 16_384, depth: 16 }));
}

/** Resolve only physical catalogue entries against the request's existing account authority. */
function physicalTarget(route: ModelRoute, host: RouteHost): ProviderCredentialResolution {
  const matches = host.providerCatalog.filter(entry => entry.id === route.provider);
  if (matches.length !== 1 || !matches[0]!.models.some(model => model.id === route.modelId)
    || host.virtualModels.get(route.provider, route.modelId)) throw new Error('The routed physical model is unavailable.');
  const entry = matches[0]!;
  const provider = entry.runtime ?? entry.id;
  const main = host.providerCredentialResolution;
  const config = host.runtimeConfig;
  const id = main.credential?.connectionId;
  const connection = provider === main.provider && id
    ? config?.providerConnections.find(value => value.id === id && value.provider === main.provider) : undefined;
  if (provider === main.provider && id && !connection) throw new Error('The routed connection is unavailable.');
  const target = connection
    ? { provider: main.provider, connectionId: connection.id, model: route.modelId }
    : `${provider}/${route.modelId}`;
  const resolved = delegatedTarget(target, main, config, host.providerCatalog, connection ? undefined : 'current');
  const address = providerCredentialBaseUrl(host.providerCatalog, resolved);
  const physical = catalogProvider(host.providerCatalog, resolved.provider, address);
  if (physical.ambiguous || physical.entry?.id !== entry.id
    || !physical.entry.models.some(model => model.id === route.modelId && (!model.modelType || model.modelType === 'chat'))) {
    throw new Error('The routed catalogue does not own the physical endpoint.');
  }
  assertScopedModel(config, resolved);
  return resolved;
}

/** The CLI owns auth/scope resolution; turn preparation receives the complete captured target. */
export function providerRouteResolver(host: RouteHost, assemble: (resolution: ProviderCredentialResolution, admission: Admission) => StepTarget) {
  const scoped = scopeAdmission(host.runtimeConfig?.configScopes, host.workspaceRoot);
  const authority = authorityIdentity(host);
  const admit = () => {
    const refusal = host.admission?.() ?? scoped();
    if (refusal) return refusal;
    try { return authorityIdentity(host) === authority ? undefined : 'The routed credential authority changed. Start a new request.'; }
    catch { return 'The routed credential authority is unavailable.'; }
  };
  const renew = delegatedRenewal(host);
  return async (route: ModelRoute, signal?: AbortSignal): Promise<StepTarget> => {
    signal?.throwIfAborted(); assertAdmission(admit);
    const selected = physicalTarget(route, host);
    // Validate the actual model and request shape before a refresh side effect.
    assemble(selected, admit);
    const fresh = await renew(selected, () => { signal?.throwIfAborted(); return admit(); });
    signal?.throwIfAborted(); assertAdmission(admit);
    const captured = snapshotData(fresh, { bytes: 256 * 1024, nodes: 4_096, depth: 12 }) as unknown as ProviderCredentialResolution;
    const target = assemble(captured, admit);
    return { provider: target.provider, fetchImpl: target.fetchImpl, modelTransport: target.modelTransport,
      contextWindow: target.contextWindow, maxOutputTokens: target.maxOutputTokens, reserveTokens: target.reserveTokens,
      isCurrent: () => {
        try { assertAdmission(admit); assertScopedModel(host.runtimeConfig, captured); return true; }
        catch { return false; }
      } };
  };
}
