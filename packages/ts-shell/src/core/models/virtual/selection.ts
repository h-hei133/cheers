import { isRuntimeProvider, type RuntimeProvider } from '../../../config/runtimeConfig.js';
import { thinkingSyntax } from '../../commands/thinking/syntax.js';
import type { ThinkingPreference } from '../effort.js';
import type { VirtualModelMetadata } from './contract.js';
import type { SessionVirtualModelSelection } from '../../../session/model/contract.js';

export type ParsedModelSelection<T extends VirtualModelMetadata> = {
  readonly kind: 'virtual'; readonly definition: T; readonly virtualModel: SessionVirtualModelSelection;
} | {
  readonly kind: 'physical'; readonly provider?: RuntimeProvider; readonly model?: string; readonly thinkingEffort?: ThinkingPreference;
};

/** Exact registration identity precedes optional effort syntax and physical provider parsing. */
export function parseModelSelection<T extends VirtualModelMetadata>(raw: string | undefined, definitions: readonly T[],
  explicitProvider?: RuntimeProvider): ParsedModelSelection<T> {
  let spec = raw?.trim() ?? '';
  const exact = definitions.find(model => `${model.provider}/${model.id}` === spec);
  if (exact) return { kind: 'virtual', definition: exact, virtualModel: { provider: exact.provider, model: exact.id } };
  let thinkingEffort: ThinkingPreference | undefined;
  const colon = spec.lastIndexOf(':');
  if (colon > 0) {
    const suffix = spec.slice(colon + 1).trim().toLowerCase();
    const action = thinkingSyntax.actions.find(action => action.name === suffix || action.aliases?.includes(suffix));
    if (action?.effort !== undefined) { thinkingEffort = action.effort; spec = spec.slice(0, colon); }
  }
  const logical = definitions.find(model => `${model.provider}/${model.id}` === spec);
  if (logical) return { kind: 'virtual', definition: logical, virtualModel: { provider: logical.provider, model: logical.id,
    ...(thinkingEffort !== undefined ? { thinkingEffort } : {}) } };
  let provider = explicitProvider;
  const slash = spec.indexOf('/');
  if (slash > 0 && !provider) {
    const prefix = spec.slice(0, slash).trim().toLowerCase();
    if (isRuntimeProvider(prefix)) { provider = prefix; spec = spec.slice(slash + 1); }
  }
  return { kind: 'physical', ...(provider ? { provider } : {}), ...(spec ? { model: spec } : {}),
    ...(thinkingEffort !== undefined ? { thinkingEffort } : {}) };
}
