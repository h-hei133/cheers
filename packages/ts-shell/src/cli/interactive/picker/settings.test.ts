import { describe, expect, it, vi } from 'vitest';
import { CONFIG_SETTINGS } from '../../../config/settings.js';
import { settingsPicker } from './settings.js';
import { OverlayHost, type Picker } from '../overlay.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';

function host() {
  const save = vi.fn(async () => ({ note: 'Saved to your user configuration. Effective for the next operation.', applied: true }));
  return { save, openSettings: (scope: 'user' | 'project' = 'user') => ({ save, scope,
    definitions: CONFIG_SETTINGS.filter(item => item.policy.sources.includes(scope)),
    values: Object.fromEntries(CONFIG_SETTINGS.map(item => [item.key, {
      effective: item.key === 'attentionOnIdle', requested: item.key === 'attentionOnIdle', stored: false,
      source: 'override', requestedSource: 'override', restartRequired: false,
    }])),
  }) };
}

async function detail(h = host(), key = 'attentionOnIdle') {
  const root = settingsPicker(h); await root.load();
  return (await root.apply([key]))!.next!;
}

describe('advanced settings picker', () => {
  it('lists searchable grouped advanced fields without personal credentials or CLI exemptions', async () => {
    const h = host(); const picker = settingsPicker(h); const options = await picker.load();
    expect(options.some(item => item.id === 'maxOutputTokens' && item.label.includes('Request'))).toBe(true);
    expect(options.some(item => item.id === 'providerConnections' || item.id === 'allowUntrustedHooks')).toBe(false);
    expect(h.save).not.toHaveBeenCalled();
  });
  it('stages choices separately from Apply and preserves application outcomes', async () => {
    const h = host(); h.save.mockResolvedValue({ note: 'Saved. Configuration was not applied (rejected).', applied: false });
    const field = await detail(h); const staged = (await field.apply(['choice:0']))!.next!;
    expect(h.save).not.toHaveBeenCalled();
    expect((await staged.load()).find(item => item.id === 'pending')?.label).toBe('Pending: true');
    const result = await staged.apply(['apply']);
    expect(h.save).toHaveBeenCalledOnce(); expect(h.save).toHaveBeenCalledWith('attentionOnIdle', true);
    expect(result?.note).toBe('Attention on idle: Saved. Configuration was not applied (rejected).');
  });
  it.each([80, 120])('shows effective/source/stored/target and pending state at %i columns', async width => {
    const h = host(); const field = await detail(h);
    const overlay = new OverlayHost(() => {}); overlay.open(field); await Promise.resolve(); await Promise.resolve();
    const rows = overlay.render(width, 24).map(stripAnsi).join('\n');
    expect(rows).toContain('save to user'); expect(rows).toContain('Effective: true'); expect(rows).toContain('override');
    expect(rows).toContain('Stored: false'); expect(rows).toContain('user file');
    overlay.open((await field.apply(['choice:1']))!.next!); await Promise.resolve(); await Promise.resolve();
    expect(overlay.render(width, 24).map(stripAnsi).join('\n')).toContain('Pending: false'); overlay.close();
  });
  it('edits a JSON number, rejects invalid input and stages removal without writing', async () => {
    const h = host(); const field = await detail(h, 'maxTurns'); const editor = (await field.apply(['edit']))!.next!;
    expect(editor.input?.validate('0')).toContain('Invalid value'); expect(editor.input?.validate('"secret"')).toContain('Invalid value');
    expect(editor.input?.validate('42')).toBeUndefined();
    const staged = (await editor.input!.apply('42'))!.next!;
    await staged.apply(['apply']); expect(h.save).toHaveBeenCalledWith('maxTurns', 42);
    h.save.mockClear(); const remove = (await field.apply(['unset']))!.next!;
    expect(h.save).not.toHaveBeenCalled(); await remove.apply(['apply']); expect(h.save).toHaveBeenCalledWith('maxTurns', undefined);
  });
  it('makes project targeting explicit and discards a pending value when scope changes', async () => {
    const h = host(); const field = await detail(h); const staged = (await field.apply(['choice:0']))!.next!;
    const scopes = (await staged.apply(['scope']))!.next!;
    expect(scopes.initialSelection).toBe('user');
    const project = (await scopes.apply(['project']))!.next!;
    expect(project.title).toContain('save to project');
    expect((await project.load()).find(item => item.id === 'apply')?.disabled).toBe(true);
    expect(h.save).not.toHaveBeenCalled();
    const personalOnly = await detail(h, 'cacheWarming');
    expect((await personalOnly.load()).some(item => item.id === 'scope')).toBe(false);
  });
  it('uses the existing status vocabulary picker and stages its canonical selection', async () => {
    const h = host(); const field = await detail(h, 'tui.statusItems');
    const editor = (await field.apply(['edit']))!.next!;
    expect(editor.multiple).toBe(true); expect(editor.input).toBeUndefined();
    expect((await editor.load()).some(item => item.id === 'cost')).toBe(true);
    expect(await editor.apply(['not-a-status-item'])).toBeUndefined();
    const staged = (await editor.apply(['cost', 'model']))!.next!;
    expect(h.save).not.toHaveBeenCalled(); await staged.apply(['apply']);
    expect(h.save).toHaveBeenCalledWith('tui.statusItems', ['model', 'cost']);
  });
  it('filters the root list, enters a detail and cancels without saving', async () => {
    const h = host(); const overlay = new OverlayHost(() => {}); overlay.open(settingsPicker(h));
    await Promise.resolve(); await Promise.resolve();
    overlay.handleKey(parseKeyEvent('maxTurns'), vi.fn());
    const calls: Promise<unknown>[] = [];
    overlay.handleKey(parseKeyEvent('\r'), (picker: Picker, ids) => { calls.push(picker.apply(ids).then(outcome => { if (outcome?.next) overlay.open(outcome.next); })); });
    await Promise.all(calls); await Promise.resolve();
    expect(overlay.render(80, 24).map(stripAnsi).join('\n')).toContain('Maximum turns');
    overlay.handleKey(parseKeyEvent('\x1b'), vi.fn()); expect(overlay.active).toBe(false); expect(h.save).not.toHaveBeenCalled();
  });
  it.each([[], ['unknown'], ['maxTurns', 'offline']].map(ids => ({ ids })))('ignores invalid selections $ids', async ({ ids }) => {
    const h = host(); const picker = settingsPicker(h); await picker.load();
    expect(await picker.apply(ids)).toBeUndefined(); expect(h.save).not.toHaveBeenCalled();
  });
});
