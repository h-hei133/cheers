import { expect, it, vi } from 'vitest';
import { AgentCore } from './agent.js';
import { convertMessages, type MessageProjection } from './messages.js';
import type { AgentMessage } from './state.js';

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
