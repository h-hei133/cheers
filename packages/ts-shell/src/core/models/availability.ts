import type { AccountPool, ProviderConnectionAuthType, ProviderConnectionConfig, ProviderCredentialConfig, RuntimeProvider } from '../../config/runtimeConfig.js';
import { catalogBaseUrl, catalogProvider, type CatalogProvider } from './catalog.js';
import { connectionCredentialState, credentialSources, ownedConnectionCredential } from '../auth/account/presence.js';
import { availablePoolConnections } from '../auth/account/pool.js';
import type { ProviderCredentialResolution } from '../auth/credential.js';
import { providerCredentialBaseUrl } from '../auth/account/target.js';
import { accountProtocol } from '../auth/account/policy.js';

/**
 * What the configuration says about a provider, without asking the provider.
 *
 * Three different facts were previously collapsed into one "connected" label:
 * a named connection exists, a credential can be resolved for it, and the
 * endpoint has answered recently. Only the first two are knowable locally, so
 * they are reported separately and a live check is never implied.
 */
export type AvailabilityState = 'ready' | 'credential-missing' | 'pending' | 'error' | 'unsupported' | 'pool-empty' | 'pool-unavailable' | 'unknown';

/** The fields this projection reads; a stored file and an accepted runtime both have them. */
export interface AvailabilityConfig {
  readonly provider?: RuntimeProvider;
  readonly activeProviderConnectionId?: string;
  readonly providerConnections?: readonly ProviderConnectionConfig[];
  readonly providerCredentials?: Partial<Record<RuntimeProvider, ProviderCredentialConfig>>;
  readonly accountPool?: AccountPool;
  readonly configValidation?: { readonly valid: boolean };
}

export interface ConnectionAvailability {
  readonly connectionId: string;
  readonly provider: RuntimeProvider;
  readonly label?: string;
  readonly authType: ProviderConnectionAuthType;
  /** Host and path only: userinfo, query and fragment never reach a surface. */
  readonly endpoint?: string;
  readonly model?: string;
  readonly state: AvailabilityState;
  readonly reason: string;
}

export interface ProviderAvailability {
  readonly provider: RuntimeProvider;
  readonly label: string;
  readonly catalogued: boolean;
  readonly state: AvailabilityState;
  readonly credential: 'present' | 'missing';
  readonly endpoint?: string;
  readonly connections: readonly ConnectionAvailability[];
  /** Declared authorization set, when the configuration has one for this provider. */
  readonly pool?: { readonly members: number; readonly available: number };
  readonly models: readonly { readonly id: string; readonly contextWindow?: number }[];
  /** No probe is made here; a configured credential is not a measured round trip. */
  readonly measured: 'unknown';
}

export interface AvailabilitySnapshot {
  readonly activeConnectionId?: string;
  readonly activeProvider: RuntimeProvider;
  readonly activeModel?: string;
  readonly providers: readonly ProviderAvailability[];
}

/** A display form of an endpoint that cannot carry a secret. */
export function endpointLabel(baseUrl?: string): string | undefined {
  if (!baseUrl?.trim()) return undefined;
  try {
    const url = new URL(baseUrl.trim());
    if (!url.host) return undefined;
    return `${url.host}${url.pathname.replace(/\/+$/, '')}`;
  } catch { return undefined; }
}

export function availabilityLabel(state: AvailabilityState): string {
  switch (state) {
    case 'ready': return 'credential present';
    case 'credential-missing': return 'credential missing';
    case 'pending': return 'setup pending';
    case 'error': return 'setup error';
    case 'unsupported': return 'not in catalogue';
    case 'pool-empty': return 'account pool empty';
    case 'pool-unavailable': return 'account pool unavailable';
    default: return 'unverified';
  }
}

function providerState(connections: readonly ConnectionAvailability[], credential: 'present' | 'missing', catalogued: boolean,
  pool?: { readonly members: number; readonly available: number }): AvailabilityState {
  if (pool) {
    if (pool.members === 0) return 'pool-empty';
    if (pool.available === 0) return 'pool-unavailable';
    return 'ready';
  }
  if (connections.some(connection => connection.state === 'ready')) return 'ready';
  if (connections.some(connection => connection.state === 'pending')) return 'pending';
  if (connections.some(connection => connection.state === 'error')) return 'error';
  if (credential === 'present') return 'ready';
  if (connections.some(connection => connection.state === 'pool-empty')) return 'pool-empty';
  if (connections.some(connection => connection.state === 'pool-unavailable')) return 'pool-unavailable';
  if (connections.some(connection => connection.state === 'unknown')) return 'unknown';
  return catalogued ? 'credential-missing' : 'unsupported';
}

export interface CatalogAvailability {
  readonly id: string;
  readonly state: AvailabilityState;
  readonly active: boolean;
  readonly activeModel?: string;
}

/** Canonical models can use relays; a relay catalogue requires its own address. */
export function matchesCatalog(provider: CatalogProvider, connection: Pick<ConnectionAvailability, 'connectionId' | 'provider'>,
  connections: readonly ProviderConnectionConfig[], catalog: readonly CatalogProvider[]): boolean {
  if (provider.id === provider.runtime) return true;
  const stored = connections.find(item => item.id === connection.connectionId && item.provider === connection.provider);
  let baseUrl = catalogBaseUrl(catalog, provider.runtime, stored?.baseUrl);
  try {
    baseUrl = (stored && accountProtocol(ownedConnectionCredential(stored).accountAuth)?.baseUrl) ?? baseUrl;
  } catch { /* Incomplete account setup retains its declared address; readiness is checked separately. */ }
  return Boolean(baseUrl && provider.baseUrl && baseUrl.replace(/\/+$/, '') === provider.baseUrl.replace(/\/+$/, ''));
}

/** Local credential presence is independent of request overrides and cannot change session affinity. */
export function catalogAvailabilitySnapshot(input: {
  readonly config: AvailabilityConfig;
  readonly catalog: readonly CatalogProvider[];
  readonly active: ProviderCredentialResolution;
  readonly resolveLocal: (provider: RuntimeProvider, connectionId?: string) => ProviderCredentialResolution;
}): readonly CatalogAvailability[] {
  const snapshot = availabilitySnapshot(input);
  const active = input.active;
  const owner = !active.blocked && active.credential ? resolvedCatalog(input.catalog, active) : undefined;
  return input.catalog.map(provider => {
    const entry = snapshot.providers.find(candidate => candidate.provider === provider.runtime);
    const connections = (entry?.connections ?? []).flatMap(connection => {
      const stored = matchesCatalog(provider, connection, input.config.providerConnections ?? [], input.catalog);
      if (connection.state !== 'ready') return stored ? [connection] : [];
      const state = catalogCredentialState(input.catalog, provider, input.resolveLocal(connection.provider, connection.connectionId), connection.connectionId);
      // An account's issuer can supply its actual address without a stored URL.
      return stored || state === 'ready' ? [{ ...connection, state }] : [];
    });
    const ambient = input.resolveLocal(provider.runtime);
    const currentAmbient = !active.credential?.connectionId && owner?.entry?.id === provider.id;
    const ambientState = catalogCredentialState(input.catalog, provider, ambient);
    const credential = ambientState === 'ready' || currentAmbient ? 'present' : 'missing';
    const ambiguous = provider.id !== provider.runtime && catalogProvider(input.catalog, provider.runtime, provider.baseUrl).ambiguous;
    const localState = providerState(connections, credential, true);
    return { id: provider.id, state: ambiguous ? 'unknown' : ambient.blocked === 'pool-empty' ? 'pool-empty'
      : localState === 'credential-missing' && ambientState === 'pool-unavailable' ? ambientState : localState,
      active: owner?.entry?.id === provider.id,
      ...(owner?.entry?.id === provider.id && active.model ? { activeModel: active.model } : {}) };
  });
}

function resolvedCatalog(catalog: readonly CatalogProvider[], resolution: ProviderCredentialResolution) {
  try { return catalogProvider(catalog, resolution.provider, providerCredentialBaseUrl(catalog, resolution)); }
  catch { return undefined; }
}

function catalogCredentialState(catalog: readonly CatalogProvider[], provider: CatalogProvider,
  resolution: ProviderCredentialResolution, connectionId?: string): AvailabilityState {
  if (resolution.blocked === 'pool-empty') return 'pool-empty';
  if (resolution.blocked === 'pool-unavailable' || resolution.blocked === 'pool-required') return 'pool-unavailable';
  if (resolution.blocked || !resolution.credential || resolution.provider !== provider.runtime
    || resolution.credential.connectionId !== connectionId) return 'credential-missing';
  const owner = resolvedCatalog(catalog, resolution);
  if (!owner || owner.ambiguous) return 'unknown';
  return provider.id === provider.runtime || owner.entry?.id === provider.id ? 'ready' : 'credential-missing';
}

export function availabilitySnapshot(input: {
  readonly config: AvailabilityConfig;
  readonly catalog: readonly CatalogProvider[];
  readonly env?: NodeJS.ProcessEnv;
}): AvailabilitySnapshot {
  const env = input.env ?? process.env;
  const config = input.config;
  const activeConnectionId = config.activeProviderConnectionId?.trim() || undefined;
  const connections = (config.providerConnections ?? []).filter(connection => Boolean(connection.id?.trim() && connection.provider));
  const providers: ProviderAvailability[] = [];
  const seen = new Set<string>();

  for (const provider of input.catalog) {
    const declared = connections.filter(connection => connection.provider === provider.runtime);
    const { projected, credential, pool } = providerProjection(config, provider.runtime, declared, env);
    const state = providerState(projected, credential, true, pool);
    providers.push({ provider: provider.runtime, label: provider.label, catalogued: true, state, credential,
      endpoint: endpointLabel(declared.find(connection => connection.baseUrl)?.baseUrl ?? provider.baseUrl),
      connections: projected, ...(pool ? { pool } : {}), models: provider.models.map(model => ({ id: model.id, ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}) })), measured: 'unknown' });
    seen.add(provider.runtime);
  }
  // A stored connection for a provider the catalogue no longer lists still exists,
  // and saying so is more useful than dropping it from every surface.
  for (const connection of connections) {
    if (seen.has(connection.provider)) continue;
    const declared = connections.filter(candidate => candidate.provider === connection.provider);
    const { projected, credential, pool } = providerProjection(config, connection.provider, declared, env);
    providers.push({ provider: connection.provider, label: connection.label ?? connection.provider, catalogued: false,
      state: providerState(projected, credential, false, pool), credential,
      endpoint: endpointLabel(connection.baseUrl), connections: projected, ...(pool ? { pool } : {}), models: [], measured: 'unknown' });
    seen.add(connection.provider);
  }

  const activeConnection = connections.find(connection => connection.id.trim() === activeConnectionId);
  const activeProvider = activeConnection?.provider ?? config.provider ?? 'openai';
  const activeProfile = config.providerCredentials?.[activeProvider];
  return { ...(activeConnectionId ? { activeConnectionId } : {}), activeProvider,
    ...(activeConnection?.model ?? activeProfile?.model ? { activeModel: activeConnection?.model ?? activeProfile?.model } : {}),
    providers };
}

function providerProjection(config: AvailabilityConfig, provider: RuntimeProvider, declared: readonly ProviderConnectionConfig[], env: NodeJS.ProcessEnv) {
  const entry = config.accountPool?.[provider];
  const usable = entry ? new Set((config.configValidation?.valid === false ? [] : availablePoolConnections({
    config: { accountPool: config.accountPool, providerConnections: config.providerConnections ?? [], providerCredentials: config.providerCredentials ?? {} },
    provider,
  }) ?? []).map(connection => connection.id.trim())) : undefined;
  const projected = declared.map(connection => projectConnection(config, connection, env, usable));
  const legacy = credentialSources(config, provider, env);
  const present = usable ? usable.size > 0 : legacy.env || legacy.configApiKey || legacy.configAccount || projected.some(item => item.state === 'ready');
  return { projected, credential: present ? 'present' as const : 'missing' as const,
    ...(entry ? { pool: { members: entry.connections.length, available: usable!.size } } : {}) };
}

function projectConnection(config: AvailabilityConfig, connection: ProviderConnectionConfig, env: NodeJS.ProcessEnv, usable?: ReadonlySet<string>): ConnectionAvailability {
  const own = connectionCredentialState(usable ? {} : config, connection, usable ? {} : env);
  const state = usable && own.state === 'ready' && !usable.has(connection.id.trim())
    ? { state: 'pool-unavailable' as const, reason: 'The current account pool does not authorize an available credential on this connection.' } : own;
  return { connectionId: connection.id.trim(), provider: connection.provider, authType: connection.authType,
    ...(connection.label ? { label: connection.label } : {}), ...(connection.model ? { model: connection.model } : {}),
    ...(endpointLabel(connection.baseUrl) ? { endpoint: endpointLabel(connection.baseUrl) } : {}), ...state };
}
