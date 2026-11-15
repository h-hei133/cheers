import type { AgentMessage } from '../../core/agent/state.js';
import { inferRouteReason, type ModelRoute } from '../../core/models/virtualModels.js';
import { routeResponseContext } from '../../core/models/virtual/context.js';
import type { ThinkingLevel } from '../../core/models/effort.js';
import type { StepOptions, StepRequest } from './contract.js';

export interface PreparedRoute {
  readonly route?: ModelRoute;
  readonly isCurrent: () => boolean;
  readonly accept: (admission: () => void) => void;
}

/** Capture branch and registration before extension code; publication belongs to the step. */
export async function prepareModelRoute(request: StepRequest, options: StepOptions, messages: readonly AgentMessage[],
  thinkingLevel: ThinkingLevel, attempt: number, signal?: AbortSignal): Promise<PreparedRoute> {
  const registry = request.virtualModels;
  const provider = request.virtualModel?.provider ?? request.provider.provider ?? '';
  const modelId = request.virtualModel?.modelId ?? request.provider.model;
  const definition = registry?.get(provider, modelId);
  if (request.virtualModel && !definition) throw new Error('The selected virtual model is unavailable.');
  if (!registry || !definition) return Object.freeze({ isCurrent: () => true, accept: () => {} });
  const current = () => {
    try { return !signal?.aborted && request.virtualModels === registry && registry.get(provider, modelId) === definition; }
    catch { return false; }
  };
  const admit = () => {
    if (!current()) throw new Error('The selected virtual model is retired.');
    if (options.contextOwner && !options.contextOwner.isCurrent()) throw new Error('Request history changed during routing.');
  };
  admit();
  const reason = options.routeReason === 'direct' ? 'direct' : attempt > 0 ? 'retry' : options.routeReason ?? inferRouteReason(messages, 0);
  const state = reason === 'direct' ? undefined : request.captureRouteState?.(provider, modelId, admit);
  const route = await registry.resolve({ provider, modelId, thinkingLevel, reason, messages, signal,
    ...(state?.state !== undefined ? { state: state.state } : {}),
    ...routeResponseContext(messages, request.catalog ?? [], registry, options.failedRoute) });
  admit();
  if (!route) throw new Error('The selected virtual model is unavailable.');
  let accepted = false;
  return Object.freeze({ route, isCurrent: current, accept: (admission: () => void) => {
    if (accepted) {
      if (!current()) throw new Error('The selected virtual model is retired.');
      admission(); return;
    }
    admit(); admission();
    if (!accepted) state?.accept(route.state, () => { admit(); admission(); });
    accepted = true;
  } });
}
