import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CommandContext } from '../../../core/commands/types.js';
import { undoPicker } from '../../../cli/interactive/picker/undo.js';
import { OverlayHost } from '../../../cli/interactive/overlay.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';
import { allocateOperation, captureOperationScope, operationLedgerRoot, persistOperation, readOperations, withOperationStore } from '../operation/store.js';
import { hashContent } from '../../authority/content.js';
import { runUndoCommand } from './command.js';
import { readUndoHistoryPage, readUndoHistoryPageAsync } from './service.js';

let directory: string;
let context: CommandContext;
beforeEach(() => {
  const scratch = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(scratch, { recursive: true });
  directory = fs.mkdtempSync(path.join(scratch, 'undo-history-'));
  fs.writeFileSync(path.join(directory, 'note.txt'), 'workspace stays unchanged\n');
  context = { cwd: directory, sessionId: 'history-session' };
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(directory, { recursive: true, force: true }); });

function seed(count: number, sessionId = context.sessionId!) {
  const scope = captureOperationScope({ sessionId, workspaceRoot: directory });
  withOperationStore(scope, () => {
    for (let index = 0; index < count; index++) {
      const operationId = `operation-${index}`;
      allocateOperation({ ...scope, schemaVersion: 1, operationId, callId: 'history-fixture', revision: 1,
        status: index === count - 1 ? 'unknown' : 'committed', undo: 'none',
        createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
        files: [{ id: 'file', workspace: scope.workspace, path: 'note.txt', kind: 'update',
          before: { state: 'exists', hash: hashContent('before') }, after: { state: 'exists', hash: hashContent('after') },
          snapshot: { authorityId: operationId, recordId: 'file' }, status: 'committed', undo: 'none' }] });
    }
  });
}

function bytes(root = directory): Record<string, string> {
  return Object.fromEntries(fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? Object.entries(bytes(target)) : [[target, fs.readFileSync(target).toString('hex')]];
  }));
}

async function picker() {
  const root = undoPicker({ context: () => context });
  await root.load();
  return (await root.apply(['history']))!.next!;
}

function receiptPath(id: string): string {
  const scope = captureOperationScope({ sessionId: context.sessionId!, workspaceRoot: directory });
  const store = path.join(operationLedgerRoot(scope), 'operations');
  return path.join(store, fs.readdirSync(store)[0]!, `${id}.json`);
}

it('hashes a yielded receipt before acquiring the next receipt body', () => {
  seed(3);
  const older = receiptPath('operation-0');
  const stringify = JSON.stringify;
  let changed = false;
  vi.spyOn(JSON, 'stringify').mockImplementation((value, ...args) => {
    if (!changed && value?.operationId === 'operation-2' && Array.isArray(value.files)) {
      changed = true;
      fs.writeFileSync(older, '{}');
    }
    return stringify(value, ...args);
  });
  expect(() => readUndoHistoryPage(context)).toThrow('invalid');
  expect(changed).toBe(true);
});

it('refuses an invalid tail even after filling the first display page', () => {
  seed(41);
  fs.writeFileSync(receiptPath('operation-0'), '{}');
  expect(() => readUndoHistoryPage(context)).toThrow('invalid');
});

it('makes all saved receipts reachable through three bounded read-only command and picker pages', async () => {
  seed(85);
  seed(2, 'foreign-session');
  const before = bytes();
  const expected = Array.from({ length: 85 }, (_, index) => `operation-${84 - index}`);
  const commandIds: string[] = [];
  let args = ['status'];
  for (let index = 0; index < 3; index++) {
    const result = await runUndoCommand(args, context);
    const facts = result.report!.facts;
    expect(facts.total).toBe(85);
    expect(facts.count).toBe(index === 2 ? 5 : 40);
    commandIds.push(...(facts.operations as { operationId: string }[]).map(receipt => receipt.operationId));
    if (index < 2) {
      expect(result.output).toContain(`/undo status --cursor=${facts.nextCursor}`);
      args = ['status', `--cursor=${facts.nextCursor}`];
    } else {
      expect(facts.nextCursor).toBeNull();
      expect(result.output).toContain('End of saved operation results.');
    }
  }
  expect(commandIds).toEqual(expected);
  const pickerIds: string[] = [];
  let page = await picker();
  for (let index = 0; index < 3; index++) {
    const options = await page.load();
    expect(options).toHaveLength(index === 2 ? 5 : 41);
    pickerIds.push(...options.filter(option => option.id !== 'more:results').map(option => option.id));
    expect(await page.apply(['not-offered'])).toBeUndefined();
    expect(await page.apply(['operation-0', 'operation-1'])).toBeUndefined();
    if (index < 2) page = (await page.apply(['more:results']))!.next!;
    else {
      expect(await page.apply(['more:results'])).toBeUndefined();
      expect((await page.apply(['operation-0']))!.report!.facts.count).toBe(1);
    }
  }
  expect(pickerIds).toEqual(expected);
  expect(bytes()).toEqual(before);
});

it('rejects changed receipts and foreign scopes without moving the saved-results cursor', async () => {
  seed(41);
  const first = readUndoHistoryPage(context)!;
  const page = await picker();
  await page.load();
  const next = (await page.apply(['more:results']))!.next!;
  expect(await page.apply(['operation-40'])).toBeUndefined();
  await expect(page.load()).rejects.toThrow('closed');
  const active = await picker(); await active.load();
  const scope = captureOperationScope({ sessionId: context.sessionId!, workspaceRoot: directory });
  const newest = readOperations(scope)[0]!;
  withOperationStore(scope, () => persistOperation({ ...newest, revision: newest.revision + 1, undo: 'unknown' }));
  const before = bytes();
  expect(readUndoHistoryPage(context, first.nextCursor)).toBeUndefined();
  expect((await runUndoCommand(['status', `--cursor=${first.nextCursor}`], context)).report!.facts.status).toBe('stale');
  expect((await active.apply(['operation-40']))!.report!.facts.status).toBe('stale');
  await expect(next.load()).rejects.toThrow('changed');
  context = { ...context, sessionId: 'another-session' };
  expect(await active.apply(['more:results'])).toBeUndefined();
  expect((await runUndoCommand(['status', `--cursor=${first.nextCursor}`], context)).report!.facts.status).toBe('stale');
  expect(bytes()).toEqual(before);
});

it('keeps exact-ID lookup beyond the first page and reports missing identities as empty', async () => {
  seed(41);
  const before = bytes();
  const selected = await runUndoCommand(['status', 'operation-0'], context);
  expect(selected.report!.facts.operations).toEqual([{ operationId: 'operation-0', status: 'committed', undo: 'none' }]);
  expect((await runUndoCommand(['status', 'missing'], context)).report!.facts.status).toBe('empty');
  expect(bytes()).toEqual(before);
});

it('rejects invalid or conflicting cursors before accessing the current context', async () => {
  const guarded = new Proxy({} as CommandContext, { get() { throw new Error('Context must not be read'); } });
  const valid = `${'a'.repeat(64)}:operation-0`;
  for (const args of [['status', '--cursor=invalid'], ['status', `--cursor=${'a'.repeat(64)}:../escape`],
    ['status', 'operation-0', `--cursor=${valid}`], ['preview', `--cursor=${valid}`],
    ['status', `--cursor=${valid}`, `--cursor=${valid}`]]) {
    expect((await runUndoCommand(args, guarded)).output).toContain('Invalid /undo arguments:');
  }
});

it('closes the real history overlay on cancellation and preserves workspace and receipt bytes', async () => {
  seed(41);
  const before = bytes();
  const page = await picker();
  const overlay = new OverlayHost(() => {});
  overlay.open(page);
  await vi.waitFor(() => expect(stripAnsi(overlay.render(100, 28).join('\n'))).toContain('Operations 1-40 of 41'));
  const selected = vi.fn();
  overlay.handleKey(parseKeyEvent('\x1b'), selected);
  expect(overlay.active).toBe(false);
  expect(selected).not.toHaveBeenCalled();
  expect(await page.apply(['operation-40'])).toBeUndefined();
  await expect(page.load()).rejects.toThrow('closed');
  expect(bytes()).toEqual(before);
});

it.each(['session', 'admission'])('binds history to the original opening after %s changes', async kind => {
  seed(41);
  let blocked: string | undefined;
  context = { ...context, admission: () => blocked };
  const page = await picker(); await page.load();
  const before = bytes();
  if (kind === 'session') context = { ...context, sessionId: 'other' };
  else { blocked = 'Opening permission revoked'; context = { ...context, admission: () => undefined }; }
  expect(page.isCurrent!()).toBe(kind !== 'session');
  expect((await page.apply(['operation-40']))!.report!.facts.status).toBe('blocked');
  expect(await page.apply(['more:results'])).toBeUndefined();
  expect(bytes()).toEqual(before);
});

it('does not acquire or retain cancelled history pages', async () => {
  seed(41);
  const page = await picker();
  const read = vi.spyOn(fs, 'readSync');
  page.previewEnd!();
  await expect(page.load()).rejects.toThrow('closed');
  expect(read).not.toHaveBeenCalled();
  const fresh = await picker();
  const controller = new AbortController(); controller.abort();
  read.mockClear();
  await expect(fresh.load(controller.signal)).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
});

it('processes real overlay cancellation between receipt reads without publishing a history page', async () => {
  seed(3);
  const before = bytes(), page = await picker();
  const unacquired = fs.statSync(receiptPath('operation-1')), read = fs.readSync;
  let unacquiredBytes = 0;
  vi.spyOn(fs, 'readSync').mockImplementation((...args: Parameters<typeof fs.readSync>) => {
    const stat = fs.fstatSync(args[0]), count = Reflect.apply(read, fs, args);
    if (stat.dev === unacquired.dev && stat.ino === unacquired.ino) unacquiredBytes += count;
    return count;
  });
  const overlay = new OverlayHost(() => {}), loading = vi.spyOn(page, 'load');
  const stringify = JSON.stringify, hashed: string[] = [];
  vi.spyOn(JSON, 'stringify').mockImplementation((value, ...args) => {
    if (typeof value?.operationId === 'string' && Array.isArray(value.files)) {
      hashed.push(value.operationId);
      if (hashed.length === 1) setImmediate(() => overlay.close());
    }
    return stringify(value, ...args);
  });
  overlay.open(page);
  const pending = loading.mock.results[0]!.value as ReturnType<typeof page.load>;
  try {
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(hashed).toEqual(['operation-2']);
    expect(unacquiredBytes).toBe(0);
    expect(overlay.render(100, 28)).toEqual([]);
    expect(await page.apply(['operation-2'])).toBeUndefined();
    expect(bytes()).toEqual(before);
  } finally { overlay.close(); await pending.catch(() => {}); await new Promise<void>(resolve => setImmediate(resolve)); }
});

it.each(['receipt', 'index', 'inventory'] as const)('rejects a changed %s between acquisition batches', async kind => {
  seed(3);
  const page = await picker(), target = receiptPath('operation-2');
  const stringify = JSON.stringify;
  let changed = false;
  vi.spyOn(JSON, 'stringify').mockImplementation((value, ...args) => {
    if (!changed && value?.operationId === 'operation-2' && Array.isArray(value.files)) {
      changed = true;
      setImmediate(() => {
        if (kind === 'inventory') fs.writeFileSync(path.join(path.dirname(target), 'unindexed.json'), '{}');
        else fs.appendFileSync(kind === 'receipt' ? target : path.join(path.dirname(target), 'index.json'), '\n');
      });
    }
    return stringify(value, ...args);
  });
  try {
    await expect(page.load()).rejects.toThrow('changed');
    expect(changed).toBe(true);
    expect(await page.apply(['operation-2'])).toBeUndefined();
  } finally { page.previewEnd?.(); await new Promise<void>(resolve => setImmediate(resolve)); }
});

it('keeps the async saved-results page and cursor identical to the synchronous command view', async () => {
  seed(41);
  const before = bytes();
  const first = readUndoHistoryPage(context)!;
  expect(await readUndoHistoryPageAsync(context)).toEqual(first);
  expect(await readUndoHistoryPageAsync(context, first.nextCursor)).toEqual(readUndoHistoryPage(context, first.nextCursor));
  expect(bytes()).toEqual(before);
});

it('keeps a superseded async load from closing the newer healthy history page', async () => {
  seed(3);
  const page = await picker();
  const first = page.load(), replaced = expect(first).rejects.toThrow('replaced');
  const second = page.load();
  try {
    await replaced;
    await expect(second).resolves.toHaveLength(3);
    expect((await page.apply(['operation-2']))?.report?.facts.count).toBe(1);
  } finally { page.previewEnd?.(); await Promise.allSettled([first, second]); }
});

it('rechecks the opening admission before acquiring another receipt after a yielded batch', async () => {
  seed(3);
  let blocked: string | undefined;
  context = { ...context, admission: () => blocked };
  const page = await picker(), before = bytes(), stringify = JSON.stringify;
  const hashed: string[] = [];
  vi.spyOn(JSON, 'stringify').mockImplementation((value, ...args) => {
    if (typeof value?.operationId === 'string' && Array.isArray(value.files)) {
      hashed.push(value.operationId);
      if (hashed.length === 1) setImmediate(() => { blocked = 'History admission revoked'; });
    }
    return stringify(value, ...args);
  });
  try {
    await expect(page.load()).rejects.toThrow('changed');
    expect(hashed).toEqual(['operation-2']);
    expect(await page.apply(['operation-2'])).toBeUndefined();
    expect(bytes()).toEqual(before);
  } finally { page.previewEnd?.(); }
});

it('names the turn each operation came from, when the writer recorded one', async () => {
  // Two edits from one prompt share a correlation id. Undo is still per
  // operation, but a reader has to be able to see which operations belong to
  // the same turn before deciding which one to restore.
  const scope = captureOperationScope({ sessionId: context.sessionId!, workspaceRoot: directory });
  withOperationStore(scope, () => {
    allocateOperation({ ...scope, schemaVersion: 1, operationId: 'turn-a', callId: 'call-1', correlationId: 'prompt-1',
      revision: 1, status: 'committed', undo: 'none', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
      files: [{ id: 'file', workspace: scope.workspace, path: 'note.txt', kind: 'update',
        before: { state: 'exists', hash: hashContent('before') }, after: { state: 'exists', hash: hashContent('after') },
        snapshot: { authorityId: 'turn-a', recordId: 'file' }, status: 'committed', undo: 'none' }] });
  });

  const result = await runUndoCommand(['status'], context);
  expect(result.output).toContain('Turn: prompt-1');
  expect((result.report!.facts.operations as { turn?: string }[])[0]?.turn).toBe('prompt-1');
});

it('says nothing about a turn when the writer recorded none', async () => {
  seed(1);

  const result = await runUndoCommand(['status'], context);
  expect(result.output).not.toContain('Turn:');
});

it('lists exactly the operations one turn recorded', async () => {
  // Two prompts, three edits. Selecting by turn must not include the other
  // turn's edit, and must not include receipts that recorded no turn at all.
  const scope = captureOperationScope({ sessionId: context.sessionId!, workspaceRoot: directory });
  const seedOne = (operationId: string, correlationId: string | undefined) => withOperationStore(scope, () => {
    allocateOperation({ ...scope, schemaVersion: 1, operationId, callId: `call-${operationId}`,
      ...(correlationId ? { correlationId } : {}), revision: 1, status: 'committed', undo: 'none',
      createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
      files: [{ id: 'file', workspace: scope.workspace, path: 'note.txt', kind: 'update',
        before: { state: 'exists', hash: hashContent('before') }, after: { state: 'exists', hash: hashContent('after') },
        snapshot: { authorityId: operationId, recordId: 'file' }, status: 'committed', undo: 'none' }] });
  });
  seedOne('turn-1-a', 'prompt-1');
  seedOne('turn-1-b', 'prompt-1');
  seedOne('turn-2-a', 'prompt-2');
  seedOne('no-turn', undefined);

  const listed = await runUndoCommand(['status', '--turn', 'prompt-1'], context);
  expect(listed.output).toContain('turn-1-a');
  expect(listed.output).toContain('turn-1-b');
  expect(listed.output).not.toContain('turn-2-a');
  expect(listed.output).not.toContain('no-turn');
});

it('says so when a turn recorded nothing', async () => {
  seed(1);

  const result = await runUndoCommand(['status', '--turn', 'missing-turn'], context);
  expect(result.output).toContain('No recorded operation belongs to turn');
});

it('restores a whole turn through the command surface, newest first', async () => {
  const scope = captureOperationScope({ sessionId: context.sessionId!, workspaceRoot: directory });
  const seedTurn = (operationId: string) => withOperationStore(scope, () => {
    allocateOperation({ ...scope, schemaVersion: 1, operationId, callId: `call-${operationId}`, correlationId: 'prompt-x',
      revision: 1, status: 'committed', undo: 'none', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
      files: [{ id: 'file', workspace: scope.workspace, path: 'note.txt', kind: 'update',
        before: { state: 'exists', hash: hashContent('before') }, after: { state: 'exists', hash: hashContent('after') },
        snapshot: { authorityId: operationId, recordId: 'file' }, status: 'committed', undo: 'none' }] });
  });
  seedTurn('turn-a');
  seedTurn('turn-b');

  const result = await runUndoCommand(['restore-turn', 'prompt-x', '--execute'], context);

  // The snapshot blobs are absent in this fixture, so every step is expected to
  // stop — what is asserted is that the command reached the turn path and
  // reported honestly rather than claiming a restore.
  expect(result.output).toContain('Turn: prompt-x');
  expect(result.output).not.toContain('Every operation of this turn was restored');
});

it('requires confirmation before restoring a turn', async () => {
  const result = await runUndoCommand(['restore-turn', 'prompt-x'], context);

  expect(result.output).toContain('Explicit --execute confirmation is required');
});
