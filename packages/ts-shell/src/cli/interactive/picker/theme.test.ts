import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CONFIG_SETTINGS } from '../../../config/settings.js';
import { themePreferences } from '../../../presentation/theme/preview.js';
import { selectTheme, selectedTheme } from '../../../presentation/theme/selection.js';
import { currentTheme } from '../../../presentation/theme/theme.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';
import { settingsPicker } from './settings.js';
import { opensPicker, pickerFor, type PickerHost } from './registry.js';
import type { PickerOutcome } from '../overlay.js';
import { OverlayHost } from '../overlay.js';
import type { SettingsDraft, SettingsSaveResult } from '../settings.js';

beforeEach(() => { selectTheme('dark'); });
afterEach(() => { selectTheme('dark'); });

function host() {
  const save = vi.fn(async (_key: string, value: unknown): Promise<SettingsSaveResult> => {
    expect(currentTheme()).toBe(selectedTheme());
    selectTheme(String(value));
    return { note: 'Saved.', applied: true };
  });
  const themes = themePreferences({ workspaceRoot: process.cwd(), follower: { stop() {}, refresh() {} }, redraw() {} });
  const reopen = vi.fn((scope: 'user' | 'project' = 'user'): SettingsDraft | undefined => ({ scope, file: '/fixture/config.json', save, reopen,
    definitions: CONFIG_SETTINGS.filter(item => item.key === 'theme'),
    values: { theme: { effective: currentTheme(), requested: selectedTheme(), stored: selectedTheme(), source: 'user', requestedSource: 'user', restartRequired: false } },
  }));
  const openSettings = vi.fn((scope: 'user' | 'project' = 'user') => reopen(scope)!);
  return { themes, save, openSettings, reopen };
}
async function detail(h: ReturnType<typeof host>) {
  const picker = settingsPicker(h); await picker.load(); return (await picker.apply(['theme']))!.next!;
}
async function choice(picker: Awaited<ReturnType<typeof detail>>, name: string) {
  return (await picker.load()).find(option => option.label === `Choose "${name}"`)!.id;
}

it('focuses the accepted theme and previews keyboard choices without saving, then cancels', async () => {
  selectTheme('light'); const h = host(); const picker = await detail(h);
  const id = await choice(picker, 'light'); expect(picker.initialSelection).toBe(id);
  const overlay = new OverlayHost(() => {}); overlay.open(picker); await Promise.resolve(); await Promise.resolve();
  expect(currentTheme()).toBe('light');
  overlay.handleKey(parseKeyEvent('\x1b[B'), vi.fn()); expect(currentTheme()).toBe('light-contrast');
  expect(selectedTheme()).toBe('light'); expect(h.save).not.toHaveBeenCalled();
  overlay.handleKey(parseKeyEvent('\x1b'), vi.fn()); expect(currentTheme()).toBe('light');
});

it('stages, previews the pending theme, and ends preview before explicit Apply', async () => {
  const h = host(); const picker = await detail(h); const light = await choice(picker, 'light');
  picker.previewChange!([light]); expect(currentTheme()).toBe('light');
  const staged = (await picker.apply([light]))!.next!;
  expect(h.save).not.toHaveBeenCalled(); expect(currentTheme()).toBe('dark');
  staged.previewChange!(['apply']); expect(currentTheme()).toBe('light');
  expect((await staged.load()).find(option => option.id === 'pending')?.label).toBe('Pending: "light"');
  await staged.apply(['apply']); expect(h.save).toHaveBeenCalledWith('theme', 'light'); expect(selectedTheme()).toBe('light');
  picker.previewEnd!(); staged.previewEnd!(); expect(currentTheme()).toBe('light');
});

it('retains a failed Apply choice, restores accepted appearance, and reopens its original draft only on retry', async () => {
  const h = host(); h.save.mockResolvedValueOnce({ note: 'Saved. Application not confirmed.', applied: false });
  const picker = await detail(h); const staged = (await picker.apply([await choice(picker, 'light')]))!.next!;
  staged.previewChange!(['apply']); const result = await staged.apply(['apply']); const retry = result!.next!;
  expect(currentTheme()).toBe('dark'); expect(retry.title).toContain('Apply not confirmed');
  expect((await retry.load()).find(option => option.id === 'pending')?.label).toContain('light');
  retry.previewChange!(['apply']); expect(currentTheme()).toBe('dark'); expect(h.openSettings).toHaveBeenCalledOnce();
  expect(h.reopen).toHaveBeenCalledOnce();
  await retry.apply(['apply']); expect(h.openSettings).toHaveBeenCalledOnce(); expect(h.reopen).toHaveBeenCalledTimes(2);
  expect(h.save).toHaveBeenCalledTimes(2); expect(h.save).toHaveBeenLastCalledWith('theme', 'light'); expect(selectedTheme()).toBe('light');
});

it('retains a failed theme choice when its original draft cannot reopen and never acquires another host', async () => {
  const h = host(); h.save.mockResolvedValueOnce({ note: 'Apply failed.', applied: false });
  const picker = await detail(h); const staged = (await picker.apply([await choice(picker, 'light')]))!.next!;
  const retry = (await staged.apply(['apply']))!.next!;
  h.reopen.mockReturnValueOnce(undefined);
  const refused = await retry.apply(['apply']);
  expect(refused?.note).toContain('Settings changed or the session moved');
  expect(h.openSettings).toHaveBeenCalledOnce(); expect(h.reopen).toHaveBeenCalledTimes(2); expect(h.save).toHaveBeenCalledOnce();
  expect((await refused!.next!.load()).find(row => row.id === 'pending')?.label).toContain('light');
  expect(selectedTheme()).toBe('dark'); expect(currentTheme()).toBe('dark');
});

it('reports invalid previews safely and never stages an unavailable theme', async () => {
  const h = host(); h.themes.names = () => ['dark', 'missing']; const picker = await detail(h);
  const missing = await choice(picker, 'missing'); picker.previewChange!([missing]);
  expect(picker.title).toContain('Preview unavailable'); expect(currentTheme()).toBe('dark');
  const result = await picker.apply([missing]); expect(result?.note).toContain('Theme preview is unavailable');
  expect((await result!.next!.load()).find(option => option.id === 'pending')).toBeUndefined();
  expect(h.save).not.toHaveBeenCalled(); result!.next!.previewEnd!();
});

it.each([true, false])('rejects stale preview callbacks after a newer accepted choice, started=%s', async started => {
  const h = host(); const picker = await detail(h); const light = await choice(picker, 'light');
  if (started) picker.previewChange!([light]); selectTheme('dark');
  picker.previewChange!([light]); expect(currentTheme()).toBe('dark');
  picker.previewEnd!(); expect(currentTheme()).toBe('dark');
});

it('opens the bare theme command as a live session picker and leaves named forms to the command', async () => {
  const h = host();
  h.themes.names = () => ['auto', 'dark', 'dark-contrast', 'light'];
  const pickerHost = { ...h, commandContext: { cwd: process.cwd() } } as PickerHost;
  const picker = pickerFor('/theme', pickerHost)!;
  expect(opensPicker('/theme')).toBe(true);
  expect(opensPicker('/theme list')).toBe(false);
  expect(opensPicker('/theme light')).toBe(false);
  expect(pickerFor('/theme light', pickerHost)).toBeUndefined();
  const overlay = new OverlayHost(() => {});
  overlay.open(picker);
  await Promise.resolve();
  await Promise.resolve();
  expect(picker.initialSelection).toBe('dark');
  overlay.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
  const previewed = currentTheme();
  expect(previewed).toBe('dark-contrast');
  expect(selectedTheme()).toBe('dark');
  let outcome: Promise<PickerOutcome | undefined> | undefined;
  overlay.handleKey(parseKeyEvent('\r'), (active, ids) => { outcome = active.apply(ids, overlay.acceptanceFor(active)); });
  expect((await outcome)?.note).toContain('for this session');
  expect(selectedTheme()).toBe(previewed);
  expect(currentTheme()).toBe(previewed);
  expect(h.save).not.toHaveBeenCalled();
});

it('restores the accepted theme after dismissing the picker and refuses an outdated choice', async () => {
  const h = host();
  const pickerHost = { ...h, commandContext: { cwd: process.cwd() } } as PickerHost;
  const picker = pickerFor('/theme', pickerHost)!;
  await picker.load();
  picker.previewChange!(['light']);
  expect(currentTheme()).toBe('light');
  picker.previewEnd!();
  expect(currentTheme()).toBe('dark');
  expect(await picker.apply(['light'])).toBeUndefined();

  const stale = pickerFor('/theme', pickerHost)!;
  await stale.load();
  selectTheme('dark-contrast');
  expect((await stale.apply(['light']))?.note).toContain('Reopen /theme');
  expect(currentTheme()).toBe('dark-contrast');
  expect(h.save).not.toHaveBeenCalled();
});
