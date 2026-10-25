import type { AgentMessage } from '../../core/agent/state.js';
import type { RequestOverhead } from '../../session/context.js';
import { estimateRequestTokens, estimateTokens } from '../../session/context.js';
import { historyDigest } from './identity.js';
import type { PromptMeasurementIdentity } from '../../observability/usage/model.js';
import type { SessionUsageTelemetry } from '../../observability/usage/model.js';

export interface PromptEstimate {
  readonly tokens: number;
  readonly source: 'estimated' | 'calibrated';
  readonly identity: PromptMeasurementIdentity;
  /** Source estimate; fixed image allowance and protocol framing are approximate. */
  readonly method: 'characters/3.5';
}

/** Calibrate only an unchanged measured prefix, never a same-length replacement. */
export function estimatePrompt(messages: readonly AgentMessage[], overhead: RequestOverhead,
  identity: PromptMeasurementIdentity, usage: SessionUsageTelemetry, projectedTokens?: number): PromptEstimate {
  const previous = usage.lastPromptIdentity;
  const count = usage.lastPromptMessageCount;
  const compatible = previous && previous.provider === identity.provider && previous.model === identity.model
    && previous.endpoint === identity.endpoint && previous.schemaDigest === identity.schemaDigest
    && identity.endpointId !== undefined && previous.endpointId === identity.endpointId
    && previous.systemDigest === identity.systemDigest && previous.historyDigest !== undefined
    && Number.isSafeInteger(count) && count >= 0 && count <= messages.length
    && previous.historyDigest === historyDigest(messages.slice(0, count))
    // Tool microcompaction and opaque multimodal/reasoning replay are not additive.
    && messages.every(message => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string'
      && !message.reasoning && !message.tool_calls?.length && !message.tool_call_id && !message.origin?.replayBinding);
  const calibrated = compatible && usage.lastPromptTokens !== undefined;
  const tokens = calibrated ? usage.lastPromptTokens! + estimateTokens(messages.slice(count))
    : projectedTokens ?? estimateRequestTokens(messages, overhead);
  return { tokens, source: calibrated ? 'calibrated' : 'estimated', identity: { ...identity, historyDigest: historyDigest(messages) }, method: 'characters/3.5' };
}
