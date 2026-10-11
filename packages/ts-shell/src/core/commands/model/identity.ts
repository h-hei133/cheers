import type { ProviderConnectionConfig, ProviderCredentialConfig } from '../../../config/runtimeConfig.js';

/** Model controls do not alter the saved credential or transport identity. */
export function connectionIdentity(connection: ProviderConnectionConfig | undefined): object | undefined {
  if (!connection) return undefined;
  const { model, thinkingEffort, serviceTier, createdAt, updatedAt, label, ...identity } = connection;
  return identity;
}

export function credentialIdentity(credential: ProviderCredentialConfig | undefined): object | undefined {
  if (!credential) return undefined;
  const { model, thinkingEffort, serviceTier, ...identity } = credential;
  return Object.keys(identity).length ? identity : undefined;
}

/** Missing legacy timestamps are synthesized on every read, so they are not publication identity. */
export function connectionSnapshot(connections: readonly ProviderConnectionConfig[]): readonly object[] {
  return connections.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...connection }) => connection);
}
