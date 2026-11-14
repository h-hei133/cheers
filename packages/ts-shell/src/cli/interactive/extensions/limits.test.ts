import { describe, expect, it, vi } from 'vitest';
import { createExtensionUiAdapter } from '../extensions.js';
import { OverlayStack } from '../../../presentation/tui/render/overlayStack.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';
import { BoundedEditor } from './editor.js';
import { INPUT_LIMIT_NOTICE, MAX_UI_EDITOR_BYTES, MAX_UI_TEXT_BYTES } from './limits.js';

function adapter() {
  const overlays = new OverlayStack();
  const notify = vi.fn();
  const setEditorText = vi.fn();
  const ui = createExtensionUiAdapter({ overlays, admitted: () => true, available: () => true,
    changed() {}, notify, setTitle() {}, setEditorText });
  return { adapter: ui, host: ui.host, overlays, notify, setEditorText };
}

describe('extension UI ingress limits', () => {
  it('rejects excess choice count, item bytes and text bytes before rendering', () => {
    const { host, adapter: ui } = adapter();
    const choices = new Array<string>(257);
    Object.defineProperty(choices, 0, { get() { throw new Error('Must not read oversized choice array'); } });
    expect(() => host.select('Count', choices)).toThrow('at most 256 choices');
    expect(() => host.select('Bytes', ['🙂'.repeat(129)])).toThrow('text exceeds its size limit');
    expect(() => host.input('x'.repeat(MAX_UI_TEXT_BYTES + 1))).toThrow('text exceeds its size limit');
    expect(() => host.notify('🙂'.repeat(MAX_UI_TEXT_BYTES / 4 + 1))).toThrow('text exceeds its size limit');
    expect(ui.active).toBe(false);
  });

  it('bounds status and widget counts, keys, lines and aggregate bytes without losing prior content', () => {
    const { host, adapter: ui } = adapter();
    for (let index = 0; index < 32; index++) host.setStatus(`status-${index}`, 'ready');
    expect(() => host.setStatus('extra', 'refused')).toThrow('at most 32 statuses');
    host.setStatus('status-0', 'updated');
    expect(ui.chrome().status[0]).toBe('updated');
    for (let index = 0; index < 16; index++) host.setWidget(`widget-${index}`, ['content']);
    expect(() => host.setWidget('extra', ['refused'])).toThrow('at most 16 widgets');
    expect(() => host.setWidget('widget-0', new Array(257).fill(''))).toThrow('at most 256 widget lines');
    expect(() => host.setStatus('x'.repeat(513), 'key too large')).toThrow('text exceeds its size limit');
    expect(ui.chrome().aboveEditor).toHaveLength(16);
    ui.clear();
    host.setStatus('first', 'a'.repeat(16 * 1024));
    host.setWidget('second', ['b'.repeat(16 * 1024), 'c'.repeat(16 * 1024)]);
    expect(() => host.setWidget('second', ['a'.repeat(16 * 1024), 'b'.repeat(16 * 1024), 'c'.repeat(16 * 1024)])).toThrow('chrome exceeds 64 KiB');
    expect(ui.chrome().aboveEditor).toEqual(['b'.repeat(16 * 1024), 'c'.repeat(16 * 1024)]);
    host.setStatus('first', undefined);
    host.setWidget('second', ['a'.repeat(16 * 1024), 'b'.repeat(16 * 1024), 'c'.repeat(16 * 1024)]);
    expect(ui.chrome().aboveEditor).toHaveLength(3);
  });

  it('returns the displayed captured choice after the caller mutates its array', async () => {
    const { host, overlays } = adapter();
    const choices = ['Alpha', 'Beta'];
    const selected = host.select('Captured choice', choices);
    choices[0] = 'Replaced'; choices.length = 1;
    const rows = overlays.composite([], 50, 10).map(stripAnsi).join('\n');
    expect(rows).toContain('Alpha'); expect(rows).toContain('Beta'); expect(rows).not.toContain('Replaced');
    overlays.handleKey(parseKeyEvent('\r'), 50, 10);
    expect(await selected).toBe('Alpha');
  });

  it('normalizes single-line content and removes terminal controls while preserving multiline editor source', async () => {
    const { host, overlays, adapter: ui, setEditorText } = adapter();
    const raw = 'One\nTwo\tThree\x1b[2J\x07';
    const selection = host.select(raw, [raw]);
    const rows = overlays.composite([], 80, 12);
    expect(rows.every(row => !/[\n\r\t]/.test(row))).toBe(true);
    expect(rows.join('')).not.toContain('\x1b[2J');
    overlays.handleKey(parseKeyEvent('\r'), 80, 12); expect(await selection).toBe(raw);
    host.setStatus('one', raw); host.setWidget('two', [raw]);
    expect(ui.chrome().status).toEqual(['One Two Three']);
    expect(ui.chrome().aboveEditor).toEqual(['One', 'Two Three']);
    const editor = host.editor('Editor\nTitle', 'A\tB\nC');
    overlays.handleKey(parseKeyEvent('\x13'), 80, 12);
    expect(await editor).toBe('A\tB\nC');
    host.setEditorText('A\tB\nC'); expect(setEditorText).toHaveBeenCalledWith('A\tB\nC');
  });

  it('rejects cumulative single-line and editor insertions with a visible notice and unchanged text', async () => {
    const { host, overlays, notify, setEditorText, adapter: ui } = adapter();
    const input = host.input('Bounded input');
    overlays.handlePaste('a'.repeat(MAX_UI_TEXT_BYTES - 4), 50, 10);
    overlays.handlePaste('🙂', 50, 10);
    overlays.handlePaste('x', 50, 10);
    expect(notify).toHaveBeenLastCalledWith(INPUT_LIMIT_NOTICE, 'warning');
    overlays.handleKey(parseKeyEvent('\r'), 50, 10);
    expect(await input).toBe('a'.repeat(MAX_UI_TEXT_BYTES - 4) + '🙂');
    const editor = host.editor('Bounded editor', 'a'.repeat(MAX_UI_EDITOR_BYTES - 4));
    overlays.handlePaste('🙂', 50, 10);
    overlays.handleKey(parseKeyEvent('\r'), 50, 10);
    overlays.handlePaste('x', 50, 10);
    expect(notify).toHaveBeenLastCalledWith(INPUT_LIMIT_NOTICE, 'warning');
    overlays.handleKey(parseKeyEvent('\x13'), 50, 10);
    expect(await editor).toBe('a'.repeat(MAX_UI_EDITOR_BYTES - 4) + '🙂');
    expect(() => host.editor('Huge prefill', 'x'.repeat(MAX_UI_EDITOR_BYTES + 1))).toThrow('text exceeds its size limit');
    expect(() => host.setEditorText('x'.repeat(MAX_UI_EDITOR_BYTES + 1))).toThrow('text exceeds its size limit');
    expect(setEditorText).not.toHaveBeenCalled(); expect(ui.active).toBe(false);
  });

  it('keeps newline and kill-ring restoration within the editor bound', () => {
    const notice = vi.fn();
    const editor = new BoundedEditor(notice);
    editor.setDraftText('a'.repeat(MAX_UI_EDITOR_BYTES));
    editor.kill('line-start');
    editor.insert('x');
    editor.yank();
    expect(editor.getText()).toBe('x');
    expect(editor.redo()).toBe(false);
    expect(notice).toHaveBeenCalledOnce();
    editor.setDraftText('a'.repeat(MAX_UI_EDITOR_BYTES));
    editor.newline(); expect(Buffer.byteLength(editor.getText())).toBe(MAX_UI_EDITOR_BYTES);
  });
});
