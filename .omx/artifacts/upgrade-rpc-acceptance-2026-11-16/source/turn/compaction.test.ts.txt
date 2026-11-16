import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentCore } from '../core/agent/agent.js';
import type { AgentMessage } from '../core/agent/state.js';
import type { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import type { QueryEvent } from '../core/query/runtime/events.js';
import type { SessionMessage } from '../session/schema/sessionMessage.js';
import { SummaryAdmissionError } from '../session/compaction/contract.js';
import { setStructuredLogSink } from '../observability/structuredLogger.js';
import { runTurn, type TurnOptions } from './session.js';

const history: SessionMessage[] = Array.from({ length: 6 }, (_, index) => [
  { role: 'user' as const, content: `question ${index} ${'x'.repeat(200)}` },
  { role: 'assistant' as const, content: `answer ${index} ${'y'.repeat(200)}` },
]).flat();
const hooks = { dispatch: async () => ({ decision: 'allow', stopChecks: [] }) } as unknown as HookDispatcher;
const overBudgetHistory = history.map(message => ({ ...message, content: `${message.content}${'z'.repeat(300)}` }));

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
  it('reports active automatic compaction through publication and the final hook', async () => {
    let entered!: () => void, release!: () => void, afterEntered!: () => void, afterRelease!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    const finalHook = new Promise<void>(resolve => { afterEntered = resolve; });
    const hookHold = new Promise<void>(resolve => { afterRelease = resolve; });
    const phases: Array<boolean | undefined> = [];
    let run!: ReturnType<typeof runTurn>;
    const input = options({ sessionId: 'compaction-activity', history: overBudgetHistory,
      hooks: { dispatch: async (event: { eventName: string }) => {
        if (event.eventName === 'PreCompact') phases.push(run.isCompacting?.());
        if (event.eventName === 'PostCompact') { phases.push(run.isCompacting?.()); afterEntered(); await hookHold; }
        return { decision: 'allow', stopChecks: [] };
      } } as unknown as HookDispatcher });
    run = runTurn({ ...input, compaction: { ...input.compaction!,
      summarize: async () => { entered(); await hold; return 'previous work'; },
      onCompact: () => { phases.push(run.isCompacting?.()); } } });
    const running = drain(run.events);
    try {
      await started; expect(run.isCompacting?.()).toBe(true);
      release(); await finalHook; expect(run.isCompacting?.()).toBe(true);
    } finally { release(); afterRelease(); await running; }
    expect(phases).toEqual([true, true, true]);
    expect(run.isCompacting?.()).toBe(false);
  });

  it.each(['missing', 'rejected', 'cancelled'] as const)('retires automatic compaction activity after a %s summary', async outcome => {
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    const controller = new AbortController();
    const input = options({ sessionId: `compaction-activity-${outcome}`, history: overBudgetHistory, signal: controller.signal });
    const run = runTurn({ ...input, compaction: { ...input.compaction!, summarize: async () => {
      entered(); await hold;
      if (outcome === 'rejected') throw new Error('The summary was unavailable.');
      return undefined;
    } } });
    const running = drain(run.events);
    try { await started; expect(run.isCompacting?.()).toBe(true); }
    finally { if (outcome === 'cancelled') controller.abort(); release(); await running; }
    expect(run.isCompacting?.()).toBe(false);
  });

  it('does not report compaction during an ordinary budget check below threshold', async () => {
    let run!: ReturnType<typeof runTurn>;
    const phases: Array<boolean | undefined> = [];
    const input = options({ history: [{ role: 'user', content: 'short' }], step: async () => {
      phases.push(run.isCompacting?.()); return { text: 'done', toolCalls: [], stopReason: 'stop' };
    } });
    run = runTurn(input); await drain(run.events);
    expect(phases).toEqual([false]); expect(run.isCompacting?.()).toBe(false);
  });

  it('shows a thrown summary admission refusal through the actual turn adapter before sending', async () => {
    const notices: string[] = [];
    const summarize = Object.assign(vi.fn(async () => 'unexpected summary'), {
      preflight: () => { throw new SummaryAdmissionError('Summary request refused: local admission is unavailable.'); },
    });
    const compact = vi.fn();
    const step = vi.fn(async (_messages: readonly AgentMessage[]) => ({ text: 'done', toolCalls: [], stopReason: 'stop' as const }));
    const input = options({ sessionId: 'compaction-thrown-admission', history: overBudgetHistory, step });
    await drain(runTurn({ ...input, compaction: { ...input.compaction!, summarize, onCompact: compact,
      onDeclined: message => { notices.push(message); } } }).events);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatch(/^Compaction failed: Summary request refused:/);
    expect(summarize).not.toHaveBeenCalled();
    expect(compact).not.toHaveBeenCalled();
    expect(step).toHaveBeenCalledOnce();
    expect(JSON.stringify(step.mock.calls[0][0])).not.toContain('[Context Checkpoint]');
  });

  it('reports a missing summary once and retains the original request context', async () => {
    const notices: string[] = [];
    const summarize = vi.fn(async () => undefined);
    const compact = vi.fn();
    const seen: unknown[] = [];
    const input = options({ sessionId: 'compaction-missing-summary', history: overBudgetHistory, step: async messages => {
      seen.push(messages); return { text: 'done', toolCalls: [], stopReason: 'stop' };
    } });
    await drain(runTurn({ ...input, compaction: { ...input.compaction!, summarize, onCompact: compact,
      onDeclined: message => { notices.push(message); } } }).events);
    expect(notices).toEqual(['Compaction failed: The provider returned no summary.']);
    expect(summarize).toHaveBeenCalledOnce();
    expect(compact).not.toHaveBeenCalled();
    expect(JSON.stringify(seen)).toContain('question 0');
    expect(JSON.stringify(seen)).not.toContain('[Context Checkpoint]');
  });

  it('keeps arbitrary provider bodies and credentials out of the failure notice', async () => {
    const notices: string[] = [];
    const body = 'fixture response body';
    const credential = 'synthetic-provider-secret';
    const summarize = vi.fn(async () => { throw new Error(`HTTP 503: ${body}; Authorization: Bearer ${credential}; api_key=${credential}`); });
    const input = options({ sessionId: 'compaction-provider-error', history: overBudgetHistory });
    await drain(runTurn({ ...input, compaction: { ...input.compaction!, summarize,
      onDeclined: message => { notices.push(message); } } }).events);
    expect(notices).toEqual(['Compaction failed: The summary request failed; history was retained.']);
    expect(JSON.stringify(notices)).not.toContain(body);
    expect(JSON.stringify(notices)).not.toContain(credential);
    expect(summarize).toHaveBeenCalledOnce();
  });

  it('scrubs local refusal details before the user-visible callback', async () => {
    const notices: string[] = [];
    const credential = 'synthetic-local-secret';
    const summarize = vi.fn(async () => {
      throw new SummaryAdmissionError(`Summary request refused: api_key=${credential}; Bearer ${credential}; raw provider output=fixture-secret-body`);
    });
    const input = options({ sessionId: 'compaction-local-error-redaction', history: overBudgetHistory });
    await drain(runTurn({ ...input, compaction: { ...input.compaction!, summarize,
      onDeclined: message => { notices.push(message); } } }).events);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('Compaction failed: Summary request refused:');
    expect(notices[0]).not.toContain(credential);
    expect(notices[0]).not.toContain('fixture-secret-body');
  });

  it('keeps an ordinary context below the threshold silent', async () => {
    const notice = vi.fn();
    const summarize = vi.fn(async () => undefined);
    const input = options({ sessionId: 'compaction-below-threshold', history: [{ role: 'user', content: 'short' }] });
    await drain(runTurn({ ...input, compaction: { ...input.compaction!, summarize, onDeclined: notice } }).events);
    expect(notice).not.toHaveBeenCalled();
    expect(summarize).not.toHaveBeenCalled();
  });

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
    const notice = vi.fn();
    await drain(runTurn(options({ signal: controller.signal, step, observe,
      history: history.map(message => ({ ...message, content: `${message.content}${'z'.repeat(300)}` })),
      compaction: { policy: { contextWindow: 1_500, reserveTokens: 100, outputTokens: 100, keepRecentTokens: 100 },
        summarize: async () => { controller.abort(); return undefined; }, onCompact: vi.fn(), onDeclined: notice },
    })).events);
    expect(step).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
    expect(notice).not.toHaveBeenCalled();
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
