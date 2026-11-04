import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import { createProfileContext, withProfile } from '../paths/profile/context.js';
import { createCommandRegistry } from './registry.js';

const roots: string[] = [];
const config = (enableMcpTools: boolean) => ({ enableMcpTools }) as RuntimeConfig;
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function workspace(): string {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  const root = fs.mkdtempSync('/tmp/cheers-test/registry-');
  roots.push(root);
  fs.mkdirSync(path.join(root, '.git'));
  fs.mkdirSync(path.join(root, '.agents', 'prompts'), { recursive: true });
  return root;
}

describe('command registry cache', () => {
  it('reuses immutable builtins on template paths with independent maps and MCP shapes', () => {
    const root = workspace();
    const options = { templates: { names: new Set<string>() } };
    const first = createCommandRegistry(root, config(false), undefined, options);
    const help = first.get('help')!;
    (first as Map<string, unknown>).delete('help');
    const second = createCommandRegistry(root, config(false), undefined, options);
    expect(second.get('help')).toBe(help);
    expect(createCommandRegistry(root, config(false)).get('help')).toBe(help);
    expect(Object.isFrozen(help)).toBe(true);
    expect(Object.isFrozen(help.aliases)).toBe(true);
    expect(() => Object.assign(help, { summary: 'corrupted' })).toThrow(TypeError);
    expect(second.get('mcp')?.enabled).toBe(false);
    const mcp = createCommandRegistry(root, config(true), undefined, { includeTemplates: false });
    expect(mcp.get('mcp')?.enabled).toBe(true);
  });

  it('keeps template contents, selections, and source observations live beside cached builtins', () => {
    const root = workspace();
    const file = path.join(root, '.agents', 'prompts', 'cache-probe.md');
    fs.writeFileSync(file, 'First body.');
    const names = new Set(['cache-probe']);
    const seen: Buffer[] = [];
    const observer = (target: string, bytes?: Buffer) => { if (target === file && bytes) seen.push(bytes); };
    const first = createCommandRegistry(root, config(false), observer, { templates: { names } });
    fs.writeFileSync(file, 'Changed body.');
    const second = createCommandRegistry(root, config(false), observer, { templates: { names } });
    expect(second.get('help')).toBe(first.get('help'));
    expect(first.get('cache-probe')?.preparePrompt?.('')).toContain('First body.');
    expect(second.get('cache-probe')?.preparePrompt?.('')).toContain('Changed body.');
    expect(seen.map(bytes => bytes.toString())).toEqual(['First body.', 'Changed body.']);
    names.clear();
    expect(createCommandRegistry(root, config(false), undefined, { templates: { names } }).has('cache-probe')).toBe(false);
    expect(createCommandRegistry(root, config(false), observer, { includeTemplates: false }).has('cache-probe')).toBe(false);
    names.add('cache-probe');
    const controller = new AbortController();
    controller.abort();
    expect(() => createCommandRegistry(root, config(false), undefined, {
      templates: { names, signal: controller.signal },
    })).toThrow();
    expect(() => createCommandRegistry(root, config(false), undefined, {
      templates: { names, maxFileBytes: 1 },
    })).toThrow('per-file byte budget');
    fs.rmSync(file);
    expect(createCommandRegistry(root, config(false), undefined, { templates: { names } }).has('cache-probe')).toBe(false);
  });

  it('never carries templates across workspaces while sharing context-free builtins', () => {
    const firstRoot = workspace();
    const secondRoot = workspace();
    const names = new Set(['cache-probe']);
    fs.writeFileSync(path.join(firstRoot, '.agents', 'prompts', 'cache-probe.md'), 'First workspace.');
    fs.writeFileSync(path.join(secondRoot, '.agents', 'prompts', 'cache-probe.md'), 'Second workspace.');
    const first = createCommandRegistry(firstRoot, config(false), undefined, { templates: { names } });
    const second = createCommandRegistry(secondRoot, config(false), undefined, { templates: { names } });
    expect(second.get('help')).toBe(first.get('help'));
    expect(second.get('cache-probe')?.preparePrompt?.('')).toContain('Second workspace.');
  });

  it('loads user templates from the active profile on every call', () => {
    const root = workspace();
    const firstProfile = createProfileContext({ name: 'first', homeDir: root, env: {} });
    const secondProfile = createProfileContext({ name: 'second', homeDir: root, env: {} });
    for (const profile of [firstProfile, secondProfile]) {
      fs.mkdirSync(path.join(profile.root, 'prompts'), { recursive: true });
      fs.writeFileSync(path.join(profile.root, 'prompts', 'cache-profile.md'), profile.id);
    }
    const options = { templates: { names: new Set(['cache-profile']) } };
    const first = withProfile(firstProfile, () => createCommandRegistry(root, config(false), undefined, options));
    const second = withProfile(secondProfile, () => createCommandRegistry(root, config(false), undefined, options));
    expect(second.get('help')).toBe(first.get('help'));
    expect(first.get('cache-profile')?.preparePrompt?.('')).toContain('first');
    expect(second.get('cache-profile')?.preparePrompt?.('')).toContain('second');
  });
});
