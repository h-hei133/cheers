import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../../../session/SessionManager.js';
import { createMessageTranscriptEvent } from '../../../../session/sessionEventCodec.js';
import { createSessionStoreLayout, locateExistingSessionLayout } from '../../../../session/store/sessionFileLayout.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';
import { visibleWidth } from '../../../../presentation/tui/text/measure.js';
import type { Option } from '../../../../presentation/tui/chrome/options.js';
import { OverlayHost, type Picker } from '../../overlay.js';
import { treePicker } from '../tree.js';

let root: string | undefined;
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function saved(extraBytes = 0) {
  const scratch = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(scratch, { recursive: true });
  root = fs.mkdtempSync(path.join(scratch, 'tree-lifetime-'));
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_TEST_ROOT', home);
  const session = new SessionManager().createNew(root);
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), session.id);
  const state = JSON.parse(fs.readFileSync(layout.statePath, 'utf8'));
  const start = state.thread.entries[0];
  const messages = ['question-a', 'answer-a', 'question-b', 'answer-b'].map((id, index) => ({
    id, role: index % 2 ? 'assistant' as const : 'user' as const,
    content: `${id} 界 e\u0301 👩‍💻 ${'x'.repeat(extraBytes)}${id === 'question-b' ? ' hidden-needle' : ''}`,
    timestamp: session.createdAt,
  }));
  state.thread.entries = [start, ...messages.map((message, index) => ({
    id: message.id, kind: 'turn-message', role: message.role, order: index + 1,
    parentId: index % 2 ? messages[index - 1]!.id : start.id,
  }))];
  state.thread.activeLeafId = 'answer-b';
  fs.writeFileSync(layout.statePath, JSON.stringify(state));
  fs.appendFileSync(layout.transcriptPath, messages.map(message => JSON.stringify(createMessageTranscriptEvent(message))).join('\n') + '\n');
  const targets = [layout.metadataPath, layout.statePath, layout.transcriptPath];
  const before = targets.map(target => fs.readFileSync(target));
  const navigate = vi.fn(async () => ({ note: 'navigated' }));
  const createPicker = () => treePicker({ sessionId: session.id, cwd: root! } as never, navigate);
  return { layout, targets, before, navigate, createPicker, sourceBytes: before.reduce((sum, bytes) => sum + bytes.length, 0) };
}

function observeSources(afterRead?: (target: string) => Promise<void>) {
  const open = fs.promises.open.bind(fs.promises);
  const counts = { opened: 0, closed: 0, active: 0, peak: 0, bytes: 0, chunk: 0, byPath: new Map<string, number>() };
  vi.spyOn(fs.promises, 'open').mockImplementation((async (target, ...args) => {
    const handle = await open(target, ...args);
    const name = String(target);
    counts.opened++; counts.active++; counts.peak = Math.max(counts.peak, counts.active);
    const read = handle.read.bind(handle), close = handle.close.bind(handle);
    handle.read = (async (buffer: Buffer, offset: number, length: number, position: number) => {
      const result = await read(buffer, offset, length, position);
      counts.chunk = Math.max(counts.chunk, length); counts.bytes += result.bytesRead;
      counts.byPath.set(name, (counts.byPath.get(name) ?? 0) + result.bytesRead);
      await afterRead?.(name);
      return result;
    }) as typeof handle.read;
    handle.close = async () => { await close(); counts.closed++; counts.active--; };
    return handle;
  }) as typeof fs.promises.open);
  return counts;
}

function openPicker(picker: Picker) {
  const loading = vi.spyOn(picker, 'load');
  const change = vi.fn(), host = new OverlayHost(change);
  host.open(picker);
  return { host, change, pending: loading.mock.results[0]!.value as Promise<readonly Option[]> };
}

it.each([32, 128 * 1024])('bounds real tree acquisition and drawing across repeated browsing (%i extra bytes)', async extraBytes => {
  const { targets, before, createPicker, navigate, sourceBytes } = saved(extraBytes);
  const counts = observeSources();
  for (let browse = 0; browse < 10; browse++) {
    const picker = createPicker(), { host, pending } = openPicker(picker);
    const retained = host as unknown as { baseOptions: readonly Option[]; model: { total: number }; optionRows: ReadonlyMap<number, unknown> };
    try {
      const options = await pending;
      expect(options.map(option => option.id)).toEqual(expect.arrayContaining(['question-a', 'answer-a', 'question-b', 'answer-b']));
      expect(options).toHaveLength(5);
      expect(picker.initialSelection).toBe('answer-b');
      expect(counts.active).toBe(0);
      expect(counts.bytes).toBe(sourceBytes * (browse + 1));
      for (const [index, target] of targets.entries()) expect(counts.byPath.get(target)).toBe(before[index]!.length * (browse + 1));

      // Exercise the real host's disclosure, filtering, selection and rendering.
      await vi.waitFor(() => expect(host.render(120, 24).map(stripAnsi).join('\n')).toContain('Entry: answer-b'));
      for (let step = 0; step < 4; step++) host.handleKey(parseKeyEvent('\x1b[A'), vi.fn());
      expect(host.render(120, 24).map(stripAnsi).join('\n')).toContain('Session start');
      host.handleKey(parseKeyEvent('\x1b[D'), vi.fn());
      expect(picker.filterOptions?.('', options)).toHaveLength(1);
      host.handlePaste('hidden-needle');
      expect(picker.filterOptions?.('hidden-needle', options)?.map(option => option.id)).toEqual(['question-b']);
      expect(host.render(120, 24).map(stripAnsi).join('\n')).toContain('Entry: question-b');
      for (const width of [20, 40, 80, 120, 200]) for (const height of [8, 24, 40, 80]) {
        const rows = host.render(width, height);
        expect(rows.length).toBeLessThanOrEqual(height);
        expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
      }
      expect(counts.bytes).toBe(sourceBytes * (browse + 1));
      expect(counts.opened).toBe(3 * (browse + 1));
      expect(retained.optionRows.size).toBeGreaterThan(0);
    } finally { host.close(); }
    expect(retained.baseOptions).toEqual([]); expect(retained.model.total).toBe(0); expect(retained.optionRows.size).toBe(0);
    expect(host.render(120, 24)).toEqual([]);
    expect(picker.detail?.('question-b')).toEqual([]);
    expect(picker.filterOptions?.('', [])).toEqual([]);
    expect(await picker.apply(['question-b'])).toBeUndefined();
  }
  expect(counts.peak).toBe(1);
  expect(counts.closed).toBe(counts.opened);
  expect(counts.chunk).toBeLessThanOrEqual(64 * 1024);
  expect(targets.map(target => fs.readFileSync(target))).toEqual(before);
  expect(navigate).not.toHaveBeenCalled();
});

it('drains a cancelled real transcript read without publishing or retaining the tree', async () => {
  const { layout, targets, before, createPicker, navigate } = saved(128 * 1024);
  let release!: () => void, entered = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const counts = observeSources(async target => {
    if (target === layout.transcriptPath) { entered = true; await gate; }
  });
  const picker = createPicker(), { host, change, pending } = openPicker(picker);
  try {
    await vi.waitFor(() => expect(entered).toBe(true), { timeout: 5_000 });
    host.close();
    const changes = change.mock.calls.length, bytes = counts.bytes;
    expect(counts.byPath.get(layout.transcriptPath)).toBe(64 * 1024);
    release();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(counts.active).toBe(0); expect(counts.closed).toBe(counts.opened);
    expect(counts.bytes).toBe(bytes); expect(change).toHaveBeenCalledTimes(changes);
    expect(host.render(120, 24)).toEqual([]);
    expect(picker.detail?.('question-b')).toEqual([]);
    expect(await picker.apply(['question-b'])).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
    expect(targets.map(target => fs.readFileSync(target))).toEqual(before);
  } finally { release(); host.close(); await pending.catch(() => {}); }
});

it('rejects a real source change during acquisition before the host can offer any tree entry', async () => {
  const { layout, createPicker, navigate } = saved();
  let changed = false;
  const counts = observeSources(async target => {
    if (target === layout.transcriptPath && !changed) { changed = true; fs.appendFileSync(target, '\n'); }
  });
  const picker = createPicker(), { host, pending } = openPicker(picker);
  try {
    await expect(pending).rejects.toThrow('changed');
    expect(counts.active).toBe(0); expect(counts.closed).toBe(counts.opened);
    await vi.waitFor(() => expect(host.render(120, 24).map(stripAnsi).join('\n')).toContain('unavailable'));
    expect(picker.detail?.('question-b')).toEqual([]);
    expect(await picker.apply(['question-b'])).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
  } finally { host.close(); }
});

it('rereads the real source revision before accepting a tree choice', async () => {
  const { layout, targets, createPicker, navigate } = saved();
  const counts = observeSources();
  const picker = createPicker(), { host, pending } = openPicker(picker);
  try {
    await pending;
    await vi.waitFor(() => expect(host.render(120, 24).map(stripAnsi).join('\n')).toContain('Entry: answer-b'));
    fs.appendFileSync(layout.metadataPath, '\n');
    const changed = targets.map(target => fs.readFileSync(target));
    expect((await picker.apply(['question-b']))?.note).toContain('changed after this tree opened');
    expect(navigate).not.toHaveBeenCalled();
    expect(counts.opened).toBe(6); expect(counts.closed).toBe(counts.opened); expect(counts.active).toBe(0);
    expect(picker.detail?.('question-b')).toEqual([]);
    expect(await picker.apply(['question-b'])).toBeUndefined();
    expect(targets.map(target => fs.readFileSync(target))).toEqual(changed);
  } finally { host.close(); }
});

it('keeps real damaged history readable while refusing navigation and preserving saved bytes', async () => {
  const { layout, targets, createPicker, navigate } = saved();
  fs.appendFileSync(layout.transcriptPath, '{broken-json}\n');
  const before = targets.map(target => fs.readFileSync(target));
  const counts = observeSources();
  const picker = createPicker(), { host, pending } = openPicker(picker);
  try {
    const options = await pending;
    expect(options).toHaveLength(5); expect(options.every(option => option.disabled)).toBe(true);
    expect(options.every(option => option.note?.includes('partial transcript'))).toBe(true);
    expect(await picker.apply(['question-b'])).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
    expect(counts.active).toBe(0); expect(counts.closed).toBe(counts.opened);
    expect(targets.map(target => fs.readFileSync(target))).toEqual(before);
  } finally { host.close(); }
});
