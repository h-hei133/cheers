import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getProjectConfigPath, getRuntimeConfig, readRuntimeConfigEditAt, writeProjectRuntimeConfigFile } from './runtimeConfig.js';
import { projectTrust } from '../core/security/trust/store.js';
import * as store from '../session/store/sessionFileStore.js';
import { createProfileContext, withProfile } from '../core/paths/profile/context.js';
import { loadMcpConfigs, mcpConfigPath } from '../core/mcp/config/document.js';

let directory: string;
let root: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-test-project-'));
  root = path.join(directory, 'workspace'); fs.mkdirSync(root);
  vi.stubEnv('HOME', path.join(directory, 'home')); vi.stubEnv('USERPROFILE', path.join(directory, 'home'));
  projectTrust.setProjectTrust(root, 'trusted');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true }); });

function write(name: string, text: string): string {
  const target = path.join(root, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text); return target;
}

it('creates a new project configuration in its directory through the existing writer', () => {
  const target = getProjectConfigPath(root);
  expect(target).toBe(path.join(root, '.cheers', 'config.json'));
  expect(fs.readdirSync(root)).toEqual([]);
  const edit = readRuntimeConfigEditAt(target);
  writeProjectRuntimeConfigFile(root, { maxTurns: 19 }, edit);
  expect(getRuntimeConfig(root).maxTurns).toBe(19);
  expect(fs.existsSync(path.join(root, '.cheers.json'))).toBe(false);
});

it('retains the legacy edit path and gives a directory document full precedence', () => {
  const legacy = write('.cheers.json', '{"maxTurns":17,"attentionOnIdle":true}');
  expect(getProjectConfigPath(root)).toBe(legacy);
  const edit = readRuntimeConfigEditAt(legacy);
  writeProjectRuntimeConfigFile(root, { maxTurns: 18 }, edit);
  const current = write('.cheers/config.json', '{"maxTurns":21}');
  const config = getRuntimeConfig(root);
  expect(config.maxTurns).toBe(21);
  expect(config.attentionOnIdle).toBe(false);
  expect(config.configSources).toContain(current);
  expect(config.configSources).not.toContain(legacy);
  expect(JSON.parse(fs.readFileSync(legacy, 'utf8')).maxTurns).toBe(18);
  expect(() => writeProjectRuntimeConfigFile(root, { maxTurns: 22 }, edit)).toThrow();
});

it.each(['malformed', 'directory', 'dangling-symlink'])('does not fall back from an invalid %s directory entry', kind => {
  write('.cheers.json', '{"maxTurns":19}');
  const current = path.join(root, '.cheers', 'config.json'); fs.mkdirSync(path.dirname(current));
  if (kind === 'directory') fs.mkdirSync(current);
  else if (kind === 'dangling-symlink') fs.symlinkSync(path.join(root, 'missing'), current);
  else fs.writeFileSync(current, '{broken');
  expect(getProjectConfigPath(root)).toBe(current);
  const config = getRuntimeConfig(root);
  expect(config.allowedTools).toEqual([]);
  expect(config.configSources).not.toContain(path.join(root, '.cheers.json'));
});

it('rejects resolution if a new project source appears during configuration acquisition', () => {
  const legacy = write('.cheers.json', '{"maxTurns":19}');
  const inode = fs.statSync(legacy).ino;
  const original = fs.readSync; let changed = false;
  vi.spyOn(fs, 'readSync').mockImplementation((...args: Parameters<typeof fs.readSync>) => {
    const count = original(...args);
    if (!changed && fs.fstatSync(args[0]).ino === inode) { changed = true; write('.cheers/config.json', '{"maxTurns":21}'); }
    return count;
  });
  expect(() => getRuntimeConfig(root)).toThrow('content-changed');
  expect(changed).toBe(true);
});

it('rejects a legacy save when the current source appears while acquiring its lock', () => {
  const legacy = write('.cheers.json', '{"maxTurns":19}');
  const edit = readRuntimeConfigEditAt(legacy); const original = store.withFileLock;
  vi.spyOn(store, 'withFileLock').mockImplementation((lock, action, options) => {
    write('.cheers/config.json', '{"maxTurns":21}');
    return original(lock, action, options);
  });
  expect(() => writeProjectRuntimeConfigFile(root, { maxTurns: 22 }, edit)).toThrow('conflict');
  expect(fs.readFileSync(legacy, 'utf8')).toBe('{"maxTurns":19}');
});

it('keeps a home-directory workspace project save separate from personal configuration', () => {
  const home = path.join(directory, 'home'); fs.mkdirSync(path.join(home, '.cheers'), { recursive: true });
  const personal = path.join(home, '.cheers', 'config.json'); fs.writeFileSync(personal, '{"maxTurns":17}');
  const target = getProjectConfigPath(home);
  expect(target).toBe(path.join(home, '.cheers.json'));
  const edit = readRuntimeConfigEditAt(target); writeProjectRuntimeConfigFile(home, { maxTurns: 21 }, edit);
  expect(fs.readFileSync(personal, 'utf8')).toBe('{"maxTurns":17}');
});

it('does not shadow legacy personal configuration when saving a home-directory project', () => {
  const home = path.join(directory, 'home'); fs.mkdirSync(path.join(home, '.cheer'), { recursive: true });
  const personal = path.join(home, '.cheer', 'config.json'); fs.writeFileSync(personal, '{"maxTurns":17}');
  const target = getProjectConfigPath(home); expect(target).toBe(path.join(home, '.cheers.json'));
  writeProjectRuntimeConfigFile(home, { maxTurns: 21 }, readRuntimeConfigEditAt(target));
  expect(fs.readFileSync(personal, 'utf8')).toBe('{"maxTurns":17}');
  expect(fs.existsSync(path.join(home, '.cheers', 'config.json'))).toBe(false);
});

it('keeps default personal files separate when a named profile opens HOME as its workspace', () => {
  const home = path.join(directory, 'home'); fs.mkdirSync(home, { recursive: true });
  const profile = createProfileContext({ name: 'work', homeDir: home, env: {} });
  const config = path.join(home, '.cheers', 'config.json'); fs.writeFileSync(config, '{"maxTurns":17}');
  const mcp = path.join(home, '.cheers', 'mcp.json'); fs.writeFileSync(mcp, '{"mcpServers":{"personal":{"command":"server"}}}');
  withProfile(profile, () => {
    expect(getProjectConfigPath(home)).toBe(path.join(home, '.cheers.json'));
    expect(mcpConfigPath(home, 'project')).toBe(path.join(home, '.cheers.mcp.json'));
    expect(loadMcpConfigs(home, true).personal).toBeUndefined();
    const target = getProjectConfigPath(home);
    writeProjectRuntimeConfigFile(home, { maxTurns: 21 }, readRuntimeConfigEditAt(target));
  });
  expect(fs.readFileSync(config, 'utf8')).toBe('{"maxTurns":17}');
  expect(fs.readFileSync(mcp, 'utf8')).toBe('{"mcpServers":{"personal":{"command":"server"}}}');
});
