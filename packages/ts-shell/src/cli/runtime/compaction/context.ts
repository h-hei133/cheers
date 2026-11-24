import type { AgentMessage } from '../../../core/agent/state.js';
import { captureContext, sameContext } from '../../../core/agent/context.js';
import type { MessageConverter } from '../../../core/agent/messages.js';
import type { CompactionPolicy } from '../../../session/compaction.js';
import { captureThinkingPreference } from '../../../core/models/preference.js';
import type { StepRequest } from '../../../turn/step.js';
import { createTurnContextPreparer } from '../../../turn/context/prepare.js';
import { capturedCompactionPolicy } from '../../../turn/compaction/policy.js';
import { requestReplayBinding } from '../../../provider/request/replay.js';
import type { PreparedTurnContext } from '../../../turn/context/contract.js';
import type { buildCompactionWiring } from '../compaction.js';
import type { CompactionBinding } from '../../../turn/compaction.js';

/** Manual history uses the foreground request owner without acquiring a provider attempt. */
export function manualCompactionPolicy(policy: CompactionPolicy, request: StepRequest,
  converter: MessageConverter | undefined, admission?: () => string | undefined,
  bind?: (prepared: PreparedTurnContext) => CompactionPolicy): CompactionPolicy {
  const thinking = captureThinkingPreference(request.workspaceRoot, request.thinkingEffort);
  const options = { allowTools: true, convertToLlm: converter, requestPurpose: 'turn', routeReason: 'direct' } as const;
  const prepareRequest = createTurnContextPreparer(request, options, {
    thinkingEffort: thinking.thinkingEffort,
    explicitEffort: request.thinkingEffortExplicit ?? thinking.thinkingEffortExplicit,
    effortAccepted: () => true, streamAttempts: () => 0,
    replayBinding: request.provider.replayBinding ?? requestReplayBinding(request.provider),
  });
  return { ...policy, prepare: async (messages: readonly AgentMessage[], signal?: AbortSignal) => {
    const captured = captureContext(messages);
    const blocked = admission?.(); if (blocked) throw new Error(blocked);
    const prepared = await prepareRequest(captured, signal);
    if (!sameContext(messages, captured)) throw new Error('Manual compaction history changed during preparation.');
    prepared.acceptRoute?.();
    // A manual reduction remains useful when fixed foreground overhead alone exceeds the model window.
    return capturedCompactionPolicy(bind?.(prepared) ?? policy, prepared,
      { admission, onPrepared: () => {}, allowContextOverflow: true });
  } };
}

/** Bind before planning the cut; every summary segment reuses that same physical target. */
export function manualCompactionWiring(wiring: ReturnType<typeof buildCompactionWiring>, request: StepRequest,
  converter: MessageConverter | undefined, admission: () => string | undefined): CompactionBinding {
  let bound: CompactionBinding | undefined;
  const current = () => {
    if (!bound) throw new Error('Manual compaction has no prepared request.');
    return bound;
  };
  return { policy: manualCompactionPolicy(wiring.policy, request, converter, admission, prepared => {
    bound = wiring.forRequest(prepared, admission); return bound.policy;
  }),
  summarize: Object.assign((...args: Parameters<typeof wiring.summarize>) => current().summarize(...args),
    { dispatchAware: true, prepare: (...args: Parameters<typeof wiring.summarize>) => current().summarize.prepare!(...args) }),
  summarizeTurnPrefix: Object.assign((...args: Parameters<typeof wiring.summarizeTurnPrefix>) => current().summarizeTurnPrefix!(...args),
    { dispatchAware: true, prepare: (...args: Parameters<NonNullable<typeof wiring.summarizeTurnPrefix.prepare>>) => current().summarizeTurnPrefix!.prepare!(...args) }) };
}
