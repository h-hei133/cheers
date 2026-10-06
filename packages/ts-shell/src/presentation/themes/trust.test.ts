import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { projectTrust } from '../../core/security/trust/store.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { configurationAdmission, initialConfiguration, refreshConfiguration } from '../../core/shell/configuration.js';
import { currentTheme, defaultTheme } from '../theme/theme.js';
import { selectTheme } from '../theme/selection.js';
import { getDefaultTheme, listThemes, loadTheme, themeDirectories, themeSource, themeSourcePath } from './index.js';
import { createThemeReloader, resolveThemeTarget } from './watch.js';

let home: string;
let root: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-trust-')); root = path.join(home, 'workspace');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('FORCE_COLOR', '2');
  selectTheme('auto');
});
afterEach(() => {
  vi.restoreAllMocks(); selectTheme('auto'); vi.unstubAllEnvs();
  fs.rmSync(home, { recursive: true, force: true });
});
function write(directory: string, name = 'dark', color = '#123456'): string {
  fs.mkdirSync(directory, { recursive: true }); const file = path.join(directory, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify({ name, colors: { accent: color } })); return file;
}
function projectDirectory(directory = root): string { return path.join(directory, '.agents', 'themes'); }
function host(theme?: string) {
  const runtimeConfigOverrides = theme ? { theme } : {};
  const source = { projectRoot: root, session: { id: 'theme-trust' }, runtimeConfigOverrides,
    runtimeConfig: getRuntimeConfig(root, runtimeConfigOverrides) };
  return { ...source, configuration: initialConfiguration(source) };
}

it.each(['undecided', 'untrusted', 'unavailable'])('excludes automatic project assets and diagnostics under %s', decision => {
  const directory = projectDirectory(); write(directory); write(directory, 'PRIVATE_THEME');
  fs.writeFileSync(path.join(directory, 'broken.json'), '{PRIVATE_CONTENT');
  if (decision === 'untrusted') projectTrust.setProjectTrust(root, 'untrusted');
  if (decision === 'unavailable') {
    fs.mkdirSync(path.join(home, '.cheers')); fs.writeFileSync(path.join(home, '.cheers', 'trust.json'), '{PRIVATE_TRUST');
  }
  const read = vi.spyOn(fs, 'readFileSync');
  expect(loadTheme('dark', root)).toEqual(getDefaultTheme());
  expect(listThemes(root)).not.toContain('PRIVATE_THEME'); expect(listThemes(root)).not.toContain('broken');
  expect(themeSource('dark', root)).toBe('built-in'); expect(themeSourcePath('dark', root)).toBeUndefined();
  expect(themeDirectories(root)).not.toContain(directory);
  expect(read.mock.calls.some(([file]) => String(file).startsWith(directory))).toBe(false);
});

it('preserves personal themes and explicit files or directories without granting the project', () => {
  write(projectDirectory()); const userFile = write(path.join(home, '.cheers', 'themes'), 'dark', '#abcdef');
  const explicit = write(projectDirectory(), 'named', '#fedcba');
  projectTrust.setProjectTrust(root, 'untrusted');
  expect(loadTheme('dark', root)?.colors.accent).toBe('#abcdef'); expect(themeSourcePath('dark', root)).toBe(userFile);
  expect(loadTheme('named', root, [explicit])?.colors.accent).toBe('#fedcba');
  expect(loadTheme('dark', root, [projectDirectory()])?.colors.accent).toBe('#123456');
  expect(projectTrust.decision(root)).toBe('untrusted');
});

it('does not extend a child grant to ancestor resources and honors covering refusals', () => {
  const child = path.join(root, 'child'); fs.mkdirSync(child);
  write(projectDirectory(), 'outer'); write(projectDirectory(child), 'inner');
  projectTrust.setProjectTrust(child, 'session-only');
  expect(listThemes(child)).toContain('inner'); expect(listThemes(child)).not.toContain('outer');
  projectTrust.setProjectTrust(root, 'untrusted'); projectTrust.setProjectTrust(child, 'trusted');
  expect(listThemes(child)).not.toContain('inner'); expect(listThemes(child)).not.toContain('outer');
});

it.each(['themes', 'agents', 'workspace'])('does not transfer a grant through a replaced %s link', kind => {
  const outside = path.join(home, 'outside'); write(projectDirectory(outside), 'outside');
  write(projectDirectory(), 'inside'); projectTrust.setProjectTrust(root, 'trusted');
  expect(listThemes(root)).toContain('inside');
  const original = kind === 'themes' ? projectDirectory() : kind === 'agents' ? path.join(root, '.agents') : root;
  const target = kind === 'themes' ? projectDirectory(outside) : kind === 'agents' ? path.join(outside, '.agents') : outside;
  fs.rmSync(original, { recursive: true }); fs.symlinkSync(target, original, 'dir');
  expect(listThemes(root)).not.toContain('outside'); expect(themeSourcePath('outside', root)).toBeUndefined();
});

it('uses the canonical resource path after the lexical theme directory changes during authorization', () => {
  const approved = path.join(home, 'approved'); const outside = path.join(home, 'outside');
  write(approved, 'inside'); write(outside, 'outside'); fs.mkdirSync(path.join(root, '.agents'));
  const alias = projectDirectory(); fs.symlinkSync(approved, alias, 'dir'); projectTrust.setProjectTrust(approved, 'trusted');
  const decide = projectTrust.isProjectTrusted.bind(projectTrust);
  vi.spyOn(projectTrust, 'isProjectTrusted').mockImplementationOnce(directory => {
    const result = decide(directory); fs.unlinkSync(alias); fs.symlinkSync(outside, alias, 'dir'); return result;
  });
  expect(listThemes(root)).toContain('inside'); expect(listThemes(root)).not.toContain('outside');
});

it('discards project results when trust is revoked during file reading', () => {
  const file = write(projectDirectory()); projectTrust.setProjectTrust(root, 'trusted');
  const read = fs.readFileSync;
  vi.spyOn(fs, 'readFileSync').mockImplementation((...args: Parameters<typeof fs.readFileSync>) => {
    const result = read(...args);
    if (String(args[0]) === file) projectTrust.setProjectTrust(root, 'untrusted');
    return result;
  });
  expect(loadTheme('dark', root)).toEqual(getDefaultTheme());
});

it('rechecks individual file identity after directory enumeration', () => {
  const file = write(projectDirectory(), 'private'); const external = write(path.join(home, 'outside'), 'private');
  projectTrust.setProjectTrust(root, 'trusted'); const enumerate = fs.readdirSync;
  vi.spyOn(fs, 'readdirSync').mockImplementation(((...args: Parameters<typeof fs.readdirSync>) => {
    const entries = enumerate(...args);
    if (String(args[0]) === projectDirectory()) { fs.unlinkSync(file); fs.symlinkSync(external, file); }
    return entries;
  }) as typeof fs.readdirSync);
  expect(listThemes(root)).not.toContain('private');
});

it('discards earlier project results if a later directory read changes trust', () => {
  const child = path.join(root, 'child'); fs.mkdirSync(child);
  write(projectDirectory(child)); const outer = write(projectDirectory(), 'outer');
  projectTrust.setProjectTrust(root, 'trusted'); const read = fs.readFileSync;
  vi.spyOn(fs, 'readFileSync').mockImplementation((...args: Parameters<typeof fs.readFileSync>) => {
    const result = read(...args);
    if (String(args[0]) === outer) projectTrust.setProjectTrust(root, 'untrusted');
    return result;
  });
  expect(loadTheme('dark', child)).toEqual(getDefaultTheme());
});

it('checks automatic results after explicit paths while retaining personal and explicit authority', () => {
  write(projectDirectory()); const user = write(path.join(home, '.cheers', 'themes'), 'dark', '#abcdef');
  const explicit = write(path.join(home, 'named'), 'named'); projectTrust.setProjectTrust(root, 'trusted');
  const read = fs.readFileSync;
  vi.spyOn(fs, 'readFileSync').mockImplementation((...args: Parameters<typeof fs.readFileSync>) => {
    const result = read(...args);
    if (String(args[0]) === explicit) projectTrust.setProjectTrust(root, 'untrusted');
    return result;
  });
  expect(loadTheme('dark', root, [explicit])?.colors.accent).toBe('#abcdef');
  expect(themeSourcePath('dark', root, [explicit])).toBe(user);
  expect(loadTheme('named', root, [explicit])?.colors.accent).toBe('#123456');
});

it('refreshes the installed palette and watcher source on grant and revocation', () => {
  const file = write(projectDirectory()); const context = host();
  expect(refreshConfiguration(context).status).toBe('applied'); const baseline = defaultTheme.fg('accent', 'x');
  expect(resolveThemeTarget(root)).toBeUndefined();
  projectTrust.setProjectTrust(root, 'session-only'); expect(refreshConfiguration(context).status).toBe('applied');
  expect(defaultTheme.fg('accent', 'x')).not.toBe(baseline); expect(resolveThemeTarget(root)?.filePath).toBe(file);
  projectTrust.setProjectTrust(root, 'untrusted'); expect(configurationAdmission(context)()).toBeDefined();
  expect(refreshConfiguration(context).status).toBe('applied'); expect(defaultTheme.fg('accent', 'x')).toBe(baseline);
  expect(resolveThemeTarget(root)).toBeUndefined(); expect(configurationAdmission(context)()).toBeUndefined();
});

it('never installs new revoked bytes through a pending file reload', () => {
  selectTheme('dark', root); const baseline = defaultTheme.fg('accent', 'x');
  write(projectDirectory()); projectTrust.setProjectTrust(root, 'trusted'); selectTheme('dark', root);
  expect(defaultTheme.fg('accent', 'x')).not.toBe(baseline);
  const target = resolveThemeTarget(root)!; const repaint = vi.fn(); const reloader = createThemeReloader(target, repaint);
  projectTrust.setProjectTrust(root, 'untrusted'); write(projectDirectory(), 'dark', '#fedcba');
  reloader.reload(); reloader.stop();
  expect(defaultTheme.fg('accent', 'x')).toBe(baseline);
  expect(loadTheme('dark', root)).toEqual(getDefaultTheme()); expect(repaint).toHaveBeenCalledOnce();
});

it('reports a rejected refresh for an unavailable explicit name and leaves actions blocked', () => {
  write(projectDirectory(), 'project-only'); projectTrust.setProjectTrust(root, 'trusted');
  const context = host('project-only'); expect(refreshConfiguration(context).status).toBe('applied');
  const revision = defaultTheme.colorRevision; projectTrust.setProjectTrust(root, 'untrusted');
  expect(refreshConfiguration(context).status).toBe('rejected'); expect(configurationAdmission(context)()).toBeDefined();
  expect(currentTheme()).toBe('project-only'); expect(defaultTheme.colorRevision).toBe(revision);
  expect(resolveThemeTarget(root)).toBeUndefined();
});
