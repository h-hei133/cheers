import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { captureRecoveryAuthorityRecord } from '../../../../edit/recovery/recoveryAuthorityStore.js';
import { snapshotRoot } from '../../../../edit/recovery/root.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { visibleWidth } from '../../../../presentation/tui/text/measure.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';
import { OverlayHost } from '../../overlay.js';
import { restorePicker } from '../restore.js';

let root: string | undefined;
afterEach(() => {
  vi.restoreAllMocks();
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
});

it.each([32, 96 * 1024])('bounds actual snapshot page/search/draw/close lifetimes (%i metadata padding)', async padding => {
  const scratch = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(scratch, { recursive: true });
  root = fs.mkdtempSync(path.join(scratch, 'restore-lifetime-'));
  const ledgerRoot = snapshotRoot(root), authorityId = 'lifetime-edit';
  for (let index = 0; index < 101; index++) {
    const result = await captureRecoveryAuthorityRecord({ mode: 'non-default', ledgerRoot, authorityId,
      recordId: `record-${String(index).padStart(3, '0')}`, workspaceRelativePath: `note-${index}.txt`,
      operationKind: 'update', beforeState: 'exists', beforeContent: 'before\n',
      expectedCurrentState: 'exists', expectedCurrentContent: 'after\n', createdAt: '2026-10-24T00:00:00.000Z' });
    expect(result.status).toBe('captured');
  }
  const folder = path.join(ledgerRoot, authorityId, 'records');
  const padded = path.join(folder, 'record-100.json');
  fs.writeFileSync(padded, JSON.stringify({ ...JSON.parse(fs.readFileSync(padded, 'utf8')), padding: 'x'.repeat(padding) }));
  const targets = fs.readdirSync(folder).sort().map(name => path.join(folder, name));
  const before = targets.map(target => fs.readFileSync(target));
  const blob = path.join(ledgerRoot, authorityId, JSON.parse(before[0]!.toString()).beforeContentRef);
  const blobBefore = fs.readFileSync(blob);
  const sourceBytes = before.reduce((sum, bytes) => sum + bytes.length, 0), tailBytes = fs.statSync(padded).size;
  const open = fs.promises.open.bind(fs.promises), opendir = fs.promises.opendir.bind(fs.promises);
  const directories: fs.Dir[] = [];
  const counts = { opened: 0, closed: 0, active: 0, peak: 0, bytes: 0, chunk: 0 };
  vi.spyOn(fs.promises, 'opendir').mockImplementation((async (...args) => {
    const dir = await opendir(...args); directories.push(dir); return dir;
  }) as typeof fs.promises.opendir);
  vi.spyOn(fs.promises, 'open').mockImplementation((async (...args) => {
    const handle = await open(...args), read = handle.read.bind(handle), close = handle.close.bind(handle);
    counts.opened++; counts.active++; counts.peak = Math.max(counts.peak, counts.active);
    handle.read = (async (buffer: Buffer, offset: number, length: number, position: number) => {
      const result = await read(buffer, offset, length, position);
      counts.bytes += result.bytesRead; counts.chunk = Math.max(counts.chunk, length); return result;
    }) as typeof handle.read;
    handle.close = async () => { await close(); counts.closed++; counts.active--; };
    return handle;
  }) as typeof fs.promises.open);
  for (let browse = 0; browse < 10; browse++) {
    const host = new OverlayHost(() => {}), picker = restorePicker(root);
    const load = vi.spyOn(picker, 'load'); host.open(picker);
    try {
      const rows = await load.mock.results[0]!.value;
      expect(rows).toHaveLength(101);
      expect(counts.opened).toBe(203 * browse + 101);
      expect(counts.bytes).toBe((2 * sourceBytes + tailBytes) * browse + sourceBytes);
      const next = (await picker.apply([':more']))!.next!; host.close();
      const nextLoad = vi.spyOn(next, 'load'); host.open(next);
      const tail = await nextLoad.mock.results[0]!.value;
      expect(tail.map(row => row.id)).toEqual([`${authorityId}:record-100`]);
      expect(directories).toHaveLength(4 * browse + 2);
      expect(counts.opened).toBe(203 * browse + 102);
      expect(counts.bytes).toBe((2 * sourceBytes + tailBytes) * browse + sourceBytes + tailBytes);
      const search = vi.spyOn(next, 'search'); host.handlePaste('record-000');
      await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());
      const found = await search.mock.results[0]!.value;
      expect(found.map(row => row.id)).toEqual([`${authorityId}:record-000`]);
      await vi.waitFor(() => expect(Reflect.get(host, 'model').visible[0]?.id).toBe(`${authorityId}:record-000`));
      expect(host.render(120, 24).map(stripAnsi).join('\n')).toContain('note-0.txt');
      for (let index = 0; index < 'record-000'.length; index++) host.handleKey(parseKeyEvent('\x7f'), vi.fn());
      expect(Reflect.get(host, 'baseOptions')[0]?.id).toBe(`${authorityId}:record-100`);
      const bytes = counts.bytes, opened = counts.opened;
      for (const width of [20, 40, 80, 120, 200]) for (const height of [8, 24, 40, 80]) {
        const drawing = host.render(width, height);
        expect(drawing.length).toBeLessThanOrEqual(height);
        expect(drawing.every(row => visibleWidth(row) <= width)).toBe(true);
      }
      expect(counts.bytes).toBe(bytes); expect(counts.opened).toBe(opened);
      expect(opened).toBe(203 * (browse + 1));
      expect(bytes).toBe((2 * sourceBytes + tailBytes) * (browse + 1));
      expect(Reflect.get(host, 'baseOptions')).toHaveLength(1);
      host.handleKey(parseKeyEvent('\x1b'), vi.fn());
      expect(Reflect.get(host, 'baseOptions')).toEqual([]);
      expect(Reflect.get(host, 'model').total).toBe(0);
      expect(Reflect.get(host, 'optionRows').size).toBe(0);
      for (const old of [picker, next]) {
        expect(old.onSearchClear?.()).toBeUndefined();
        expect(await old.apply([`${authorityId}:record-100`])).toBeUndefined();
        await expect(old.load()).rejects.toThrow('closed');
      }
      expect(counts.opened).toBe(opened); expect(counts.active).toBe(0);
    } finally { host.close(); }
  }
  expect(counts.closed).toBe(counts.opened); expect(counts.peak).toBe(1);
  expect(counts.chunk).toBeLessThanOrEqual(64 * 1024);
  for (const dir of directories) await expect(Promise.resolve().then(() => dir.read())).rejects.toMatchObject({ code: 'ERR_DIR_CLOSED' });
  expect(targets.map(target => fs.readFileSync(target))).toEqual(before);
  expect(fs.readFileSync(blob)).toEqual(blobBefore);
});
