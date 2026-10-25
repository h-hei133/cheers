import { expect, it } from 'vitest';
import { estimatePrompt } from './estimate.js';
import { historyDigest, requestIdentity } from './identity.js';
import { getSessionUsage } from '../../observability/usageTelemetry.js';
import type { AgentMessage } from '../../core/agent/state.js';

const prefix: AgentMessage[] = [{ role: 'user', content: 'first' }, { role: 'assistant', content: 'answer' }];
const overhead = { systemPrompt: 'system', tools: [] };
const identity = { provider: 'openai', model: 'm', endpoint: 'openai-compatible', endpointId: 'a'.repeat(64), ...requestIdentity(overhead) };
const usage = () => ({ ...getSessionUsage('estimate-fixture'), lastPromptTokens: 500, lastPromptMessageCount: prefix.length,
  lastPromptIdentity: { ...identity, historyDigest: historyDigest(prefix) } });

it('uses provider usage only for an unchanged text prefix and a proven destination', () => {
  const messages: AgentMessage[] = [...prefix, { role: 'user', content: 'next' }];
  expect(estimatePrompt(messages, overhead, identity, usage(), 800)).toMatchObject({ source: 'calibrated', tokens: 502 });
  const changes = [
    { ...identity, endpointId: 'b'.repeat(64) }, { ...identity, endpointId: undefined },
    { ...identity, model: 'other' }, { ...identity, schemaDigest: 'new' }, { ...identity, systemDigest: 'new' },
  ];
  for (const changed of changes) expect(estimatePrompt(messages, overhead, changed, usage(), 800))
    .toMatchObject({ source: 'estimated', tokens: 800 });
  expect(estimatePrompt([{ ...prefix[0]!, content: 'other' }, prefix[1]!, messages[2]!], overhead, identity, usage(), 800))
    .toMatchObject({ source: 'estimated', tokens: 800 });
});

it('does not add calibrated counts through tool compaction, reasoning or image transformations', () => {
  const variants: AgentMessage[] = [
    { role: 'tool', content: 'result', tool_call_id: 'id' },
    { role: 'assistant', content: 'answer', reasoning: { text: 'thought', signature: 'signed' } },
    { role: 'user', content: [{ type: 'image', mimeType: 'image/png', data: 'AA==' }] },
  ];
  for (const message of variants) expect(estimatePrompt([...prefix, message], overhead, identity, usage(), 800))
    .toMatchObject({ source: 'estimated', tokens: 800 });
});
