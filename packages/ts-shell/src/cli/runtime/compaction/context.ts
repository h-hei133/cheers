import type { AgentMessage } from '../../../core/agent/state.js';
import { captureContext, sameContext } from '../../../core/agent/context.js';
import type { MessageConverter } from '../../../core/agent/messages.js';
import type { CompactionPolicy } from '../../../session/compaction.js';
import { captureThinkingPreference } from '../../../core/models/preference.js';
import type { StepRequest } from '../../../turn/step.js';
import { createTurnContextPreparer } from '../../../turn/context/prepare.js';
import { capturedCompactionPolicy } from '../../../turn/compaction/policy.js';
import { requestReplayBinding } from '../../../provider/request/replay.js';

/** Manual history uses the foreground request owner without acquiring a provider attempt. */
export function manualCompactionPolicy(policy: CompactionPolicy, request: StepRequest,
  converter: MessageConverter | undefined, admission?: () => string | undefined): CompactionPolicy {
  const thinking = captureThinkingPreference(request.workspaceRoot, request.thinkingEffort);
  const options = { allowTools: true, convertToLlm: converter, requestPurpose: 'turn' } as const;
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
    return capturedCompactionPolicy(policy, prepared, { admission, onPrepared: () => {} });
  } };
}
