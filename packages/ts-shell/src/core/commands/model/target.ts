import type { RuntimeConfig } from '../../../config/runtimeConfig.js';
import { sameValue } from '../../../config/values.js';
import type { SessionModelSelection, SessionModelTarget } from '../../../session/model/contract.js';
import { projectModelSelection } from '../../../session/model/projection.js';
import { resolveProviderCredential } from '../../shell/providerCredentials.js';
import type { CommandContext } from '../types.js';

export function scopedModelTarget(target: SessionModelTarget): SessionModelSelection {
  return target.connectionId !== undefined ? { ...target, connectionId: target.connectionId, connectionScope: 'session' }
    : { connectionScope: 'provider', provider: target.provider, model: target.model,
      ...(target.thinkingEffort !== undefined ? { thinkingEffort: target.thinkingEffort } : {}) };
}

export function targetRequest(context: CommandContext, config: RuntimeConfig, target: SessionModelTarget) {
  return selectionRequest(context, config, scopedModelTarget(target));
}

/** Preference edits preserve legacy cascade semantics as well as explicit bindings. */
export function selectionRequest(context: CommandContext, config: RuntimeConfig, selection: SessionModelSelection) {
  const candidate = projectModelSelection(config, selection);
  return context.resolveConfigTarget?.(candidate) ?? resolveProviderCredential({ runtimeConfig: candidate });
}

/** Named targets require their own credential. Provider targets use the accepted CLI/env/profile source. */
export function exactTargetMatches(context: CommandContext, config: RuntimeConfig, target: SessionModelTarget): boolean {
  const providerSlot = 'connectionScope' in target && target.connectionScope === 'provider';
  const connection = config.providerConnections.find(item => item.id === target.connectionId && item.provider === target.provider);
  if (!providerSlot && (!connection || connection.status === 'pending' || connection.status === 'error')) return false;
  const actual = targetRequest(context, config, target);
  if (actual.blocked || !actual.credential || actual.provider !== target.provider || actual.model !== target.model) return false;
  if (providerSlot) return actual.credential.connectionId === undefined;
  const expected = resolveProviderCredential({ runtimeConfig: projectModelSelection(config, scopedModelTarget(target)) });
  return actual.baseUrl === expected.baseUrl && sameValue(actual.credential, expected.credential);
}

/** A projected preference must still name the same credential namespace. */
export function selectedModelMatches(config: RuntimeConfig, selection: SessionModelSelection): boolean {
  if (selection.connectionScope === 'provider') return config.sessionConnection?.scope === 'provider'
    && config.sessionConnection.provider === selection.provider && config.provider === selection.provider
    && config.activeProviderConnectionId === undefined;
  return config.activeProviderConnectionId === selection.connectionId
    && config.providerConnections.find(item => item.id === selection.connectionId)?.provider === selection.provider;
}
