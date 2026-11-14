import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { AgentMessage } from '../../core/agent/state.js';
import type { SessionMessage } from '../schema/sessionMessage.js';
import type { TranscriptEvent } from '../sessionEventCodec.js';
import { createMessageTranscriptEvent } from '../sessionEventCodec.js';
import { applyCompaction, condenseContext, createCompactionStep, type CompactionPlan } from '../compaction.js';
import { projectBranchMessages, projectTranscriptMessages } from '../transcript/sessionTranscript.js';
import { SessionManager } from '../SessionManager.js';
import { SessionStoreAccess } from '../store/sessionStoreAccess.js';
import { switchDurableSessionActiveLeaf } from '../store/threadState.js';
import { sessionCompactionAuthority } from './authority.js';
import { estimateTokens } from '../context.js';

const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const stamp = '2026-11-15T01:00:00Z';
function marker(id: string, effort = 'low', schema = ''): SessionMessage {
  return { id, role: 'system', content: '', timestamp: stamp, requestDeclaration: { version: 1,
    target: { provider: 'fixture', model: 'm', endpoint: 'anthropic-messages', replayBinding: 'a'.repeat(64) },
    tools: [{ type: 'function', function: { name: 'read', parameters: { type: 'object', description: schema } } }], effort } };
}
const prose = (id: string, role: 'user' | 'assistant' = 'user', size = 0): SessionMessage => ({ id, role, content: `${id}${'x'.repeat(size)}`, timestamp: stamp });
const event = (message: SessionMessage): TranscriptEvent => createMessageTranscriptEvent({ ...message, timestamp: message.timestamp ?? stamp });
const plan = (cut: number, total: number): CompactionPlan => ({ cut, turnStart: -1, splitsTurn: false, keptMessages: total - cut, tokensBefore: 5000 });
function fixture() {
  const root = fs.mkdtempSync(path.resolve(process.cwd(), '../../.tmp/declaration-compaction-')); roots.push(root);
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
  const manager = new SessionManager(); const session = manager.createNew(root);
  return { root, manager, sessionId: session.id };
}

it('preserves discarded declarations before the checkpoint and retained declarations at their original tail positions', () => {
  const system: AgentMessage = { role: 'system', content: 'ordinary instructions' };
  const first = marker('first'); const second = marker('second', 'high'); const tail = marker('tail', 'medium');
  const history: AgentMessage[] = [system, prose('old'), first, prose('old-answer', 'assistant'), second,
    prose('kept'), tail, prose('answer', 'assistant')];
  const result = applyCompaction(history, plan(5, history.length), 'Saved work');
  expect(result).toEqual([system, first, second, expect.objectContaining({ content: '[Context Checkpoint]\nSaved work' }), ...history.slice(5)]);
  expect(result[1]).toBe(first); expect(result[2]).toBe(second); expect(result[5]).toBe(tail);
  expect(result.filter(message => message.requestDeclaration).map(message => message.id)).toEqual(['first', 'second', 'tail']);
  const withoutSystem = history.slice(2);
  expect(applyCompaction(withoutSystem, plan(2, withoutSystem.length), 'Again').filter(message => message.requestDeclaration).map(message => message.id))
    .toEqual(['first', 'second', 'tail']);
});

it('matches the declaration-preserving kept-tail transform across repeated compactions', () => {
  const messages = [prose('old'), marker('first'), prose('answer', 'assistant'), marker('second', 'high'), prose('kept'), marker('tail', 'medium')];
  const events: TranscriptEvent[] = messages.map(event);
  let expected: SessionMessage[] = messages;
  const keptCounts = [3, 1, 20, 0, 2, 1, 100, 2, 0];
  for (let index = 0; index < keptCounts.length; index++) {
    const kept = keptCounts[index]!;
    const cut = Math.max(0, expected.length - kept);
    expected = [...expected.slice(0, cut).filter(message => message.requestDeclaration),
      { role: 'user', content: `[Context Checkpoint]\ns${index}`, metadata: { contextSummary: 'compaction' }, timestamp: stamp },
      ...expected.slice(cut)];
    events.push({ type: 'compaction', id: `c${index}`, summary: `s${index}`, keptMessages: kept, timestamp: stamp });
    expect(projectTranscriptMessages(events)).toEqual(expected);
  }
  expect(expected.filter(message => message.requestDeclaration).map(message => message.id)).toEqual(['first', 'second', 'tail']);
});

it('retains only active branch declarations through a checkpoint', () => {
  const events: TranscriptEvent[] = [prose('root'), marker('common'), prose('left'), marker('abandoned', 'high'), prose('right'), marker('active', 'medium')].map(event);
  events.push({ type: 'compaction', id: 'checkpoint', sourceActivePath: ['root', 'common', 'right', 'active'], summary: 'active path', keptMessages: 1, timestamp: stamp });
  expect(projectBranchMessages(events, ['root', 'common', 'right', 'active'], ['root', 'common', 'left', 'abandoned', 'right', 'active'])
    .map(message => message.id ?? message.content)).toEqual(['common', '[Context Checkpoint]\nactive path', 'active']);
  expect(projectBranchMessages(events, ['root', 'common', 'left', 'abandoned'], ['root', 'common', 'left', 'abandoned', 'right', 'active'])
    .map(message => message.id)).toEqual(['root', 'common', 'left', 'abandoned']);
});

it('admits a leading persisted declaration and keeps repeated live publication equal to reopened history', async () => {
  const { manager, root, sessionId } = fixture();
  manager.addTurn(sessionId, marker('initial'));
  for (let index = 0; index < 5; index++) {
    manager.addTurn(sessionId, prose(`q${index}`, 'user', 400)); manager.addTurn(sessionId, prose(`a${index}`, 'assistant', 400));
    if (index === 2) manager.addTurn(sessionId, marker('expanded', 'high'));
  }
  const authority = sessionCompactionAuthority({ sessionId, workspaceRoot: root, admission: () => undefined, isCurrent: () => true,
    capture: () => manager.captureCompactionSource(sessionId), commit: manager.appendCompactionIfCurrent.bind(manager) });
  const history = manager.getSession(sessionId)!.turns;
  expect(() => authority.capture(history)).not.toThrow();
  expect(() => authority.capture([{ ...history[0]!, id: 'rewritten-boundary' }, ...history.slice(1)])).toThrow('no longer matches');
  const summaries: Array<{ messages: readonly AgentMessage[]; previousSummary?: string }> = [];
  const summarize = async (input: { messages: readonly AgentMessage[]; previousSummary?: string }) => { summaries.push(input); return `summary${summaries.length}`; };
  const step = createCompactionStep({ contextWindow: 900, reserveTokens: 0, keepRecentTokens: 100 }, { authority, summarize });
  const first = await step({ messages: history, toolResults: [] }); expect(first?.messages).toBeDefined();
  const comparable = (messages: readonly AgentMessage[]) => messages.map(({ timestamp: _timestamp, ...message }) => message);
  expect(comparable(first!.messages!)).toEqual(comparable(new SessionManager().getSession(sessionId)!.turns));
  expect(first!.messages!.filter(message => message.requestDeclaration).map(message => message.id)).toEqual(['initial', 'expanded']);
  for (let index = 0; index < 4; index++) { manager.addTurn(sessionId, prose(`later${index}`, 'user', 400)); manager.addTurn(sessionId, prose(`result${index}`, 'assistant', 400)); }
  const second = await step({ messages: manager.getSession(sessionId)!.turns, toolResults: [] }); expect(second?.messages).toBeDefined();
  expect(comparable(second!.messages!)).toEqual(comparable(new SessionManager().getSession(sessionId)!.turns));
  expect(summaries[1]?.previousSummary).toBe('summary1');
  expect(summaries.every(input => input.messages.every(message => !message.requestDeclaration))).toBe(true);
});

it('includes the retained declaration spine in candidate admission and shrink comparison', async () => {
  const source: AgentMessage[] = [prose('first', 'user', 1000), marker('large', 'low', 'x'.repeat(18_000)),
    prose('answer', 'assistant', 1000), prose('second', 'user', 1000), prose('done', 'assistant', 1000), prose('last', 'user')];
  const seen: AgentMessage[][] = [];
  const prepare = vi.fn(async (messages: readonly AgentMessage[]) => { seen.push([...messages]); return {
    contextWindow: 20_000, reserveTokens: 0, keepRecentTokens: 10, estimateContextTokens: () => estimateTokens(messages),
  }; });
  const result = await condenseContext({ messages: source, policy: { contextWindow: 20_000, reserveTokens: 0, keepRecentTokens: 10, prepare },
    force: true, summarize: async () => 'Small summary' });
  expect(result.status).toBe('condensed');
  expect(seen).toHaveLength(2); expect(seen[1]!.filter(message => message.requestDeclaration).map(message => message.id)).toEqual(['large']);
  if (result.status === 'condensed') {
    expect(result.tokensAfter).toBeGreaterThan(4000); expect(result.tokensAfter).toBeLessThan(result.plan.tokensBefore);
    expect(result.summarized).toBe(3);
  }
});

it('keeps stored ordinary system history outside the transient system exception', () => {
  const { manager, root, sessionId } = fixture();
  for (const message of [{ id: 'stored-system', role: 'system' as const, content: 'authored instructions' },
    marker('initial'), prose('old'), prose('answer', 'assistant'), prose('kept')]) manager.addTurn(sessionId, message);
  const authority = sessionCompactionAuthority({ sessionId, workspaceRoot: root, admission: () => undefined, isCurrent: () => true,
    capture: () => manager.captureCompactionSource(sessionId), commit: manager.appendCompactionIfCurrent.bind(manager) });
  const history = manager.getSession(sessionId)!.turns;
  expect(() => authority.capture(history)).toThrow('no longer matches');
  expect(() => authority.capture([{ role: 'system', content: 'transient instructions' }, ...history])).toThrow('no longer matches');
  expect(manager.getTranscriptEvents(sessionId).some(event => event.type === 'compaction-commit')).toBe(false);
});

it.each([false, true])('uses the previous checkpoint once when the kept tail splits its resumed turn (%s)', async separatePrefix => {
  const checkpoint: AgentMessage = { role: 'user', content: '[Context Checkpoint]\nprior work' };
  const messages: AgentMessage[] = [marker('initial'), marker('expanded'), checkpoint,
    prose('old-result', 'assistant', 500), prose('kept-result', 'assistant', 500), prose('next'), prose('done', 'assistant')];
  const seen: AgentMessage[] = [];
  const summarize = vi.fn(async (request: { messages: readonly AgentMessage[]; previousSummary?: string }) => {
    seen.push(...request.messages); expect(request.previousSummary).toBe('prior work'); return 'revised work';
  });
  const result = await condenseContext({ messages, force: true, policy: { contextWindow: 5000, reserveTokens: 0, keepRecentTokens: 100 }, summarize,
    ...(separatePrefix ? { summarizeTurnPrefix: async (prefix: readonly AgentMessage[]) => { seen.push(...prefix); return 'resumed turn'; } } : {}) });
  expect(result.status).toBe('condensed');
  if (result.status === 'condensed') { expect(result.plan).toMatchObject({ cut: 4, turnStart: 2, splitsTurn: true }); expect(result.summarized).toBe(2); }
  expect(seen.map(message => message.id)).toEqual(['old-result']);
});

it('isolates declaration spines when switching, reopening and forking compacted branches', () => {
  const { manager, sessionId } = fixture();
  for (const message of [prose('root'), marker('common'), prose('left'), marker('left-declaration', 'high'), prose('left-end')]) manager.addTurn(sessionId, message);
  const left = manager.captureCompactionSource(sessionId);
  expect(manager.appendCompactionIfCurrent({ source: left, summary: 'left summary', keptMessages: 1, tokensBefore: 5000 })).toEqual({ status: 'committed' });
  const switchLeaf = (leafEntryId: string) => {
    const store = new SessionStoreAccess(); const session = store.load(sessionId);
    switchDurableSessionActiveLeaf({ session, layout: store.stateLayout(sessionId), leafEntryId });
  };
  switchLeaf('common'); manager.addTurn(sessionId, prose('right')); manager.addTurn(sessionId, marker('right-declaration', 'medium')); manager.addTurn(sessionId, prose('right-end'));
  const right = manager.captureCompactionSource(sessionId);
  expect(manager.appendCompactionIfCurrent({ source: right, summary: 'right summary', keptMessages: 1, tokensBefore: 5000 })).toEqual({ status: 'committed' });
  const reopened = new SessionManager();
  expect(reopened.getSession(sessionId)!.turns.filter(message => message.requestDeclaration).map(message => message.id)).toEqual(['common', 'right-declaration']);
  const fork = reopened.fork(sessionId, undefined, { activate: false });
  expect(new SessionManager().getSession(fork.id)!.turns.filter(message => message.requestDeclaration).map(message => message.id)).toEqual(['common', 'right-declaration']);
  switchLeaf('left-end');
  expect(new SessionManager().getSession(sessionId)!.turns.filter(message => message.requestDeclaration).map(message => message.id)).toEqual(['common', 'left-declaration']);
});
