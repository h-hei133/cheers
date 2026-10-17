import { createHash } from 'node:crypto';
import type { AccountPool, ProviderConnectionConfig, RuntimeConfig, RuntimeProvider } from '../../../config/runtimeConfig.js';
import { connectionCredentialState } from './presence.js';

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
  const key = `${input.sessionId}\u0000${input.provider}\u0000${signature}`;
  const remembered = affinity.get(key);
  const start = candidates.findIndex(candidate => candidate.id === remembered);
  const offset = start >= 0 ? start : createHash('sha256').update(key).digest().readUInt32BE(0) % candidates.length;
  return [...candidates.slice(offset), ...candidates.slice(0, offset)];
}

export function selectPooledConnection(input: PoolInput): PoolSelection | undefined {
  const entry = input.config.accountPool?.[input.provider];
  if (!entry) return undefined;
  if (entry.connections.length === 0) return { blocked: 'pool-empty' };
  const env = input.env ?? process.env;
  const members = entry.connections
    .map(id => input.config.providerConnections.find(connection => connection.id === id && connection.provider === input.provider))
    .filter((connection): connection is ProviderConnectionConfig => Boolean(connection))
    .filter(connection => connectionCredentialState(input.config, connection, env).state === 'ready');
  if (members.length === 0) return { blocked: 'pool-unavailable' };
  const selected = order(members, input, poolSignature(entry))[0]!;
  if (input.sessionId) remember(`${input.sessionId}\u0000${input.provider}\u0000${poolSignature(entry)}`, selected.id);
  return { connection: selected, credentialId: credentialIdentity(selected), generation: credentialGeneration(selected) };
}

/** Stable across renames of the same stored slot; not derived from an array index. */
export function credentialIdentity(connection: ProviderConnectionConfig): string {
  return `${connection.provider}:${connection.id}`;
}

export function credentialGeneration(connection: ProviderConnectionConfig): string {
  const material = connection.accountAuth && Object.keys(connection.accountAuth).length
    ? JSON.stringify(connection.accountAuth)
    : connection.apiKey ?? '';
  return createHash('sha256').update(material).digest('hex').slice(0, 16);
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
