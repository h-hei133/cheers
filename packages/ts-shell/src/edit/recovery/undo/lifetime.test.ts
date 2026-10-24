import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { allocateOperation, captureOperationScope, operationLedgerRoot, withOperationStore } from '../operation/store.js';
import { hashContent } from '../../authority/content.js';
import { applyPatchPlan } from '../../patch/batch.js';
import { planPatch } from '../../patch/plan.js';
import { OverlayHost } from '../../../cli/interactive/overlay.js';
import { undoPicker } from '../../../cli/interactive/picker/undo.js';
import { undoHistoryPicker } from '../../../cli/interactive/picker/undo/history.js';
import { bindUndoHost } from '../../../cli/interactive/picker/undo/state.js';
import { Pager } from '../../../presentation/tui/chrome/pager.js';
import { reportText } from '../../../core/commands/report/projection.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';
import { visibleWidth } from '../../../presentation/tui/text/measure.js';

let root: string | undefined;
afterEach(() => {
  vi.restoreAllMocks();
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function workspace() {
  const scratch = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(scratch, { recursive: true });
  root = fs.mkdtempSync(path.join(scratch, 'undo-lifetime-'));
  return root;
}

function savedBytes(directory: string): Map<string, Buffer> {
  return new Map(fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? [...savedBytes(target)] : [[target, fs.readFileSync(target)] as const];
  }));
}

it('accounts for complete receipt scans separately from retained pages and repeated host lifetimes', async () => {
  const cwd = workspace(), context = { cwd, sessionId: 'lifetime-session' };
  fs.writeFileSync(path.join(cwd, 'note.txt'), 'unchanged workspace\n');
  const scope = captureOperationScope({ sessionId: context.sessionId, workspaceRoot: cwd });
  withOperationStore(scope, () => {
    for (let index = 0; index < 41; index++) {
      const operationId = `operation-${index}`;
      allocateOperation({ ...scope, schemaVersion: 1, operationId, callId: 'lifetime-fixture', revision: 1,
        status: 'committed', undo: 'none', createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z',
        files: [{ id: 'file', workspace: scope.workspace, path: 'note.txt', kind: 'update',
          before: { state: 'exists', hash: hashContent('before') }, after: { state: 'exists', hash: hashContent('after') },
          snapshot: { authorityId: operationId, recordId: 'file' }, status: 'committed', undo: 'none' }] });
    }
  });
  const before = savedBytes(cwd), ledger = operationLedgerRoot(scope);
  const sources = [...before].filter(([target]) => target.startsWith(ledger + path.sep) && target.endsWith('.json'));
  expect(sources).toHaveLength(42);
  const identities = new Map(sources.map(([target]) => {
    const stat = fs.statSync(target); return [`${stat.dev}:${stat.ino}`, target];
  }));
  const bytes = new Map<string, number>(), read = fs.readSync;
  const opened = new Set<number>(), open = fs.openSync, close = fs.closeSync;
  vi.spyOn(fs, 'openSync').mockImplementation(((...args: Parameters<typeof fs.openSync>) => {
    const fd = Reflect.apply(open, fs, args); opened.add(fd); return fd;
  }) as typeof fs.openSync);
  vi.spyOn(fs, 'closeSync').mockImplementation(fd => { close(fd); opened.delete(fd); });
  vi.spyOn(fs, 'readSync').mockImplementation((...args: Parameters<typeof fs.readSync>) => {
    const stat = fs.fstatSync(args[0]), target = identities.get(`${stat.dev}:${stat.ino}`);
    const count = Reflect.apply(read, fs, args);
    if (target) bytes.set(target, (bytes.get(target) ?? 0) + count);
    return count;
  });
  let scans = 0;
  const assertScans = () => {
    for (const [target, content] of sources) expect(bytes.get(target)).toBe(content.length * scans);
    expect(opened.size).toBe(0);
  };
  const host = bindUndoHost({ context: () => context });
  for (let browse = 0; browse < 10; browse++) {
    const overlay = new OverlayHost(() => {});
    let picker = undoHistoryPicker(host);
    try {
      for (let index = 0; index < 2; index++) {
        const load = vi.spyOn(picker, 'load'); overlay.open(picker);
        const rows = await load.mock.results[0]!.value; scans++; assertScans();
        expect(rows).toHaveLength(index === 0 ? 41 : 1);
        expect(rows[0]?.id).toBe(index === 0 ? 'operation-40' : 'operation-0');
        await vi.waitFor(() => expect(Reflect.get(overlay, 'baseOptions')).toHaveLength(index === 0 ? 41 : 1));
        for (const width of [20, 40, 80, 120, 200]) for (const height of [8, 24, 40, 80]) {
          const drawing = overlay.render(width, height);
          expect(drawing.length).toBeLessThanOrEqual(height);
          expect(drawing.every(row => visibleWidth(row) <= width)).toBe(true);
        }
        assertScans(); expect(Reflect.get(overlay, 'baseOptions')).toHaveLength(index === 0 ? 41 : 1);
        const outcome = await picker.apply([index === 0 ? 'more:results' : 'operation-0']);
        scans++; assertScans();
        overlay.close();
        expect(Reflect.get(overlay, 'baseOptions')).toEqual([]);
        expect(Reflect.get(overlay, 'model').total).toBe(0);
        expect(Reflect.get(overlay, 'optionRows').size).toBe(0);
        expect(await picker.apply(['operation-0'])).toBeUndefined();
        await expect(picker.load()).rejects.toThrow('closed');
        assertScans();
        if (index === 0) picker = outcome!.next!;
        else {
          expect(outcome!.report!.facts.count).toBe(1);
          const pager = new Pager(); pager.open('Saved result', reportText(outcome!.report!), outcome!.report);
          pager.render(80, 24); pager.close();
          expect(pager.text).toBe(''); expect(Reflect.get(pager, 'report')).toBeUndefined(); assertScans();
        }
      }
    } finally { overlay.close(); }
  }
  expect(scans).toBe(40);
  expect(savedBytes(cwd)).toEqual(before);
});

it.each([32, 128 * 1024])('keeps actual patch preview rendering and cancel read-only across reopen (%i source units)', async units => {
  const cwd = workspace(), target = path.join(cwd, 'note.txt');
  fs.writeFileSync(target, `${'x'.repeat(units)}\nold\n`);
  const identity = { sessionId: 'preview-session', workspaceRoot: cwd, callId: 'preview-fixture' };
  await applyPatchPlan(planPatch('*** Begin Patch\n*** Update File: note.txt\n@@\n-old\n+new\n*** End Patch', identity), identity);
  const before = savedBytes(cwd), publish = vi.fn();
  const read = vi.spyOn(fs, 'readSync'), open = vi.spyOn(fs.promises, 'open');
  for (let browse = 0; browse < 10; browse++) {
    const picker = undoPicker({ context: () => ({ cwd, sessionId: identity.sessionId }), publish });
    const overlay = new OverlayHost(() => {}), load = vi.spyOn(picker, 'load'); overlay.open(picker);
    const pager = new Pager();
    try {
      expect((await load.mock.results[0]!.value).map(row => row.id)).toContain('review');
      const outcome = (await picker.apply(['review']))!; overlay.close();
      expect(outcome.report!.facts.status).toBe('preview');
      const confirmation = outcome.next!, confirmLoad = vi.spyOn(confirmation, 'load'); overlay.open(confirmation);
      await confirmLoad.mock.results[0]!.value;
      expect(confirmation.initialSelection).toBe('cancel');
      const syncReads = read.mock.calls.length, asyncOpens = open.mock.calls.length;
      pager.open('Undo preview', reportText(outcome.report!), outcome.report);
      for (const width of [20, 40, 80, 120, 200]) for (const height of [8, 24, 40, 80]) {
        for (const drawing of [pager.render(width, height), overlay.render(width, height)]) {
          expect(drawing.length).toBeLessThanOrEqual(height);
          expect(drawing.every(row => visibleWidth(row) <= width)).toBe(true);
        }
      }
      pager.close(); expect(pager.text).toBe(''); expect(Reflect.get(pager, 'report')).toBeUndefined();
      overlay.handleKey(parseKeyEvent('\x1b'), vi.fn());
      expect(await confirmation.apply(['restore'])).toBeUndefined();
      await expect(confirmation.load()).rejects.toThrow('closed');
      expect(read).toHaveBeenCalledTimes(syncReads); expect(open).toHaveBeenCalledTimes(asyncOpens);
    } finally { pager.close(); overlay.close(); }
  }
  expect(publish).not.toHaveBeenCalled();
  expect(savedBytes(cwd)).toEqual(before);
});
