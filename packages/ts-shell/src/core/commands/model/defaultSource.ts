import type { ConfigOrigin } from '../../../config/provenance/model.js';
import type { RuntimeConfig } from '../../../config/runtimeConfig.js';

/**
 * Which stored layer supplies the active model.
 *
 * Two defaults may be saved: one on the selected connection and one for the
 * provider. Request resolution reads the connection first, so when both exist
 * the connection is the effective one. This is a read-only projection of that
 * precedence — it explains an answer that was already decided elsewhere, never
 * changes it, and does not read credentials.
 */
export type ModelDefaultLayer = 'connection' | 'provider' | 'account-default' | 'unset';

export interface ModelDefaultSource {
  readonly layer: ModelDefaultLayer;
  readonly effective?: string;
  /** The provider value the connection shadows, only when the two disagree. */
  readonly overridden?: string;
  /** Both layers hold the same value; the connection is still the source. */
  readonly agrees?: boolean;
  /** The effective leaf came from this session, not from a saved default. */
  readonly session?: boolean;
}

export interface ModelDefaultInput {
  readonly connectionModel?: string;
  readonly providerModel?: string;
  readonly accountDefault?: string;
  readonly sessionSelected?: boolean;
}

export function modelDefaultSource(input: ModelDefaultInput): ModelDefaultSource {
  const connection = input.connectionModel?.trim() || undefined;
  const provider = input.providerModel?.trim() || undefined;
  const session = input.sessionSelected ? { session: true as const } : {};
  if (connection) {
    return { layer: 'connection', effective: connection, ...session,
      ...(provider === undefined ? {} : provider === connection ? { agrees: true } : { overridden: provider }) };
  }
  if (provider) return { layer: 'provider', effective: provider, ...session };
  const account = input.accountDefault?.trim() || undefined;
  return account ? { layer: 'account-default', effective: account } : { layer: 'unset' };
}

/** A session overlay is the session's own selection, not a saved default of the layer below. */
export function modelDefaultSourceLine(source: ModelDefaultSource): string | undefined {
  const scope = source.session ? ' (session selection)' : '';
  switch (source.layer) {
    case 'connection':
      return source.overridden !== undefined
        ? `Model source: connection${scope}, overriding the provider default ${source.overridden}.`
        : source.agrees ? `Model source: connection${scope}, the same value as the provider default.`
        : `Model source: connection${scope}.`;
    case 'provider': return source.session ? 'Model source: provider (session selection).' : 'Model source: provider default.';
    case 'account-default': return 'Model source: account default.';
    case 'unset': return undefined;
  }
}

/** Provenance names the leaf that actually supplied the value, without reading it. */
export function sessionOwnsModel(config: Pick<RuntimeConfig, 'configProvenance'>, provider: string,
  connectionIndex: number | undefined): boolean {
  const node: ConfigOrigin | undefined = connectionIndex === undefined
    ? config.configProvenance.providerCredentials.children?.[provider]?.children?.model
    : config.configProvenance.providerConnections.children?.[String(connectionIndex)]?.children?.model;
  return node?.sources.includes('session') ?? false;
}
