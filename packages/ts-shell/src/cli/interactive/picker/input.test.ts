import { expect, it, vi } from 'vitest';
import { OverlayHost } from '../overlay.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';
import { InputForm } from './input.js';

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
