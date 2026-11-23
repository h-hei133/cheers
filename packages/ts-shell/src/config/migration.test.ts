import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateUserConfig, migrateWorkspaceConfig } from './migration.js';
import { getUserAuthPath } from './runtimeConfig.js';
import { readConfigSnapshot } from './document.js';
import { createProfileContext, withProfile } from '../core/paths/profile/context.js';

describe('explicit human configuration migration', () => {
  let root: string | undefined;
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); if (root) fs.rmSync(root, { recursive: true, force: true }); root = undefined; });

  it('backs up the exact JSONC source, separates credentials, and publishes YAML before removing JSON', () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    root = fs.mkdtempSync('/tmp/cheers-test/config-migrate-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
    const directory = path.join(root, '.cheers'); fs.mkdirSync(directory, { recursive: true });
    const source = path.join(directory, 'config.json');
    const before = '{\n  // retained in the backup\n  "theme": "dark",\n  "provider": "openai",\n  "providerCredentials": {"openai": {"apiKey": "synthetic-migration-key"}},\n}\n';
    fs.writeFileSync(source, before, { mode: 0o600 });

    const items = migrateUserConfig();

    expect(items.find(item => item.file.endsWith('config.yaml'))).toMatchObject({ status: 'complete' });
    expect(fs.readFileSync(`${source}.bak`, 'utf8')).toBe(before);
    expect(fs.existsSync(source)).toBe(false);
    expect(readConfigSnapshot(path.join(directory, 'config.yaml'))?.values).toEqual({ theme: 'dark' });
    expect(readConfigSnapshot(getUserAuthPath())?.values).toMatchObject({
      provider: 'openai', providerCredentials: { openai: { apiKey: 'synthetic-migration-key' } },
    });
    expect(fs.statSync(`${source}.bak`).mode & 0o777).toBe(0o600);
  });

  it('preserves a JSON source symlink while writing a verified YAML destination and backup', () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    root = fs.mkdtempSync('/tmp/cheers-test/config-migrate-link-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
    const directory = path.join(root, '.cheers'); fs.mkdirSync(directory, { recursive: true });
    const source = path.join(directory, 'models.json');
    const target = path.join(root, 'dotfiles-models.json');
    const before = '{"providers":{"local":{"runtime":"openai-compatible","models":[{"id":"one"}]}}}';
    fs.writeFileSync(target, before); fs.symlinkSync(target, source);

    const items = migrateUserConfig();

    expect(items.find(item => item.file.endsWith('models.yaml'))).toMatchObject({ status: 'complete' });
    expect(fs.lstatSync(source).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(`${source}.bak`, 'utf8')).toBe(before);
    expect(readConfigSnapshot(path.join(directory, 'models.yaml'))?.values).toMatchObject({
      providers: { local: { models: [{ id: 'one' }] } },
    });
  });

  it('refuses existing YAML targets or backups without overwriting either', () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    root = fs.mkdtempSync('/tmp/cheers-test/config-migrate-conflict-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
    const directory = path.join(root, '.cheers'); fs.mkdirSync(directory, { recursive: true });
    const source = path.join(directory, 'keybindings.json');
    const yaml = path.join(directory, 'keybindings.yaml');
    fs.writeFileSync(source, '{"app.retry":"f6"}');
    fs.writeFileSync(yaml, 'app.retry: f7\n');
    const items = migrateUserConfig();
    expect(items.find(item => item.file === yaml)).toMatchObject({ status: 'unchanged' });
    expect(fs.readFileSync(source, 'utf8')).toBe('{"app.retry":"f6"}');
    expect(fs.readFileSync(yaml, 'utf8')).toBe('app.retry: f7\n');
    expect(fs.existsSync(`${source}.bak`)).toBe(false);
    fs.unlinkSync(yaml);
    fs.writeFileSync(`${source}.bak`, 'different backup');
    const backupItems = migrateUserConfig();
    expect(backupItems.find(item => item.file === source)).toMatchObject({ status: 'rejected' });
    expect(fs.readFileSync(`${source}.bak`, 'utf8')).toBe('different backup');
    expect(fs.readFileSync(source, 'utf8')).toBe('{"app.retry":"f6"}');
  });

  it('keeps migration inside the explicitly selected profile', () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    root = fs.mkdtempSync('/tmp/cheers-test/config-migrate-profile-');
    const profile = createProfileContext({ name: 'Work', homeDir: root });
    const source = path.join(profile.root, 'models.json');
    fs.writeFileSync(source, '{"providers":{}}', { mode: 0o600 });
    const items = withProfile(profile, () => migrateUserConfig());
    expect(items.find(item => item.file.endsWith('models.yaml'))).toMatchObject({ status: 'complete' });
    expect(fs.existsSync(path.join(profile.root, 'models.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.cheers', 'models.yaml'))).toBe(false);
  });

  it('migrates a legacy-directory settings file in its existing directory', () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    root = fs.mkdtempSync('/tmp/cheers-test/config-migrate-legacy-dir-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
    const legacy = path.join(root, '.cheer'); fs.mkdirSync(legacy);
    const source = path.join(legacy, 'config.json');
    fs.writeFileSync(source, '{"maxTurns":13}');

    expect(migrateUserConfig().find(item => item.file.endsWith('config.yaml'))).toMatchObject({ status: 'complete' });
    expect(readConfigSnapshot(path.join(legacy, 'config.yaml'))?.values.maxTurns).toBe(13);
    expect(fs.existsSync(source)).toBe(false);
  });

  it('does not accept a backup pointing to the source it would remove', () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    root = fs.mkdtempSync('/tmp/cheers-test/config-migrate-backup-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
    const directory = path.join(root, '.cheers'); fs.mkdirSync(directory);
    const source = path.join(directory, 'keybindings.json');
    const before = '{"app.retry":"f6"}';
    fs.writeFileSync(source, before);
    fs.symlinkSync(source, `${source}.bak`);

    expect(migrateUserConfig().find(item => item.file === source)).toMatchObject({ status: 'rejected' });
    expect(fs.readFileSync(source, 'utf8')).toBe(before);
    expect(fs.lstatSync(`${source}.bak`).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(directory, 'keybindings.yaml'))).toBe(false);
  });

  it('does not accept an existing YAML symlink as a verified migration destination', () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    root = fs.mkdtempSync('/tmp/cheers-test/config-migrate-target-link-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
    const directory = path.join(root, '.cheers'); fs.mkdirSync(directory);
    const source = path.join(directory, 'keybindings.json');
    const elsewhere = path.join(root, 'elsewhere.yaml');
    const target = path.join(directory, 'keybindings.yaml');
    fs.writeFileSync(source, '{"app.retry":"f6"}');
    fs.writeFileSync(elsewhere, 'app.retry: f6\n');
    const link = fs.linkSync;
    vi.spyOn(fs, 'linkSync').mockImplementation((staged, destination) => {
      if (destination === target) fs.symlinkSync(elsewhere, target);
      return link(staged, destination);
    });

    expect(migrateUserConfig().find(item => item.file === source)).toMatchObject({ status: 'partial' });
    expect(fs.readFileSync(source, 'utf8')).toBe('{"app.retry":"f6"}');
    expect(fs.readFileSync(elsewhere, 'utf8')).toBe('app.retry: f6\n');
    expect(fs.readFileSync(`${source}.bak`, 'utf8')).toBe('{"app.retry":"f6"}');
  });

  it('keeps the original file when the YAML publication fails after backup creation', () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    root = fs.mkdtempSync('/tmp/cheers-test/config-migrate-partial-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
    const directory = path.join(root, '.cheers'); fs.mkdirSync(directory);
    const source = path.join(directory, 'keybindings.json');
    const target = path.join(directory, 'keybindings.yaml');
    const original = '{"app.retry":"f6"}';
    fs.writeFileSync(source, original);
    const link = fs.linkSync;
    vi.spyOn(fs, 'linkSync').mockImplementation((existing, destination) => {
      if (destination === target) throw Object.assign(new Error('simulated destination race'), { code: 'EEXIST' });
      return link(existing, destination);
    });

    expect(migrateUserConfig().find(item => item.file === source)).toMatchObject({ status: 'partial' });
    expect(fs.readFileSync(source, 'utf8')).toBe(original);
    expect(fs.readFileSync(`${source}.bak`, 'utf8')).toBe(original);
    expect(fs.existsSync(target)).toBe(false);
    vi.restoreAllMocks();
    expect(migrateUserConfig().find(item => item.file === target)).toMatchObject({ status: 'complete' });
    expect(fs.existsSync(source)).toBe(false);
    expect(fs.readFileSync(`${source}.bak`, 'utf8')).toBe(original);
  });

  it('preserves restricted source permissions on the backup and YAML publication', () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    root = fs.mkdtempSync('/tmp/cheers-test/config-migrate-mode-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
    const directory = path.join(root, '.cheers'); fs.mkdirSync(directory);
    const source = path.join(directory, 'keybindings.json');
    const target = path.join(directory, 'keybindings.yaml');
    fs.writeFileSync(source, '{"app.retry":"f6"}');
    fs.chmodSync(source, 0o640);

    expect(migrateUserConfig().find(item => item.file === target)).toMatchObject({ status: 'complete' });
    expect(fs.statSync(`${source}.bak`).mode & 0o777).toBe(0o640);
    expect(fs.statSync(target).mode & 0o777).toBe(0o640);
  });

  it('migrates the selected workspace settings, sandbox policy, and workflow definitions', () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    root = fs.mkdtempSync('/tmp/cheers-test/config-migrate-workspace-');
    const legacyConfig = path.join(root, '.cheers.json');
    const sandbox = path.join(root, '.agents', 'sandbox.json');
    const workflow = path.join(root, '.agents', 'workflows', 'verify.json');
    fs.mkdirSync(path.dirname(sandbox), { recursive: true });
    fs.mkdirSync(path.dirname(workflow), { recursive: true });
    fs.writeFileSync(legacyConfig, '{"maxTurns":7}');
    fs.writeFileSync(sandbox, '{"enabled":true}');
    fs.writeFileSync(workflow, JSON.stringify({ name: 'verify', steps: [{ id: 'check', run: 'exit 0' }] }));

    const items = migrateWorkspaceConfig(root);

    expect(items).toHaveLength(3);
    expect(items.map(item => item.status)).toEqual(['complete', 'complete', 'complete']);
    expect(readConfigSnapshot(path.join(root, '.cheers', 'config.yaml'))?.values).toEqual({ maxTurns: 7 });
    expect(readConfigSnapshot(path.join(root, '.agents', 'sandbox.yaml'))?.values).toEqual({ enabled: true });
    expect(readConfigSnapshot(path.join(root, '.agents', 'workflows', 'verify.yaml'))?.values).toMatchObject({
      steps: [{ id: 'check', run: 'exit 0' }],
    });
    for (const source of [legacyConfig, sandbox, workflow]) expect(fs.existsSync(source)).toBe(false);
    for (const source of [legacyConfig, sandbox, workflow]) expect(fs.existsSync(`${source}.bak`)).toBe(true);
  });
});
