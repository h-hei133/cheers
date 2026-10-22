import { createHash } from 'node:crypto';
import type { AccountPool, ProviderConnectionConfig, RuntimeConfig, RuntimeProvider } from '../../../config/runtimeConfig.js';
import { credentialBackoffRemaining } from './backoff.js';
import { ownedConnectionCredential } from './presence.js';
import { profileScope } from '../../paths/profile/scope.js';

/**
 * Explicit account authorization.
 *
 * A pool is a closed set: it names the connections a provider request may use and
 * nothing outside it. An empty list is a deliberate "no request", not "no
 * restriction", and a broken member is refused rather than skipped into another
 * account.
 */
export type PoolBlock = 'pool-empty' | 'pool-unavailable';

export interface PoolSelection {
  readonly connection?: ProviderConnectionConfig;
  readonly credentialId?: string;
  /** Non-secret digest of the selected credential material. */
  readonly generation?: string;
  readonly blocked?: PoolBlock;
}

export interface PoolInput {
  readonly config: Pick<RuntimeConfig, 'accountPool' | 'providerConnections' | 'providerCredentials'>;
  readonly provider: RuntimeProvider;
  readonly sessionId?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Explicit targets must be authorized and usable; they never choose a sibling. */
  readonly connectionId?: string;
}

/** Session affinity, bounded so a long-lived process cannot accumulate sessions. */
const affinity = new Map<string, string>();
const AFFINITY_LIMIT = 1024;

function remember(key: string, connectionId: string): void {
  affinity.delete(key); affinity.set(key, connectionId);
  while (affinity.size > AFFINITY_LIMIT) affinity.delete(affinity.keys().next().value!);
}

function poolSignature(entry: NonNullable<AccountPool[RuntimeProvider]>): string {
  return `${entry.connections.join('\u0000')}\u0001${entry.baseUrl ?? ''}`;
}

function order(candidates: readonly ProviderConnectionConfig[], input: PoolInput, signature: string): readonly ProviderConnectionConfig[] {
  if (!input.sessionId) return candidates;
  const key = affinityKey(input.sessionId, input.provider, signature);
  const remembered = affinity.get(key);
  const start = candidates.findIndex(candidate => `${candidate.id}\u0000${credentialGeneration(candidate)}` === remembered);
  const offset = start >= 0 ? start : createHash('sha256').update(key).digest().readUInt32BE(0) % candidates.length;
  return [...candidates.slice(offset), ...candidates.slice(0, offset)];
}

function affinityKey(sessionId: string, provider: RuntimeProvider, signature: string): string {
  return profileScope(`${sessionId}\u0000${provider}\u0000${signature}`);
}

export function selectPooledConnection(input: PoolInput): PoolSelection | undefined {
  const entry = input.config.accountPool?.[input.provider];
  if (!entry) return undefined;
  if (entry.connections.length === 0) return { blocked: 'pool-empty' };
  const members = availablePoolConnections(input);
  if (!members?.length) return { blocked: 'pool-unavailable' };
  const selected = order(members, input, poolSignature(entry))[0]!;
  if (input.sessionId) remember(affinityKey(input.sessionId, input.provider, poolSignature(entry)),
    `${selected.id}\u0000${credentialGeneration(selected)}`);
  return { connection: selected, credentialId: credentialIdentity(selected), generation: credentialGeneration(selected) };
}

/** The request's usable authorization set, without selecting or changing affinity. */
export function availablePoolConnections(input: PoolInput): readonly ProviderConnectionConfig[] | undefined {
  const entry = input.config.accountPool?.[input.provider];
  if (!entry) return undefined;
  const topology = poolMembers(entry, input);
  if (!topology) return [];
  return topology.filter(connection => {
    if (input.connectionId !== undefined && connection.id !== input.connectionId) return false;
    if (connection.status === 'pending' || connection.status === 'error') return false;
    const identity = credentialIdentityFor(connection.provider, ownedConnectionCredential(connection));
    return identity !== undefined && credentialBackoffRemaining(identity) === 0;
  });
}

/** Validate the complete captured topology before availability can narrow it. */
function poolMembers(entry: NonNullable<AccountPool[RuntimeProvider]>, input: PoolInput): ProviderConnectionConfig[] | undefined {
  const seen = new Set<string>();
  const members: ProviderConnectionConfig[] = [];
  const endpoint = entry.baseUrl?.trim().replace(/\/+$/, '');
  for (const rawId of entry.connections) {
    const id = rawId.trim();
    if (!id || seen.has(id)) return undefined;
    seen.add(id);
    const matches = input.config.providerConnections.filter(connection => connection.id.trim() === id);
    const connection = matches[0];
    if (matches.length !== 1 || !connection || connection.provider !== input.provider
      || (endpoint && connection.baseUrl?.trim().replace(/\/+$/, '') !== endpoint)) return undefined;
    members.push(connection);
  }
  return members;
}

/** Stable across renames of the same stored slot; not derived from an array index. */
export function credentialIdentity(connection: ProviderConnectionConfig): string {
  return `${connection.provider}:${connection.id}`;
}

export function credentialGeneration(connection: ProviderConnectionConfig): string {
  return credentialIdentityFor(connection.provider, ownedConnectionCredential(connection))?.generation
    ?? createHash('sha256').update('').digest('hex').slice(0, 16);
}

/** Non-secret identity for a resolved credential, including config-only slots. */
export function credentialIdentityFor(provider: RuntimeProvider, credential: {
  readonly connectionId?: string;
  readonly accountAuth?: object;
  readonly apiKey?: string;
} | undefined): { readonly credentialId: string; readonly generation: string } | undefined {
  if (!credential) return undefined;
  const material = credential.accountAuth && Object.keys(credential.accountAuth).length ? credential.accountAuth : credential.apiKey;
  if (!material) return undefined;
  return { credentialId: `${provider}:${credential.connectionId ?? 'config'}`,
    generation: createHash('sha256').update(typeof material === 'string' ? material : JSON.stringify(material)).digest('hex').slice(0, 16) };
}
