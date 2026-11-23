import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readConfigSnapshot, serializeConfigDocument } from './document.js';
import { partitionConfigDocuments } from './documents.js';
import { patchConfigDocument } from './patch.js';
import { ConfigDocumentError, parseConfigFileText } from './syntax.js';
import { getUserAuthPath, getUserRuntimeConfigPath, readRuntimeConfigEditAt, readUserRuntimeConfigFile,
  writeUserRuntimeConfigFile } from './runtimeConfig.js';
import * as storage from '../session/store/sessionFileStore.js';

describe('human configuration YAML', () => {
  const roots: string[] = [];
  afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

  it('parses YAML 1.2 values, bounded aliases, and existing JSONC paths', () => {
    expect(parseConfigFileText('config.yaml', 'base: &defaults\n  enabled: true\ncopy: *defaults\n')).toEqual({
      base: { enabled: true }, copy: { enabled: true },
    });
    expect(parseConfigFileText('config.json', '{/* comment */"enabled":true,}')).toEqual({ enabled: true });
  });

  it.each([
    ['duplicate keys', 'theme: dark\ntheme: light\n', 'duplicate-key'],
    ['unsafe keys', '__proto__: value\n', 'unsafe-key'],
    ['sequence roots', '- value\n', 'invalid-document'],
    ['custom tags', 'theme: !private value\n', 'invalid-yaml'],
    ['multiple documents', 'theme: dark\n---\ntheme: light\n', 'invalid-yaml'],
    ['older YAML versions', '%YAML 1.1\n---\ntheme: yes\n', 'unsupported-version'],
  ] as const)('rejects %s as a configuration document', (_label, text, code) => {
    try { parseConfigFileText('config.yaml', text); throw new Error('expected YAML parsing to fail'); }
    catch (error) { expect(error).toMatchObject<Partial<ConfigDocumentError>>({ code }); }
  });

  it('keeps YAML comments, key order, and a no-op source exactly while patching changed fields', () => {
    const text = '# workspace preferences\nmodel:\n  # model label\n  name: first\nmaxTurns: 4\nunknown: 1\n';
    const values = parseConfigFileText('config.yaml', text);
    const snapshot = { text, values, format: 'yaml' as const };
    const unchanged = patchConfigDocument(snapshot, values);
    expect(unchanged).toBe(text);

    const changed = patchConfigDocument(snapshot, { ...values, model: { name: 'second' }, maxTurns: 7 });
    expect(changed).toContain('# workspace preferences');
    expect(changed).toContain('# model label');
    expect(changed.indexOf('model:')).toBeLessThan(changed.indexOf('maxTurns:'));
    expect(parseConfigFileText('config.yaml', changed)).toEqual({ ...values, model: { name: 'second' }, maxTurns: 7 });
  });

  it('changes only a YAML scalar token while retaining unrelated layout and line endings', () => {
    const text = '\uFEFFtheme:  "old"   # inline\r\nmodel:\r\n    nested: first\r\n';
    const snapshot = { text, values: parseConfigFileText('config.yaml', text), format: 'yaml' as const };
    const changed = patchConfigDocument(snapshot, { ...snapshot.values, theme: 'new' });
    expect(changed).toBe('\uFEFFtheme:  "new"   # inline\r\nmodel:\r\n    nested: first\r\n');
    expect(parseConfigFileText('config.yaml', changed)).toEqual({ ...snapshot.values, theme: 'new' });
  });

  it('serializes a new YAML document and reports path, line, column, and a safe source marker', () => {
    const serialized = serializeConfigDocument({ theme: 'dark', limits: { maxTurns: 3 } }, 'yaml');
    expect(serialized).toContain('theme: dark');
    expect(parseConfigFileText('new.yaml', serialized)).toEqual({ theme: 'dark', limits: { maxTurns: 3 } });
    expect(() => serializeConfigDocument({ modelPreferences: { providers: {
      'openai-compatible': { model: 'deepseek-ai/DeepSeek-V3' },
    } } }, 'yaml')).not.toThrow();

    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/yaml-diagnostic-'); roots.push(root);
    const file = path.join(root, 'config.yaml');
    fs.writeFileSync(file, 'theme: dark\nmaxTurns: [private-marker\n');
    let error: unknown;
    try { readConfigSnapshot(file); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(ConfigDocumentError);
    expect((error as Error).message).toContain(`${file}:`);
    expect((error as Error).message).toMatch(/:\d+:\d+: invalid-yaml/);
    expect((error as Error).message).toContain('<source content omitted>');
    expect((error as Error).message).not.toContain('private-marker');
  });

  it('rejects alias expansion beyond the bounded document budget', () => {
    const values = Array.from({ length: 101 }, (_, index) => `copy${index}: *defaults`).join('\n');
    const text = `defaults: &defaults\n  enabled: true\n${values}\n`;
    try { parseConfigFileText('sandbox.yaml', text); throw new Error('expected the alias bound to reject the document'); }
    catch (error) { expect(error).toMatchObject<Partial<ConfigDocumentError>>({ code: 'resource-limit' }); }
  });

  it('counts visible columns and preserves source offsets when YAML begins with a BOM', () => {
    try { parseConfigFileText('config.yaml', '\uFEFF__proto__: value\n'); throw new Error('expected unsafe key rejection'); }
    catch (error) { expect(error).toMatchObject<Partial<ConfigDocumentError>>({ code: 'unsafe-key', position: { offset: 1, line: 1, column: 1 } }); }
  });

  it('rejects oversized files from descriptor metadata before reading their bodies', () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/config-size-'); roots.push(root);
    const file = path.join(root, 'hooks.json');
    fs.writeFileSync(file, '{}');
    fs.truncateSync(file, 1024 * 1024 + 1);
    const read = vi.spyOn(fs, 'readSync');
    try { readConfigSnapshot(file); throw new Error('expected size limit rejection'); }
    catch (error) { expect(error).toMatchObject<Partial<ConfigDocumentError>>({ code: 'resource-limit' }); }
    expect(read).not.toHaveBeenCalled();
  });

  it('writes provider preferences to YAML and keeps credentials in JSON', () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/yaml-settings-'); roots.push(root);
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
    const logical = { provider: 'openai-compatible', providerCredentials: { 'openai-compatible': {
      apiKey: 'synthetic-key', baseUrl: 'https://api.example.invalid/v1', model: 'deepseek-ai/DeepSeek-V3',
    } } };
    const split = partitionConfigDocuments(logical, { settings: undefined, auth: undefined, values: {} });
    expect(() => serializeConfigDocument(split.settings, 'yaml')).not.toThrow();
    const settings = getUserRuntimeConfigPath();
    const published: string[] = [];
    const write = storage.writeTextFileAtomic;
    vi.spyOn(storage, 'writeTextFileAtomic').mockImplementation((file, text, mode, options) => {
      published.push(file);
      write(file, text, mode, options);
    });
    writeUserRuntimeConfigFile(logical, readRuntimeConfigEditAt(settings));
    expect(published).toEqual([getUserAuthPath(), settings]);
    expect(settings.endsWith('config.yaml')).toBe(true);
    expect(readConfigSnapshot(settings)?.values.modelPreferences).toMatchObject({
      providers: { 'openai-compatible': { model: 'deepseek-ai/DeepSeek-V3' } },
    });
    expect(readUserRuntimeConfigFile().providerCredentials?.['openai-compatible']?.apiKey).toBe('synthetic-key');
    expect(fs.readFileSync(getUserAuthPath(), 'utf8')).toContain('synthetic-key');
  });
});
