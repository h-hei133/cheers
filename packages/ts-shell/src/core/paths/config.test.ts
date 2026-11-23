import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { configFileCandidates, resolveConfigFile } from './config.js';

describe('configuration file resolution', () => {
  let root: string | undefined;
  afterEach(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); root = undefined; });

  it('selects the first extension within the first owning directory', () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    root = fs.mkdtempSync('/tmp/cheers-test/config-path-');
    const current = path.join(root, '.cheers');
    const legacy = path.join(root, '.cheer');
    fs.mkdirSync(current); fs.mkdirSync(legacy);
    fs.writeFileSync(path.join(current, 'config.json'), '{}');
    fs.writeFileSync(path.join(legacy, 'config.yaml'), '{}');
    expect(resolveConfigFile([current, legacy], 'config')).toBe(path.join(current, 'config.json'));

    fs.writeFileSync(path.join(current, 'config.yml'), '{}');
    expect(resolveConfigFile([current, legacy], 'config')).toBe(path.join(current, 'config.yml'));
    fs.writeFileSync(path.join(current, 'config.yaml'), '{}');
    expect(resolveConfigFile([current, legacy], 'config')).toBe(path.join(current, 'config.yaml'));
  });

  it('uses the preferred extension for new files and treats a broken link as an existing owner', () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    root = fs.mkdtempSync('/tmp/cheers-test/config-path-');
    const directory = path.join(root, 'settings'); fs.mkdirSync(directory);
    expect(resolveConfigFile([directory], 'config')).toBe(path.join(directory, 'config.yaml'));
    const broken = path.join(directory, 'keybindings.yaml');
    fs.symlinkSync(path.join(directory, 'missing'), broken);
    expect(resolveConfigFile([directory], 'keybindings')).toBe(broken);
  });

  it('lists paths in the same order used by selection', () => {
    expect(configFileCandidates(['/user/.cheers', '/user/.cheer'], 'models')).toEqual([
      '/user/.cheers/models.yaml', '/user/.cheers/models.yml', '/user/.cheers/models.json',
      '/user/.cheer/models.yaml', '/user/.cheer/models.yml', '/user/.cheer/models.json',
    ]);
    expect(configFileCandidates(['/workspace/.agents/workflows'], 'verify.types')).toEqual([
      '/workspace/.agents/workflows/verify.types.yaml',
      '/workspace/.agents/workflows/verify.types.yml',
      '/workspace/.agents/workflows/verify.types.json',
    ]);
  });
});
