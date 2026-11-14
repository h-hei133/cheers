import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../session/SessionManager.js';
import { createCompactionStep } from '../../session/compaction.js';
import { sessionCompactionAuthority } from '../../session/compaction/authority.js';
import type { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { runTurn } from '../session.js';
import { createStepFunction } from '../step.js';
import type { AgentMessage } from '../../core/agent/state.js';
import { resetSessionUsage } from '../../observability/usageTelemetry.js';

const hooks = { dispatch: async () => ({ decision: 'allow', stopChecks: [] }) } as unknown as HookDispatcher;
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.resolve(process.cwd(), '../../.tmp/context-publication-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); resetSessionUsage('owned-context'); });

it.each(['source', 'config'] as const)('refuses publication when %s changes during candidate conversion', async kind => {
  const store = new SessionManager();
  const sessionId = 'owned-context'; store.createNewWithId(sessionId, root);
  for (let index = 0; index < 4; index++) {
    store.addTurn(sessionId, { role: 'user', content: `Work ${index}: ${'x'.repeat(300)}` });
    store.addTurn(sessionId, { role: 'assistant', content: `Result ${index}: ${'y'.repeat(300)}` });
  }
  const history = [...store.getSession(sessionId)!.turns]; store.persistUserPromptBarrier(sessionId, 'Continue.');
  const commit = vi.fn(store.appendCompactionIfCurrent.bind(store)); const send = vi.fn(async () => new Response('{}'));
  let current = true;
  const authority = sessionCompactionAuthority({ sessionId, workspaceRoot: root, admission: () => undefined,
    isCurrent: () => current, capture: () => store.captureCompactionSource(sessionId), commit });
  const convertToLlm = (messages: readonly AgentMessage[]) => {
    const candidate = messages.some(message => String(message.content).includes('[Context Checkpoint]'));
    if (candidate) {
      if (kind === 'source') store.addTurn(sessionId, { role: 'user', content: 'Successor retained.' });
      else current = false;
    }
    return [{ role: 'user' as const, content: candidate ? 'short' : 'a'.repeat(8000) }];
  };
  const step = createStepFunction({ provider: { headers: {}, provider: 'fixture', model: 'model', baseUrl: 'https://fixture.test/v1' },
    sessionId, workspaceRoot: root, systemPrompt: '', tools: [], contextWindow: 1800, maxOutputTokens: 10, reserveTokens: 0, fetchImpl: send });
  for await (const _event of runTurn({ sessionId, workspaceRoot: root, prompt: 'Continue.', history, onMessage: () => {},
    tools: new Map(), hooks, step, signal: new AbortController().signal, maxSteps: 3, retry: { enabled: false }, convertToLlm,
    compaction: { policy: { contextWindow: 1800, reserveTokens: 0, outputTokens: 10, keepRecentTokens: 10 },
      authority, summarize: async () => 'Summary.', onCompact: () => {} },
  }).events) { /* Actual loop through durable commit owner. */ }
  expect(send).not.toHaveBeenCalled();
  expect(store.getTranscriptEvents(sessionId).some(event => event.type === 'compaction-commit')).toBe(false);
  if (kind === 'source') expect(store.getSession(sessionId)!.turns.at(-1)?.content).toBe('Successor retained.');
});

it('compacts after a live tool step while persistence retains the declared durable fields', async () => {
  const sessionId = 'owned-context'; const store = new SessionManager();
  store.createNewWithId(sessionId, root);
  for (let index = 0; index < 4; index++) {
    store.addTurn(sessionId, { role: 'user', content: `Work ${index}: ${'x'.repeat(100)}` });
    store.addTurn(sessionId, { role: 'assistant', content: `Result ${index}: ${'y'.repeat(100)}` });
  }
  const history = [...store.getSession(sessionId)!.turns]; store.persistUserPromptBarrier(sessionId, 'Continue.');
  const authority = sessionCompactionAuthority({ sessionId, workspaceRoot: root, admission: () => undefined, isCurrent: () => true,
    capture: () => store.captureCompactionSource(sessionId), commit: store.appendCompactionIfCurrent.bind(store) });
  const bodies: string[] = []; const summarize = vi.fn(async () => 'Stored work summary.');
  const step = createStepFunction({ provider: { headers: {}, provider: 'fixture', model: 'model', baseUrl: 'https://fixture.test/v1' },
    sessionId, workspaceRoot: root, systemPrompt: '', tools: [{ type: 'function', function: { name: 'read', parameters: { type: 'object' } } }],
    contextWindow: 1800, maxOutputTokens: 10, reserveTokens: 0, fetchImpl: async (_url, init) => {
      bodies.push(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: bodies.length === 1 ? { content: '', tool_calls: [{ id: 'read-1', type: 'function',
        function: { name: 'read', arguments: '{}' } }] } : { content: 'done' }, finish_reason: 'stop' }] }),
        { headers: { 'content-type': 'application/json' } });
    } });
  const convertToLlm = (messages: readonly AgentMessage[]) => [{ role: 'user' as const, content:
    messages.some(message => String(message.content).includes('[Context Checkpoint]')) ? 'Captured candidate.'
      : messages.some(message => message.role === 'tool') ? 'a'.repeat(8000) : 'Small initial history.' }];
  for await (const _event of runTurn({ sessionId, workspaceRoot: root, prompt: 'Continue.', history,
    onMessage: message => store.addTurn(sessionId, message), hooks, step, convertToLlm, maxSteps: 3,
    permissionScope: 'allow-all', signal: new AbortController().signal,
    tools: new Map([['read', { name: 'read', description: 'read', parameters: { type: 'object' }, execute: async () => ({ success: true, output: 'Known result.' }) }]]),
    compaction: { policy: { contextWindow: 1800, outputTokens: 10, reserveTokens: 0, keepRecentTokens: 10 }, authority, summarize, onCompact: () => {} },
  }).events) { /* Persist the actual completed live step before candidate capture. */ }
  expect(summarize).toHaveBeenCalledOnce(); expect(bodies).toHaveLength(2);
  expect(bodies[1]).toContain('Captured candidate.');
  expect(store.getTranscriptEvents(sessionId).some(event => event.type === 'compaction-commit')).toBe(true);
});

it('compacts the returned live checkpoint again against its actual persisted history', async () => {
  const sessionId = 'owned-context';
  const store = new SessionManager();
  store.createNewWithId(sessionId, root);
  for (let index = 0; index < 4; index++) {
    store.addTurn(sessionId, { role: 'user', content: `Work ${index}: ${'x'.repeat(400)}` });
    store.addTurn(sessionId, { role: 'assistant', content: `Result ${index}: ${'y'.repeat(400)}` });
  }
  const authority = sessionCompactionAuthority({
    sessionId, workspaceRoot: root, admission: () => undefined, isCurrent: () => true,
    capture: () => store.captureCompactionSource(sessionId), commit: store.appendCompactionIfCurrent.bind(store),
  });
  const summarize = vi.fn(async () => 'Stored work summary.');
  const onError = vi.fn();
  const step = createCompactionStep({ contextWindow: 900, reserveTokens: 0, keepRecentTokens: 100 },
    { summarize, authority, onError });
  const history = [...store.getSession(sessionId)!.turns];
  const first = await step({ message: history.at(-1)!, toolResults: [], messages: history });
  expect(first?.messages).toBeDefined();
  const live = [...first!.messages!];
  expect(live[0]?.metadata).toEqual({ contextSummary: 'compaction' });
  expect(live[0]?.metadata).toEqual(store.getSession(sessionId)!.turns[0]?.metadata);
  expect(() => authority.capture(live)).not.toThrow();
  expect(() => authority.capture([
    { ...live[0]!, metadata: { ...live[0]!.metadata, application: 'changed' } }, ...live.slice(1),
  ])).toThrow('Compaction context no longer matches its stored history.');

  for (let index = 4; index < 8; index++) {
    const turns: AgentMessage[] = [
      { role: 'user', content: `Work ${index}: ${'x'.repeat(400)}` },
      { role: 'assistant', content: `Result ${index}: ${'y'.repeat(400)}` },
    ];
    for (const turn of turns) {
      store.addTurn(sessionId, turn);
      live.push(turn);
    }
  }
  const second = await step({ message: live.at(-1)!, toolResults: [], messages: live });
  expect(second?.messages).toBeDefined();
  expect(() => authority.capture(second!.messages!)).not.toThrow();
  expect(summarize).toHaveBeenCalledTimes(2);
  expect(onError).not.toHaveBeenCalled();
  expect(store.getTranscriptEvents(sessionId).filter(event => event.type === 'compaction-commit')).toHaveLength(2);
});
