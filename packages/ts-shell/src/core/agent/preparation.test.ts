import { expect, it, vi } from 'vitest';
import { AgentCore } from './agent.js';
import { runAgentLoop, type AssistantStep } from './loop.js';
import type { AgentMessage } from './state.js';

const prompt: AgentMessage = { role: 'user', content: 'Original request' };
const answer = (text: string): AssistantStep => ({ text, toolCalls: [], stopReason: 'stop' });

it.each(['initial', 'continuation'] as const)('does not publish a cancelled %s preparation result', async boundary => {
  let calls = 0;
  const core = new AgentCore({
    streamStep: vi.fn(async () => answer(`Answer ${++calls}`)),
    finishTurn: () => ({ action: calls === 1 ? 'continue' : 'end' }),
    prepareNextStep: async snapshot => {
      if (Boolean(snapshot.message) !== (boundary === 'continuation')) return undefined;
      core.abort();
      await Promise.resolve();
      return { messages: [{ role: 'user', content: 'Cancelled replacement' }] };
    },
  });

  await core.prompt(prompt);
  await core.waitForIdle();
  expect(core.state.messages[0]?.content).toBe(prompt.content);
  expect(core.state.messages.some(message => message.content === 'Cancelled replacement')).toBe(false);
  expect(core.state.messages.at(-1)?.stopReason).toBe('aborted');
  expect(calls).toBe(boundary === 'initial' ? 0 : 1);
});

it.each(['initial', 'continuation'] as const)('does not overwrite successor history after %s preparation awaited', async boundary => {
  let entered!: () => void;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const core = new AgentCore({
    streamStep: async () => answer(`Answer ${++calls}`),
    finishTurn: () => ({ action: calls === 1 ? 'continue' : 'end' }),
    prepareNextStep: async snapshot => {
      if (Boolean(snapshot.message) !== (boundary === 'continuation')) return undefined;
      entered();
      await gate;
      return { messages: [{ role: 'user', content: 'Stale replacement' }] };
    },
  });

  const running = core.prompt(prompt);
  await waiting;
  core.state.messages = [{ role: 'user', content: 'Successor history' }];
  release();
  await running;
  expect(core.state.messages[0]?.content).toBe('Successor history');
  expect(core.state.messages.some(message => message.content === 'Stale replacement')).toBe(false);
  expect(core.state.messages.at(-1)?.stopReason).toBe('error');
  expect(calls).toBe(boundary === 'initial' ? 0 : 1);
});

it('ends the completed turn when its finish hook cancels a requested continuation', async () => {
  const controller = new AbortController();
  const prepare = vi.fn();
  const stream = vi.fn(async () => answer('Completed answer'));
  const turns: Array<{ willContinue?: boolean }> = [];
  const events: string[] = [];
  const produced = await runAgentLoop([prompt], [], {
    streamStep: stream,
    prepareNextStep: prepare,
    finishTurn: () => { controller.abort(); return { action: 'continue' }; },
  }, event => {
    events.push(event.type);
    if (event.type === 'turn_end') turns.push({ willContinue: event.willContinue });
  }, controller.signal);

  expect(produced.map(message => message.content)).toEqual([prompt.content, 'Completed answer']);
  expect(turns).toEqual([{ willContinue: false }]);
  expect(stream).toHaveBeenCalledTimes(1);
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(events.filter(type => type === 'agent_end')).toHaveLength(1);
});

it('does not enter another asynchronous stop hook after finishTurn cancels the run', async () => {
  const controller = new AbortController();
  const shouldStop = vi.fn(async () => false);
  await runAgentLoop([prompt], [], { streamStep: async () => answer('Completed answer'),
    finishTurn: () => { controller.abort(); return { action: 'continue' }; },
    shouldStopAfterStep: shouldStop }, () => {}, controller.signal);
  expect(shouldStop).not.toHaveBeenCalled();
});

it('preserves queued follow-ups when a turn_end listener cancels the continuation', async () => {
  let calls = 0;
  const core = new AgentCore({
    streamStep: async () => {
      if (++calls === 1) core.followUp({ role: 'user', content: 'Queued request' });
      return answer(`Answer ${calls}`);
    },
    finishTurn: () => ({ action: calls === 1 ? 'continue' : 'end' }),
  });
  core.subscribe(event => { if (event.type === 'turn_end' && calls === 1) core.abort(); });
  await core.prompt(prompt);
  expect(core.hasQueuedMessages()).toBe(true);
  expect(core.state.messages.map(message => message.content)).toEqual([prompt.content, 'Answer 1']);
  await core.continue();
  expect(core.state.messages.map(message => message.content)).toEqual([prompt.content, 'Answer 1', 'Queued request', 'Answer 2']);
});

it('rechecks preparation ownership after reading a returned replacement', async () => {
  const core = new AgentCore({ streamStep: async () => answer('Must not send'),
    prepareNextStep: () => ({ get messages() { core.abort(); return [{ role: 'user', content: 'Cancelled carrier' }]; } }),
  });
  await core.prompt(prompt);
  expect(core.state.messages[0]?.content).toBe(prompt.content);
  expect(core.state.messages.some(message => message.content === 'Cancelled carrier')).toBe(false);
});

it('keeps initial steering queued if preparation cancels before accepting it', async () => {
  const core = new AgentCore({ streamStep: async () => answer('Must not send'),
    prepareNextStep: async () => { core.abort(); await Promise.resolve(); return undefined; },
  });
  core.steer({ role: 'user', content: 'Queued steering' });
  await core.prompt(prompt);
  expect(core.pendingQueues.steering.entries().map(entry => entry.value.content)).toEqual(['Queued steering']);
  expect(core.state.messages.some(message => message.content === 'Queued steering')).toBe(false);
});

it('prepares a follow-up before taking ownership of its queue entry', async () => {
  let calls = 0;
  const core = new AgentCore({ streamStep: async () => {
    calls++;
    core.followUp({ role: 'user', content: 'Queued follow-up' });
    return answer('First answer');
  }, prepareNextStep: async snapshot => {
    if (snapshot.message) { core.abort(); await Promise.resolve(); }
    return undefined;
  } });
  await core.prompt(prompt);
  expect(calls).toBe(1);
  expect(core.pendingQueues.followUps.entries().map(entry => entry.value.content)).toEqual(['Queued follow-up']);
  expect(core.state.messages.some(message => message.content === 'Queued follow-up')).toBe(false);
});

it('does not manufacture a request when its queued follow-up is removed during preparation', async () => {
  let calls = 0;
  const core = new AgentCore({ streamStep: async () => {
    calls++;
    core.followUp({ role: 'user', content: 'Withdrawn request' });
    return answer('First answer');
  }, prepareNextStep: async snapshot => {
    if (snapshot.message) { core.clearAllQueues(); await Promise.resolve(); }
    return undefined;
  } });
  await core.prompt(prompt);
  expect(calls).toBe(1);
  expect(core.hasQueuedMessages()).toBe(false);
  expect(core.state.messages.map(message => message.content)).toEqual([prompt.content, 'First answer']);
});

it('takes one late steering message before an untouched follow-up after long preparation', async () => {
  let calls = 0;
  const seen: unknown[] = [];
  const core = new AgentCore({ streamStep: async messages => {
    seen.push(messages.at(-1)?.content);
    if (++calls === 1) core.followUp({ role: 'user', content: 'Follow-up' });
    return answer(`Answer ${calls}`);
  }, prepareNextStep: async snapshot => {
    if (snapshot.message && calls === 1) {
      await Promise.resolve();
      core.steer({ role: 'user', content: 'Steering one' });
      core.steer({ role: 'user', content: 'Steering two' });
    }
    return undefined;
  } });
  await core.prompt(prompt);
  expect(seen).toEqual([prompt.content, 'Steering one', 'Steering two', 'Follow-up']);
  expect(core.hasQueuedMessages()).toBe(false);
});

it('does not deliver an old queue entry into history replaced by a turn_start observer', async () => {
  let calls = 0;
  let starts = 0;
  const core = new AgentCore({ streamStep: async () => {
    if (++calls === 1) core.followUp({ role: 'user', content: 'Queued request' });
    return answer(`Answer ${calls}`);
  } });
  core.subscribe(event => {
    if (event.type === 'turn_start' && ++starts === 2) core.state.messages = [{ role: 'user', content: 'Successor history' }];
  });
  await core.prompt(prompt);
  expect(core.pendingQueues.followUps.entries().map(entry => entry.value.content)).toEqual(['Queued request']);
  expect(core.state.messages[0]?.content).toBe('Successor history');
  expect(core.state.messages.some(message => message.content === 'Queued request')).toBe(false);
  expect(calls).toBe(1);
});

it('keeps request preparation on the captured history when live state is replaced while awaiting', async () => {
  const stream = vi.fn(async () => answer('Must not send'));
  const core = new AgentCore({
    streamStep: stream,
    prepareRequest: async () => {
      core.state.messages = [{ role: 'user', content: 'Successor history' }];
      await Promise.resolve();
      return undefined;
    },
  });

  await core.prompt(prompt);
  expect(stream).not.toHaveBeenCalled();
  expect(core.state.messages[0]?.content).toBe('Successor history');
  expect(core.state.messages.at(-1)?.stopReason).toBe('error');
});

it('prepares each retry after turn preparation and settles only the accepted tool batch', async () => {
  const order: string[] = [];
  let requests = 0;
  const core = new AgentCore({
    retry: { enabled: true, maxRetries: 1, baseDelayMs: 0 },
    prepareNextStep: snapshot => { order.push(snapshot.message ? 'prepare:next' : 'prepare:initial'); return undefined; },
    prepareRequest: input => { order.push(`request:${input.reason}:${input.attempt}`); return undefined; },
    streamStep: async () => {
      order.push(`stream:${++requests}`);
      if (requests === 1) return { ...answer(''), stopReason: 'error', retryable: true };
      if (requests === 2) return { ...answer('Tool preamble'), toolCalls: [{ id: 'read-1', name: 'read', args: {} }] };
      return answer('Final answer');
    },
    tools: [{ name: 'read', execute: async () => { order.push('tool'); return { output: 'File content', isError: false }; } }],
    finishTurn: snapshot => {
      order.push(`finish:${snapshot.toolResults.length}`);
      if (snapshot.toolResults.length) expect(snapshot.messages.at(-1)).toMatchObject({ role: 'tool', content: 'File content' });
      return undefined;
    },
  });
  core.subscribe(event => { if (event.type === 'turn_end') order.push('turn:end'); });
  await core.prompt(prompt);

  expect(order).toEqual(['prepare:initial', 'request:user:0', 'stream:1', 'request:retry:1', 'stream:2',
    'tool', 'finish:1', 'turn:end', 'prepare:next', 'request:continuation:0', 'stream:3', 'finish:0', 'turn:end']);
  expect(core.state.messages.map(message => message.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
});

it.each(['error', 'aborted'] as const)('keeps a %s response as a hard exit even when finishTurn requests continuation', async stopReason => {
  const stream = vi.fn(async () => ({ ...answer('Failed attempt'), stopReason, retriesExhausted: true }));
  const finish = vi.fn(() => ({ action: 'continue' as const }));
  const steering = vi.fn(async () => []);
  const followUp = vi.fn(async () => []);
  await runAgentLoop([prompt], [], { streamStep: stream, finishTurn: finish,
    getSteeringMessages: steering, getFollowUpMessages: followUp }, () => {}, undefined);
  expect(stream).toHaveBeenCalledTimes(1);
  expect(finish).toHaveBeenCalledTimes(1);
  expect(steering).toHaveBeenCalledTimes(1);
  expect(followUp).not.toHaveBeenCalled();
});
