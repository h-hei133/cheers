import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProfileContext, currentProfile, profilePath, profilePathOverride, withProfile } from './context.js';
import { profileName } from './name.js';
import { resolveUserDataFile, userDataDir, userDataDirFor, userDataSearchDirs } from '../userHome.js';

let home: string;
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-context-')); });
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

it('canonicalizes portable names and rejects path aliases and device names before creating state', () => {
  expect(profileName(' Work ')).toBe('work');
  expect(profileName(undefined)).toBe('default');
  for (const name of ['..', '.', '../a', 'a/b', 'a\\b', 'a.', 'con', 'NUL.txt', 'com9.log', 'lpt0', 'a'.repeat(65), 'a\0b']) {
    expect(() => createProfileContext({ homeDir: home, name, env: {} })).toThrow('Invalid profile name');
  }
  expect(fs.readdirSync(home)).toEqual([]);
});

it('preserves default reads and isolates a named profile from every legacy directory', () => {
  const legacy = path.join(home, '.cheer', 'config.json');
  fs.mkdirSync(path.dirname(legacy)); fs.writeFileSync(legacy, '{}');
  const defaultProfile = createProfileContext({ homeDir: home, env: {} });
  withProfile(defaultProfile, () => expect(resolveUserDataFile('config.json')).toBe(legacy));
  const named = createProfileContext({ homeDir: home, name: 'work', env: {} });
  withProfile(named, () => {
    expect(userDataSearchDirs()).toEqual([named.root]);
    expect(resolveUserDataFile('config.json')).toBe(path.join(named.root, 'config.json'));
    expect(userDataDirFor(home)).toBe(named.root);
    expect(() => resolveUserDataFile('../../config.json')).toThrow('escapes');
    expect(() => userDataDirFor(os.tmpdir())).toThrow('differs');
  });
});

it('captures environment and overrides without changing the process environment', () => {
  const env = { HOME: home, CHEERS_PROFILE: 'Work' };
  const profile = createProfileContext({ env });
  env.HOME = os.tmpdir(); env.CHEERS_PROFILE = 'other';
  vi.stubEnv('CHEERS_EXTENSIONS_FILE', '/changed-after-launch');
  withProfile(profile, () => {
    expect(currentProfile()?.id).toBe('work');
    expect(userDataDir()).toBe(profile.root);
    expect(profilePathOverride('CHEERS_EXTENSIONS_FILE')).toBeUndefined();
  });
  expect(Object.isFrozen(profile)).toBe(true);
  expect(Object.isFrozen(profile.pathOverrides)).toBe(true);
  expect(process.env.CHEERS_EXTENSIONS_FILE).toBe('/changed-after-launch');
});

it('refuses shared file overrides and symbolic links into another profile', () => {
  expect(() => createProfileContext({ name: 'a', homeDir: home, env: { CHEERS_PLUGINS_FILE: path.join(home, 'plugins.json') } })).toThrow('inside the selected profile');
  const a = createProfileContext({ name: 'a', homeDir: home, env: {} });
  const b = createProfileContext({ name: 'b', homeDir: home, env: {} });
  fs.symlinkSync(b.root, path.join(a.root, 'linked'), 'dir');
  expect(() => profilePath('linked/config.json', a)).toThrow('symbolic links');
  fs.symlinkSync(b.root, path.join(home, '.cheers', 'profiles', 'alias'), 'dir');
  expect(() => createProfileContext({ name: 'alias', homeDir: home, env: {} })).toThrow('symbolic links');
});

it('refuses root replacement even when the pathname is restored', () => {
  const profile = createProfileContext({ name: 'a', homeDir: home, env: {} });
  fs.renameSync(profile.root, `${profile.root}-retired`); fs.mkdirSync(profile.root);
  expect(() => withProfile(profile, userDataDir)).toThrow('changed identity');
});

it('keeps interleaved async work on the captured profile', async () => {
  const a = createProfileContext({ name: 'a', homeDir: home, env: {} });
  const b = createProfileContext({ name: 'b', homeDir: home, env: {} });
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const delayed = withProfile(a, async () => {
    await barrier;
    fs.writeFileSync(resolveUserDataFile('late.txt'), 'A');
    return currentProfile()?.id;
  });
  await withProfile(b, async () => {
    fs.writeFileSync(resolveUserDataFile('late.txt'), 'B'); release();
    expect(await delayed).toBe('a');
    expect(currentProfile()?.id).toBe('b');
  });
  expect(fs.readFileSync(path.join(a.root, 'late.txt'), 'utf8')).toBe('A');
  expect(fs.readFileSync(path.join(b.root, 'late.txt'), 'utf8')).toBe('B');
  expect(currentProfile()).toBeUndefined();
});

it('requires a new process to change an installed profile', async () => {
  vi.resetModules();
  const isolated = await import('./context.js');
  const a = isolated.createProfileContext({ name: 'a', homeDir: home, env: {} });
  const b = isolated.createProfileContext({ name: 'b', homeDir: home, env: {} });
  isolated.installProcessProfile(a);
  expect(isolated.withProfile(a, () => isolated.currentProfile()?.id)).toBe('a');
  expect(() => isolated.withProfile(b, () => {})).toThrow('new process');
  expect(() => isolated.installProcessProfile(b)).toThrow('immutable');
});
