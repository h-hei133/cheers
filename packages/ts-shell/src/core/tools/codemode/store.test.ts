import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../../../tools/types.js';
import { SessionManager } from '../../../session/SessionManager.js';
import type { BranchStoreTranscriptEntry } from '../../../session/branch/store/contract.js';
import { locateExistingSessionLayout, createSessionStoreLayout } from '../../../session/store/sessionFileLayout.js';
import { loadSessionRecord } from '../../../session/store/sessionStore.js';
import { switchDurableSessionActiveLeaf } from '../../../session/store/threadState.js';
import { appendTranscriptEvent, readTranscriptEvents, TranscriptAppendError } from '../../../session/transcript/sessionTranscript.js';
import { sessionModelCatalog } from '../../catalog/models.js';
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
  return createCodemodeToolDefinition(() => tools).execute({ code }, {
    workspaceRoot: workspace, sessionId: id, taskId: 'cm-store',
    executeNestedTool: (name, args, taskId) => tools.get(name)!.execute(args, { workspaceRoot: workspace, sessionId: id, taskId }),
  });
}
function switchLeaf(leafEntryId: string) {
  const files = layout();
  switchDurableSessionActiveLeaf({ session: loadSessionRecord({ sessionId, layout: files, cwd: workspace }), layout: files, leafEntryId });
}
function messageIds() { return readTranscriptEvents(layout().transcriptPath).filter(event => event.type === 'message').map(event => event.id!); }

function replayEvents() {
  return readTranscriptEvents(layout().transcriptPath)
    .filter((event): event is BranchStoreTranscriptEntry => event.type === 'branch-store' && event.namespace === 'codemode-replay');
}

const replayToolName = 'mcp__records__lookup';
function replayTool(description = 'Read fixture catalogue records'): ToolDefinition {
  return { name: replayToolName, description, argsSchema: { type: 'object' },
    execute: vi.fn(async () => ({ success: true, output: 'unexpected tool call' })) };
}

function runReplay(args: Record<string, unknown>, context: Partial<ToolExecutionContext> = {}, tool = replayTool()) {
  return createCodemodeToolDefinition(() => new Map([[tool.name, tool]])).execute(args, {
    workspaceRoot: workspace, sessionId, taskId: 'cm-replay', ...context,
  });
}

function recordedId(result: ToolExecutionResult): string {
  expect(result.success, result.error).toBe(true);
  expect(result.metadata?.codemodeReplay).toMatchObject({ status: 'recorded', id: expect.any(String) });
  return (result.metadata?.codemodeReplay as { id: string }).id;
}

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

  it('refuses a before-await lease after a written value changes away and back', async () => {
    loadCodemodeStore(sessionId, workspace).commit({ value: '"original"' });
    const result = await run('store("value", "stale"); await tools.barrier({});', () => {
      loadCodemodeStore(sessionId, workspace).commit({ value: '"intermediate"' });
      loadCodemodeStore(sessionId, workspace).commit({ value: '"original"' });
    });
    expect(result.success).toBe(false);
    expect(result.metadata?.codemodeStore).toMatchObject({ status: 'unchanged', reason: 'conflict' });
    expect(loadCodemodeStore(sessionId, workspace).initial.value).toBe('"original"');
    expect(storeEvents()).toHaveLength(3);
  });

  it('retains a deletion revision when a previously absent key is created and deleted during await', async () => {
    const result = await run('store("value", "stale"); await tools.barrier({});', () => {
      loadCodemodeStore(sessionId, workspace).commit({ value: '"intermediate"' });
      loadCodemodeStore(sessionId, workspace).commit({ value: null });
    });
    expect(result.success).toBe(false);
    expect(result.metadata?.codemodeStore).toMatchObject({ status: 'unchanged', reason: 'conflict' });
    expect(loadCodemodeStore(sessionId, workspace).initial.value).toBeUndefined();
    expect(storeEvents()).toHaveLength(2);
  });

  it('checks empty commits against the captured branch instead of reporting a retired lease as unchanged', () => {
    manager.addTurn(sessionId, { role: 'user', content: 'before lease' });
    const captured = loadCodemodeStore(sessionId, workspace);
    manager.addTurn(sessionId, { role: 'assistant', content: 'after lease' });
    const before = fs.readFileSync(layout().transcriptPath, 'utf8');
    expect(() => captured.commit({})).toThrow(expect.objectContaining({ reason: 'conflict', status: 'unchanged' }));
    expect(fs.readFileSync(layout().transcriptPath, 'utf8')).toBe(before);
  });

  it('checks admission for an empty successful worker result after await', async () => {
    const result = await run('await tools.barrier({}); return "state-free";', () => {
      manager.addTurn(sessionId, { role: 'user', content: 'replacement history' });
    });
    expect(result.success).toBe(false);
    expect(result.metadata?.codemodeStore).toMatchObject({ status: 'unchanged', reason: 'conflict' });
    expect(storeEvents()).toHaveLength(0);
  });

  it('does not bypass an explicit admission refusal on an empty commit', () => {
    const captured = loadCodemodeStore(sessionId, workspace);
    const before = fs.readFileSync(layout().transcriptPath, 'utf8');
    expect(() => captured.commit({}, () => { throw new Error('fixture-private-admission'); }))
      .toThrow(expect.objectContaining({ reason: 'lock-failed', status: 'unchanged' }));
    expect(fs.readFileSync(layout().transcriptPath, 'utf8')).toBe(before);
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

  it('preserves confirmed codemode persistence when lock release fails', async () => {
    const files = layout(); const remove = fs.rmSync;
    vi.spyOn(fs, 'rmSync').mockImplementation((...args: Parameters<typeof fs.rmSync>) => {
      if (args[0] === files.stateLockPath) throw new Error('fixture-private-lock-release'); return remove(...args);
    });
    syncBuiltinESMExports();
    const result = await run('store("value", "confirmed");');
    expect(result.success).toBe(false);
    expect(result.metadata?.codemodeStore).toMatchObject({ reason: 'lock-failed', status: 'persisted' });
    expect(JSON.stringify(result)).not.toContain('fixture-private-lock-release');
    vi.restoreAllMocks(); syncBuiltinESMExports(); fs.rmSync(files.stateLockPath);
    expect(loadCodemodeStore(sessionId, workspace).initial.value).toBe('"confirmed"');
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

describe('codemode deterministic recordings', () => {
  it('reopens ordered observations, a fixed clock, seeded randomness and saved script inputs', async () => {
    expect((await run('store("answer", 42);')).success).toBe(true);
    const code = [
      'const time = Date.now(); const random = Math.random();',
      'const [found, described, namespace] = await Promise.all([',
      '  searchTools("lookup"), describeTool("mcp__records__lookup"), describeNamespace("mcp__records"),',
      ']);',
      'text("recorded-fixture-source"); console.log(described);',
      'return { time, sameDate: Date() === new Date().toString() && time === new Date().getTime(),',
      '  random, distinctRandom: Math.random() !== random, answer: load("answer"),',
      '  found: found.map(tool => tool.name), namespace,',
      '  deterministicGlobals: [typeof Intl, typeof WeakRef, typeof SharedArrayBuffer],',
      '};',
    ].join('\n');
    const recorded = await runReplay({ code, record: true });
    const id = recordedId(recorded);
    expect(recorded.output).toContain('"sameDate": true');
    expect(recorded.output).toContain('"distinctRandom": true');
    expect(recorded.output).toContain('"answer": 42');
    expect(recorded.output).toContain(replayToolName);
    expect(recorded.output).toContain(`Replay ID ${id}`);
    expect(recorded.output).toMatch(/"deterministicGlobals": \[\s+"undefined",\s+"undefined",\s+"undefined"/);
    const [event] = replayEvents();
    const receipt = JSON.parse(event!.entries[id]!);
    expect(receipt.trace.observations.map(([sequence]: [number]) => sequence)).toEqual([1, 2, 3]);
    expect(JSON.stringify(event)).not.toMatch(/recorded-fixture-source|Read fixture catalogue records|mcp__records__lookup/);
    expect(loadCodemodeStore(sessionId, workspace).initial[id]).toBeUndefined();

    manager = new SessionManager();
    const before = fs.readFileSync(layout().transcriptPath);
    const replayed = await runReplay({ code, replay_id: id });
    expect(replayed.success, replayed.error).toBe(true);
    expect(replayed.metadata?.codemodeReplay).toEqual({ status: 'verified', id });
    expect(replayed.output).toBe(recorded.output);
    expect(fs.readFileSync(layout().transcriptPath)).toEqual(before);
  });

  it('refuses drift in the exact source, tool names, model metadata and initial store', async () => {
    const code = 'return "unaffected";';
    const id = recordedId(await runReplay({ code, record: true }));
    const changedCode = await runReplay({ code: code + '\n', replay_id: id });
    const changedTools = await runReplay({ code, replay_id: id }, { toolCatalog: new Map() });
    const changedModels = await runReplay({ code, replay_id: id }, {
      modelCatalog: sessionModelCatalog(workspace, sessionId, [{
        id: 'fixture', label: 'Fixture', runtime: 'openai', auth: 'none', models: [{ id: 'available' }],
      }]),
    });
    expect((await run('store("newer", 1);')).success).toBe(true);
    const changedStore = await runReplay({ code, replay_id: id });
    for (const result of [changedCode, changedTools, changedModels, changedStore]) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('source or inputs differ');
      expect(result.output).toBeUndefined();
    }
    expect(replayEvents()).toHaveLength(1);
  });

  it('rejects a changed catalogue reply even when the script does not use it', async () => {
    const code = `text("unverified"); await describeTool("${replayToolName}"); return true;`;
    const id = recordedId(await runReplay({ code, record: true }));
    const changed = await runReplay({ code, replay_id: id }, {}, replayTool('Modified fixture description'));
    expect(changed.success).toBe(false);
    expect(changed.error).toContain('catalogue observation differs');
    expect(changed.error).not.toContain('unverified');
    expect(changed.output).toBeUndefined();
    expect(replayEvents()).toHaveLength(1);
  });

  it.each(['delivery order', 'output'] as const)('rejects a recording with a mismatched %s', async mismatch => {
    const code = `await Promise.all([describeTool("${replayToolName}"), describeNamespace("mcp__records")]); return "same";`;
    const id = recordedId(await runReplay({ code, record: true }));
    const event = replayEvents()[0]!;
    const receipt = JSON.parse(event.entries[id]!);
    if (mismatch === 'delivery order') receipt.trace.observations.reverse();
    else receipt.trace.output = '0'.repeat(64);
    appendTranscriptEvent(layout().transcriptPath, {
      ...event, id: 'receipt-mismatch', entries: { [id]: JSON.stringify(receipt) },
    }, undefined, { requireExisting: true });
    const replayed = await runReplay({ code, replay_id: id });
    expect(replayed.success).toBe(false);
    expect(replayed.error).toContain(mismatch === 'delivery order' ? 'catalogue observation differs' : 'output differs');
  });

  it('keeps receipts on the saved session branch that recorded them', async () => {
    manager.addTurn(sessionId, { role: 'user', content: 'common ancestor' });
    const ancestor = messageIds()[0]!;
    manager.addTurn(sessionId, { role: 'assistant', content: 'original branch' });
    const original = messageIds()[1]!;
    const code = 'return "bound";';
    const id = recordedId(await runReplay({ code, record: true }));
    const forked = manager.fork(sessionId, workspace, { activate: false });
    expect((await runReplay({ code, replay_id: id }, { sessionId: forked.id })).success).toBe(false);
    switchLeaf(ancestor);
    manager.addTurn(sessionId, { role: 'assistant', content: 'sibling branch' });
    const sibling = await runReplay({ code, replay_id: id });
    expect(sibling.success).toBe(false);
    expect(sibling.error).toContain('unavailable on this session branch');
    switchLeaf(original);
    expect((await runReplay({ code, replay_id: id })).success).toBe(true);
  });

  it.each([
    `await tools.${replayToolName}({});`,
    'store("effect", true);',
    'await image("fixture");',
    'await models.generateImages(null, null);',
    'await models.classify(null, null);',
  ])('fails even when the script catches a refused operation (%s)', async attempt => {
    const tool = replayTool();
    const executeNestedTool = vi.fn(async () => ({ success: true }));
    const result = await runReplay({ code: `try { ${attempt} } catch {} return "caught";`, record: true }, { executeNestedTool }, tool);
    expect(result.success).toBe(false);
    expect(result.error).toContain('only allow read-only');
    expect(result.output).toBeUndefined();
    expect(replayEvents()).toHaveLength(0);
    expect(storeEvents()).toHaveLength(0);
    expect(tool.execute).not.toHaveBeenCalled();
    expect(executeNestedTool).not.toHaveBeenCalled();
  });

  it.each(['abort', 'retire'] as const)('refuses publication when an active observation causes %s', async reason => {
    const controller = new AbortController();
    let admitted = true;
    const tool = replayTool();
    const observe = vi.fn(() => {
      if (reason === 'abort') controller.abort();
      else admitted = false;
      return 'fixture changed admission';
    });
    Object.defineProperty(tool, 'description', { get: observe });
    const result = await runReplay({ code: `await describeTool("${replayToolName}"); return true;`, record: true }, {
      abortSignal: controller.signal, admission: () => admitted ? undefined : 'test turn ended',
    }, tool);
    expect(observe).toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain(reason === 'abort' ? 'Operation aborted' : 'conflict');
    expect(replayEvents()).toHaveLength(0);
  });

  it('requires an explicit mode and a saved session', async () => {
    const code = 'return true;';
    const regular = await runReplay({ code, record: false }, { sessionId: undefined });
    expect(regular.success).toBe(true);
    expect(regular.metadata?.codemodeReplay).toBeUndefined();
    const unsaved = await runReplay({ code, record: true }, { sessionId: undefined });
    expect(unsaved.success).toBe(false);
    expect(unsaved.error).toContain('saved session');
    const malformed = await runReplay({ code, replay_id: 'not-an-id' });
    expect(malformed.success).toBe(false);
    expect(malformed.error).toContain('valid script replay ID');
    const id = recordedId(await runReplay({ code, record: true }));
    const ambiguous = await runReplay({ code, record: true, replay_id: id });
    expect(ambiguous.success).toBe(false);
    expect(ambiguous.error).toContain('either record or replay_id');
    expect(replayEvents()).toHaveLength(1);
  });
});
