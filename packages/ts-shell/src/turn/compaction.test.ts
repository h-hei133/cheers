import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentCore } from '../core/agent/agent.js';
import type { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import type { QueryEvent } from '../core/query/runtime/events.js';
import type { SessionMessage } from '../session/schema/sessionMessage.js';
import { setStructuredLogSink } from '../observability/structuredLogger.js';
import { runTurn, type TurnOptions } from './session.js';

const history: SessionMessage[] = Array.from({ length: 6 }, (_, index) => [
  { role: 'user' as const, content: `question ${index} ${'x'.repeat(200)}` },
  { role: 'assistant' as const, content: `answer ${index} ${'y'.repeat(200)}` },
]).flat();
const hooks = { dispatch: async () => ({ decision: 'allow' }) } as unknown as HookDispatcher;

function options(overrides: Partial<TurnOptions> = {}): TurnOptions {
  return { sessionId: 'pre-prompt-compaction', prompt: 'continue', workspaceRoot: process.cwd(),
    history, hooks, signal: new AbortController().signal, tools: new Map(), maxSteps: 5,
    onMessage: () => {}, step: async () => ({ text: 'done', toolCalls: [], stopReason: 'stop' }),
    compaction: { policy: { contextWindow: 1_500, reserveTokens: 100, outputTokens: 100, keepRecentTokens: 100 },
      summarize: async () => 'previous work', onCompact: () => {} }, ...overrides };
}

async function drain(events: AsyncIterable<QueryEvent>): Promise<void> {
  for await (const _event of events) { /* Drive the actual turn to settlement. */ }
}

afterEach(() => { setStructuredLogSink(null); });

describe('session compaction boundaries', () => {
  it('checks before kernel entry, retains the opening once, and checks between tool steps', async () => {
    const order: string[] = [];
    const boundaries: unknown[] = [];
    setStructuredLogSink(entry => { if (entry.component === 'turn.compaction') boundaries.push(entry.fields.boundary); });
    let calls = 0;
    const compact = vi.fn();
    const input = options({
      history: history.map(message => ({ ...message, content: `${message.content}${'z'.repeat(300)}` })),
      attachments: { images: [{ type: 'image', mimeType: 'image/png', data: 'fixture' }] },
      permissionScope: 'allow-all',
      observe: event => { if (event.type === 'agent_start') order.push('kernel'); },
      tools: new Map([['inspect', { name: 'inspect', description: 'Read only', parameters: { type: 'object', properties: {} },
        execute: async () => ({ success: true, output: 'ok' }) }]]),
      compaction: { policy: { contextWindow: 4_000, reserveTokens: 100, outputTokens: 100, keepRecentTokens: 100 },
        summarize: async () => { order.push('summary'); return 'previous work'; }, onCompact: compact },
      step: async messages => {
        order.push('request');
        expect(messages.filter(message => typeof message.content !== 'string'
          && message.content.some(block => block.type === 'image'))).toHaveLength(1);
        expect(JSON.stringify(messages)).toContain('continue');
        expect(JSON.stringify(messages)).toContain('[Context Checkpoint]');
        return ++calls === 1 ? { text: '', toolCalls: [{ id: 'read-1', name: 'inspect', args: {} }], stopReason: 'tool_calls' }
          : { text: 'done', toolCalls: [], stopReason: 'stop' };
      },
    });
    await drain(runTurn(input).events);
    expect(order.slice(0, 3)).toEqual(['summary', 'kernel', 'request']);
    expect(boundaries).toEqual(['prompt', 'step']);
    expect(compact).toHaveBeenCalledTimes(1);
    expect(calls).toBe(2);
  });

  it('cancels preflight without entering the kernel or sending the first request', async () => {
    const controller = new AbortController();
    const step = vi.fn(async () => ({ text: 'unexpected', toolCalls: [], stopReason: 'stop' as const }));
    const observe = vi.fn();
    await drain(runTurn(options({ signal: controller.signal, step, observe,
      history: history.map(message => ({ ...message, content: `${message.content}${'z'.repeat(300)}` })),
      compaction: { policy: { contextWindow: 1_500, reserveTokens: 100, outputTokens: 100, keepRecentTokens: 100 },
        summarize: async () => { controller.abort(); return 'cancelled summary'; }, onCompact: vi.fn() },
    })).events);
    expect(step).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  });

  it('skips only the externally prepared prompt and still prepares a queued restart', async () => {
    const prepared: SessionMessage[][] = [];
    const prepare = vi.fn(snapshot => { prepared.push([...snapshot.messages]); });
    const core = new AgentCore({ prepareNextStep: prepare,
      streamStep: async () => ({ text: 'done', toolCalls: [], stopReason: 'stop' }) });
    await core.prompt({ role: 'user', content: 'prepared' }, { skipInitialPreparation: true });
    expect(prepare).not.toHaveBeenCalled();
    core.followUp({ role: 'user', content: 'queued' });
    await core.continue();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepared[0].at(-1)).toMatchObject({ content: 'queued' });
  });
});
