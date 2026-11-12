import { afterEach, expect, it } from 'vitest';
import type { AgentMessage } from '../core/agent/state.js';
import type { CatalogProvider } from '../core/models/catalog.js';
import { boundText } from '../core/agent/tools.js';
import { resetSessionUsage } from '../observability/usageTelemetry.js';
import { estimateWirePromptDetails } from '../context/request/wire.js';
import { endpointShape } from '../provider/endpoints/index.js';
import { createStepFunction, CONTEXT_OVERFLOW_PREFIX } from './step.js';
import { FINAL_STEP_MESSAGE, outgoingProjection } from './messages.js';

const sessionId = 'tool-text-retention';
const fact = 'Render chrome before the transcript pane.';
const raw = 'source header\n'.repeat(150) + fact + '\nsource footer'.repeat(1000);
const bounded = boundText(raw, 10_000, 'Read the next page for remaining source.');
const replayBinding = 'a'.repeat(64);
const history: AgentMessage[] = [
  { role: 'user', content: 'implement' },
  { role: 'assistant', content: '', tool_calls: [{ id: 'source', type: 'function',
    function: { name: 'read', arguments: '{"path":"source.ts"}' } }],
    origin: { provider: 'fixture', model: 'model', replayBinding },
    reasoning: { text: 'Public synthetic reasoning fixture.' } },
  { role: 'tool', content: bounded, tool_call_id: 'source' },
  ...Array.from({ length: 4 }, (_, index): AgentMessage[] => [
    { role: 'user', content: `continue ${index}` }, { role: 'assistant', content: 'working' },
  ]).flat(),
];
const provider = { provider: 'fixture', model: 'model', baseUrl: 'https://fixture.invalid/v1',
  headers: {}, replayBinding };
const tools = [{ type: 'function' as const, function: { name: 'read', parameters: { type: 'object' } } }];
const catalog = (inputLimit?: number): readonly CatalogProvider[] => [{ id: 'fixture', label: 'Retention fixture',
  runtime: 'openai', auth: 'api-key', baseUrl: provider.baseUrl, models: [{ id: 'model', contextWindow: 100_000,
  maxTokens: 1024, inputLimit, compat: { reasoningReplayField: 'reasoning_content' as const } }] }];
const response = () => new Response(JSON.stringify({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 9000, completion_tokens: 1 } }), { headers: { 'content-type': 'application/json' } });
afterEach(() => resetSessionUsage(sessionId));

it.each([true, false])('retains bounded source in a native request when tools are allowed=%s', async allowTools => {
  expect(bounded).toContain(fact);
  expect(bounded).not.toBe(raw);
  expect(JSON.stringify(outgoingProjection(history, false).messages)).not.toContain(fact);
  let sent = '';
  const step = createStepFunction({ provider, sessionId, workspaceRoot: '/fixture', systemPrompt: 'Implement.',
    tools, catalog: catalog(), pruneToolText: false, maxOutputTokens: 1024, reserveTokens: 8000,
    thinkingEffort: null, fetchImpl: async (_url, init) => { sent = String(init?.body); return response(); } });
  const result = await step(history, undefined, {}, { allowTools });
  expect(result.stopReason).toBe('stop');
  const body = JSON.parse(sent);
  expect(body.messages.find((message: { role: string }) => message.role === 'tool').content).toBe(bounded);
  expect(body.messages[2].reasoning_content).toBe('Public synthetic reasoning fixture.');
  expect(body.messages.filter((message: { content?: string }) => message.content === FINAL_STEP_MESSAGE)).toHaveLength(allowTools ? 0 : 1);
  expect(body.tools !== undefined).toBe(allowTools);
  expect(result.promptMeasurement?.identity.wireRewriteTokens).toBe(0);
  expect(estimateWirePromptDetails(body, endpointShape('openai-compatible').contextFields).tokens).toBeGreaterThan(2000);
  expect(history[2]!.content).toBe(bounded);
});

it.each(['window', 'input'] as const)('refuses the full retained source at a known %s limit before sending', async limit => {
  let sends = 0;
  const step = createStepFunction({ provider, sessionId, workspaceRoot: '/fixture', systemPrompt: 'Implement.',
    tools, catalog: catalog(limit === 'input' ? 1000 : undefined), pruneToolText: false, maxOutputTokens: 1024,
    contextWindow: limit === 'window' ? 2500 : 100_000, thinkingEffort: null,
    fetchImpl: async () => { sends++; return response(); } });
  const result = await step(history, undefined, {}, { allowTools: true });
  expect(result.stopReason).toBe('error');
  expect(result.errorMessage).toContain(CONTEXT_OVERFLOW_PREFIX);
  expect(sends).toBe(0);
});
