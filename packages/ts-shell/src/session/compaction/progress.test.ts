import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentMessage } from '../../core/agent/state.js';
import type { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import type { QueryEvent } from '../../core/query/runtime/events.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import { ConfigState } from '../../config/state.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { configurationBinding } from '../../core/shell/configuration.js';
import type { ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import { createCompactionProviders } from '../../cli/provider/compaction.js';
import { createProviderResources } from '../../cli/provider/resources.js';
import { resetSessionUsage } from '../../observability/usageTelemetry.js';
import { cleanupAdvisorHarnesses, createAdvisorHarness } from '../../test-utils/advisor.js';
import { runTurn } from '../../turn/session.js';
import { CONTEXT_OVERFLOW_PREFIX } from '../../turn/step.js';
import { FINAL_STEP_MESSAGE, outgoingProjection } from '../../turn/messages.js';
import { condenseContext, createCompactionStep, planCompaction, type CompactionPolicy } from '../compaction.js';
import { estimateRequestTokens, estimateTokens } from '../context.js';
import { availableTailTokens, compactionThreshold } from './budget.js';
import { CompactionPublicationError, type CompactionAuthority } from './contract.js';
import { createCompactionProgress } from './progress.js';

vi.mock('../../turn/cacheWarm.js', () => ({ createCacheWarmingRunner: () => ({ stop: vi.fn() }) }));

const policy: CompactionPolicy = { contextWindow: 1_000, reserveTokens: 100, outputTokens: 100, keepRecentTokens: 100 };
const hooks = { dispatch: async () => ({ decision: 'allow' }) } as unknown as HookDispatcher;

function toolGroup(id: string, chars = 2_300): AgentMessage[] {
  return [{ id: `message-${id}`, role: 'assistant', content: '', tool_calls: [
    { id, type: 'function', function: { name: 'read', arguments: '{}' } },
  ] }, { role: 'tool', tool_call_id: id, content: 'r'.repeat(chars) }];
}

function history(tail = toolGroup('read-1')): AgentMessage[] {
  return [{ role: 'system', content: 'runtime instruction' },
    { role: 'user', content: 'old request '.repeat(400) },
    { role: 'assistant', content: 'old response '.repeat(400) },
    { role: 'user', content: 'latest request' }, ...tail];
}

function snapshot(messages: readonly AgentMessage[]) {
  return { messages, toolResults: [] };
}

async function drain(events: AsyncIterable<QueryEvent>): Promise<QueryEvent[]> {
  const seen: QueryEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

let harness: ReturnType<typeof createAdvisorHarness> | undefined;
afterEach(() => {
  if (harness) resetSessionUsage(harness.session.id);
  harness = undefined;
  cleanupAdvisorHarnesses();
});

describe('threshold compaction progress', () => {
  it('keeps ordinary compaction available after it creates headroom', async () => {
    const summarize = vi.fn(async () => 'older work');
    const onDeadEnd = vi.fn();
    const step = createCompactionStep(policy, { summarize, onDeadEnd });
    const first = (await step(snapshot(history(toolGroup('small-1', 800)))))!.messages!;
    expect(estimateRequestTokens(first, policy.overhead)).toBeLessThan(availableTailTokens(policy));
    const grown = [...first, ...toolGroup('small-2', 800), ...toolGroup('small-3', 800)];
    expect(planCompaction(grown, policy)).toBeDefined();
    const second = await step(snapshot(grown));
    expect(second?.messages?.slice(-2)).toEqual(toolGroup('small-3', 800));
    expect(summarize).toHaveBeenCalledTimes(2);
    expect(onDeadEnd).not.toHaveBeenCalled();
  });

  it.each([true, false])('suppresses repeated and appended history at the same cut (message id: %s)', async withId => {
    const tail = toolGroup('large');
    if (!withId) delete tail[0].id;
    const messages = history(tail);
    const original = structuredClone(messages);
    const summarize = vi.fn(async () => 'older work');
    const onCompact = vi.fn();
    const onDeadEnd = vi.fn();
    const step = createCompactionStep(policy, { summarize, onCompact, onDeadEnd });
    const compacted = (await step(snapshot(messages)))!.messages!;
    expect(compacted.slice(-2)).toEqual(tail);
    expect(messages).toEqual(original);
    expect(estimateRequestTokens(compacted, policy.overhead)).toBeGreaterThan(compactionThreshold(policy).tokens);
    expect(planCompaction(compacted, policy)?.cut).toBe(2);
    expect(await step(snapshot(structuredClone(compacted)))).toBeUndefined();
    const appended = [...structuredClone(compacted), { role: 'assistant' as const, content: 'still processing' }];
    expect(planCompaction(appended, policy)?.cut).toBe(2);
    expect(await step(snapshot(appended))).toBeUndefined();
    expect(summarize).toHaveBeenCalledOnce();
    expect(onCompact).toHaveBeenCalledOnce();
    expect(onDeadEnd).toHaveBeenCalledOnce();
    expect(onDeadEnd.mock.calls[0][0]).toContain('pausing automatic compaction');
  });

  it('allows compaction and a fresh notice when the retained cut advances', async () => {
    const summarize = vi.fn(async () => 'older work');
    const onDeadEnd = vi.fn();
    const step = createCompactionStep(policy, { summarize, onDeadEnd });
    const compacted = (await step(snapshot(history())))!.messages!;
    const nextTail = toolGroup('read-2');
    const advanced = [...compacted, ...nextTail];
    expect(planCompaction(advanced, policy)?.cut).toBe(4);
    const second = await step(snapshot(advanced));
    expect(second?.messages?.slice(-2)).toEqual(nextTail);
    expect(summarize).toHaveBeenCalledTimes(2);
    expect(onDeadEnd).toHaveBeenCalledTimes(2);
  });

  it('keeps a dead end suppressed when the retained call has no legal new cut', async () => {
    const messages = history();
    messages.shift();
    const summarize = vi.fn(async () => 'older work');
    const onDeadEnd = vi.fn();
    const onDeclined = vi.fn();
    const step = createCompactionStep(policy, { summarize, onDeadEnd, onDeclined });
    const compacted = (await step(snapshot(messages)))!.messages!;
    expect(planCompaction(compacted, policy)).toBeUndefined();
    expect(await step(snapshot(compacted))).toBeUndefined();
    expect(await step(snapshot(structuredClone(compacted)))).toBeUndefined();
    expect(summarize).toHaveBeenCalledOnce();
    expect(onDeadEnd).toHaveBeenCalledOnce();
    expect(onDeclined).not.toHaveBeenCalled();
  });

  it('resets suppression when a new run creates its own step', async () => {
    const summarize = vi.fn(async () => 'older work');
    const onDeadEnd = vi.fn();
    await createCompactionStep(policy, { summarize, onDeadEnd })(snapshot(history()));
    await createCompactionStep(policy, { summarize, onDeadEnd })(snapshot(history()));
    expect(summarize).toHaveBeenCalledTimes(2);
    expect(onDeadEnd).toHaveBeenCalledTimes(2);
  });

  it('clears suppression when the same retained history enters the recovery band', async () => {
    const summarize = vi.fn().mockResolvedValueOnce('older work '.repeat(50)).mockResolvedValue('brief');
    const onDeadEnd = vi.fn();
    const step = createCompactionStep(policy, { summarize, onDeadEnd });
    const compacted = (await step(snapshot(history())))!.messages!;
    const reduced = compacted.map(message => message.role === 'tool' ? { ...message, content: 'reduced output' } : message);
    expect(estimateRequestTokens(reduced, policy.overhead)).toBeLessThan(availableTailTokens(policy));
    expect(await step(snapshot(reduced))).toBeUndefined();
    expect(await step(snapshot(compacted))).toBeDefined();
    expect(summarize).toHaveBeenCalledTimes(2);
    expect(onDeadEnd).toHaveBeenCalledTimes(2);
  });

  it('clears suppression using projected closing headroom without the withheld schemas', () => {
    const messages: AgentMessage[] = Array.from({ length: 8 }, (_, index) => [
      { id: `user-${index}`, role: 'user' as const, content: `read ${index}` },
      ...toolGroup(`projected-${index}`, 4_000),
    ]).flat();
    const overhead = { systemPrompt: 'main system', tools: [{ name: 'read', description: 's'.repeat(35_000) }] };
    const projectMessages = (source: readonly AgentMessage[]) => outgoingProjection(source, false).messages
      .map(message => ({ ...message, content: message.content ?? '' }));
    const projectedPolicy = { ...policy, contextWindow: 12_000, overhead, projectMessages };
    const projected = projectMessages(messages);
    const closing = { role: 'user' as const, content: FINAL_STEP_MESSAGE };
    const headroom = availableTailTokens(projectedPolicy);
    expect(estimateRequestTokens(projected, overhead)).toBeGreaterThan(headroom);
    expect(estimateRequestTokens([...messages, closing], { ...overhead, tools: [] })).toBeGreaterThan(headroom);
    expect(estimateRequestTokens([...projected, closing], { ...overhead, tools: [] })).toBeLessThanOrEqual(headroom);
    const onDeadEnd = vi.fn();
    const progress = createCompactionProgress(projectedPolicy, onDeadEnd);
    const cut = messages.length - 3;
    progress.accepted(messages, 3, true);
    expect(progress.blocks(messages, cut, true)).toBe(true);
    expect(onDeadEnd).toHaveBeenCalledOnce();
    // Neither the original text nor the offered schema pool changed. Both
    // projection and schema withdrawal are required to regain this headroom.
    expect(progress.blocks(messages, cut, false)).toBe(false);
    expect(progress.blocks(messages, cut, true)).toBe(false);
  });

  it('counts fixed instructions and schemas in both the publication and recovery checks', async () => {
    const overhead = { systemPrompt: 'fixed'.repeat(300), tools: [{ description: 'schema'.repeat(200) }] };
    const completePolicy = { ...policy, overhead };
    const summarize = vi.fn().mockResolvedValueOnce('older work '.repeat(50)).mockResolvedValue('brief');
    const onDeadEnd = vi.fn();
    const step = createCompactionStep(completePolicy, { summarize, onDeadEnd });
    const compacted = (await step(snapshot(history(toolGroup('small', 800)))))!.messages!;
    expect(estimateTokens(compacted)).toBeLessThan(availableTailTokens(policy));
    expect(estimateRequestTokens(compacted, overhead)).toBeGreaterThan(compactionThreshold(policy).tokens);
    expect(await step(snapshot(compacted))).toBeUndefined();
    expect(summarize).toHaveBeenCalledOnce();
    expect(onDeadEnd).toHaveBeenCalledOnce();
  });

  it('allows the carried checkpoint above the recovery band without exempting fixed context', async () => {
    const onDeadEnd = vi.fn();
    const step = createCompactionStep(policy, { summarize: async () => 'summary'.repeat(50), onDeadEnd });
    const compacted = (await step(snapshot(history(toolGroup('near-band', 1_700)))))!.messages!;
    expect(estimateRequestTokens(compacted, policy.overhead)).toBeGreaterThan(availableTailTokens(policy));
    expect(estimateRequestTokens(compacted, policy.overhead) - estimateTokens([compacted[1]]))
      .toBeLessThanOrEqual(availableTailTokens(policy));
    expect(onDeadEnd).not.toHaveBeenCalled();
  });

  it('does not arm until the publication authority and acceptance callback both succeed', async () => {
    const summarize = vi.fn(async () => 'older work');
    const onCompact = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const onDeadEnd = vi.fn();
    const commit = vi.fn().mockReturnValueOnce({ status: 'refused', reason: 'source changed' })
      .mockReturnValue({ status: 'committed' });
    const authority: CompactionAuthority = { capture: messages => ({ sessionId: 'guard-authority', identity: 'source', history: [...messages!] }), commit };
    const step = createCompactionStep(policy, { summarize, authority, onCompact, onDeadEnd });
    expect(await step(snapshot(history()))).toBeUndefined();
    expect(onCompact).not.toHaveBeenCalled();
    expect(onDeadEnd).not.toHaveBeenCalled();
    expect(await step(snapshot(history()))).toBeUndefined();
    expect(onDeadEnd).not.toHaveBeenCalled();
    expect(await step(snapshot(history()))).toBeDefined();
    expect(summarize).toHaveBeenCalledTimes(3);
    expect(commit).toHaveBeenCalledTimes(3);
    expect(onDeadEnd).toHaveBeenCalledOnce();
  });

  it('preserves unverified publication errors and leaves the next attempt unguarded', async () => {
    const summarize = vi.fn(async () => 'older work');
    const onDeadEnd = vi.fn();
    const commit = vi.fn().mockReturnValueOnce({ status: 'unverified', reason: 'unknown outcome' })
      .mockReturnValue({ status: 'committed' });
    const authority: CompactionAuthority = { capture: messages => ({ sessionId: 'guard-unknown', identity: 'source', history: [...messages!] }), commit };
    const step = createCompactionStep(policy, { summarize, authority, onDeadEnd });
    await expect(step(snapshot(history()))).rejects.toBeInstanceOf(CompactionPublicationError);
    expect(onDeadEnd).not.toHaveBeenCalled();
    expect(await step(snapshot(history()))).toBeDefined();
    expect(summarize).toHaveBeenCalledTimes(2);
    expect(onDeadEnd).toHaveBeenCalledOnce();
  });

  it.each(['summary', 'publication', 'acceptance', 'after-hook'] as const)('does not arm when aborted during %s', async boundary => {
    const controller = new AbortController();
    const summarize = vi.fn(async () => { if (boundary === 'summary') controller.abort(); return 'older work'; });
    const onCompact = vi.fn(() => { if (boundary === 'acceptance') controller.abort(); });
    const onDeadEnd = vi.fn();
    const authority: CompactionAuthority = { capture: messages => ({ sessionId: 'guard-abort', identity: 'source', history: [...messages!] }),
      commit: () => { if (boundary === 'publication') controller.abort(); return { status: 'committed' }; } };
    const step = createCompactionStep(policy, { summarize, authority, onCompact, onDeadEnd,
      lifecycle: { after: () => { if (boundary === 'after-hook') controller.abort(); } } });
    expect(await step(snapshot(history()), controller.signal)).toBeUndefined();
    expect(onDeadEnd).not.toHaveBeenCalled();
    expect(await step(snapshot(history()))).toBeDefined();
    expect(onDeadEnd).toHaveBeenCalledOnce();
  });

  it('leaves forced overflow compaction available while threshold compaction is paused', async () => {
    const summarize = vi.fn().mockResolvedValueOnce('older work '.repeat(50)).mockResolvedValue('brief');
    const onDeadEnd = vi.fn();
    const step = createCompactionStep(policy, { summarize, onDeadEnd });
    const compacted = (await step(snapshot(history())))!.messages!;
    expect(await step(snapshot(compacted))).toBeUndefined();
    const rescue = await condenseContext({ messages: compacted, policy, summarize, force: true, lifecycleReason: 'overflow' });
    expect(rescue.status).toBe('condensed');
    if (rescue.status === 'condensed') {
      expect(rescue.messages.slice(-2)).toEqual(toolGroup('read-1'));
      expect(estimateRequestTokens(rescue.messages, policy.overhead)).toBeGreaterThan(availableTailTokens(policy));
    }
    expect(summarize).toHaveBeenCalledTimes(2);
    expect(onDeadEnd).toHaveBeenCalledOnce();
  });

  it('forwards the notice through real provider resources and turn wiring while overflow still retries', async () => {
    harness = createAdvisorHarness(false, false);
    const config = { ...getRuntimeConfig(harness.root), offline: true };
    const binding = configurationBinding({ projectRoot: harness.root, session: harness.session });
    const resolution: ProviderCredentialResolution = { provider: 'openai', model: 'fixture', baseUrl: 'https://provider.invalid/v1',
      expectedEnvVarName: 'OPENAI_API_KEY', credential: { provider: 'openai', authMode: 'api-key', apiKey: 'synthetic-progress-only',
        model: 'fixture', baseUrl: 'https://provider.invalid/v1', source: 'config', envVarName: 'OPENAI_API_KEY' } };
    const catalog = [{ id: 'openai', endpoint: 'openai-compatible' as const, baseUrl: resolution.baseUrl, models: [{ id: 'fixture' }] }];
    const configuration = new ConfigState(config, binding, catalog);
    const runtimeContext = { projectRoot: harness.root, session: harness.session, configuration } as ShellRuntimeContext;
    const renderer = { renderLine: vi.fn() } as unknown as StreamingRenderer;
    const providers = createCompactionProviders({ runtimeContext, renderer });
    const resources = createProviderResources({ runtimeContext, renderer, sessionManager: harness.manager,
      providerRuntimeBridge: { resolveCredentialSnapshot: () => resolution } }, providers);
    const prepare = resources.startRun({ config, catalog, publication: configuration.current,
      backgroundSignal: new AbortController().signal, sessionId: harness.session.id,
      admission: () => undefined, getSourceEntryId: () => undefined });
    const summarize = vi.fn().mockResolvedValueOnce('older work '.repeat(50)).mockResolvedValue('brief');
    const compaction = { ...prepare(resolution).compaction!, authority: undefined, policy, summarize,
      summarizeTurnPrefix: undefined };
    let calls = 0;
    const requests: (readonly AgentMessage[])[] = [];
    const events = await drain(runTurn({ sessionId: harness.session.id, workspaceRoot: harness.root,
      history: history(), prompt: 'continue', hooks, signal: new AbortController().signal,
      tools: new Map(), onMessage: () => {}, compaction,
      step: async messages => {
        requests.push([...messages]);
        return ++calls === 1 ? { text: '', toolCalls: [], stopReason: 'error', errorMessage: `${CONTEXT_OVERFLOW_PREFIX}too big` }
          : { text: 'recovered', toolCalls: [], stopReason: 'stop' };
      },
    }).events);
    expect(renderer.renderLine).toHaveBeenCalledOnce();
    expect(vi.mocked(renderer.renderLine).mock.calls[0][0]).toContain('pausing automatic compaction');
    expect(summarize).toHaveBeenCalledTimes(2);
    expect(calls).toBe(2);
    expect(requests[1].find(message => message.role === 'tool')?.content).toBe('r'.repeat(2_300));
    expect(events.at(-1)?.type).toBe('query.completed');
  });
});
