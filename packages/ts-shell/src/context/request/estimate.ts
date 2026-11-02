import type { AgentMessage } from '../../core/agent/state.js';
import type { RequestOverhead } from '../../session/context.js';
import { estimateRequestTokens } from '../../session/context.js';
import { historyDigest } from './identity.js';
import type { PromptMeasurementIdentity } from '../../observability/usage/model.js';
import type { SessionUsageTelemetry } from '../../observability/usage/model.js';
import type { PromptCountMethod } from './model.js';
import { estimatePromptTail, type PromptTailContext } from './tail.js';

export interface PromptEstimate {
  readonly tokens: number;
  readonly source: 'estimated' | 'calibrated';
  readonly identity: PromptMeasurementIdentity;
  /** Source estimate; fixed image allowance and protocol framing are approximate. */
  readonly method: PromptCountMethod;
}

/** Calibrate only an unchanged measured prefix, never a same-length replacement. */
export function estimatePrompt(messages: readonly AgentMessage[], overhead: RequestOverhead,
  identity: PromptMeasurementIdentity, usage: SessionUsageTelemetry,
  projected?: number | { readonly tokens: number; readonly method: PromptCountMethod;
    readonly tailContext?: PromptTailContext;
    /** The measured source prefix as it appears in the current, unmodified wire projection. */
    readonly prefixIdentity?: Pick<PromptMeasurementIdentity, 'wireHistoryDigest' | 'wireMessageCount'> }): PromptEstimate {
  const method = typeof projected === 'object' ? projected.method : 'characters/3.5';
  const projectedTokens = typeof projected === 'number' ? projected : projected?.tokens;
  const previous = usage.lastPromptIdentity;
  const count = usage.lastPromptMessageCount;
  const comparedWireIdentity = previous?.wireHistoryDigest !== undefined || identity.wireHistoryDigest !== undefined;
  const sameWireIdentity = previous?.wireHistoryDigest === identity.wireHistoryDigest
    && previous?.wireMessageCount === identity.wireMessageCount;
  const prefixIdentity = typeof projected === 'object' ? projected.prefixIdentity : undefined;
  const sameWirePrefix = prefixIdentity?.wireHistoryDigest !== undefined
    && previous?.wireHistoryDigest === prefixIdentity.wireHistoryDigest
    && previous?.wireMessageCount === prefixIdentity.wireMessageCount;
  const comparedReplayIdentity = previous?.replayBinding !== undefined || identity.replayBinding !== undefined;
  const sameReplayIdentity = previous?.replayBinding === identity.replayBinding;
  const compatible = previous && previous.provider === identity.provider && previous.model === identity.model
    && (method === 'characters/3.5' || comparedWireIdentity && (count === messages.length || sameWirePrefix))
    && previous.endpoint === identity.endpoint && previous.schemaDigest === identity.schemaDigest
    && identity.endpointId !== undefined && previous.endpointId === identity.endpointId
    && previous.systemDigest === identity.systemDigest && previous.historyDigest !== undefined
    && (!comparedWireIdentity || sameWireIdentity && count === messages.length || sameWirePrefix)
    && (!comparedReplayIdentity || sameReplayIdentity)
    && Number.isSafeInteger(count) && count >= 0 && count <= messages.length
    && previous.historyDigest === historyDigest(messages.slice(0, count))
    // Ordinary tool calls and results are additive; rewritten or opaque replay is not.
    && messages.every(message => typeof message.content === 'string'
      && message.reasoning?.signature === undefined && !message.reasoning?.redacted
      && (!message.origin?.replayBinding || (sameWirePrefix || sameWireIdentity && count === messages.length)
        && message.origin.provider === identity.provider && message.origin.model === identity.model
        && message.origin.replayBinding === identity.replayBinding));
  const tailContext = typeof projected === 'object' && projected.tailContext
    ? { ...projected.tailContext, endpoint: identity.endpoint, provider: identity.provider, model: identity.model,
      replayBinding: identity.replayBinding } : undefined;
  const tail = compatible ? estimatePromptTail(messages.slice(count), tailContext) : undefined;
  const calibrated = compatible && usage.lastPromptTokens !== undefined && tail !== undefined;
  const tokens = calibrated ? usage.lastPromptTokens! + tail!
    : projectedTokens ?? estimateRequestTokens(messages, overhead);
  return { tokens, source: calibrated ? 'calibrated' : 'estimated', identity: { ...identity, historyDigest: historyDigest(messages) },
    method: calibrated && count < messages.length ? 'characters/3.5' : method };
}
