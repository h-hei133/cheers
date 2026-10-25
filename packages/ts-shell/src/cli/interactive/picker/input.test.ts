import { expect, it, vi } from 'vitest';
import { OverlayHost } from '../overlay.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';
import { InputForm } from './input.js';
import { cursorTarget } from '../../../presentation/tui/render/paint.js';

it('masks graphemes before painting, maps the caret and drops cleared credentials from undo', () => {
  const form = new InputForm({ initial: '', label: 'API key', masked: true, validate: () => undefined });
  form.paste('a😀éz');
  const rows = form.render('Configure', 20, 10);
  expect(rows.map(stripAnsi).join('\n')).toContain('••••');
  expect(rows.join('\n')).not.toContain('a😀éz'); expect(cursorTarget(rows, 0, 10)).toEqual({ row: 2, column: 4 });
  form.key(parseKeyEvent('\x1b[D'));
  expect(cursorTarget(form.render('Configure', 20, 10), 0, 10)).toEqual({ row: 2, column: 3 });
  form.key(parseKeyEvent('\x7f')); expect(form.value()).toBe('a😀z');
  form.paste('\nsecret'); expect(form.value()).toBe('a😀z');
  form.key(parseKeyEvent('\x15')); form.key(parseKeyEvent('\x1a')); expect(form.value()).toBe('');
});

it('keeps invalid input open, routes paste to the editor, and only submits validated text', async () => {
  const submit = vi.fn(async () => undefined); const overlay = new OverlayHost(() => {});
  overlay.open({ title: 'Edit value', form: 'panel', empty: '', load: async () => [], apply: async () => undefined,
    input: { initial: '', label: 'JSON integer', validate: text => /^\d+$/.test(text) ? undefined : 'Invalid integer', apply: submit } });
  await Promise.resolve();
  const invoke = vi.fn((picker, ids) => { void picker.apply(ids); });
  overlay.handlePaste('bad'); overlay.handleKey(parseKeyEvent('\r'), invoke);
  expect(overlay.active).toBe(true); expect(invoke).not.toHaveBeenCalled();
  expect(overlay.render(80, 24).map(stripAnsi).join('\n')).toContain('Invalid integer');
  overlay.handleKey(parseKeyEvent('\x15'), invoke); overlay.handlePaste('23');
  overlay.handleKey(parseKeyEvent('\r'), invoke);
  expect(overlay.active).toBe(false); expect(submit).toHaveBeenCalledWith('23');
});

it('reuses grapheme deletion, refuses terminal controls and bounds pasted data', () => {
  const form = new InputForm({ initial: 'a😀', label: '', validate: () => undefined });
  form.key(parseKeyEvent('\x7f')); expect(form.value()).toBe('a');
  form.paste('\x1b]52;injection\x07'); expect(form.value()).toBe('a');
  form.paste('x'.repeat(65536)); expect(form.value()).toBe('a');
  form.paste('b'); expect(form.value()).toBe('ab');
});

it('cancel drops the form without invoking its submit callback', () => {
  const submit = vi.fn(async () => undefined); const overlay = new OverlayHost(() => {});
  overlay.open({ title: 'Edit value', form: 'panel', empty: '', load: async () => [], apply: async () => undefined,
    input: { initial: '23', label: '', validate: () => undefined, apply: submit } });
  overlay.handleKey(parseKeyEvent('\x1b'), vi.fn()); expect(overlay.active).toBe(false); expect(submit).not.toHaveBeenCalled();
});

it('scrolls a read-only value from the start and absorbs every editing path', () => {
  const initial = Array.from({ length: 30 }, (_, index) => `source-${index}`).join('\n');
  const form = new InputForm({ initial, label: 'Read-only', readOnly: true, validate: () => undefined });
  expect(form.render('Sources', 30, 10).map(stripAnsi).join('\n')).toContain('source-0');
  form.paste('replacement');
  for (const key of ['x', '\x15', '\x1a', '\x7f', '\x1b[3~']) form.key(parseKeyEvent(key));
  expect(form.value()).toBe(initial);
  for (let index = 0; index < 20; index++) form.key(parseKeyEvent('\x1b[B'));
  const scrolled = form.render('Sources', 30, 10).map(stripAnsi).join('\n');
  expect(scrolled).toContain('source-20'); expect(scrolled).not.toContain('source-0\n');
  expect(form.value()).toBe(initial);
});

it('inserts modified Enter at the caret in multiline forms without submitting, and undoes the newline', () => {
  const form = new InputForm({ initial: 'ab', label: 'List', multiline: true, validate: () => undefined });
  form.key(parseKeyEvent('\x1b[D'));
  form.key(parseKeyEvent('\x1b[13;2u'));
  expect(form.value()).toBe('a\nb');
  form.key(parseKeyEvent('\x1a')); expect(form.value()).toBe('ab');
  form.key(parseKeyEvent('\n')); expect(form.value()).toBe('a\nb');
  form.key(parseKeyEvent('\r')); expect(form.value()).toBe('a\nb');
});

it('absorbs newline keys in single-line, masked and read-only forms and bounds multiline insertion', () => {
  for (const options of [{}, { multiline: true, masked: true }, { multiline: true, readOnly: true }]) {
    const form = new InputForm({ initial: 'original', label: '', validate: () => undefined, ...options });
    for (const raw of ['\n', '\x1b[13;2u']) form.key(parseKeyEvent(raw));
    expect(form.value()).toBe('original');
  }
  const form = new InputForm({ initial: 'x'.repeat(65536), label: '', multiline: true, validate: () => undefined });
  form.key(parseKeyEvent('\n'));
  expect(form.value()).toHaveLength(65536);
});

it.each([1, 2, 3, 4, 6, 12])('keeps the caret inside a %i-row viewport while wrapping, moving and resizing', height => {
  const form = new InputForm({ initial: '中文😀\nsecond\nlast', label: 'List', multiline: true, validate: () => undefined });
  for (const width of [4, 18, 4]) {
    const rows = form.render('Edit', width, height);
    expect(rows.length).toBeLessThanOrEqual(height);
    expect(cursorTarget(rows, 0, height)).not.toBeNull();
    form.key(parseKeyEvent('\x1b[A'));
    const moved = form.render('Edit', width, height);
    expect(moved.length).toBeLessThanOrEqual(height);
    expect(cursorTarget(moved, 0, height)).not.toBeNull();
  }
  expect(form.value()).toBe('中文😀\nsecond\nlast');
  expect(form.render('Edit', 18, 0)).toEqual([]);
  expect(form.render('Edit', 0, height)).toEqual([]);
});

it('never submits an empty replacement for an oversized initial value without an explicit edit', async () => {
  const submit = vi.fn(async () => undefined), overlay = new OverlayHost(() => {});
  overlay.open({ title: 'Edit', form: 'panel', empty: '', load: async () => [], apply: async () => undefined,
    input: { initial: 'x'.repeat(65537), label: 'List', multiline: true, validate: () => undefined, apply: submit } });
  await Promise.resolve(); await Promise.resolve();
  const invoke = vi.fn((picker, ids) => { void picker.apply(ids); });
  overlay.handleKey(parseKeyEvent('\r'), invoke);
  expect(overlay.active).toBe(true); expect(invoke).not.toHaveBeenCalled();
  expect(overlay.render(100, 8).map(stripAnsi).join('\n')).toContain('Value is too large');
  overlay.handleKey(parseKeyEvent('\x15'), invoke);
  overlay.handleKey(parseKeyEvent('\r'), invoke);
  expect(submit).toHaveBeenCalledWith(''); expect(overlay.active).toBe(false);
});

it('uses the remaining row budget for ordinary forms and the whole viewport for fullscreen forms', () => {
  for (const fullScreen of [false, true]) {
    const overlay = new OverlayHost(() => {});
    overlay.open({ title: 'Edit', form: 'panel', fullScreen, empty: '', load: async () => [], apply: async () => undefined,
      input: { initial: 'first\nlast', label: 'List', multiline: true, validate: () => undefined, apply: async () => undefined } });
    const rows = overlay.render(40, 10, 1);
    expect(rows.length).toBeLessThanOrEqual(fullScreen ? 10 : 1);
    expect(rows.map(stripAnsi).join('\n')).toContain('last');
    expect(cursorTarget(rows, 0, 10)).not.toBeNull();
    expect(rows.map(stripAnsi).join('\n').includes('Edit')).toBe(fullScreen);
    overlay.close();
  }
});
