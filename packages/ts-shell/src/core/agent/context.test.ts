import { expect, it, vi } from 'vitest';
import { AgentCore } from './agent.js';
import { convertMessages, type MessageProjection } from './messages.js';
import type { AgentMessage, StandardAgentMessage } from './state.js';
import type { RequestContextOwner } from './context.js';
import type { AgentLoopConfig } from './loop.js';

function declaration(id = 'declaration'): StandardAgentMessage {
  return { id, role: 'system', content: '', requestDeclaration: { version: 1,
    target: { provider: 'fixture', model: 'model', endpoint: 'anthropic', replayBinding: 'a'.repeat(64) }, tools: [] } };
}

it('accepts captured replacement into live state and retries its existing projection', async () => {
  const converted = vi.fn((messages: readonly AgentMessage[]) => messages.map(message => ({ role: 'user' as const, content: String(message.content) })));
  const candidate = await convertMessages([{ role: 'user', content: 'Accepted history' }], converted);
  let calls = 0;
  const seen: string[] = [];
  const core = new AgentCore({ convertToLlm: converted, retry: { enabled: true, maxRetries: 1, baseDelayMs: 0 },
    streamStep: async (messages, _signal, request) => {
      seen.push(String(messages[0]!.content));
      if (++calls === 1) {
        expect(request?.context?.eligible).toBe(true); expect(request?.context?.accept(candidate)).toBe(true);
        expect(request?.context?.isCurrent()).toBe(true);
        return { text: '', toolCalls: [], stopReason: 'error', retryable: true };
      }
      return { text: 'done', toolCalls: [], stopReason: 'stop' };
    } });
  await core.prompt({ role: 'user', content: 'Original history' });
  expect(seen).toEqual(['Original history', 'Accepted history']); expect(converted).toHaveBeenCalledTimes(2);
  expect(core.state.messages[0]!.content).toBe('Accepted history');
});

it('refuses replacing live history after a successor state was installed', async () => {
  const candidate = await convertMessages([{ role: 'user', content: 'Stale candidate' }], messages => messages.map(message => ({ role: 'user', content: message.content })));
  const core = new AgentCore({ streamStep: async (_messages, _signal, request) => {
    core.state.messages = [{ role: 'user', content: 'Successor history' }];
    expect(request?.context?.isCurrent()).toBe(false); expect(request?.context?.accept(candidate)).toBe(false);
    return { text: 'done', toolCalls: [], stopReason: 'stop' };
  } });
  await core.prompt({ role: 'user', content: 'Original history' });
  expect(core.state.messages[0]!.content).toBe('Successor history');
});

it.each(['messages', 'step'] as const)('does not authorize durable compaction from a prepared %s replacement', async kind => {
  const candidate: MessageProjection = { messages: [{ role: 'user', content: 'Candidate' }], sourceMessages: [{ role: 'user', content: 'Candidate' }] };
  const attempt = async (_messages: readonly AgentMessage[], _signal?: AbortSignal, request?: Parameters<import('./loop.js').AgentLoopConfig['streamStep']>[2]) => {
    expect(request?.context?.eligible).toBe(false); expect(request?.context?.accept(candidate)).toBe(false);
    return { text: 'done', toolCalls: [], stopReason: 'stop' as const };
  };
  const core = new AgentCore({ streamStep: kind === 'messages' ? attempt : async () => ({ text: 'unused', toolCalls: [], stopReason: 'stop' }),
    prepareRequest: () => kind === 'messages' ? { messages: [{ role: 'user', content: 'Temporary replacement' }] } : { streamStep: attempt },
  });
  await core.prompt({ role: 'user', content: 'Original history' });
  expect(core.state.messages[0]!.content).toBe('Original history');
});

it('does not execute a getter while checking live context freshness', async () => {
  const getter = vi.fn(() => 'private');
  const core = new AgentCore({ streamStep: async (_messages, _signal, request) => {
    Object.defineProperty(core.state.messages[0]!, 'content', { configurable: true, enumerable: true, get: getter });
    expect(request?.context?.isCurrent()).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    return { text: 'done', toolCalls: [], stopReason: 'stop' };
  } });
  await core.prompt({ role: 'user', content: 'Original history' });
  expect(getter).not.toHaveBeenCalled();
});

it('publishes a declaration after compaction acceptance and reuses its conversion on retry', async () => {
  const converted = vi.fn((messages: readonly AgentMessage[]) => messages.map(message => ({ ...message, role: message.role === 'custom' ? 'user' as const : message.role })));
  const candidate = await convertMessages([{ role: 'user', content: 'Compacted history' }], converted);
  const marker = declaration();
  const appended = await convertMessages([...candidate.sourceMessages!, marker], converted);
  let calls = 0;
  const persist = vi.fn((message: StandardAgentMessage) => {
    expect(core.state.messages.some(entry => entry.requestDeclaration)).toBe(false);
    expect(message).toEqual(marker);
  });
  const core = new AgentCore({ convertToLlm: converted, retry: { enabled: true, maxRetries: 1, baseDelayMs: 0 },
    streamStep: async (messages, _signal, request) => {
      if (++calls === 1) {
        expect(request?.context?.accept(candidate)).toBe(true);
        expect(request?.context?.appendDeclaration?.(marker, appended, persist)).toBe(true);
        expect(request?.context?.isCurrent()).toBe(true);
        return { text: '', toolCalls: [], stopReason: 'error', retryable: true };
      }
      expect(messages).toEqual(appended.messages);
      return { text: 'done', toolCalls: [], stopReason: 'stop' };
    } });
  const emitted: StandardAgentMessage[] = [];
  core.subscribe(event => { if (event.type === 'message_end') emitted.push(event.message as StandardAgentMessage); });
  await core.prompt({ role: 'user', content: 'Original history' });
  expect(persist).toHaveBeenCalledTimes(1);
  expect(converted).toHaveBeenCalledTimes(3);
  expect(core.state.messages.filter(message => message.requestDeclaration)).toEqual([marker]);
  expect(emitted.some(message => message.requestDeclaration)).toBe(false);
});

it.each(['throw', 'replace', 'abort'] as const)('preserves declaration persistence truth when its callback triggers %s', async outcome => {
  const marker = declaration();
  let persisted = false;
  const core = new AgentCore({ streamStep: async (messages, _signal, request) => {
    const raw = request?.sourceMessages ?? messages;
    const next = [...raw, marker];
    const projected = await convertMessages(next);
    const publication = () => request!.context!.appendDeclaration!(marker, { ...projected, sourceMessages: next }, () => {
      if (outcome === 'throw') throw new Error('storage unavailable');
      persisted = true;
      if (outcome === 'replace') core.state.messages = [{ role: 'user', content: 'Successor history' }];
      if (outcome === 'abort') core.abort();
    });
    if (outcome === 'throw') expect(publication).toThrow('storage unavailable');
    else expect(publication()).toBe(outcome === 'abort');
    expect(core.state.messages.some(message => message.requestDeclaration)).toBe(outcome === 'abort');
    expect(request?.context?.isCurrent()).toBe(outcome === 'throw');
    return { text: '', toolCalls: [], stopReason: 'error', retriesExhausted: true };
  } });
  await core.prompt({ role: 'user', content: 'Original history' });
  expect(persisted).toBe(outcome !== 'throw');
  if (outcome === 'replace') expect(core.state.messages[0]!.content).toBe('Successor history');
});

it('refuses reentrant, duplicate and non-append declaration publication before persistence', async () => {
  const marker = declaration();
  const rejected = vi.fn();
  const core = new AgentCore({ streamStep: async (messages, _signal, request) => {
    const owner = request!.context!;
    const next = [...messages, marker];
    const candidate = { ...await convertMessages(next), sourceMessages: next };
    expect(owner.appendDeclaration!(marker, candidate, () => {
      expect(owner.appendDeclaration!(marker, candidate, rejected)).toBe(false);
      expect(owner.accept(candidate)).toBe(false);
    })).toBe(true);
    expect(owner.appendDeclaration!(marker, candidate, rejected)).toBe(false);
    const replacement = [declaration('second')];
    expect(owner.appendDeclaration!(replacement[0]!, { ...await convertMessages(replacement), sourceMessages: replacement }, rejected)).toBe(false);
    expect(rejected).not.toHaveBeenCalled();
    return { text: 'done', toolCalls: [], stopReason: 'stop' };
  } });
  await core.prompt({ role: 'user', content: 'Original history' });
});

it('refuses invalid declarations before snapshotting can remove undefined payload keys', async () => {
  const persist = vi.fn();
  const core = new AgentCore({ streamStep: async (messages, _signal, request) => {
    const marker = declaration();
    const invalid = { ...marker, requestDeclaration: { ...marker.requestDeclaration!, extra: undefined } } as StandardAgentMessage;
    const next = [...messages, marker];
    expect(request?.context?.appendDeclaration?.(marker, { sourceMessages: next, messages: [...messages, invalid] as StandardAgentMessage[] }, persist)).toBe(false);
    expect(request?.context?.appendDeclaration?.(marker, { sourceMessages: next, messages: next as StandardAgentMessage[], providerMessages: [...messages, invalid] }, persist)).toBe(false);
    expect(persist).not.toHaveBeenCalled();
    return { text: 'done', toolCalls: [], stopReason: 'stop' };
  } });
  await core.prompt({ role: 'user', content: 'Original history' });
});

it('captures publication input before its callback and refuses projection accessors without reading them', async () => {
  const marker = declaration();
  const getter = vi.fn(() => { throw new Error('must not run'); });
  const rejected = vi.fn();
  const core = new AgentCore({ streamStep: async (messages, _signal, request) => {
    const owner = request!.context!;
    const candidate = { ...await convertMessages([...messages, marker]), sourceMessages: [...messages, marker] };
    const hostile = Object.defineProperty({}, 'sourceMessages', { get: getter }) as MessageProjection;
    expect(owner.appendDeclaration!(marker, hostile, rejected)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(rejected).not.toHaveBeenCalled();
    expect(owner.appendDeclaration!(marker, candidate, () => {
      candidate.sourceMessages[0] = { role: 'user', content: 'Callback mutation' };
    })).toBe(true);
    expect(core.state.messages[0]!.content).toBe('Original history');
    return { text: 'done', toolCalls: [], stopReason: 'stop' };
  } });
  await core.prompt({ role: 'user', content: 'Original history' });
});

it.each(['native', 'replacement-native', 'replacement-custom'] as const)('converts according to the actual %s step preparation contract', async mode => {
  const converter = vi.fn((messages: readonly AgentMessage[]) => messages.map(message => ({ role: 'user' as const, content: `converted ${message.content}` })));
  let owner: RequestContextOwner | undefined;
  const actual: AgentLoopConfig['streamStep'] = Object.assign(async (messages: readonly AgentMessage[], _signal?: AbortSignal,
    request?: Parameters<AgentLoopConfig['streamStep']>[2]) => {
    owner = request?.context;
    if (mode !== 'replacement-custom') {
      expect(converter).not.toHaveBeenCalled();
      expect(messages[0]!.content).toBe('Original history');
      expect(request?.sourceMessages).toEqual(messages);
      await convertMessages(request!.sourceMessages!, converter);
    } else expect(messages[0]!.content).toBe('converted Original history');
    return { text: 'done', toolCalls: [], stopReason: 'stop' as const };
  }, { preparesContext: mode !== 'replacement-custom' });
  const initial = Object.assign(async () => ({ text: 'unused', toolCalls: [], stopReason: 'stop' as const }), { preparesContext: true });
  const core = new AgentCore({ streamStep: mode === 'native' ? actual : initial, convertToLlm: converter,
    ...(mode === 'native' ? {} : { prepareRequest: () => ({ streamStep: actual }) }) });
  await core.prompt({ role: 'user', content: 'Original history' });
  expect(converter).toHaveBeenCalledTimes(1);
  expect(owner?.eligible).toBe(mode === 'native');
});
