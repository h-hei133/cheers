import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { Option } from '../../../../presentation/tui/chrome/options.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { visibleWidth } from '../../../../presentation/tui/text/measure.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';
import { OverlayHost, type Picker } from '../../overlay.js';
import { skillPicker } from '../skills.js';

let root: string | undefined;
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function saved(bodyBytes = 32) {
  const scratch = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(scratch, { recursive: true });
  root = fs.mkdtempSync(path.join(scratch, 'skill-picker-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
  const file = path.join(root, 'SKILL.md');
  const body = 'x'.repeat(bodyBytes);
  fs.writeFileSync(file, `---\nname: fixture\ndescription: Fixture metadata\n---\n${body}`);
  const before = fs.readFileSync(file);
  return { file, body, before, createPicker: () => skillPicker({ cwd: root!, skillOptions: { noSkills: true, skillPaths: [file] } }) };
}

/** Observe only the selected manifest descriptors; other source owners stay real. */
function observeManifest(file: string, afterRead?: () => Promise<void>) {
  const open = fs.promises.open.bind(fs.promises);
  const counts = { opened: 0, closed: 0, active: 0, peak: 0, bytes: 0, chunk: 0 };
  vi.spyOn(fs.promises, 'open').mockImplementation((async (target, ...args) => {
    const handle = await open(target, ...args);
    if (String(target) !== file) return handle;
    counts.opened++; counts.active++; counts.peak = Math.max(counts.peak, counts.active);
    const read = handle.read.bind(handle), close = handle.close.bind(handle);
    handle.read = (async (buffer: Buffer, offset: number, length: number, position: number) => {
      const result = await read(buffer, offset, length, position);
      counts.bytes += result.bytesRead; counts.chunk = Math.max(counts.chunk, length);
      await afterRead?.();
      return result;
    }) as typeof handle.read;
    handle.close = async () => { await close(); counts.closed++; counts.active--; };
    return handle;
  }) as typeof fs.promises.open);
  return counts;
}

function opened(picker: Picker) {
  const load = vi.spyOn(picker, 'load'), change = vi.fn();
  const host = new OverlayHost(change); host.open(picker);
  const pending = load.mock.results[0]!.value as Promise<readonly Option[]>;
  const retained = host as unknown as { baseOptions: readonly Option[]; model: { total: number }; optionRows: ReadonlyMap<number, unknown> };
  return { host, change, pending, retained };
}

it.each([32, 128 * 1024])('releases the real skill catalogue after repeated browsing and cancellation (%i body bytes)', async bodyBytes => {
  const { file, body, before, createPicker } = saved(bodyBytes);
  const counts = observeManifest(file);
  for (let round = 0; round < 10; round++) {
    const picker = createPicker(), { host, pending, retained } = opened(picker);
    try {
      expect((await pending).map(row => row.id)).toEqual(['fixture']);
      await vi.waitFor(() => expect(retained.model.total).toBe(1));
      expect(counts.opened).toBe(round + 1); expect(counts.bytes).toBe(before.length * (round + 1));
      expect(counts.active).toBe(0);
      expect(retained.baseOptions).toHaveLength(1);
      expect(Buffer.byteLength(JSON.stringify(retained.baseOptions))).toBeLessThan(512);
      expect(JSON.stringify(retained.baseOptions)).not.toContain(body);
      host.handlePaste('fixture');
      for (const width of [20, 40, 80, 120, 200]) for (const height of [8, 24, 40, 80]) {
        const frame = host.render(width, height);
        expect(frame.length).toBeLessThanOrEqual(height);
        expect(frame.every(line => visibleWidth(line) <= width)).toBe(true);
      }
      expect(counts.opened).toBe(round + 1); expect(counts.bytes).toBe(before.length * (round + 1));
      const apply = vi.fn(); host.handleKey(parseKeyEvent('\x1b'), apply);
      expect(apply).not.toHaveBeenCalled();
      expect(retained.baseOptions).toEqual([]); expect(retained.model.total).toBe(0); expect(retained.optionRows.size).toBe(0);
      await expect(picker.apply(['fixture'])).resolves.toBeUndefined();
      expect(counts.opened).toBe(round + 1); expect(counts.bytes).toBe(before.length * (round + 1));
    } finally { host.close(); }
  }
  expect(counts.peak).toBe(1); expect(counts.closed).toBe(10); expect(counts.chunk).toBeLessThanOrEqual(64 * 1024);
  expect(fs.readFileSync(file)).toEqual(before);
});

it('preserves an accepted real skill after the host retires its load signal', async () => {
  const { file, body, before, createPicker } = saved(128 * 1024);
  const counts = observeManifest(file);
  const picker = createPicker(), { host, pending, retained } = opened(picker);
  try {
    await pending; await vi.waitFor(() => expect(retained.model.total).toBe(1));
    const apply = vi.fn(); host.handleKey(parseKeyEvent('\r'), apply);
    expect(apply).toHaveBeenCalledWith(picker, ['fixture']); expect(host.active).toBe(false);
    const result = await picker.apply(['fixture']);
    expect(result?.draft).toBe('/skill fixture '); expect(result?.note?.endsWith(body)).toBe(true);
    expect(counts.opened).toBe(2); expect(counts.bytes).toBe(before.length * 2);
    expect(counts.closed).toBe(2); expect(counts.active).toBe(0);
    await expect(picker.apply(['fixture'])).resolves.toBeUndefined();
    expect(counts.opened).toBe(2); expect(fs.readFileSync(file)).toEqual(before);
  } finally { host.close(); }
});

it('drains a cancelled real manifest read without acquiring another chunk or publishing a late choice', async () => {
  const { file, before, createPicker } = saved(128 * 1024);
  let release!: () => void, entered = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const counts = observeManifest(file, async () => { entered = true; await gate; });
  const picker = createPicker(), { host, change, pending, retained } = opened(picker);
  try {
    await vi.waitFor(() => expect(entered).toBe(true), { timeout: 5000 });
    expect(counts.bytes).toBe(64 * 1024); host.close();
    const notifications = change.mock.calls.length;
    release(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(counts.bytes).toBe(64 * 1024); expect(counts.opened).toBe(1); expect(counts.closed).toBe(1); expect(counts.active).toBe(0);
    expect(change).toHaveBeenCalledTimes(notifications); expect(retained.baseOptions).toEqual([]); expect(retained.model.total).toBe(0);
    await expect(picker.apply(['fixture'])).resolves.toBeUndefined(); expect(counts.opened).toBe(1);
    expect(fs.readFileSync(file)).toEqual(before);
  } finally { release(); host.close(); await pending.catch(() => {}); }
});

it('rereads the selected real identity and withholds a replacement skill body', async () => {
  const { file, createPicker } = saved();
  const counts = observeManifest(file);
  const picker = createPicker(), { host, pending, retained } = opened(picker);
  try {
    await pending; await vi.waitFor(() => expect(retained.model.total).toBe(1));
    fs.writeFileSync(file, '---\nname: replacement\ndescription: Replaced metadata\n---\nREPLACEMENT_BODY');
    const replacement = fs.readFileSync(file);
    const apply = vi.fn(); host.handleKey(parseKeyEvent('\r'), apply);
    expect(apply).toHaveBeenCalledWith(picker, ['fixture']);
    const result = await picker.apply(['fixture']);
    expect(result?.note).toContain('no longer available'); expect(result?.note).not.toContain('REPLACEMENT_BODY');
    expect(result?.draft).toBeUndefined(); expect(counts.opened).toBe(2); expect(counts.closed).toBe(2);
    expect(fs.readFileSync(file)).toEqual(replacement);
  } finally { host.close(); }
});

it.each(['host', 'direct', 'original'] as const)('withholds choices when %s cancellation happens inside post-acquisition admission', async owner => {
  const { file, before } = saved();
  const counts = observeManifest(file);
  const host = new OverlayHost(() => {});
  const original = new AbortController();
  let checks = 0, closes = 0;
  const picker = skillPicker({ cwd: root!, signal: original.signal, skillOptions: { noSkills: true, skillPaths: [file] },
    admission: () => {
      if (++checks === 2) {
        closes++;
        if (owner === 'host') host.close();
        else if (owner === 'direct') picker.previewEnd?.();
        else original.abort();
      }
      return undefined;
    },
  });
  const load = vi.spyOn(picker, 'load');
  let pending: Promise<readonly Option[]>;
  if (owner === 'host') { host.open(picker); pending = load.mock.results[0]!.value; }
  else pending = picker.load();
  try {
    if (owner !== 'direct') await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    else await expect(pending).resolves.toEqual([]);
    expect(closes).toBe(1); expect(host.active).toBe(false);
    await expect(picker.apply(['fixture'])).resolves.toBeUndefined();
    expect(counts.opened).toBe(1); expect(counts.bytes).toBe(before.length);
    expect(counts.closed).toBe(1); expect(counts.active).toBe(0);
    expect(fs.readFileSync(file)).toEqual(before);
  } finally { host.close(); }
});
