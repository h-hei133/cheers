import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { themePreferences } from './preview.js';
import { isThemePreviewActive, prepareThemeSelection, selectedTheme, selectTheme, updateAppearance } from './selection.js';
import { currentTheme, defaultTheme } from './theme.js';
import { createThemeReloader, followTheme, resolveThemeTarget, RELOAD_DEBOUNCE_MS } from '../themes/watch.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-preview-'));
  vi.stubEnv('FORCE_COLOR', '3'); selectTheme('dark'); updateAppearance('dark');
});
afterEach(() => {
  selectTheme('dark'); updateAppearance('dark');
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

function preferences() {
  const follower = { stop: vi.fn(), refresh: vi.fn() };
  const redraw = vi.fn();
  return { follower, redraw, controller: themePreferences({ workspaceRoot: root, extraPaths: [root], follower, redraw }) };
}
function custom(name = 'mine') {
  const file = path.join(root, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify({ name, colors: { accent: '#123456' } }));
  selectTheme(name, root, [root]);
  return file;
}

it('restores exact accepted colors and mode after the original file disappears', () => {
  const file = custom(); const before = defaultTheme.fg('accent', 'x');
  const { controller, follower, redraw } = preferences();
  const lease = controller.begin();
  expect(follower.stop).toHaveBeenCalledOnce();
  vi.stubEnv('FORCE_COLOR', '1'); lease.show('light');
  expect(selectedTheme()).toBe('mine'); expect(currentTheme()).toBe('light');
  fs.unlinkSync(file); const revision = defaultTheme.colorRevision;
  lease.end();
  expect(defaultTheme.fg('accent', 'x')).toBe(before);
  expect(defaultTheme.colorMode).toBe('truecolor');
  expect(currentTheme()).toBe('mine'); expect(defaultTheme.colorRevision).toBeGreaterThan(revision);
  expect(follower.refresh).toHaveBeenCalledOnce(); expect(redraw).toHaveBeenCalledTimes(2);
  expect(lease.show('dark')).toBe(false); lease.end(); expect(follower.refresh).toHaveBeenCalledOnce();
});

it('remembers appearance while an explicit preview stays fixed and restores latest auto', () => {
  selectTheme('auto'); const lease = preferences().controller.begin(); lease.show('dark-contrast');
  expect(updateAppearance('light')).toBe(false); expect(currentTheme()).toBe('dark-contrast');
  expect(selectedTheme()).toBe('auto'); lease.end(); expect(currentTheme()).toBe('light');
});

it('follows appearance in auto preview without changing explicit accepted intent', () => {
  const lease = preferences().controller.begin(); lease.show('auto');
  expect(updateAppearance('light')).toBe(true); expect(currentTheme()).toBe('light');
  expect(selectedTheme()).toBe('dark'); lease.end(); expect(currentTheme()).toBe('dark');
  selectTheme('auto'); expect(currentTheme()).toBe('light');
});

it.each(['dark', 'light'])('revokes old callbacks after a newer accepted %s selection', name => {
  const { controller, follower } = preferences(); const lease = controller.begin(); lease.show('light-contrast');
  selectTheme(name); const revision = defaultTheme.colorRevision;
  expect(isThemePreviewActive()).toBe(false); expect(follower.refresh).toHaveBeenCalledOnce();
  expect(lease.show('dark-contrast')).toBe(false); lease.end();
  expect(selectedTheme()).toBe(name); expect(currentTheme()).toBe(name); expect(defaultTheme.colorRevision).toBe(revision);
});

it('leaves a preview intact after failed preparation and restores before a second lease', () => {
  const { controller } = preferences(); const first = controller.begin(); first.show('light');
  const revision = defaultTheme.colorRevision;
  expect(() => prepareThemeSelection('missing', root)).toThrow();
  expect(() => first.show('missing')).toThrow(); expect(defaultTheme.colorRevision).toBe(revision);
  const second = controller.begin(); second.show('dark-contrast'); first.end();
  expect(first.show('light')).toBe(false); expect(currentTheme()).toBe('dark-contrast');
  second.end(); expect(currentTheme()).toBe('dark');
});

it('blocks queued reloads and follower refresh while previewing the same custom theme', () => {
  vi.useFakeTimers(); const file = custom();
  const onReload = vi.fn(); const target = resolveThemeTarget(root, [root])!;
  const reloader = createThemeReloader(target, onReload);
  const follower = followTheme({ workspaceRoot: root, extraPaths: [root], onReload });
  const watch = vi.spyOn(fs, 'watch');
  try {
    reloader.schedule();
    const lease = themePreferences({ workspaceRoot: root, extraPaths: [root], follower, redraw: vi.fn() }).begin();
    lease.show('mine'); const colors = defaultTheme.fg('accent', 'x');
    fs.writeFileSync(file, JSON.stringify({ name: 'mine', colors: { accent: '#abcdef' } }));
    follower.refresh(); expect(watch).not.toHaveBeenCalled();
    expect(resolveThemeTarget(root, [root])).toBeUndefined();
    vi.advanceTimersByTime(RELOAD_DEBOUNCE_MS + 1); reloader.reload();
    expect(defaultTheme.fg('accent', 'x')).toBe(colors); expect(onReload).not.toHaveBeenCalled();
    lease.end(); expect(watch).toHaveBeenCalledOnce();
    reloader.reload(); expect(defaultTheme.fg('accent', 'x')).not.toBe(colors);
  } finally { reloader.stop(); follower.stop(); }
});
