import type { CommandContext } from '../types.js';
import { readFreshConfiguration } from '../configuration.js';
import type { RuntimeConfig, ProviderConnectionConfig } from '../../../config/runtimeConfig.js';
import { loadCatalog } from '../../models/catalogStore.js';
import type { CatalogProvider } from '../../models/catalog.js';
import { isThinkingPreference, type ThinkingPreference } from '../../models/effort.js';
import type { SessionModelRole, SessionModelTarget } from '../../../session/model/contract.js';
import { validPresetName } from './preset.js';
import { matchesCatalog } from '../../models/availability.js';

export type RoleParseResult =
  | { readonly ok: true; readonly roles: Readonly<Record<string, SessionModelRole>> }
  | { readonly ok: false; readonly reason: string };

/** A named connection wins over a provider name; provider-only choices must be unambiguous. */
export function parsePresetRoles(context: CommandContext, selection: SessionModelTarget | undefined, specs: readonly string[]): RoleParseResult {
  if (!specs.length) return selection?.connectionId !== undefined ? { ok: true, roles: { default: { ...selection, connectionId: selection.connectionId } } }
    : { ok: false, reason: 'Preset roles require a named connection. Select one first, or supply explicit role=connection/model[@effort] targets.' };
  const publication = context.readConfiguration?.();
  const config = publication?.config ?? context.runtimeConfig ?? readFreshConfiguration(context);
  const catalog = publication?.catalog ?? loadCatalog();
  const roles: Record<string, SessionModelRole> = {};
  for (const spec of specs) {
    const separator = spec.indexOf('=');
    if (separator <= 0 || separator === spec.length - 1) return { ok: false, reason: 'Invalid preset role. Use role=connection/model[@effort] or role=provider/model[@effort].' };
    const role = spec.slice(0, separator);
    if (!validPresetName(role) || Object.hasOwn(roles, role)) return { ok: false, reason: 'Invalid or duplicate preset role name.' };
    const target = spec.slice(separator + 1);
    const effortSplit = target.lastIndexOf('@');
    const modelTarget = effortSplit > 0 ? target.slice(0, effortSplit) : target;
    const effort = effortSplit > 0 ? parseEffort(target.slice(effortSplit + 1).toLowerCase()) : selection?.thinkingEffort;
    if (effort === 'invalid') return { ok: false, reason: 'Invalid reasoning effort in preset role.' };
    const resolved = resolveTarget(modelTarget, selection, config, catalog);
    if (typeof resolved === 'string') return { ok: false, reason: resolved };
    roles[role] = { ...resolved, ...(effort !== undefined ? { thinkingEffort: effort } : {}) };
  }
  return { ok: true, roles };
}

function resolveTarget(target: string, selection: SessionModelTarget | undefined, config: RuntimeConfig, catalog: readonly CatalogProvider[]): SessionModelRole | string {
  const slash = target.indexOf('/');
  const owner = slash > 0 ? target.slice(0, slash) : undefined;
  const matches = owner ? config.providerConnections.filter(connection => connection.id === owner) : [];
  if (matches.length > 1) return 'Preset connection target is ambiguous. Resolve the duplicate connection IDs first.';
  const named = matches[0];
  if (named) return roleTarget(named, target.slice(slash + 1));
  const provider = owner ? catalog.find(entry => entry.id === owner) : undefined;
  const runtime = provider?.runtime ?? (owner && config.providerConnections.some(connection => connection.provider === owner) ? owner : undefined);
  if (!runtime) {
    const current = selection && config.providerConnections.find(connection => connection.id === selection.connectionId && connection.provider === selection.provider);
    return current ? roleTarget(current, target) : 'A preset target must name an existing connection or provider.';
  }
  const candidates = config.providerConnections.filter(connection => connection.provider === runtime
    && (!provider || matchesCatalog(provider, { connectionId: connection.id, provider: connection.provider }, config.providerConnections, catalog)));
  const current = candidates.find(connection => connection.id === selection?.connectionId && connection.provider === selection?.provider);
  const connection = current ?? (candidates.length === 1 ? candidates[0] : undefined);
  if (!connection) return candidates.length ? 'Preset provider target is ambiguous. Use role=connection/model[@effort].'
    : 'No saved connection matches this preset provider target.';
  return roleTarget(connection, target.slice(slash + 1));
}

function roleTarget(connection: ProviderConnectionConfig, model: string): SessionModelRole | string {
  return model.trim() ? { connectionId: connection.id, provider: connection.provider, model: model.trim() } : 'Preset model name is empty.';
}

function parseEffort(value: string): ThinkingPreference | 'invalid' {
  if (value === 'auto' || value === 'off' || value === 'none') return null;
  return isThinkingPreference(value) ? value : 'invalid';
}
