import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import { buildCompactionLifecycle, compactSessionHistory } from '../../core/shell/compaction.js';
import { condenseContext, createCompactionStep, planCompactionCut } from '../compaction.js';
import { registerCatalogContribution } from '../../core/catalog/contributions.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { runEventHandlers } from '../../extensions/events/dispatch.js';
import type { ExtensionSessionBeforeEventPayload, ExtensionSessionEventPayload } from '../../extensions/events/model.js';
import { sessionCompactionAuthority } from './authority.js';
import { readSessionThreadSnapshot, switchDurableSessionActiveLeaf } from '../store/threadState.js';
import { SessionStoreAccess } from '../store/sessionStoreAccess.js';
import { encodeTranscriptEvent, classifyTranscriptLine } from '../sessionEventCodec.js';
import { CompactionPublicationError, type PreparedSummaryStep } from './contract.js';
import { compactionOperationsPath } from './state.js';
import { runTurn } from '../../turn/session.js';
import type { AgentMessage } from '../../core/agent/state.js';

const lockProbe = vi.hoisted(() => ({ beforeRegistryLock: undefined as (() => void) | undefined }));
vi.mock('../store/sessionFileStore.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../store/sessionFileStore.js')>();
  return { ...actual, withFileLock: (...args: Parameters<typeof actual.withFileLock>) => {
    if (args[0].endsWith('current-session.json.lock') && lockProbe.beforeRegistryLock) {
      const before = lockProbe.beforeRegistryLock;
      lockProbe.beforeRegistryLock = undefined;
      before();
    }
    return actual.withFileLock(...args);
  } };
});

let home: string;
let manager: SessionManager;
let sessionId: string;
const policy = { contextWindow: 900, reserveTokens: 0, keepRecentTokens: 100 };
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'compact-commit-'));
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  manager = new SessionManager(); sessionId = manager.createNew(home).id;
  for (let index = 0; index < 12; index++) manager.addTurn(sessionId, { role: index % 2 ? 'assistant' : 'user', content: `${index}:` + 'x'.repeat(500) });
});
afterEach(() => { lockProbe.beforeRegistryLock = undefined; vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { force: true, recursive: true }); });
const compactions = () => manager.getTranscriptEvents(sessionId).filter(event => event.type === 'compaction');

function registerCompactionHandlers(handlers: Record<string, readonly ((payload: unknown) => unknown)[]>): () => void {
  const registered = new Map(Object.entries(handlers));
  return registerCatalogContribution({ root: home, sessionId, commands: [], tools: [], skills: () => [],
    onEvent: (event, payload, aliases, signal) => runEventHandlers({ handlers: registered, event, payload, aliases, signal }) });
}

it.each(['manual', 'threshold', 'overflow'] as const)('publishes a custom %s summary through the original planned and verified commit', async reason => {
  const summary = 'Extension checkpoint';
  const summarize = vi.fn(async () => 'unexpected default');
  const legacy = vi.fn(() => ({ decision: 'allow' as const }));
  const hooks = new HookDispatcher({ inProcessHooks: [{ event: 'PreCompact', handler: legacy }] });
  const before = vi.fn((event: unknown) => {
    const plan = event as ExtensionSessionBeforeEventPayload<'session_before_compact'>;
    expect(plan).toMatchObject({ type: 'session_before_compact', reason, sessionId, workspaceRoot: home, messageCount: 12 });
    expect(plan.messages).not.toHaveLength(0);
    expect(Object.isFrozen(plan.messages[0])).toBe(true);
    expect(Object.keys(plan.messages[0]!)).toEqual(['role', 'text']);
    return { summary, keptMessages: 0, tokensBefore: 1 };
  });
  const after = vi.fn((event: unknown) => {
    const notice = event as ExtensionSessionEventPayload<'session_compact'>;
    expect(notice).toMatchObject({ type: 'session_compact', reason, summary, fromExtension: true });
    expect(compactions()).toHaveLength(1);
    expect(manager.getTranscriptEvents(sessionId).some(entry => entry.type === 'compaction-commit')).toBe(true);
    expect(new SessionManager().getSession(sessionId)!.turns[0]!.content).toContain(summary);
  });
  const retire = registerCompactionHandlers({ session_before_compact: [before, () => ({ cancel: false })], session_compact: [after] });
  try {
    const history = manager.getSession(sessionId)!.turns;
    const planned = planCompactionCut(history, policy)!;
    const authority = sessionCompactionAuthority({ sessionId, workspaceRoot: home, admission: () => undefined,
      isCurrent: () => true, capture: () => manager.captureCompactionSource(sessionId), commit: input => manager.appendCompactionIfCurrent(input) });
    if (reason === 'manual') {
      expect(await compactSessionHistory({ store: manager, sessionId, policy, summarize, workspaceRoot: home, hooks })).toMatchObject({ status: 'compacted' });
    } else {
      const lifecycle = buildCompactionLifecycle({ hooks, sessionId, workspaceRoot: home, reason });
      const step = createCompactionStep(policy, { sessionId, summarize, authority, lifecycle, reason, force: reason === 'overflow' });
      expect(await step({ messages: history, toolResults: [] })).toMatchObject({ messages: expect.any(Array) });
    }
    expect(summarize).not.toHaveBeenCalled();
    expect(legacy).toHaveBeenCalledOnce();
    expect(before).toHaveBeenCalledOnce();
    expect(after).toHaveBeenCalledOnce();
    expect(compactions()[0]).toMatchObject({ summary, tokensBefore: expect.any(Number), keptMessages: planned.keptMessages });
    expect(compactions()[0]).not.toMatchObject({ tokensBefore: 1 });
  } finally { retire(); }
});

it.each(['cancel', 'invalid', 'legacy', 'refuse-shrink', 'stale', 'retire', 'no-plan'] as const)('refuses compaction without default dispatch or publication (%s)', async mode => {
  let foreignGetterCalls = 0;
  const summarize = vi.fn(async () => 'unexpected default');
  const later = vi.fn(() => ({ cancel: false }));
  const after = vi.fn();
  const before = vi.fn(async () => {
    if (mode === 'invalid') return Object.defineProperty({}, 'summary', { enumerable: true, get: () => { foreignGetterCalls++; return 'invalid'; } });
    if (mode === 'stale') manager.addTurn(sessionId, { role: 'user', content: 'Competing saved message' });
    if (mode === 'retire') retire();
    return mode === 'cancel' ? { cancel: true } : { summary: mode === 'refuse-shrink' ? 'x'.repeat(20_000) : 'Extension checkpoint' };
  });
  const retire = registerCompactionHandlers({ session_before_compact: [() => ({ summary: 'Earlier checkpoint' }), before, later], session_compact: [after] });
  const hooks = new HookDispatcher({ inProcessHooks: [{ event: 'PreCompact', handler: () => ({ decision: mode === 'legacy' ? 'block' : 'allow' }) }] });
  try {
    const budget = mode === 'no-plan' ? { ...policy, contextWindow: 30_000, keepRecentTokens: 20_000 } : policy;
    const outcome = await compactSessionHistory({ store: manager, sessionId, policy: budget, hooks, summarize, workspaceRoot: home });
    expect(outcome.status).toBe(mode === 'refuse-shrink' || mode === 'no-plan' ? 'nothing' : 'failed');
    if (mode === 'legacy') expect(outcome).toMatchObject({ reason: 'Compaction was refused by a PreCompact hook.' });
    if (mode === 'cancel' || mode === 'invalid' || mode === 'retire') {
      expect(outcome).toMatchObject({ reason: 'Compaction was refused by a session extension.' });
    }
    expect(compactions()).toHaveLength(0);
    expect(summarize).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    expect(foreignGetterCalls).toBe(0);
    expect(before).toHaveBeenCalledTimes(mode === 'no-plan' || mode === 'legacy' ? 0 : 1);
    if (mode === 'cancel') expect(later).not.toHaveBeenCalled();
  } finally { retire(); }
});

it.each(['prepare retirement', 'prepare replacement', 'handoff retirement', 'handoff replacement'] as const)(
  'refuses stale native compaction before transmission after %s', async boundary => {
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const pending = new Promise<void>(resolve => { release = resolve; });
    const transmit = vi.fn();
    const send = vi.fn<PreparedSummaryStep['send']>(async dispatch => {
      if (boundary.startsWith('handoff')) { entered(); await pending; }
      dispatch!.dispatch();
      transmit();
      return 'Stale summary';
    });
    const summarize = Object.assign(vi.fn(async () => 'unexpected fallback'), {
      prepare: async (): Promise<PreparedSummaryStep> => {
        if (boundary.startsWith('prepare')) { entered(); await pending; }
        return { identity: 'captured-summary-request', tokens: 1, send };
      },
    });
    const after = vi.fn();
    const retire = registerCompactionHandlers({ session_before_compact: [() => undefined], session_compact: [after] });
    const run = compactSessionHistory({ store: manager, sessionId, policy, summarize, workspaceRoot: home });
    try {
      await started;
      if (boundary.endsWith('retirement')) retire();
      else manager.resume(sessionId);
      release();
      expect(await run).toMatchObject({ status: 'failed', reason: boundary.endsWith('retirement')
        ? 'Compaction was refused by a session extension.' : expect.stringContaining('The session source changed') });
      expect(send).toHaveBeenCalledTimes(boundary.startsWith('handoff') ? 1 : 0);
      expect(transmit).not.toHaveBeenCalled();
      expect(summarize).not.toHaveBeenCalled();
      expect(compactions()).toEqual([]);
      expect(after).not.toHaveBeenCalled();
      const ledger = compactionOperationsPath(sessionId);
      if (boundary.startsWith('prepare')) expect(fs.existsSync(ledger)).toBe(false);
      else {
        const captured = JSON.parse(fs.readFileSync(ledger, 'utf8')) as import('./contract.js').OperationFile;
        expect(Object.values(captured.operations).flatMap(operation => Object.values(operation.steps))).toEqual([]);
      }
    } finally { release(); retire(); await run; }
  },
);

it('notifies the original compaction audience when cancellation arrives after a verified write', async () => {
  const controller = new AbortController();
  const after = vi.fn(() => { expect(controller.signal.aborted).toBe(true); expect(compactions()).toHaveLength(1); });
  const retire = registerCompactionHandlers({ session_before_compact: [() => ({ summary: 'Accepted checkpoint' })], session_compact: [after] });
  const authority = sessionCompactionAuthority({ sessionId, workspaceRoot: home, admission: () => undefined,
    isCurrent: () => true, capture: () => manager.captureCompactionSource(sessionId), commit: input => {
      const committed = manager.appendCompactionIfCurrent(input);
      controller.abort();
      return committed;
    } });
  try {
    const summarize = vi.fn(async () => 'unexpected default');
    const outcome = await compactSessionHistory({ store: manager, sessionId, policy, authority, summarize, workspaceRoot: home, signal: controller.signal });
    expect(outcome).toMatchObject({ status: 'compacted' });
    expect(after).toHaveBeenCalledOnce();
    expect(summarize).not.toHaveBeenCalled();
  } finally { retire(); }
});

it('honours each caller veto or summary while an equivalent default generation is in flight', async () => {
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(done => { entered = done; });
  const hold = new Promise<void>(done => { release = done; });
  const summarize = vi.fn(async () => { entered(); await hold; return 'Default checkpoint'; });
  const source = manager.captureCompactionSource(sessionId);
  const input = { policy, summarize, messages: source.history, force: true, operation: { sessionId, source } };
  const primary = condenseContext(input);
  try {
    await started;
    expect(await condenseContext({ ...input, lifecycle: { before: () => false } })).toEqual({ status: 'declined', reason: 'blocked-by-hook' });
    expect(await condenseContext({ ...input, lifecycle: { decide: () => ({ summary: 'Different checkpoint' }) } }))
      .toMatchObject({ status: 'condensed', summary: 'Different checkpoint' });
    expect(summarize).toHaveBeenCalledOnce();
  } finally { release(); }
  expect(await primary).toMatchObject({ status: 'condensed', summary: 'Default checkpoint' });
});

it('keeps replay identity stable across unchanged configuration publications and instruction touches', async () => {
  const instructions = path.join(home, 'AGENTS.md');
  fs.writeFileSync(instructions, 'Same instruction bytes.');
  const capture = () => manager.captureCompactionSource(sessionId);
  const makeAuthority = () => sessionCompactionAuthority({ sessionId, workspaceRoot: home, admission: () => undefined,
    isCurrent: () => true, capture, commit: input => manager.appendCompactionIfCurrent(input) });
  const first = makeAuthority();
  const summarize = vi.fn(async () => undefined);
  await compactSessionHistory({ store: manager, sessionId, policy, authority: first, summarize });
  fs.utimesSync(instructions, new Date(), new Date(Date.now() + 60_000));
  expect(first.admission?.()).toContain('instructions changed');
  const restarted = makeAuthority();
  expect(restarted.identity).toBe(first.identity);
  expect(await compactSessionHistory({ store: manager, sessionId, policy, authority: restarted, summarize })).toMatchObject({ status: 'failed' });
  expect(summarize).toHaveBeenCalledOnce();
});

it('rechecks native resume made by final admission before appending', () => {
  const source = manager.captureCompactionSource(sessionId);
  let checks = 0;
  const result = manager.appendCompactionIfCurrent({ source, summary: 'stale', keptMessages: 1, tokensBefore: 2000,
    admission: () => { if (++checks === 2) manager.resume(sessionId); return undefined; } });
  expect(result.status).toBe('refused');
  expect(compactions()).toHaveLength(0);
});

it('allows a display rename made by final admission before appending', () => {
  const source = manager.captureCompactionSource(sessionId);
  let checks = 0;
  const result = manager.appendCompactionIfCurrent({ source, summary: 'summary', keptMessages: 1, tokensBefore: 2000,
    admission: () => { if (++checks === 2) manager.renameSession(sessionId, 'Concurrent rename'); return undefined; } });
  expect(result.status).toBe('committed');
  expect(compactions()).toHaveLength(1);
  expect(manager.getSession(sessionId)!.title).toBe('Concurrent rename');
});

it('rechecks cancellation caused by final admission before the append effect', () => {
  const source = manager.captureCompactionSource(sessionId);
  const controller = new AbortController(); let checks = 0;
  const result = manager.appendCompactionIfCurrent({ source, summary: 'cancelled', keptMessages: 1, tokensBefore: 2000,
    signal: controller.signal, admission: () => { if (++checks === 2) controller.abort(); return undefined; } });
  expect(result.status).toBe('refused');
  expect(compactions()).toHaveLength(0);
});

it('allows query observations appended while the summary is generated', async () => {
  const outcome = await compactSessionHistory({ store: manager, sessionId, policy,
    summarize: async () => {
      const store = new SessionStoreAccess();
      const statePath = store.statePath(sessionId);
      const state = store.readStateSnapshotRequired(statePath);
      store.writeJsonFileAtomic(statePath, { ...state, thread: undefined });
      manager.appendQueryEvent(sessionId, { type: 'tool.started', toolName: 'read', taskId: 'summary-race' });
      return 'summary';
    } });
  expect(outcome).toMatchObject({ status: 'compacted' });
  expect(compactions()).toHaveLength(1);
  expect(manager.getTranscriptEvents(sessionId)).toContainEqual(expect.objectContaining({
    type: 'query-event', event: { type: 'tool.started', toolName: 'read', taskId: 'summary-race' },
  }));
});

it.each(['turn-active', 'metadata', 'error', 'interrupted'] as const)(
  'allows %s lifecycle publication while the summary is generated', async kind => {
    const store = new SessionStoreAccess();
    const metadataPath = store.metadataPath(sessionId);
    const beforeMetadata = fs.lstatSync(metadataPath);
    const source = manager.captureCompactionSource(sessionId);
    const outcome = await compactSessionHistory({ store: manager, sessionId, policy,
      summarize: async () => {
        if (kind === 'turn-active') manager.markTurnActive(sessionId);
        if (kind === 'error') manager.saveError(sessionId, 'Synthetic lifecycle update');
        if (kind === 'interrupted') manager.saveInterrupted(sessionId);
        if (kind === 'metadata') store.writeJsonFileAtomic(metadataPath, {
          ...JSON.parse(fs.readFileSync(metadataPath, 'utf8')), title: 'Display metadata changed', updatedAt: '2026-11-02T12:00:00.000Z',
        });
        const afterMetadata = fs.lstatSync(metadataPath);
        expect(`${afterMetadata.dev}:${afterMetadata.ino}`).not.toBe(`${beforeMetadata.dev}:${beforeMetadata.ino}`);
        expect(manager.captureCompactionSource(sessionId).identity).toBe(source.identity);
        return 'summary';
      } });
    expect(outcome).toMatchObject({ status: 'compacted' });
    expect(compactions()).toHaveLength(1);
  });

it('allows another project activation while the summary is generated', async () => {
  const source = manager.captureCompactionSource(sessionId);
  const outcome = await compactSessionHistory({ store: manager, sessionId, policy,
    summarize: async () => {
      manager.createNew(path.join(home, 'other-project'));
      expect(manager.captureCompactionSource(sessionId).identity).toBe(source.identity);
      return 'summary';
    } });
  expect(outcome).toMatchObject({ status: 'compacted' });
  expect(compactions()).toHaveLength(1);
});

it.each(['set', 'clear'] as const)(
  'rereads the whole registry under its lock before an unrelated project %s', kind => {
    const store = new SessionStoreAccess();
    const otherProject = path.join(home, 'other-project');
    const otherSession = manager.createNew(otherProject);
    const source = manager.captureCompactionSource(sessionId);
    const registryLock = path.join(path.dirname(store.sessionsDir), 'current-session.json.lock');
    let intervened = false;
    let resumedActivation: string | undefined;
    lockProbe.beforeRegistryLock = () => {
      intervened = true;
      // A competing native resume completed immediately before this writer
      // acquired the lock. Its activation must survive the unrelated write.
      manager.resume(sessionId);
      resumedActivation = store.readCurrentSessionSelection(home)!.activationId;
    };
    if (kind === 'set') store.setCurrentSessionForProject(otherProject, otherSession.id);
    else store.clearCurrentSessionForProject(otherProject);
    expect(intervened).toBe(true);
    expect(store.readCurrentSessionSelection(home)!.activationId).toBe(resumedActivation);
    expect(manager.appendCompactionIfCurrent({ source, summary: 'stale', keptMessages: 1, tokensBefore: 2000 })).toMatchObject({ status: 'refused' });
    expect(compactions()).toHaveLength(0);
    expect(fs.existsSync(registryLock)).toBe(false);
  });

it('refuses publication after native resume within the same millisecond', () => {
  const store = new SessionStoreAccess();
  vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-11-02T12:00:00.000Z');
  manager.resume(sessionId);
  const selection = store.readCurrentSessionSelection(home)!;
  const source = manager.captureCompactionSource(sessionId);
  manager.resume(sessionId);
  const resumedSelection = store.readCurrentSessionSelection(home)!;
  expect(resumedSelection.updatedAt).toBe(selection.updatedAt);
  expect(resumedSelection.activationId).not.toBe(selection.activationId);
  expect(manager.captureCompactionSource(sessionId).replayIdentity).toBe(source.replayIdentity);
  expect(manager.appendCompactionIfCurrent({ source, summary: 'stale', keptMessages: 1, tokensBefore: 2000 })).toMatchObject({ status: 'refused' });
  expect(compactions()).toHaveLength(0);
});

it('reads legacy project selections without upgrading or repairing them', () => {
  const store = new SessionStoreAccess();
  const registry = path.join(home, '.cheers', 'current-session.json');
  const contents = JSON.parse(fs.readFileSync(registry, 'utf8'));
  const projectKey = Object.keys(contents.byProjectRoot)[0]!;
  delete contents.byProjectRoot[projectKey].activationId;
  fs.writeFileSync(registry, JSON.stringify(contents));
  const before = fs.readFileSync(registry);
  expect(store.readCurrentSessionSelection(home)).toEqual(contents.byProjectRoot[projectKey]);
  const source = manager.captureCompactionSource(sessionId);
  manager.markTurnActive(sessionId);
  expect(fs.readFileSync(registry)).toEqual(before);
  expect(manager.captureCompactionSource(sessionId).identity).toBe(source.identity);
  expect(manager.appendCompactionIfCurrent({ source, summary: 'legacy summary', keptMessages: 1, tokensBefore: 2000 })).toMatchObject({ status: 'committed' });
});

it('allows lifecycle publication when a corrupt legacy registry is shadowed by the current activation', async () => {
  const legacyRegistry = path.join(home, '.cheer', 'current-session.json');
  fs.mkdirSync(path.dirname(legacyRegistry), { recursive: true });
  fs.writeFileSync(legacyRegistry, '{');
  manager = new SessionManager();
  const source = manager.captureCompactionSource(sessionId);
  const outcome = await compactSessionHistory({ store: manager, sessionId, policy,
    summarize: async () => {
      manager.markTurnActive(sessionId);
      expect(manager.captureCompactionSource(sessionId).identity).toBe(source.identity);
      return 'summary';
    } });
  expect(outcome).toMatchObject({ status: 'compacted' });
  expect(compactions()).toHaveLength(1);
  expect(fs.readFileSync(legacyRegistry, 'utf8')).toBe('{');
});

it('refuses a corrupt current registry even when an older valid activation exists', () => {
  const registry = path.join(home, '.cheers', 'current-session.json');
  const legacyRegistry = path.join(home, '.cheer', 'current-session.json');
  fs.mkdirSync(path.dirname(legacyRegistry), { recursive: true });
  fs.copyFileSync(registry, legacyRegistry);
  manager = new SessionManager();
  const store = new SessionStoreAccess();
  const source = manager.captureCompactionSource(sessionId);
  fs.writeFileSync(registry, '{');
  expect(() => store.readCurrentSessionSelection(home)).toThrow('activation is unavailable');
  expect(manager.appendCompactionIfCurrent({ source, summary: 'stale', keptMessages: 1, tokensBefore: 2000 })).toMatchObject({ status: 'refused' });
  expect(compactions()).toHaveLength(0);
  expect(fs.readFileSync(registry, 'utf8')).toBe('{');
});

it.each(['record', 'activation', 'array-store', 'unreadable'] as const)(
  'refuses a malformed %s activation without repairing its registry', kind => {
    const store = new SessionStoreAccess();
    const source = manager.captureCompactionSource(sessionId);
    const registry = path.join(home, '.cheers', 'current-session.json');
    const contents = JSON.parse(fs.readFileSync(registry, 'utf8'));
    const projectKey = Object.keys(contents.byProjectRoot)[0]!;
    if (kind === 'record') contents.byProjectRoot[projectKey] = null;
    if (kind === 'activation') contents.byProjectRoot[projectKey].activationId = 7;
    if (kind === 'array-store') contents.byProjectRoot = [];
    fs.writeFileSync(registry, kind === 'unreadable' ? '{' : JSON.stringify(contents));
    const before = fs.readFileSync(registry);
    expect(() => store.readCurrentSessionSelection(home)).toThrow('activation is unavailable');
    expect(manager.appendCompactionIfCurrent({ source, summary: 'stale', keptMessages: 1, tokensBefore: 2000 })).toMatchObject({ status: 'refused' });
    expect(compactions()).toHaveLength(0);
    expect(fs.readFileSync(registry)).toEqual(before);
  });

it('writes prepared summaries with a distinct wire type and preserves inertness on decode', () => {
  const line = encodeTranscriptEvent({ type: 'compaction', id: 'prepared', publication: 'prepared',
    summary: 'inert', keptMessages: 1, sourceActivePath: ['root', 'leaf'], timestamp: new Date().toISOString() });
  expect(JSON.parse(line).type).toBe('compaction-prepared');
  expect(classifyTranscriptLine(line)).toMatchObject({ kind: 'entry', event: { type: 'compaction', publication: 'prepared' } });
});

it('propagates uncertain automatic publication without updating context or PostCompact', async () => {
  const authority = sessionCompactionAuthority({ sessionId, workspaceRoot: home, admission: () => undefined,
    isCurrent: () => true, capture: () => manager.captureCompactionSource(sessionId),
    commit: () => ({ status: 'unverified', reason: 'private detail' }) });
  const after = vi.fn(); const onCompact = vi.fn();
  const step = createCompactionStep(policy, { sessionId, authority, summarize: async () => 'summary',
    lifecycle: { after }, onCompact });
  await expect(step({ messages: manager.getSession(sessionId)!.turns, stepCount: 1 } as never)).rejects.toThrow(CompactionPublicationError);
  expect(after).not.toHaveBeenCalled(); expect(onCompact).not.toHaveBeenCalled();
});

it.each(['cancel', 'turn', 'branch-return', 'model', 'rebind', 'replacement', 'profile-replacement', 'resume', 'session-return'])('refuses a late manual append after %s', async kind => {
  const before = manager.getSession(sessionId)!.turns;
  const controller = new AbortController();
  const events: string[] = [];
  const outcome = await compactSessionHistory({ store: manager, sessionId, policy, signal: controller.signal,
    hooks: { dispatch: async (event: { eventName: string }) => { events.push(event.eventName); return { decision: 'allow' }; } } as never,
    summarize: async () => {
      if (kind === 'cancel') controller.abort();
      if (kind === 'turn') manager.addTurn(sessionId, { role: 'user', content: 'new work' });
      if (kind === 'branch-return') {
        const store = new SessionStoreAccess(); const session = store.load(sessionId); const layout = store.stateLayout(sessionId);
        const thread = readSessionThreadSnapshot({ session, layout });
        switchDurableSessionActiveLeaf({ session, layout, leafEntryId: thread.entries[1]!.id });
        switchDurableSessionActiveLeaf({ session, layout, leafEntryId: thread.activeLeafId! });
      }
      if (kind === 'model') {
        const store = new SessionStoreAccess(); const target = store.statePath(sessionId);
        store.writeJsonFileAtomic(target, { ...store.readStateSnapshotRequired(target), modelRevision: 'next' });
      }
      if (kind === 'rebind') manager.rebindSessionProjectRoot(sessionId, path.join(home, 'next'));
      if (kind === 'resume') manager.resume(sessionId);
      if (kind === 'session-return') { manager.createNew(home); manager.resume(sessionId); }
      if (kind === 'replacement') {
        const directory = manager.getSessionDirPath(sessionId); const copy = `${directory}-copy`;
        fs.cpSync(directory, copy, { recursive: true }); fs.rmSync(directory, { recursive: true }); fs.renameSync(copy, directory);
      }
      if (kind === 'profile-replacement') {
        const directory = path.join(home, '.cheers'); const copy = `${directory}-copy`;
        fs.cpSync(directory, copy, { recursive: true }); fs.rmSync(directory, { recursive: true }); fs.renameSync(copy, directory);
      }
      return 'summary';
    } });
  expect(outcome.status).toBe('failed');
  expect(compactions()).toHaveLength(0);
  expect(events).toEqual(['PreCompact']);
  if (kind === 'cancel') expect(manager.getSession(sessionId)!.turns).toEqual(before);
});

it('verifies durable append before PostCompact and publishes once in manual/automatic competition', async () => {
  let resolve!: () => void;
  const pending = new Promise<void>(done => { resolve = done; });
  const summarize = vi.fn(async () => { await pending; return 'summary'; });
  const authority = sessionCompactionAuthority({ sessionId, workspaceRoot: home, admission: () => undefined,
    isCurrent: () => true, capture: () => manager.captureCompactionSource(sessionId), commit: input => manager.appendCompactionIfCurrent(input) });
  const manual = compactSessionHistory({ store: manager, sessionId, policy, summarize, authority,
    hooks: { dispatch: async (event: { eventName: string }) => {
      if (event.eventName === 'PostCompact') expect(compactions()).toHaveLength(1);
      return { decision: 'allow' }; } } as never });
  const automatic = createCompactionStep(policy, { sessionId, summarize, authority })({ messages: manager.getSession(sessionId)!.turns, stepCount: 1 } as never);
  resolve();
  const results = await Promise.all([manual, automatic]);
  expect(results[0]).toMatchObject({ status: 'compacted' });
  expect(results[1]).toBeUndefined();
  expect(summarize).toHaveBeenCalledOnce();
  expect(compactions()).toHaveLength(1);
});

it.each(['automatic', 'manual-first', 'automatic-first'])('compacts native runtime system and opening messages (%s)', async mode => {
  const history = manager.getSession(sessionId)!.turns;
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>(done => { started = done; });
  const pending = new Promise<void>(done => { release = done; });
  const summarize = vi.fn(async (request: { messages: readonly AgentMessage[] }) => {
    expect(request.messages.some(message => message.role === 'system' || String(message.content).includes('Environment Context'))).toBe(false);
    started(); await pending; return 'summary';
  });
  const authority = sessionCompactionAuthority({ sessionId, workspaceRoot: home, admission: () => undefined,
    isCurrent: () => true, capture: () => manager.captureCompactionSource(sessionId), commit: input => manager.appendCompactionIfCurrent(input) });
  const events: string[] = [];
  const hooks = { dispatch: async (event: { eventName: string }) => {
    events.push(event.eventName);
    if (event.eventName === 'PostCompact') expect(compactions()).toHaveLength(1);
    return { decision: 'allow' as const };
  } };
  const compact = () => compactSessionHistory({ store: manager, sessionId, policy, summarize, authority, hooks: hooks as never });
  let manual: ReturnType<typeof compact> | undefined;
  const sent: AgentMessage[][] = [];
  const step = vi.fn(async (messages: readonly AgentMessage[]) => {
    sent.push([...messages]);
    return sent.length === 1
      ? { text: '', toolCalls: [{ id: 'read-current', name: 'read', args: {} }], stopReason: 'stop' as const }
      : { text: 'done', toolCalls: [], stopReason: 'stop' as const };
  });
  const run = runTurn({ sessionId, workspaceRoot: home, prompt: 'keep opening', permissionScope: 'allow-all',
    history: [{ role: 'system', content: 'runtime system' }, ...history],
    onPromptAccepted: () => {
      manager.persistUserPromptBarrier(sessionId, 'keep opening');
    },
    onMessage: message => manager.addTurn(sessionId, message), step,
    observe: event => { if (event.type === 'turn_end' && event.willContinue && mode === 'manual-first') manual = compact(); },
    tools: new Map([['read', { name: 'read', description: 'read', argsSchema: { type: 'object', properties: {} },
      execute: async () => ({ success: true, output: 'read output' }) }]]), hooks: hooks as never,
    maxSteps: 2, signal: new AbortController().signal,
    compaction: { policy, summarize, authority, onCompact: () => undefined },
  });
  const drained = (async () => { for await (const _event of run.events) { /* Drain the real turn lifecycle. */ } })();
  await ready;
  if (mode === 'automatic-first') manual = compact();
  release();
  await drained;
  if (manual) {
    const outcome = await manual;
    if (mode === 'manual-first') expect(['compacted', 'nothing']).toContain(outcome.status);
    else expect(outcome).toMatchObject({ status: 'failed' });
  }
  expect(summarize).toHaveBeenCalledOnce();
  expect(compactions()).toHaveLength(1);
  expect(events.filter(event => event === 'PostCompact')).toHaveLength(1);
  expect(step).toHaveBeenCalledTimes(2);
  expect(sent[0]![0]).toMatchObject({ role: 'system', content: 'runtime system' });
  expect(sent[0]!.at(-1)!.content).toContain('Environment Context');
  expect(sent[0]!.at(-1)!.content).toContain('keep opening');
  if (mode !== 'manual-first') {
    expect(sent[1]![1]!.content).toBe('[Context Checkpoint]\nsummary');
    const opening = sent[1]!.find(message => String(message.content).includes('Environment Context'));
    expect(opening?.content).toContain('keep opening');
  }
});

it.each(['instructions', 'publication-return'])('refuses publication after %s changed', async kind => {
  fs.writeFileSync(path.join(home, 'AGENTS.md'), 'original');
  const original = {}; let publication = original;
  const authority = sessionCompactionAuthority({ sessionId, workspaceRoot: home, admission: () => undefined,
    isCurrent: () => publication === original, capture: () => manager.captureCompactionSource(sessionId), commit: input => manager.appendCompactionIfCurrent(input) });
  const outcome = await compactSessionHistory({ store: manager, sessionId, policy, authority, summarize: async () => {
    if (kind === 'instructions') fs.writeFileSync(path.join(home, 'AGENTS.md'), 'changed');
    else { publication = {}; publication = { sameValues: true }; }
    return 'summary';
  } });
  expect(outcome).toMatchObject({ status: 'failed', reason: expect.stringContaining(kind === 'instructions' ? 'instructions changed' : 'Configuration changed') });
  expect(compactions()).toHaveLength(0);
});

it('keeps an unverified native append distinct from successful publication', async () => {
  const source = manager.captureCompactionSource(sessionId);
  const history = manager.getSession(sessionId)!.turns;
  const fsync = vi.spyOn(fs, 'fsyncSync').mockImplementation(() => { throw new Error('durability failed'); });
  const result = manager.appendCompactionIfCurrent({ source, summary: 'retained material', keptMessages: 1, tokensBefore: 2000 });
  fsync.mockRestore();
  expect(result.status).toBe('unverified');
  // The effect may exist, but no successful compaction outcome is authorized.
  expect(compactions()).toHaveLength(1);
  expect(manager.getSession(sessionId)!.turns).toEqual(history);
  expect(new SessionManager().getSession(sessionId)!.turns).toEqual(history);
});

it('keeps current publication unverified and permits later exact marker recovery', async () => {
  const source = manager.captureCompactionSource(sessionId);
  const original = fs.fsyncSync;
  const onCompact = vi.fn(); const after = vi.fn();
  let calls = 0;
  const fsync = vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => { if (++calls === 2) throw new Error('marker durability uncertain'); original(fd); });
  const authority = sessionCompactionAuthority({ sessionId, workspaceRoot: home, admission: () => undefined,
    isCurrent: () => true, capture: () => source, commit: input => manager.appendCompactionIfCurrent(input) });
  await expect(createCompactionStep(policy, { sessionId, authority, summarize: async () => 'verified summary',
    onCompact, lifecycle: { after } })({ messages: source.history, stepCount: 1 } as never)).rejects.toThrow(CompactionPublicationError);
  fsync.mockRestore();
  expect(onCompact).not.toHaveBeenCalled();
  expect(after).not.toHaveBeenCalled();
  expect(manager.getSession(sessionId)!.turns[0]!.content).toBe('[Context Checkpoint]\nverified summary');
  expect(new SessionManager().getSession(sessionId)!.turns[0]!.content).toBe('[Context Checkpoint]\nverified summary');
});

it('applies a receipt only to its captured branch and new descendants', async () => {
  const history = manager.getSession(sessionId)!.turns;
  const source = manager.captureCompactionSource(sessionId);
  expect(manager.appendCompactionIfCurrent({ source, summary: 'future summary', keptMessages: 1, tokensBefore: 2000 })).toEqual({ status: 'committed' });
  const receipt = compactions()[0]!;
  expect(receipt).toMatchObject({ sourceActivePath: source.sourceActivePath });
  const leaf = source.sourceActivePath!.at(-1)!;
  const earlier = history[1]!.id!;
  const switchLeaf = (leafEntryId: string) => {
    const store = new SessionStoreAccess(); const session = store.load(sessionId);
    switchDurableSessionActiveLeaf({ session, layout: store.stateLayout(sessionId), leafEntryId });
  };
  switchLeaf(earlier);
  expect(new SessionManager().getSession(sessionId)!.turns).toEqual(history.slice(0, 2));
  manager.addTurn(sessionId, { role: 'user', content: 'sibling work' });
  const sibling = manager.getSession(sessionId)!.turns.at(-1)!.id!;
  expect(new SessionManager().getSession(sessionId)!.turns.map(turn => turn.content)).toEqual([...history.slice(0, 2).map(turn => turn.content), 'sibling work']);
  switchLeaf(leaf);
  expect(new SessionManager().getSession(sessionId)!.turns.map(turn => turn.content)).toEqual(['[Context Checkpoint]\nfuture summary', history.at(-1)!.content]);
  manager.addTurn(sessionId, { role: 'user', content: 'new descendant' });
  expect(new SessionManager().getSession(sessionId)!.turns.map(turn => turn.content)).toEqual(['[Context Checkpoint]\nfuture summary', history.at(-1)!.content, 'new descendant']);
  const descendantFork = manager.fork(sessionId, undefined, { activate: false });
  expect(new SessionManager().getSession(descendantFork.id)!.turns.map(turn => turn.content)).toEqual(['[Context Checkpoint]\nfuture summary', history.at(-1)!.content, 'new descendant']);
  switchLeaf(sibling);
  expect(new SessionManager().getSession(sessionId)!.turns.map(turn => turn.content)).toEqual([...history.slice(0, 2).map(turn => turn.content), 'sibling work']);
  const forked = manager.fork(sessionId, undefined, { entryId: history[2]!.id, activate: false });
  expect(new SessionManager().getSession(forked.id)!.turns.map(turn => turn.content)).toEqual(history.slice(0, 2).map(turn => turn.content));
});

it('refuses a store without native verification or explicit synthetic injection', async () => {
  const append = vi.fn();
  const result = await compactSessionHistory({ sessionId, policy, summarize: async () => 'summary',
    store: { getSession: () => manager.getSession(sessionId), appendCompactionEntry: append } });
  expect(result).toMatchObject({ status: 'failed', reason: expect.stringContaining('verified') });
  expect(append).not.toHaveBeenCalled();
});

it.each(['raw provider output: Bearer synthetic-secret response body', 'Summary request refused: raw-secret-canary'])('keeps arbitrary provider failure bodies out of the manual result: %s', async failure => {
  const outcome = await compactSessionHistory({ store: manager, sessionId, policy,
    summarize: async () => { throw new Error(failure); } });
  expect(outcome).toEqual({ status: 'failed', reason: 'The summary request failed; history was retained.' });
  expect(compactions()).toHaveLength(0);
});

it('does not replay an unknown summary after native resume republishes unchanged metadata', async () => {
  vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(manager.getSession(sessionId)!.updatedAt);
  const summary = vi.fn(async () => undefined);
  expect(await compactSessionHistory({ store: manager, sessionId, policy, summarize: summary })).toMatchObject({ status: 'failed' });
  const before = manager.captureCompactionSource(sessionId);
  const metadata = new SessionStoreAccess().metadataPath(sessionId);
  const beforeMetadata = fs.readFileSync(metadata);
  manager.resume(sessionId);
  const after = manager.captureCompactionSource(sessionId);
  expect(fs.readFileSync(metadata)).toEqual(beforeMetadata);
  expect(after.history).toEqual(before.history);
  expect(after.identity).not.toBe(before.identity);
  expect(after.replayIdentity).toBe(before.replayIdentity);
  const retry = vi.fn(async () => 'must not send');
  expect(await compactSessionHistory({ store: manager, sessionId, policy, summarize: retry })).toMatchObject({ status: 'failed', reason: expect.stringContaining('not repeated') });
  expect(summary).toHaveBeenCalledOnce();
  expect(retry).not.toHaveBeenCalled();
});
