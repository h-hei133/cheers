import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { exec } from 'node:child_process';
import { Transcript } from '../../../presentation/tui/transcript/container.js';
import { textBlock } from '../../../presentation/tui/transcript/blocks.js';
import { copyPicker } from './copy.js';
import { setClipboardSink } from '../../../core/commands/copyCommandRuntime.js';
import type { CommandContext } from '../../../core/commands/types.js';
import { OverlayHost, type Picker } from '../overlay.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';

vi.mock('node:child_process', async () => ({ ...await vi.importActual<typeof import('node:child_process')>('node:child_process'), exec: vi.fn() }));
beforeEach(() => {
  vi.mocked(exec).mockImplementation(((_command: string, _options: unknown, callback: (error: Error) => void) => ({
    on() {}, stdin: { on() {}, end() { queueMicrotask(() => callback(new Error('clipboard unavailable'))); } },
  })) as typeof exec);
});
afterEach(() => { setClipboardSink(undefined); vi.clearAllMocks(); });

it('lists every block, newest first, and copies the chosen source', async () => {
  const captured: string[] = [];
  setClipboardSink(sequence => captured.push(sequence));
  const transcript = new Transcript();
  for (let index = 0; index < 40; index++) transcript.append(textBlock('assistant', `answer ${index}`));
  const picker = copyPicker(transcript, { cwd: '/workspace' } as CommandContext);
  const options = await picker.load();
  expect(options).toHaveLength(40);
  expect(options[0]?.detail).toBe('answer 39');
  try {
    const result = await picker.apply([options[39]!.id]);
    expect(result?.note).toContain('8 characters');
    const base64 = /;c;([^\x07]+)\x07/.exec(captured[0] ?? '')?.[1] ?? '';
    expect(Buffer.from(base64, 'base64').toString('utf8')).toBe('answer 0');
  } finally {
    setClipboardSink(undefined);
  }
});

it('loads a bounded first page and follows the explicit continuation', async () => {
  const transcript = new Transcript();
  for (let index = 0; index < 1001; index++) transcript.append(textBlock('assistant', `answer ${index}`));
  const first = copyPicker(transcript, { cwd: '/workspace' } as CommandContext);
  const firstOptions = await first.load();
  expect(firstOptions).toHaveLength(101);
  expect(firstOptions.at(-1)?.id).toBe('__more__');
  expect(firstOptions[0]?.detail).toBe('answer 1000');

  const next = await first.apply(['__more__']);
  expect(next?.next).toBeDefined();
  const secondOptions = await next!.next!.load();
  expect(secondOptions[0]?.detail).toBe('answer 900');
});

it('rejects a copy selection after the transcript revision changes', async () => {
  const captured: string[] = [];
  setClipboardSink(sequence => captured.push(sequence));
  const transcript = new Transcript();
  const block = transcript.append(textBlock('assistant', 'before'));
  const picker = copyPicker(transcript, { cwd: '/workspace' } as CommandContext);
  const options = await picker.load();
  transcript.setText(block, 'after');
  try {
    const result = await picker.apply([options[0]!.id]);
    expect(result?.note).toContain('Transcript changed');
    expect(captured).toHaveLength(0);
  } finally {
    setClipboardSink(undefined);
  }
});

it('reaches the end without duplicate blocks and rejects unoffered or coerced identities', async () => {
  const transcript = new Transcript();
  for (let index = 0; index < 205; index++) transcript.append(textBlock('assistant', `answer ${index}`));
  const captured: string[] = [];
  setClipboardSink(sequence => captured.push(sequence));
  let picker = copyPicker(transcript, { cwd: '/workspace' });
  const details: string[] = [];
  for (let page = 0; page < 3; page++) {
    const options = await picker.load();
    details.push(...options.filter(option => option.id !== '__more__').map(option => option.detail!));
    expect(await picker.apply([''])).toBeUndefined();
    expect(await picker.apply(['0e0'])).toBeUndefined();
    expect(await picker.apply(['0', '1'])).toBeUndefined();
    if (page < 2) picker = (await picker.apply(['__more__']))!.next!;
    else {
      expect(options).toHaveLength(5);
      expect(picker.status?.()).toContain('end of blocks');
      expect(await picker.apply(['__more__'])).toBeUndefined();
      expect(await picker.apply(['0'])).toBeUndefined();
    }
  }
  expect(details).toEqual(Array.from({ length: 205 }, (_, index) => `answer ${204 - index}`));
  expect(captured).toHaveLength(0);
  expect(exec).not.toHaveBeenCalled();
  await picker.apply(['204']);
  expect(Buffer.from(/;c;([^\x07]+)\x07/.exec(captured[0]!)![1]!, 'base64').toString()).toBe('answer 0');
});

it('filters complete source text before paging and retains the query across continuation', async () => {
  const transcript = new Transcript();
  for (let index = 0; index < 205; index++) transcript.append(textBlock('assistant', `answer ${index}\narchived`));
  const picker = copyPicker(transcript, { cwd: '/workspace' });
  const overlay = new OverlayHost(() => {});
  overlay.open(picker);
  await vi.waitFor(() => expect(stripAnsi(overlay.render(100, 30).join('\n'))).toContain('answer 204'));
  overlay.handlePaste('archived');
  expect(picker.status?.()).toContain('1-100 of 205');
  const next = (await picker.apply(['__more__']))!.next!;
  expect(next.initialFilter).toBe('archived');
  expect((await next.load())[0]!.detail).toBe('answer 104');
  overlay.close();
  overlay.open(next);
  await vi.waitFor(() => expect(stripAnsi(overlay.render(100, 30).join('\n'))).toContain('answer 104'));
  for (let index = 0; index < 'archived'.length; index++) overlay.handleKey(parseKeyEvent('\x7f'), () => {});
  expect(next.status?.()).toContain('1-100 of 205');
  overlay.handlePaste('answer 0');
  expect(stripAnsi(overlay.render(100, 30).join('\n'))).toContain('answer 0');
  expect(next.status?.()).toContain('1-1 of 1');
  expect(await next.apply(['0'])).toBeUndefined();
  overlay.close();
  expect(exec).not.toHaveBeenCalled();
});

it('hands captured sources to the next page after the host releases its closed model', async () => {
  const transcript = new Transcript();
  for (let index = 0; index < 3; index++) transcript.append(textBlock('assistant', `answer ${index}\narchived`));
  const overlay = new OverlayHost(() => {});
  overlay.open(copyPicker(transcript, { cwd: '/workspace' }, { pageSize: 1 }));
  await vi.waitFor(() => expect(stripAnsi(overlay.render(100, 30).join('\n'))).toContain('answer 2'));
  overlay.handlePaste('archived');
  const oldModel = Reflect.get(overlay, 'model');
  const revision = overlay.revision;
  const captured: string[] = [];
  setClipboardSink(sequence => captured.push(sequence));
  const results: Promise<unknown>[] = [];
  const notes: string[] = [];
  const apply = vi.fn((picker: Picker, ids: readonly string[]) => {
    expect(overlay.active).toBe(false);
    expect(Reflect.get(overlay, 'model')).not.toBe(oldModel);
    results.push(picker.apply(ids).then(outcome => {
      if (outcome?.next) overlay.open(outcome.next);
      if (outcome?.note) notes.push(outcome.note);
    }));
  });
  overlay.handleKey(parseKeyEvent('\x1b[B'), apply);
  overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(overlay.revision).toBe(revision);
  await Promise.all(results);
  await vi.waitFor(() => expect(stripAnsi(overlay.render(100, 30).join('\n'))).toContain('answer 1'));
  expect(Reflect.get(overlay, 'model').filter).toBe('archived');
  expect(captured).toHaveLength(0);
  overlay.handleKey(parseKeyEvent('\r'), apply);
  await Promise.all(results);
  expect(Buffer.from(/;c;([^\x07]+)\x07/.exec(captured[0]!)![1]!, 'base64').toString()).toBe('answer 1\narchived');
  expect(notes[0]).toContain('Sent');
  expect(overlay.active).toBe(false);
});

it('rejects a continuation after source replacement and copies only the selected raw text', async () => {
  const transcript = new Transcript();
  const text = '  exact\r\n\t中文 😀  ';
  const block = transcript.append(textBlock('assistant', text));
  const captured: string[] = [];
  setClipboardSink(sequence => captured.push(sequence));
  const picker = copyPicker(transcript, { cwd: '/workspace', rawCommandArgs: 'old command arguments' });
  await picker.load();
  const stale = copyPicker(transcript, { cwd: '/workspace' });
  await stale.load();
  expect((await picker.apply(['0']))?.note).toContain('Sent');
  expect(Buffer.from(/;c;([^\x07]+)\x07/.exec(captured[0]!)![1]!, 'base64').toString()).toBe(text);
  captured.length = 0;
  transcript.setText(block, 'changed');
  expect((await stale.apply(['__more__']))?.note).toContain('Transcript changed');
  expect(captured).toHaveLength(0);
});

it('preserves cancellation and reports clipboard failure without claiming a copy', async () => {
  const transcript = new Transcript();
  transcript.append(textBlock('assistant', 'selected text'));
  const picker = copyPicker(transcript, { cwd: '/workspace' });
  const sink = vi.fn(() => { throw new Error('PRIVATE_CLIPBOARD_ERROR'); });
  setClipboardSink(sink);
  const overlay = new OverlayHost(() => {});
  overlay.open(picker);
  await vi.waitFor(() => expect(stripAnsi(overlay.render(100, 30).join('\n'))).toContain('selected text'));
  const selected = vi.fn();
  overlay.handleKey(parseKeyEvent('\x1b'), selected);
  expect(overlay.active).toBe(false);
  expect(selected).not.toHaveBeenCalled();
  expect(sink).not.toHaveBeenCalled();
  expect(exec).not.toHaveBeenCalled();
  expect(await picker.apply(['0'])).toBeUndefined();
  const fresh = copyPicker(transcript, { cwd: '/workspace' });
  await fresh.load();
  const result = await fresh.apply(['0']);
  expect(result?.note).toBe('Could not reach a clipboard for 13 characters.');
  expect(result?.note).not.toMatch(/Copied|Sent|PRIVATE/);
  expect(transcript.all()[0]!.text).toBe('selected text');
});

it('rejects revoked session admission and a second consumption before any clipboard action', async () => {
  const transcript = new Transcript();
  transcript.append(textBlock('assistant', 'bound source'));
  const sink = vi.fn();
  setClipboardSink(sink);
  let blocked: string | undefined;
  const context = { cwd: '/workspace', admission: () => blocked };
  const stale = copyPicker(transcript, context);
  await stale.load();
  blocked = 'The session selection changed.';
  expect((await stale.apply(['0']))?.note).toBe(blocked);
  expect(sink).not.toHaveBeenCalled();
  expect(exec).not.toHaveBeenCalled();
  blocked = undefined;
  const fresh = copyPicker(transcript, context);
  await fresh.load();
  expect((await fresh.apply(['0']))?.note).toContain('Sent');
  const attempts = vi.mocked(exec).mock.calls.length;
  expect(await fresh.apply(['0'])).toBeUndefined();
  expect(sink).toHaveBeenCalledOnce();
  expect(exec).toHaveBeenCalledTimes(attempts);
});

it('refuses loading after cancellation or expired admission without reacquiring sources', async () => {
  const transcript = new Transcript();
  transcript.append(textBlock('assistant', 'private retained source'));
  const picker = copyPicker(transcript, { cwd: '/workspace' });
  await picker.load();
  picker.previewEnd?.();
  await expect(picker.load()).rejects.toThrow();
  const denied = copyPicker(transcript, { cwd: '/workspace', admission: () => 'Session closed.' });
  await expect(denied.load()).rejects.toThrow('Session closed.');
  expect(exec).not.toHaveBeenCalled();
});

it('defers source acquisition until admitted load and refuses stale or aborted continuations', async () => {
  const transcript = new Transcript();
  for (let index = 0; index < 3; index++) transcript.append(textBlock('assistant', `source ${index}`));
  const read = vi.spyOn(transcript, 'copySources');
  const controller = new AbortController();
  const picker = copyPicker(transcript, { cwd: '/workspace', signal: controller.signal }, { pageSize: 1 });
  expect(read).not.toHaveBeenCalled();
  await picker.load();
  expect(read).toHaveBeenCalledOnce();
  const next = (await picker.apply(['__more__']))!.next!;
  expect(await picker.apply(['__more__'])).toBeUndefined();
  await next.load();
  expect(read).toHaveBeenCalledOnce();
  controller.abort();
  expect((await next.apply(['1']))?.note).toContain('Copy cancelled');
  expect(exec).not.toHaveBeenCalled();
  const stale = copyPicker(transcript, { cwd: '/workspace' });
  transcript.append(textBlock('assistant', 'replacement'));
  await expect(stale.load()).rejects.toThrow('Transcript changed');
  expect(read).toHaveBeenCalledOnce();
  read.mockRestore();
});

it('clamps caller page sizes and ignores invalid offsets', async () => {
  const transcript = new Transcript();
  for (let index = 0; index < 205; index++) transcript.append(textBlock('assistant', `answer ${index}`));
  for (const pageSize of [10000, Infinity, NaN]) {
    expect(await copyPicker(transcript, { cwd: '/workspace' }, { pageSize, offset: NaN }).load()).toHaveLength(101);
  }
  const signal = AbortSignal.abort();
  await expect(copyPicker(transcript, { cwd: '/workspace' }).load(signal)).rejects.toThrow();
});

it('says a picture-only transcript has no text rather than calling it empty', async () => {
  const transcript = new Transcript();
  transcript.append({ ...textBlock('user', ''), images: [{ type: 'image', data: 'QUJD', mimeType: 'image/png' }] });
  const picker = copyPicker(transcript, { cwd: '/workspace' } as CommandContext);
  await picker.load();
  expect(picker.empty).toBe('The transcript holds only pictures; there is no text to copy.');
  // A genuinely empty transcript keeps the original wording.
  const blank = copyPicker(new Transcript(), { cwd: '/workspace' } as CommandContext);
  await blank.load();
  expect(blank.empty).toBe('Nothing in the transcript to copy yet.');
});
