import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readLedgerText } from './record.js';
import { RecoveryReadControlError, RecoveryReadLimitError, recoveryReadBudget } from './read.js';
import { UNDO_PREVIEW_LIMITS } from './operation/limits.js';
import { inspectWorkspaceFile } from '../authority/state.js';
import { captureRecoveryAuthorityRecord, readRecoveryAuthorityRecord } from './recoveryAuthorityStore.js';
import { prepareRecoveryRestore } from './restorePrimitive.js';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-read-')); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

function watchHandle(onRead?: (handle: fsp.FileHandle) => void) {
  const original = fsp.open;
  const handles: { read: ReturnType<typeof vi.spyOn>; close: ReturnType<typeof vi.spyOn> }[] = [];
  vi.spyOn(fsp, 'open').mockImplementation(async (...args: Parameters<typeof fsp.open>) => {
    const handle = await Reflect.apply(original, fsp, args);
    const read = handle.read.bind(handle);
    const watched = { read: vi.spyOn(handle, 'read').mockImplementation(async (...args: Parameters<typeof handle.read>) => {
      const result = await Reflect.apply(read, handle, args);
      onRead?.(handle);
      return result;
    }), close: vi.spyOn(handle, 'close') };
    vi.spyOn(handle, 'readFile').mockImplementation(async () => { throw new Error('Unbounded body reading is forbidden.'); });
    handles.push(watched);
    return handle;
  });
  return handles;
}

it('charges the exact preview byte tier and never refunds failed acquisitions', () => {
  const budget = recoveryReadBudget(UNDO_PREVIEW_LIMITS.totalBytes);
  budget.admit(UNDO_PREVIEW_LIMITS.totalBytes - 1); budget.admit(1);
  expect(budget.remaining()).toBe(0);
  expect(() => budget.admit(1)).toThrow(RecoveryReadLimitError);
  for (const bytes of [-1, NaN, Infinity, 0.5]) expect(() => budget.admit(bytes)).toThrow(RecoveryReadLimitError);
  budget.admit(0);
});

it('checks an aborted budget without acquiring another source', () => {
  const controller = new AbortController();
  const budget = recoveryReadBudget(1, controller.signal); controller.abort();
  expect(() => budget.check()).toThrow();
  expect(budget.remaining()).toBe(1);
});

it('charges metadata before allocation and refuses the next body without reading it', async () => {
  fs.writeFileSync(path.join(root, 'first'), '😀');
  fs.writeFileSync(path.join(root, 'second'), 'x');
  const handles = watchHandle();
  const budget = recoveryReadBudget(4);
  expect(await readLedgerText(root, 'first', 128 * 1024, budget)).toBe('😀');
  await expect(readLedgerText(root, 'second', 128 * 1024, budget)).rejects.toThrow(RecoveryReadLimitError);
  expect(handles[1]!.read).not.toHaveBeenCalled();
  for (const handle of handles) expect(handle.close).toHaveBeenCalledOnce();
});

it.each(['cancel', 'admission'])('stops after a single bounded chunk when %s changes and closes its descriptor', async kind => {
  fs.writeFileSync(path.join(root, 'body'), 'x'.repeat(256 * 1024));
  const controller = new AbortController();
  let blocked: string | undefined;
  const handles = watchHandle(() => { if (kind === 'cancel') controller.abort(); else blocked = 'Grant revoked'; });
  const budget = recoveryReadBudget(1024 * 1024, controller.signal, () => blocked);
  await expect(readLedgerText(root, 'body', 1024 * 1024, budget)).rejects.toThrow();
  expect(handles[0]!.read).toHaveBeenCalledOnce();
  expect(handles[0]!.read.mock.calls[0]![2]).toBe(64 * 1024);
  expect(handles[0]!.close).toHaveBeenCalledOnce();
  expect(budget.remaining()).toBe(768 * 1024);
});

it('rejects a growing source after reading only its admitted original body', async () => {
  const target = path.join(root, 'body');
  fs.writeFileSync(target, 'x'.repeat(64 * 1024));
  const handles = watchHandle(() => fs.appendFileSync(target, 'y'.repeat(256 * 1024)));
  await expect(readLedgerText(root, 'body', 128 * 1024)).rejects.toThrow('changed');
  expect(handles[0]!.read).toHaveBeenCalledOnce();
  expect(handles[0]!.close).toHaveBeenCalledOnce();
  expect(fs.statSync(target).size).toBe(320 * 1024);
});

it('rejects a replaced source inode even when the previous descriptor still has valid text', async () => {
  const target = path.join(root, 'body'); fs.writeFileSync(target, 'old');
  const handles = watchHandle(() => { fs.renameSync(target, target + '-old'); fs.writeFileSync(target, 'new'); });
  await expect(readLedgerText(root, 'body')).rejects.toThrow('changed');
  expect(handles[0]!.close).toHaveBeenCalledOnce();
  expect(fs.readFileSync(target, 'utf8')).toBe('new');
});

it('charges an invalid UTF-8 read and refuses later acquisitions instead of resetting the budget', async () => {
  fs.writeFileSync(path.join(root, 'invalid'), Buffer.from([0xff]));
  fs.writeFileSync(path.join(root, 'next'), 'x');
  const budget = recoveryReadBudget(1);
  await expect(readLedgerText(root, 'invalid', 128 * 1024, budget)).rejects.toThrow();
  expect(budget.remaining()).toBe(0);
  await expect(readLedgerText(root, 'next', 128 * 1024, budget)).rejects.toThrow(RecoveryReadLimitError);
});

it('reads only the admitted current-file bytes when it grows after admission', () => {
  const target = path.join(root, 'current'); fs.writeFileSync(target, 'old');
  const budget = recoveryReadBudget(3);
  const original = fs.readSync;
  let readBytes = 0;
  vi.spyOn(fs, 'readSync').mockImplementation((...args: Parameters<typeof fs.readSync>) => {
    const count = Reflect.apply(original, fs, args); readBytes += count; return count;
  });
  expect(() => inspectWorkspaceFile(root, 'current', undefined, 64 * 1024 * 1024, bytes => {
    budget.admit(bytes); fs.appendFileSync(target, 'x'.repeat(1024 * 1024));
  })).toThrow('changed');
  expect(readBytes).toBe(3);
  expect(budget.remaining()).toBe(0);
});

it('propagates a one-shot metadata admission failure without mapping it to missing records', async () => {
  let calls = 0;
  await expect(readRecoveryAuthorityRecord({ ledgerRoot: root, authorityId: 'authority', recordId: 'record', readAccess: {
    check: () => { if (++calls === 1) throw new Error('One-shot admission refusal'); },
  } })).rejects.toThrow(RecoveryReadControlError);
  expect(calls).toBe(1);
});

it('preserves cancellation supplied only through readAccess after the first blob chunk', async () => {
  const captured = await captureRecoveryAuthorityRecord({ mode: 'non-default', ledgerRoot: root, authorityId: 'authority', recordId: 'record',
    workspaceRelativePath: 'current', operationKind: 'update', beforeState: 'exists', beforeContent: 'x'.repeat(128 * 1024),
    expectedCurrentState: 'absent' });
  expect(captured.status).toBe('captured');
  const controller = new AbortController(); const reason = new Error('Specific readAccess cancellation');
  const handles = watchHandle(handle => {
    if (process.platform !== 'linux' || fs.realpathSync(`/proc/self/fd/${handle.fd}`).includes('/blobs/')) controller.abort(reason);
  });
  await expect(prepareRecoveryRestore({ ledgerRoot: root, authorityId: 'authority', recordId: 'record', workspaceRoot: root,
    workspaceRelativePath: 'current', readAccess: { signal: controller.signal } })).rejects.toBe(reason);
  expect(handles.every(handle => handle.close.mock.calls.length === 1)).toBe(true);
});
