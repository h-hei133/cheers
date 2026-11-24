import { providerEndpoint } from '../../core/models/catalog.js';
import type { ModelRoute } from '../../core/models/virtualModels.js';
import { snapshotData } from '../../core/values/data.js';
import { requestReplayBinding } from '../../provider/request/replay.js';
import type { StepRequest, StepTarget } from './contract.js';

function targetData(target: StepTarget) {
  return snapshotData({ provider: target.provider, maxOutputTokens: target.maxOutputTokens,
    contextWindow: target.contextWindow, reserveTokens: target.reserveTokens,
    transportOwnsBodyDeadline: target.transportOwnsBodyDeadline, bodyIdleTimeoutMs: target.bodyIdleTimeoutMs },
  { bytes: 256 * 1024, nodes: 4_096, depth: 8 }) as unknown as StepTarget;
}

/** Keep executable transport handles outside the inert identity snapshot. */
export function captureStepTarget(source: StepTarget): StepTarget {
  const data = targetData(source);
  const identity = JSON.stringify(data);
  const { fetchImpl, modelTransport, isCurrent } = source;
  return Object.freeze({ ...data, fetchImpl, modelTransport, isCurrent: () => {
    try {
      return source.fetchImpl === fetchImpl && source.modelTransport === modelTransport && source.isCurrent === isCurrent
        && isCurrent?.() !== false && JSON.stringify(targetData(source)) === identity;
    } catch { return false; }
  } });
}

/** A caller-bound endpoint can change models; a different provider needs its own resolver. */
export async function resolveStepTarget(request: StepRequest, original: StepTarget, route: ModelRoute | undefined, signal?: AbortSignal): Promise<StepTarget> {
  signal?.throwIfAborted();
  if (!route) return original;
  if (request.resolveTarget) {
    const target = await request.resolveTarget(route, signal);
    signal?.throwIfAborted();
    if (target.provider.model !== route.modelId) throw new Error('The routed model binding is unavailable.');
    const captured = captureStepTarget(target);
    return Object.freeze({ ...captured, isCurrent: () => original.isCurrent?.() !== false && captured.isCurrent?.() !== false });
  }
  if (route.provider !== original.provider.provider) throw new Error('The routed provider requires its own target binding.');
  const address = original.provider.baseUrl;
  const endpoint = providerEndpoint(request.catalog ?? [], route.provider, address, route.modelId) ?? request.provider.endpoint;
  const provider = { ...original.provider, provider: route.provider, model: route.modelId, endpoint };
  return captureStepTarget({ ...original, provider: { ...provider,
    replayBinding: endpoint === original.provider.endpoint ? original.provider.replayBinding : requestReplayBinding(provider) } });
}
