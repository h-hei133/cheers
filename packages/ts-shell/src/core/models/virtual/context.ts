import type { AgentMessage } from '../../agent/state.js';
import type { CatalogProvider } from '../catalog.js';
import { THINKING_LEVELS } from '../effort.js';
import type { ModelRouteFailure, ModelRouteTarget } from './contract.js';
import type { VirtualModelRegistry } from '../virtualModels.js';

/** Only bounded physical catalogue identities are exposed as response context. */
function physicalTarget(origin: AgentMessage['origin'], catalog: readonly CatalogProvider[], virtual?: VirtualModelRegistry): ModelRouteTarget | undefined {
  if (!origin?.provider || !origin.model || origin.provider.length > 128 || origin.model.length > 512
    || virtual?.get(origin.provider, origin.model)) return undefined;
  const entries = catalog.filter(entry => entry.id === origin.provider || entry.runtime === origin.provider);
  if (!entries.some(entry => entry.models.some(model => model.id === origin.model && (!model.modelType || model.modelType === 'chat')))) return undefined;
  const level = origin.thinkingLevel;
  return Object.freeze({ provider: origin.provider, modelId: origin.model,
    ...(level && THINKING_LEVELS.includes(level) ? { thinkingLevel: level } : {}) });
}

export function routeResponseContext(messages: readonly AgentMessage[], catalog: readonly CatalogProvider[], virtual?: VirtualModelRegistry,
  failure?: ModelRouteFailure) {
  let previous: ModelRouteTarget | undefined;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.role !== 'assistant' || message.stopReason === 'error' || message.stopReason === 'aborted' || message.errorMessage) continue;
    previous = physicalTarget(message.origin, catalog, virtual);
    if (previous) break;
  }
  const target = failure && physicalTarget({ provider: failure.provider, model: failure.modelId, thinkingLevel: failure.thinkingLevel }, catalog, virtual);
  const failed = target && failure && (failure.stopReason === 'error' || failure.stopReason === 'aborted')
    ? Object.freeze({ ...target, stopReason: failure.stopReason,
      ...(failure.failureClass ? { failureClass: failure.failureClass.slice(0, 128) } : {}),
      ...(failure.errorMessage ? { errorMessage: failure.errorMessage.slice(0, 8192) } : {}) }) : undefined;
  return { ...(previous ? { previous } : {}), ...(failed ? { failed } : {}) };
}
