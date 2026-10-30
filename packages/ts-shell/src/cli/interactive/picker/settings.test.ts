import { describe, expect, it, vi } from 'vitest';
import { CONFIG_SETTINGS, formatSetting } from '../../../config/settings.js';
import type { SettingsDraft } from '../settings.js';
import { settingsPicker, type SettingsHost } from './settings.js';
import { OverlayHost, type Picker } from '../overlay.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';

function host() {
  const save = vi.fn(async () => ({ note: 'Saved to your user configuration. Effective for the next operation.', applied: true }));
  const openSettings = (scope: 'user' | 'project' = 'user'): SettingsDraft => ({ save, scope, file: scope === 'user' ? '/profile/config.json' : '/workspace/.cheers/config.json', reopen: openSettings,
    definitions: CONFIG_SETTINGS.filter(item => item.policy.sources.includes(scope)),
    values: Object.fromEntries(CONFIG_SETTINGS.map(item => [item.key, {
      effective: item.key === 'attentionOnIdle', requested: item.key === 'attentionOnIdle', stored: false,
      source: 'override', requestedSource: 'override', restartRequired: false,
    }])),
  });
  return { save, openSettings };
}

async function detail(h: SettingsHost = host(), key = 'attentionOnIdle') {
  const root = settingsPicker(h); await root.load();
  return (await root.apply([key]))!.next!;
}

describe('advanced settings picker', () => {
  it.each(['user', 'project'] as const)('shows the %s save file and keeps the model catalogue separate', async scope => {
    const h = host(), root = settingsPicker(h, scope, 'Model');
    await root.load();
    const file = h.openSettings(scope).file;
    expect(root.detail!('maxTurns').join('\n')).toContain(`Save file: ${file} (${scope})`);
    expect(root.detail!('maxTurns').join('\n')).toContain('catalogue entries: models.json (user profile only)');
    const field = (await root.apply(['maxTurns']))!.next!;
    expect((await field.load()).find(row => row.id === 'stored')?.note).toBe(file);
    const sources = (await field.apply(['inspect']))!.next!;
    expect(sources.input?.initial).toContain(`Save file: ${file}`);
    expect(h.save).not.toHaveBeenCalled();
  });
  it('separates file preferences from current-session model and thinking entries without changing their owners', async () => {
    const base = host();
    const child = (back: (notice?: string) => Picker): Picker => ({
      title: 'Session child', empty: '', back: () => back(), load: async () => [], apply: async () => undefined,
    });
    const h = { ...base, modelSettings: vi.fn(child), thinkingSettings: vi.fn(child) };
    const model = settingsPicker(h, 'project', 'Model');
    const all = await model.load();
    const modelRows = model.filterOptions!('', all);
    expect(modelRows.filter(row => !row.disabled).map(row => row.id).sort()).toEqual([
      'allowedModels', 'maxOutputTokens', 'maxTurns', 'temperature', 'topP',
    ]);
    expect(modelRows.some(row => row.id.startsWith('settings:'))).toBe(false);
    expect(all.some(row => row.id === 'providerConnectTimeoutMs')).toBe(true);
    expect(all.some(row => row.id === 'instructionBudgetBytes')).toBe(true);
    const sessions = model.chips!.select('Session')!;
    const sessionRows = sessions.filterOptions!('', await sessions.load());
    expect(sessionRows.map(row => row.id)).toEqual([
      'section:Session / Current session', 'settings:model', 'settings:thinking',
    ]);
    expect(sessions.title).toBe('Settings — current session — from project configuration');
    expect(sessions.detail!('settings:thinking').join(' ')).toContain('settings file scope does not change');
    const thinking = (await sessions.apply(['settings:thinking']))!.next!;
    const returned = thinking.back!();
    expect(returned.chips?.active).toBe('Session');
    expect(returned.initialSelection).toBe('settings:thinking');
    expect(returned.title).toContain('project configuration');
    expect(h.thinkingSettings).toHaveBeenCalledOnce();
    expect(base.save).not.toHaveBeenCalled();
  });

  it('admits only IDs from a successfully loaded catalogue', async () => {
    const h: SettingsHost = host();
    const picker = settingsPicker(h);
    expect(picker.detail!(undefined)).toEqual([]);
    expect(await picker.apply(['settings:memory'])).toBeUndefined();
    await picker.load();
    expect(picker.chips?.items.some(item => item.id === 'Session')).toBe(false);
    h.modelSettings = vi.fn(() => ({ title: 'Unexpected child', empty: '', load: async () => [], apply: async () => undefined }));
    h.thinkingSettings = vi.fn(() => ({ title: 'Unexpected child', empty: '', load: async () => [], apply: async () => undefined }));
    for (const id of ['settings:model', 'settings:thinking']) {
      expect(picker.detail!(id)).toEqual([]);
      expect(await picker.apply([id])).toBeUndefined();
    }
    expect(h.modelSettings).not.toHaveBeenCalled();
    expect(h.thinkingSettings).not.toHaveBeenCalled();

    const original = h.openSettings;
    h.openSettings = scope => ({ ...original(scope), definitions: CONFIG_SETTINGS.filter(item => item.key !== 'temperature') });
    const restricted = settingsPicker(h); await restricted.load();
    expect(restricted.detail!('temperature')).toEqual([]);
    expect(await restricted.apply(['temperature'])).toBeUndefined();
    h.openSettings = () => { throw new Error('Synthetic unreadable configuration'); };
    await expect(restricted.load()).rejects.toThrow('Synthetic unreadable configuration');
    expect(restricted.detail!('settings:memory')).toEqual([]);
    expect(await restricted.apply(['settings:memory'])).toBeUndefined();
    expect(await restricted.apply(['maxTurns'])).toBeUndefined();
  });

  it.each(['user', 'project'] as const)('searches and returns session children through actual overlay keys while retaining %s file scope', async scope => {
    const base = host();
    const child = vi.fn((back: (notice?: string) => Picker): Picker => ({
      title: 'Thinking child — current session', empty: '', back: () => back(), load: async () => [], apply: async () => undefined,
    }));
    const h = { ...base, thinkingSettings: child };
    const picker = settingsPicker(h, scope, 'Model');
    const overlay = new OverlayHost(() => {});
    const frame = () => overlay.render(120, 32).map(stripAnsi).join('\n');
    overlay.open(picker); await Promise.resolve(); await Promise.resolve();
    overlay.handleKey(parseKeyEvent('\x1b[C'), vi.fn());
    expect(frame()).toContain('Settings — current session');
    expect(frame()).toContain('Session /');
    expect(picker.chips?.active).toBe('Session');
    expect(frame()).not.toContain('Maximum turns');
    overlay.handlePaste('reasoning');
    expect(frame()).toContain('▸ Thinking effort');
    overlay.handleKey(parseKeyEvent('\x1b'), vi.fn());
    expect(picker.chips?.active).toBe('Session');
    expect(frame()).toContain('▸ Thinking effort');
    expect(frame()).toContain(`${scope} configuration`);
    let pending: Promise<unknown> | undefined;
    overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => {
      pending = selected.apply(ids).then(outcome => { if (outcome?.next) overlay.open(outcome.next); });
    });
    await pending; await Promise.resolve(); await Promise.resolve();
    expect(frame()).toContain('Thinking child — current session');
    overlay.handleKey(parseKeyEvent('\x1b'), vi.fn());
    await Promise.resolve(); await Promise.resolve();
    expect(frame()).toContain('Settings — current session');
    expect(frame()).toContain(`${scope} configuration`);
    expect(frame()).toContain('▸ Thinking effort');
    expect(child).toHaveBeenCalledOnce();
    expect(base.save).not.toHaveBeenCalled();
    overlay.close();
  });

  it('exposes memory and shell diagnostics as read-only drafts owned by their commands', async () => {
    const h = host();
    const picker = settingsPicker(h);
    const rows = await picker.load();
    expect(picker.chips?.items.map(item => item.id)).toEqual(expect.arrayContaining(['Memory', 'Shell']));
    expect(rows.find(row => row.id === 'settings:memory')).toMatchObject({ label: 'Memory status', note: 'read-only' });
    expect(rows.find(row => row.id === 'settings:shell')).toMatchObject({ label: 'Shell diagnostics', note: 'read-only' });
    expect(picker.filterOptions!('memory', rows)[0]?.id).toBe('settings:memory');
    expect(picker.detail?.('settings:memory')).toEqual([
      'Insert /memory status to inspect memory health, candidates and saved facts through the memory owner.',
    ]);
    expect(await picker.apply(['settings:memory'])).toEqual({ draft: '/memory status' });
    expect(await picker.apply(['settings:shell'])).toEqual({ draft: '/shell status' });
    expect(h.save).not.toHaveBeenCalled();

    const memory = settingsPicker(h, 'user', 'Memory');
    const overlay = new OverlayHost(() => {});
    overlay.open(memory); await Promise.resolve(); await Promise.resolve();
    expect(overlay.render(100, 30).map(stripAnsi).join('\n')).toContain('Memory status');
    const selected = vi.fn();
    overlay.handleKey(parseKeyEvent('\r'), selected);
    expect(selected).toHaveBeenCalledWith(memory, ['settings:memory']);
    overlay.close();
  });

  it.each(['typed', 'pasted'] as const)('focuses the strongest result for a new %s search instead of retaining an unrelated match', async input => {
    const h = host(); const picker = settingsPicker(h); const overlay = new OverlayHost(() => {});
    overlay.open(picker); await Promise.resolve(); await Promise.resolve();
    if (input === 'pasted') overlay.handlePaste('topP');
    else for (const character of 'topP') overlay.handleKey(parseKeyEvent(character), vi.fn());
    expect(overlay.render(120, 40).map(stripAnsi).join('\n')).toMatch(/▸ (?:● )?Top P/);
    const selected = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), selected);
    expect(selected).toHaveBeenCalledWith(picker, ['topP']);
    expect(h.save).not.toHaveBeenCalled(); overlay.close();
  });
  it('retains manually chosen search focus until the query changes and restores the pre-search field when cleared', async () => {
    const h = host(); const picker = settingsPicker(h, 'user', 'Model', 'temperature');
    const overlay = new OverlayHost(() => {}); overlay.open(picker); await Promise.resolve(); await Promise.resolve();
    const focus = () => overlay.render(120, 40).map(stripAnsi).find(row => row.includes('▸ '))?.split('▸ ')[1]?.trim();
    expect(focus()).toContain('Temperature');
    overlay.handlePaste('topP'); overlay.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
    const manual = focus(); expect(manual).toBeDefined(); expect(manual).not.toContain('Top P');
    overlay.handlePaste('');
    expect(focus()).toBe(manual);
    overlay.handleKey(parseKeyEvent('\x7f'), vi.fn()); overlay.handlePaste('P');
    expect(focus()).toContain('Top P');
    for (const character of 'topP') overlay.handleKey(parseKeyEvent('\x7f'), vi.fn());
    const restored = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), restored);
    expect(restored).toHaveBeenCalledWith(picker, ['temperature']);
    expect(h.save).not.toHaveBeenCalled(); overlay.close();
  });
  it.each(CONFIG_SETTINGS.filter(setting => setting.choices && setting.key !== 'theme').map(setting => ({ setting })))('opens $setting.key on its effective choice without staging or writing', async ({ setting }) => {
    const value = setting.choices![setting.choices!.length - 1]; const base = host();
    const h = { ...base, openSettings(scope?: 'user' | 'project') {
      const draft = base.openSettings(scope);
      return { ...draft, values: { ...draft.values, [setting.key]: { ...draft.values[setting.key],
        effective: value, requested: setting.choices![0], stored: setting.choices![0] } } };
    } };
    const field = await detail(h, setting.key); const overlay = new OverlayHost(() => {});
    overlay.open(field); await Promise.resolve(); await Promise.resolve();
    const rows = overlay.render(120, 40).map(stripAnsi).join('\n');
    expect(rows).toContain(`▸ Choose ${formatSetting(value)}`);
    const apply = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), apply);
    expect(apply.mock.calls[0]?.[1]).toEqual([`choice:${setting.choices!.length - 1}`]);
    expect(h.save).not.toHaveBeenCalled(); overlay.close();
  });
  it('focuses value inspection when the effective enum value has no declared choice', async () => {
    const h = host(); const field = await detail(h, 'toolDiscovery'); const overlay = new OverlayHost(() => {});
    overlay.open(field); await Promise.resolve(); await Promise.resolve();
    const apply = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), apply);
    expect(apply.mock.calls[0]?.[1]).toEqual(['inspect']);
    expect(h.save).not.toHaveBeenCalled(); overlay.close();
  });
  it('searches every group with literal-first fuzzy ranking and restores the selected group when cleared', async () => {
    const h = host();
    const picker = settingsPicker(h, 'user', 'Interaction');
    const options = await picker.load();
    expect(picker.filterOptions!('', options).some(option => option.id === 'maxTurns')).toBe(false);
    const fuzzy = picker.filterOptions!('mxtrns', options);
    expect(fuzzy[0]?.id).toBe('maxTurns');
    expect(picker.title).toContain('Search all groups');
    expect(picker.chips?.active).toBe('all');
    expect(picker.filterOptions!('maxturns', options)[0]?.id).toBe('maxTurns');
    expect(picker.filterOptions!('no-such-setting', options)).toEqual([]);
    const restored = picker.filterOptions!('', options);
    expect(restored.length).toBeGreaterThan(0);
    expect(restored.some(option => option.id === 'section:Interaction / Input')).toBe(true);
    expect(picker.chips?.active).toBe('Interaction');
    expect(picker.title).toContain(' — Interaction');
    expect(h.save).not.toHaveBeenCalled();
  });
  it('keeps cross-group matches grouped by best rank with stable ties', async () => {
    const picker = settingsPicker(host()); const options = await picker.load();
    const results = picker.filterOptions!('tokens', options);
    expect(results.length).toBeGreaterThan(2);
    expect(picker.filterOptions!('tokens', [...options])).toEqual(results);
    const groupNames = results.map(option => CONFIG_SETTINGS.find(setting => setting.key === option.id)!.group);
    const blocks = groupNames.filter((group, index) => index === 0 || groupNames[index - 1] !== group);
    expect(new Set(blocks).size).toBe(blocks.length);
    expect(picker.filterOptions!('contextwindow', options)[0]?.id).toBe('contextWindow');
  });
  it('routes typed and pasted cross-group searches through the real overlay without saving', async () => {
    const h = host(); const overlay = new OverlayHost(() => {});
    overlay.open(settingsPicker(h, 'user', 'Interaction'));
    await Promise.resolve(); await Promise.resolve();
    overlay.handlePaste('mxtrns');
    let output = overlay.render(120, 40).map(stripAnsi).join('\n');
    expect(output).toContain('Search all groups');
    expect(output).toContain('Maximum turns');
    for (let index = 0; index < 6; index++) overlay.handleKey(parseKeyEvent('\x7f'), vi.fn());
    output = overlay.render(120, 40).map(stripAnsi).join('\n');
    expect(output).toContain('Interaction');
    expect(output).not.toContain('Maximum turns');
    overlay.handleKey(parseKeyEvent('maxTurns'), vi.fn());
    const applied: Promise<void>[] = [];
    overlay.handleKey(parseKeyEvent('\r'), (picker, ids) => { applied.push(picker.apply(ids).then(outcome => {
      if (outcome?.next) overlay.open(outcome.next);
    })); });
    await Promise.all(applied); await Promise.resolve();
    expect(overlay.render(120, 40).map(stripAnsi).join('\n')).toContain('Maximum turns — save to user');
    overlay.close(); expect(h.save).not.toHaveBeenCalled();
  });
  it('returns from a search result to its owning group with that field focused', async () => {
    const h = host(); const picker = settingsPicker(h, 'user', 'Interaction'); await picker.load();
    const detail = (await picker.apply(['maxTurns']))!.next!;
    const back = (await detail.apply(['back']))!.next!;
    expect(back.chips?.active).toBe('Model');
    expect(back.initialSelection).toBe('maxTurns');
    const overlay = new OverlayHost(() => {}); overlay.open(back);
    await Promise.resolve(); await Promise.resolve();
    const apply = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), apply);
    expect(apply).toHaveBeenCalledWith(back, ['maxTurns']);
    expect(h.save).not.toHaveBeenCalled();
  });
  it('lists searchable grouped advanced fields without personal credentials or CLI exemptions', async () => {
    const h = host(); const picker = settingsPicker(h); const options = await picker.load();
    expect(options.some(item => item.id === 'maxOutputTokens' && item.label.includes('Output token limit'))).toBe(true);
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
  it('revokes a composer preview after an external configuration publication', async () => {
    let revision = 0;
    const preview = vi.fn();
    const h = { ...host(), configurationRevision: () => revision, previewComposerShape: preview };
    const field = await detail(h, 'tui.composerShape');
    const choices = CONFIG_SETTINGS.find(item => item.key === 'tui.composerShape')!.choices!;
    const box = `choice:${choices.indexOf('box')}`;
    const fallback = `choice:${choices.indexOf('default')}`;
    field.previewChange!([box]);
    expect(preview).toHaveBeenLastCalledWith('box');
    revision++;
    field.previewChange!([fallback]);
    expect(preview).toHaveBeenLastCalledWith(undefined);
    const result = await field.apply([fallback]);
    expect(result?.note).toContain('Display preview is unavailable');
    expect(h.save).not.toHaveBeenCalled();
  });
  it('revokes a status preview after an external configuration publication', async () => {
    let revision = 0;
    const preview = vi.fn();
    const h = { ...host(), configurationRevision: () => revision, previewStatusItems: preview };
    const field = await detail(h, 'tui.statusItems');
    const editor = (await field.apply(['edit']))!.next!;
    editor.previewChange!(['cost']);
    expect(preview).toHaveBeenLastCalledWith(['cost']);
    revision++;
    editor.previewChange!(['model']);
    expect(preview).toHaveBeenLastCalledWith(undefined);
  });
  it('does not let a theme preview overwrite an externally accepted theme', async () => {
    let revision = 0;
    let shown = 'dark';
    const themes = {
      names: () => ['dark', 'light', 'external'],
      selected: () => shown,
      revision: () => revision,
      begin: vi.fn(() => {
        const accepted = revision;
        return {
          show(name: string) {
            if (accepted !== revision) return false;
            shown = name;
            return true;
          },
          end() {
            if (accepted === revision) shown = 'dark';
          },
        };
      }),
    };
    const h = { ...host(), themes };
    const field = await detail(h, 'theme');
    const light = `choice:${themes.names().indexOf('light')}`;
    field.previewChange!([light]);
    expect(shown).toBe('light');
    revision++;
    shown = 'external';
    field.previewChange!([light]);
    expect(shown).toBe('external');
    const result = await field.apply([light]);
    expect(result?.note).toContain('Theme preview is unavailable');
    expect(h.save).not.toHaveBeenCalled();
  });
  it.each([80, 120])('shows effective/source/stored/target and pending state at %i columns', async width => {
    const h = host(); const field = await detail(h);
    const overlay = new OverlayHost(() => {}); overlay.open(field); await Promise.resolve(); await Promise.resolve();
    const rows = overlay.render(width, 24).map(stripAnsi).join('\n');
    expect(rows).toContain('save to user'); expect(rows).toContain('Effective: true'); expect(rows).toContain('override');
    expect(rows).toContain('Stored: false'); expect(rows).toContain('/profile/config.json');
    overlay.open((await field.apply(['choice:1']))!.next!); await Promise.resolve(); await Promise.resolve();
    expect(overlay.render(width, 24).map(stripAnsi).join('\n')).toContain('Pending: false'); overlay.close();
  });
  it('edits a typed number, rejects invalid input and stages removal without writing', async () => {
    const h = host(); const field = await detail(h, 'maxTurns'); const editor = (await field.apply(['edit']))!.next!;
    expect(editor.input?.validate('0')).toContain('Invalid value'); expect(editor.input?.validate('"secret"')).toBeDefined();
    expect(editor.input?.validate('42')).toBeUndefined();
    const staged = (await editor.input!.apply('42'))!.next!;
    await staged.apply(['apply']); expect(h.save).toHaveBeenCalledWith('maxTurns', 42);
    h.save.mockClear(); const remove = (await field.apply(['unset']))!.next!;
    expect(h.save).not.toHaveBeenCalled(); await remove.apply(['apply']); expect(h.save).toHaveBeenCalledWith('maxTurns', undefined);
  });
  it.each(['prefix\rpart', 'prefix\r\npart'])(
    'retains a list item containing loaded newlines through untouched form submission: %j', async item => {
      const original = [item, 'unchanged'], base = host();
      const h = { ...base, openSettings(scope?: 'user' | 'project') {
        const draft = base.openSettings(scope);
        return { ...draft, values: { ...draft.values,
          hiddenToolPrefixes: { ...draft.values.hiddenToolPrefixes, effective: original, requested: original, stored: original },
        } };
      } };
      const field = await detail(h, 'hiddenToolPrefixes');
      const editor = (await field.apply(['edit']))!.next!;
      expect(editor.input!.initial).toBe(formatSetting(original));
      const overlay = new OverlayHost(() => {});
      overlay.open(editor); await Promise.resolve(); await Promise.resolve();
      let pending: ReturnType<Picker['apply']> | undefined;
      overlay.handleKey(parseKeyEvent('\r'), (picker, ids) => { pending = picker.apply(ids); });
      const staged = (await pending)!.next!;
      overlay.close();
      expect(base.save).not.toHaveBeenCalled();
      await staged.apply(['apply']);
      expect(base.save).toHaveBeenCalledWith('hiddenToolPrefixes', original);
    },
  );
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
    const preview = vi.fn();
    const h = { ...host(), previewStatusItems: preview }; const field = await detail(h, 'tui.statusItems');
    const editor = (await field.apply(['edit']))!.next!;
    expect(editor.multiple).toBe(true); expect(editor.input).toBeUndefined();
    editor.previewChange!(['cost', 'model']);
    expect(preview).toHaveBeenLastCalledWith(['model', 'cost']);
    editor.previewEnd!();
    expect(preview).toHaveBeenLastCalledWith(undefined);
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
    overlay.handleKey(parseKeyEvent('\x1b'), vi.fn());
    await Promise.resolve(); await Promise.resolve();
    expect(overlay.active).toBe(true);
    expect(overlay.render(100, 30).map(stripAnsi).join('\n')).toContain('Settings — user');
    const selected = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), selected);
    expect(selected.mock.calls[0]?.[1]).toEqual(['maxTurns']);
    expect(h.save).not.toHaveBeenCalled(); overlay.close();
  });
  it('returns from an input editor without saving its draft and preserves an earlier staged value', async () => {
    const h = host(), field = await detail(h, 'maxTurns');
    const editor = (await field.apply(['edit']))!.next!;
    const pending = (await editor.input!.apply('42'))!.next!;
    const editAgain = (await pending.apply(['edit']))!.next!;
    const overlay = new OverlayHost(() => {}); overlay.open(editAgain);
    await Promise.resolve(); await Promise.resolve();
    overlay.handleKey(parseKeyEvent('7'), vi.fn());
    overlay.handleKey(parseKeyEvent('\x1b'), vi.fn());
    await Promise.resolve(); await Promise.resolve();
    expect(overlay.active).toBe(true);
    const frame = overlay.render(120, 32).map(stripAnsi).join('\n');
    expect(frame).toContain('Pending: 42'); expect(frame).not.toContain('Pending: 427');
    expect(h.save).not.toHaveBeenCalled(); overlay.close();
  });
  it('cancels scope selection back to the staged field and drops it only when returning to the catalogue', async () => {
    const h = host(), field = await detail(h), staged = (await field.apply(['choice:0']))!.next!;
    const scopes = (await staged.apply(['scope']))!.next!;
    const overlay = new OverlayHost(() => {}); overlay.open(scopes);
    await Promise.resolve(); await Promise.resolve();
    overlay.handleKey(parseKeyEvent('\x1b'), vi.fn());
    await Promise.resolve(); await Promise.resolve();
    expect(overlay.render(120, 32).map(stripAnsi).join('\n')).toContain('Pending: true');
    overlay.handleKey(parseKeyEvent('\x1b'), vi.fn());
    await Promise.resolve(); await Promise.resolve();
    expect(overlay.render(120, 32).map(stripAnsi).join('\n')).not.toContain('Pending: true');
    const selected = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), selected);
    expect(selected.mock.calls[0]?.[1]).toEqual(['attentionOnIdle']);
    expect(h.save).not.toHaveBeenCalled(); overlay.close();
  });
  it.each([[], ['unknown'], ['maxTurns', 'offline']].map(ids => ({ ids })))('ignores invalid selections $ids', async ({ ids }) => {
    const h = host(); const picker = settingsPicker(h); await picker.load();
    expect(await picker.apply(ids)).toBeUndefined(); expect(h.save).not.toHaveBeenCalled();
  });
});
