import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../session/SessionManager.js';
import { readSessionNavigation } from '../../session/query/navigation.js';
import { createSessionStoreLayout, locateExistingSessionLayout } from '../../session/store/sessionFileLayout.js';
import { navigateSession } from './navigation.js';
import { registerCatalogContribution } from '../../core/catalog/contributions.js';
import { runEventHandlers } from '../../extensions/events/dispatch.js';
import { initialConfiguration } from '../../core/shell/configuration.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';

let root: string;
const cleanups: Array<() => void> = [];
beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(temporary, { recursive: true }); root = fs.mkdtempSync(path.join(temporary, 'navigation-events-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
});
afterEach(() => { cleanups.splice(0).forEach(retire => retire()); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
function fixture(handlers: ReadonlyMap<string, readonly ((event: unknown) => unknown)[]>) {
  const manager = new SessionManager(), original = manager.createNew(root);
  for (const message of [{ role: 'user' as const, content: 'First' }, { role: 'assistant' as const, content: 'Answer' }, { role: 'user' as const, content: 'Second' }, { role: 'assistant' as const, content: 'Later' }]) manager.addTurn(original.id, message);
  const session = manager.getSession(original.id)!;
  const seed = { session, cwd: root, projectRoot: root, runtimeConfig: getRuntimeConfig(root) };
  const context = { ...seed, configuration: initialConfiguration(seed) } as ShellRuntimeContext;
  const summarize = vi.fn(async () => 'Kept branch summary');
  const runtime = { getState: () => 'idle' as const, summarizeAbandonedTurns: summarize };
  const retire = registerCatalogContribution({ root, sessionId: session.id, commands: [], tools: [], skills: () => [],
    onEvent: (event, payload, aliases, signal) => runEventHandlers({ handlers, event, payload, aliases, signal }) });
  cleanups.push(retire);
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), session.id);
  const bytes = () => [layout.metadataPath, layout.statePath, layout.transcriptPath].map(file => fs.readFileSync(file));
  return { manager, session, context, summarize, runtime, bytes, retire, target: session.turns[0]!.id! };
}

it('honours before_tree cancellation without a summary, durable write or view change', async () => {
  const seen: unknown[] = [];
  const test = fixture(new Map([['session_before_tree', [event => { seen.push(event); return { cancel: true }; }]]]));
  const before = test.bytes(), context = test.context.session;
  const result = await navigateSession({ runtimeContext: test.context, sessionManager: test.manager, sessionRuntime: test.runtime }, test.target);
  expect(result).toMatchObject({ status: 'unchanged', changed: false }); expect(result.output).toContain('cancelled');
  expect(seen).toHaveLength(1); expect(test.summarize).not.toHaveBeenCalled(); expect(test.bytes()).toEqual(before); expect(test.context.session).toBe(context);
});

it('emits before_tree then confirmed tree with actual old and new leaf identities and no session restart', async () => {
  const events: Array<{ name: string; payload: unknown }> = [];
  const names = ['session_before_tree', 'session_tree', 'session_start', 'session_shutdown'];
  const test = fixture(new Map(names.map(name => [name, [payload => { events.push({ name, payload }); }]])));
  const oldLeafId = readSessionNavigation(test.session.id, root).thread.activeLeafId;
  const result = await navigateSession({ runtimeContext: test.context, sessionManager: test.manager, sessionRuntime: test.runtime }, test.target);
  expect(result.changed).toBe(true);
  expect(events.map(row => row.name)).toEqual(['session_before_tree', 'session_tree']);
  expect(events[1]!.payload).toMatchObject({ type: 'session_tree', oldLeafId, newLeafId: test.target, sessionId: test.session.id });
});

it('refuses a malformed before_tree result before any write', async () => {
  const test = fixture(new Map([['session_before_tree', [() => ({ cancel: 'yes' })]]])); const before = test.bytes();
  const result = await navigateSession({ runtimeContext: test.context, sessionManager: test.manager, sessionRuntime: test.runtime }, test.target);
  expect(result).toMatchObject({ changed: false }); expect(test.bytes()).toEqual(before); expect(test.summarize).not.toHaveBeenCalled();
});

it('discards a late before_tree result after its source is changed', async () => {
  let release!: () => void; let reached!: () => void; const ready = new Promise<void>(resolve => { reached = resolve; });
  const test = fixture(new Map([['session_before_tree', [async () => { reached(); await new Promise<void>(resolve => { release = resolve; }); return { cancel: false }; }]]]));
  const before = test.bytes();
  const pending = navigateSession({ runtimeContext: test.context, sessionManager: test.manager, sessionRuntime: test.runtime }, test.target);
  await ready; test.context.session = { ...test.context.session, id: 'replacement' }; release();
  await expect(pending).rejects.toThrow('session changed'); expect(test.bytes()).toEqual(before); expect(test.summarize).not.toHaveBeenCalled();
});

it('does not publish a tree success when no navigation write is confirmed', async () => {
  const after = vi.fn(); const test = fixture(new Map([['session_tree', [after]]]));
  vi.spyOn(test.manager, 'revertTo').mockRejectedValue(new Error('Synthetic storage refusal'));
  const result = await navigateSession({ runtimeContext: test.context, sessionManager: test.manager, sessionRuntime: test.runtime }, test.target);
  expect(result.changed).toBe(false); expect(after).not.toHaveBeenCalled();
});

it('preserves a confirmed write but refuses its old draft after a post-tree handler replaces the active session', async () => {
  let release!: () => void; let reached!: () => void; const ready = new Promise<void>(resolve => { reached = resolve; });
  const test = fixture(new Map([['session_tree', [async () => { reached(); await new Promise<void>(resolve => { release = resolve; }); }]]]));
  const pending = navigateSession({ runtimeContext: test.context, sessionManager: test.manager, sessionRuntime: test.runtime }, test.target);
  await ready; test.context.session = { ...test.context.session, id: 'replacement', turns: [] }; release();
  const result = await pending;
  expect(result).toMatchObject({ status: 'changed-with-warning', changed: false }); expect(result.draft).toBeUndefined();
  expect(result.output).toContain('confirmed'); expect(test.context.session.id).toBe('replacement');
  expect(readSessionNavigation(test.session.id, root).thread.activeLeafId).toBe(test.target);
});

it('refuses the selected draft after saved navigation changes during the post-tree notification', async () => {
  let release!: () => void; let reached!: () => void; const ready = new Promise<void>(resolve => { reached = resolve; });
  const test = fixture(new Map([['session_tree', [async () => { reached(); await new Promise<void>(resolve => { release = resolve; }); }]]]));
  const pending = navigateSession({ runtimeContext: test.context, sessionManager: test.manager, sessionRuntime: test.runtime }, test.target);
  await ready; test.manager.addTurn(test.session.id, { role: 'user', content: 'New saved question' }); release();
  const result = await pending;
  expect(result).toMatchObject({ status: 'changed-with-warning', changed: false }); expect(result.draft).toBeUndefined(); expect(result.output).toContain('confirmed');
});

it('refuses a branch write when the admitted extension generation retires during its summary', async () => {
  let release!: () => void; let reached!: () => void; const ready = new Promise<void>(resolve => { reached = resolve; });
  const test = fixture(new Map([['session_before_tree', [() => ({ cancel: false })]]])); const before = test.bytes();
  test.summarize.mockImplementation(async () => { reached(); await new Promise<void>(resolve => { release = resolve; }); return 'Old generation summary'; });
  const pending = navigateSession({ runtimeContext: test.context, sessionManager: test.manager, sessionRuntime: test.runtime }, test.target);
  await ready; test.retire(); release();
  const result = await pending; expect(result.changed).toBe(false); expect(test.bytes()).toEqual(before);
});
