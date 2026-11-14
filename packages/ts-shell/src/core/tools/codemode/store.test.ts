import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolDefinition, ToolExecutionResult } from '../../../tools/types.js';
import { SessionManager } from '../../../session/SessionManager.js';
import { locateExistingSessionLayout, createSessionStoreLayout } from '../../../session/store/sessionFileLayout.js';
import { loadSessionRecord } from '../../../session/store/sessionStore.js';
import { switchDurableSessionActiveLeaf } from '../../../session/store/threadState.js';
import { appendTranscriptEvent, readTranscriptEvents, TranscriptAppendError } from '../../../session/transcript/sessionTranscript.js';
import { fileIdentity } from '../../workspace/files.js';
import { loadCodemodeStore, MAX_STORE_TOTAL_CHARS } from './store.js';
import { createCodemodeToolDefinition } from './tool.js';

let temporary: string;
let workspace: string;
let manager: SessionManager;
let sessionId: string;

beforeEach(() => {
  const parent = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(parent, { recursive: true });
  temporary = fs.mkdtempSync(path.join(parent, 'codemode-store-'));
  workspace = path.join(temporary, 'workspace');
  const home = path.join(temporary, 'home');
  fs.mkdirSync(workspace); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('CHEERS_TEST_ROOT', temporary); vi.stubEnv('GIT_CEILING_DIRECTORIES', temporary);
  manager = new SessionManager(); sessionId = manager.createNew(workspace).id;
});
afterEach(() => {
  vi.restoreAllMocks(); syncBuiltinESMExports(); vi.unstubAllEnvs();
  fs.rmSync(temporary, { recursive: true, force: true });
});

function layout() { return locateExistingSessionLayout(createSessionStoreLayout(), sessionId); }
function storeEvents() { return readTranscriptEvents(layout().transcriptPath).filter(event => event.type === 'codemode-store'); }
function run(code: string, barrier?: () => void, id = sessionId): Promise<ToolExecutionResult> {
  const tools = new Map<string, ToolDefinition>([['barrier', { name: 'barrier', description: 'fixture boundary', argsSchema: {},
    execute: async () => { barrier?.(); return { success: true, output: 'ready' }; },
  }]]);
  return createCodemodeToolDefinition(() => tools).execute({ code }, { workspaceRoot: workspace, sessionId: id, taskId: 'cm-store' });
}
function switchLeaf(leafEntryId: string) {
  const files = layout();
  switchDurableSessionActiveLeaf({ session: loadSessionRecord({ sessionId, layout: files, cwd: workspace }), layout: files, leafEntryId });
}
function messageIds() { return readTranscriptEvents(layout().transcriptPath).filter(event => event.type === 'message').map(event => event.id!); }

describe('codemode saved branch storage', () => {
  it('reloads disk values and deletions through a new worker without retaining failed writes', async () => {
    expect((await run('store("keep", { answer: 42 }); store("remove", "old");')).success).toBe(true);
    expect((await run('store("remove", undefined);')).success).toBe(true);
    expect((await run('store("keep", "bad"); throw new Error("fixture script failure");')).success).toBe(false);
    manager = new SessionManager();
    const resumed = await run('return { keep: load("keep"), removed: load("remove") === undefined };');
    expect(resumed.success).toBe(true);
    expect(resumed.output).toContain('"answer": 42');
    expect(resumed.output).toContain('"removed": true');
    expect(storeEvents()).toHaveLength(2);
  });

  it('inherits root-scoped values in a real fork while later writes stay independent', async () => {
    expect((await run('store("shared", "root-value");')).success).toBe(true);
    const forked = manager.fork(sessionId, workspace, { activate: false });
    const inherited = await run('return load("shared");', undefined, forked.id);
    expect(inherited.success).toBe(true);
    expect(inherited.output).toContain('root-value');
    expect((await run('store("shared", "fork-value");', undefined, forked.id)).success).toBe(true);
    expect((await run('return load("shared");')).output).toContain('root-value');
    expect((await run('return load("shared");', undefined, forked.id)).output).toContain('fork-value');
    expect((await run('return load("shared");', undefined, manager.fork(forked.id, workspace, { activate: false }).id)).output).toContain('fork-value');
  });

  it('replays only the active branch after navigation and new saved messages', async () => {
    manager.addTurn(sessionId, { role: 'user', content: 'first' });
    const first = messageIds()[0]!;
    expect((await run('store("value", "first");')).success).toBe(true);
    manager.addTurn(sessionId, { role: 'assistant', content: 'abandoned' });
    expect((await run('store("value", "abandoned");')).success).toBe(true);
    switchLeaf(first); manager.addTurn(sessionId, { role: 'assistant', content: 'new branch' });
    const resumed = await run('return load("value");');
    expect(resumed.success).toBe(true); expect(resumed.output).toContain('first');
    expect(resumed.output).not.toContain('abandoned');
  });

  it.each(['missing-state', 'corrupt-state', 'broken-ancestry'] as const)('refuses %s before a worker can issue tools', async damage => {
    const files = layout();
    if (damage === 'missing-state') fs.rmSync(files.statePath);
    else if (damage === 'corrupt-state') fs.writeFileSync(files.statePath, '{fixture-invalid-json');
    else {
      const state = JSON.parse(fs.readFileSync(files.statePath, 'utf8'));
      state.thread.activeLeafId = 'missing-leaf'; fs.writeFileSync(files.statePath, JSON.stringify(state));
    }
    const barrier = vi.fn();
    const result = await run('await tools.barrier({}); store("value", "should-not-run");', barrier);
    expect(result.success).toBe(false); expect(barrier).not.toHaveBeenCalled();
    expect(result.metadata?.codemodeStore).toMatchObject({ status: 'unchanged' });
    expect(storeEvents()).toEqual([]);
  });

  it.each(['unresolved-leaf', 'duplicate-root', 'foreign-root'] as const)('refuses saved %s before catch-up can hide it with an unindexed message', async damage => {
    manager.addTurn(sessionId, { role: 'user', content: 'captured branch message' });
    expect((await run('store("branch", "captured-value");')).success).toBe(true);
    const files = layout(); const state = JSON.parse(fs.readFileSync(files.statePath, 'utf8'));
    if (damage === 'unresolved-leaf') state.thread.activeLeafId = 'missing-leaf';
    else if (damage === 'duplicate-root') {
      const root = state.thread.entries[0];
      state.thread.entries.push({ ...root, kind: 'turn-message', role: 'assistant', order: state.thread.entries.length });
    } else state.thread.entries[0].id = 'foreign:root';
    fs.writeFileSync(files.statePath, JSON.stringify(state));
    appendTranscriptEvent(files.transcriptPath, { type: 'message', id: 'unindexed-message', role: 'assistant',
      content: 'persisted but not indexed', timestamp: new Date().toISOString() }, undefined, { requireExisting: true });
    const before = fs.readFileSync(files.transcriptPath, 'utf8');
    const barrier = vi.fn();
    const result = await run('await tools.barrier({}); store("branch", "should-not-run");', barrier);
    expect(result.success).toBe(false); expect(barrier).not.toHaveBeenCalled();
    expect(result.metadata?.codemodeStore).toMatchObject({ status: 'unchanged', reason: 'unavailable' });
    expect(fs.readFileSync(files.transcriptPath, 'utf8')).toBe(before);
  });

  it('retains the legacy no-thread fallback when indexing a saved message', async () => {
    const files = layout(); const state = JSON.parse(fs.readFileSync(files.statePath, 'utf8'));
    delete state.thread; fs.writeFileSync(files.statePath, JSON.stringify(state));
    appendTranscriptEvent(files.transcriptPath, { type: 'message', id: 'legacy-message', role: 'user', content: 'saved legacy message',
      timestamp: new Date().toISOString() }, undefined, { requireExisting: true });
    const result = await run('store("legacy", "saved"); return load("legacy");');
    expect(result.success).toBe(true); expect(result.output).toContain('saved');
    expect(loadCodemodeStore(sessionId, workspace).initial.legacy).toBe('"saved"');
  });

  it('refuses a declared missing saved session instead of creating an ephemeral success', async () => {
    const barrier = vi.fn();
    const result = await run('await tools.barrier({}); store("value", "should-not-run");', barrier, 'sess_missing');
    expect(result.success).toBe(false); expect(barrier).not.toHaveBeenCalled();
    expect(result.metadata?.codemodeStore).toMatchObject({ status: 'unchanged' });
    expect(fs.existsSync(path.join(createSessionStoreLayout().sessionsDir, 'sess_missing'))).toBe(false);
  });

  it.each(['directory', 'transcript'] as const)('refuses replacement of the captured %s before commit', async target => {
    const files = layout(); const before = fs.readFileSync(files.transcriptPath, 'utf8');
    const result = await run('store("value", "foreign-write"); await tools.barrier({});', () => {
      if (target === 'directory') {
        const retired = path.join(temporary, 'retired-session');
        fs.renameSync(files.sessionDir, retired); fs.cpSync(retired, files.sessionDir, { recursive: true });
      } else {
        fs.renameSync(files.transcriptPath, path.join(temporary, 'retired-transcript'));
        fs.writeFileSync(files.transcriptPath, before);
      }
    });
    expect(result.success).toBe(false);
    expect(result.metadata?.codemodeStore).toMatchObject({ status: 'unchanged' });
    expect(fs.readFileSync(files.transcriptPath, 'utf8')).toBe(before);
  });

  it('refuses a navigation round trip even when the active leaf returns to its original value', async () => {
    manager.addTurn(sessionId, { role: 'user', content: 'first' });
    manager.addTurn(sessionId, { role: 'assistant', content: 'second' });
    const [first, second] = messageIds();
    const files = layout(); const before = fs.readFileSync(files.transcriptPath, 'utf8');
    const result = await run('store("value", "stale-write"); await tools.barrier({});', () => {
      switchLeaf(first!); switchLeaf(second!);
    });
    expect(result.success).toBe(false);
    expect(result.metadata?.codemodeStore).toMatchObject({ status: 'unchanged' });
    expect(fs.readFileSync(files.transcriptPath, 'utf8')).toBe(before);
  });

  it('retains unrelated concurrent writes while appending a bounded store update', async () => {
    const result = await run('store("script", "own-value"); await tools.barrier({});', () => {
      loadCodemodeStore(sessionId, workspace).commit({ concurrent: JSON.stringify('other-value') });
    });
    expect(result.success).toBe(true);
    expect(loadCodemodeStore(sessionId, workspace).initial).toEqual({ concurrent: '"other-value"', script: '"own-value"' });
  });

  it('refuses a rewritten captured transcript prefix even when its inode, branch and written key stay unchanged', async () => {
    manager.addTurn(sessionId, { role: 'user', content: 'saved branch message' });
    expect((await run('store("earlier", "captured-value");')).success).toBe(true);
    const files = layout(); const inode = fs.statSync(files.transcriptPath).ino;
    let rewritten = '';
    const result = await run('store("pending", "must-not-commit"); await tools.barrier({});', () => {
      rewritten = fs.readFileSync(files.transcriptPath, 'utf8').split('\n').filter(line => {
        if (!line.trim()) return true;
        const event = JSON.parse(line);
        return event.type !== 'codemode-store' || event.entries.earlier === undefined;
      }).join('\n');
      fs.writeFileSync(files.transcriptPath, rewritten);
    });
    expect(fs.statSync(files.transcriptPath).ino).toBe(inode);
    expect(result.success).toBe(false);
    expect(result.metadata?.codemodeStore).toMatchObject({ status: 'unchanged', reason: 'conflict' });
    expect(fs.readFileSync(files.transcriptPath, 'utf8')).toBe(rewritten);
    expect(loadCodemodeStore(sessionId, workspace).initial.pending).toBeUndefined();
  });

  it('refuses a concurrent change to a written key instead of overwriting the newer value', async () => {
    const result = await run('store("value", "stale-value"); await tools.barrier({});', () => {
      loadCodemodeStore(sessionId, workspace).commit({ value: JSON.stringify('newer-value') });
    });
    expect(result.success).toBe(false);
    expect(result.metadata?.codemodeStore).toMatchObject({ status: 'unchanged' });
    expect(loadCodemodeStore(sessionId, workspace).initial.value).toBe('"newer-value"');
    expect(storeEvents()).toHaveLength(1);
  });

  it('checks the current persisted store budget under competing updates', async () => {
    const result = await run('store("pending", "p".repeat(120000)); await tools.barrier({});', () => {
      loadCodemodeStore(sessionId, workspace).commit(Object.fromEntries(['a', 'b', 'c', 'd'].map(key => [key, JSON.stringify('x'.repeat(240000))])));
    });
    expect(result.success).toBe(false);
    expect(result.metadata?.codemodeStore).toMatchObject({ status: 'unchanged' });
    const saved = loadCodemodeStore(sessionId, workspace).initial;
    expect(saved.pending).toBeUndefined();
    expect(Object.entries(saved).reduce((total, [key, value]) => total + key.length + value.length, 0)).toBeLessThan(MAX_STORE_TOTAL_CHARS);
  });

  it('reports an append failure as unknown with already landed bytes retained and private detail excluded', async () => {
    const append = fs.appendFileSync;
    vi.spyOn(fs, 'appendFileSync').mockImplementation((...args: Parameters<typeof fs.appendFileSync>) => {
      append(...args);
      if (String(args[1]).includes('codemode-store')) throw new Error('fixture-private-body-secret');
    });
    syncBuiltinESMExports();
    const result = await run('text("script output"); store("value", "landed");');
    expect(result.success).toBe(false);
    expect(result.metadata?.codemodeStore).toMatchObject({ status: 'unknown' });
    expect(JSON.stringify(result)).not.toContain('fixture-private-body-secret');
    expect(loadCodemodeStore(sessionId, workspace).initial.value).toBe('"landed"');
  });

  it('does not equate readable landed bytes with durable storage after fsync fails', async () => {
    vi.spyOn(fs, 'fsyncSync').mockImplementation(() => { throw new Error('fixture-private-sync-detail'); });
    syncBuiltinESMExports();
    const result = await run('store("value", "landed-without-sync");');
    expect(result.success).toBe(false);
    expect(result.metadata?.codemodeStore).toMatchObject({ status: 'unknown' });
    expect(JSON.stringify(result)).not.toContain('fixture-private-sync-detail');
    expect(loadCodemodeStore(sessionId, workspace).initial.value).toBe('"landed-without-sync"');
  });

  it('refuses a mismatching append descriptor before writing through the existing transcript owner', () => {
    const files = layout(); const before = fs.readFileSync(files.transcriptPath, 'utf8');
    try {
      appendTranscriptEvent(files.transcriptPath, { type: 'codemode-store', id: 'fixture-cm', entries: { value: '"blocked"' }, timestamp: 't' },
        undefined, { requireExisting: true, expectedIdentity: fileIdentity(fs.lstatSync(files.transcriptPath)) + '-stale', durable: true });
      throw new Error('Expected descriptor identity refusal.');
    } catch (error) {
      expect(error).toBeInstanceOf(TranscriptAppendError);
      expect(error).toMatchObject({ persistence: 'unchanged' });
    }
    expect(fs.readFileSync(files.transcriptPath, 'utf8')).toBe(before);
  });

  it('keeps successful nested effects visible when later branch storage refuses the script writes', async () => {
    const target = path.join(workspace, 'nested.txt');
    const result = await run('store("value", "stale"); await tools.barrier({});', () => {
      fs.writeFileSync(target, 'nested landed');
      loadCodemodeStore(sessionId, workspace).commit({ value: '"newer"' });
    });
    expect(result.success).toBe(false);
    expect(result.output ?? result.error).toContain('Completed nested tool effects were not rolled back.');
    expect(result.metadata?.nestedCalls).toMatchObject({ complete: true, calls: [{ name: 'barrier', status: 'ok' }] });
    expect(result.metadata?.codemodeStore).toMatchObject({ status: 'unchanged' });
    expect(fs.readFileSync(target, 'utf8')).toBe('nested landed');
    expect(loadCodemodeStore(sessionId, workspace).initial.value).toBe('"newer"');
  });
});
