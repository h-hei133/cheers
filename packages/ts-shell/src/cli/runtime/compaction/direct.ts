import type { AgentMessage } from '../../../core/agent/state.js';
import { captureContext, sameContext } from '../../../core/agent/context.js';
import { assertAdmission, type Admission } from '../../../core/network/admission.js';
import { catalogModel } from '../../../core/models/catalog.js';
import { effortCapability } from '../../../core/models/capability.js';
import { captureThinkingPreference } from '../../../core/models/preference.js';
import { resolveRequestShape } from '../../../core/models/requestShape.js';
import { requestReplayBinding } from '../../../provider/request/replay.js';
import { endpointShape } from '../../../provider/endpoints/index.js';
import { effortOutputFailure } from '../../../provider/endpoints/effort.js';
import { prepareModelRoute } from '../../../turn/context/route.js';
import { captureStepTarget, resolveStepTarget } from '../../../turn/context/target.js';
import type { StepRequest } from '../../../turn/context/contract.js';
import { summaryBudget } from '../../provider/summary/budget.js';
import { summaryTarget } from './target.js';

/** Summaries route before budgeting, without consuming or publishing foreground branch state. */
export async function directCompactionTarget(request: StepRequest, messages: readonly AgentMessage[], signal?: AbortSignal,
  admission?: Admission) {
  const original = captureStepTarget(request), resolver = request.resolveTarget;
  const cacheRetention = request.cacheRetention ?? 'short', sessionId = request.sessionId;
  const captured = captureContext(messages);
  const thinking = captureThinkingPreference(request.workspaceRoot, request.thinkingEffort);
  const rawEffort = thinking.thinkingEffort ?? undefined;
  const explicitEffort = request.thinkingEffortExplicit ?? thinking.thinkingEffortExplicit;
  signal?.throwIfAborted(); assertAdmission(admission);
  const routing = await prepareModelRoute(request, { allowTools: false, routeReason: 'direct' }, captured,
    rawEffort ?? 'medium', 0, signal);
  const target = await resolveStepTarget(request, original, routing.route, signal);
  const admit = () => {
    signal?.throwIfAborted();
    return admission?.() ?? (!routing.isCurrent() || target.isCurrent?.() === false || request.resolveTarget !== resolver
      || !sameContext(messages, captured) ? 'The captured summary route changed.' : undefined);
  };
  routing.accept(() => assertAdmission(admit));
  const activeProvider = target.provider.provider ?? '', activeModel = target.provider.model;
  const endpoint = target.provider.endpoint ?? 'openai-compatible';
  const model = catalogModel(request.catalog ?? [], activeProvider, activeModel, target.provider.baseUrl);
  const effort = routing.route?.thinkingLevel ?? rawEffort;
  if (effort && (explicitEffort || ['minimal', 'xhigh', 'max'].includes(effort))
    && effortCapability(request.catalog ?? [], activeProvider, activeModel, effort, target.provider.baseUrl) === 'unsupported') {
    throw new Error('The selected model does not support this reasoning effort. Select another level or use /thinking auto.');
  }
  const shape = resolveRequestShape(request.catalog ?? [], activeProvider, activeModel,
    effort, target.provider.baseUrl, endpoint);
  const contextWindow = target.contextWindow ?? model?.contextWindow, reserveTokens = target.reserveTokens ?? 0;
  const limits = summaryBudget({ contextWindow, inputLimit: model?.inputLimit, maxOutputCeiling: model?.maxTokens,
    reserveTokens, providerOwnedOutput: endpointShape(endpoint).outputControl === 'provider' });
  const failure = explicitEffort && effort ? effortOutputFailure(endpointShape(endpoint), limits.maxOutputTokens) : undefined;
  if (failure) throw new Error(failure);
  return { target, admission: admit, provider: { ...summaryTarget({ target, activeProvider, activeModel, endpoint, shape,
    cacheRetention, sessionId,
    replayBinding: target.provider.replayBinding ?? requestReplayBinding(target.provider) }),
    contextWindow, inputLimit: model?.inputLimit, maxOutputTokens: limits.maxOutputTokens, reserveTokens } };
}
