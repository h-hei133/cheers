import { readRuntimeConfigEditAt } from "./runtimeConfig.js";
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath, readUserRuntimeConfigFile, writeUserRuntimeConfigFile, writeRuntimeConfigFileAt, type RuntimeConfigFile, type RuntimeConfigOverrides } from './runtimeConfig.js';
import { matchDenyRule } from '../core/shell/approval/deny.js';
import { evaluateToolPermissionScope } from '../core/query/toolPolicy.js';
import { readDiagramMode, readStatusItems, writeStatusItems } from '../cli/interactive/tuiSettings.js';

describe('configuration validation boundary', () => {
  let root: string;
  let userPath: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'config-validation-'));
    vi.stubEnv('HOME', path.join(root, 'home'));
    vi.stubEnv('USERPROFILE', path.join(root, 'home'));
    vi.stubEnv('CHEERS_MAX_TURNS', '');
    userPath = getUserRuntimeConfigPath();
    fs.mkdirSync(path.dirname(userPath), { recursive: true });
  });
  afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
  function project(value: unknown) { fs.writeFileSync(path.join(root, '.cheers.json'), JSON.stringify(value)); }
  function user(value: unknown) { fs.writeFileSync(userPath, JSON.stringify(value)); }

  it.each([
    ['maxTurns', 0, 8], ['maxTurns', 1.5, 8], ['maxTurns', 'secret-value', 8],
    ['temperature', 'secret-value', 0.2], ['topP', 2, 0.8],
    ['retryEnabled', 'secret-value', false], ['contextWindow', -1, 20000],
    ['retryBaseDelayMs', 2147483648, 1000], ['instructionBudgetBytes', -1, 0],
  ])('preserves a valid lower %s when the user value is invalid', (field, invalid, lower) => {
    project({ [field]: lower }); user({ [field]: invalid });
    const config = getRuntimeConfig(root);
    expect(config[field as keyof typeof config]).toBe(lower);
    expect(config.configDiagnostics.join(' ')).toContain(field);
    expect(config.configDiagnostics.join(' ')).not.toContain('secret-value');
  });

  it('validates nested credentials without throwing or echoing data', () => {
    user({ providerCredentials: { openai: { apiKey: { 'secret-value': true } } } });
    const config = getRuntimeConfig(root);
    expect(config.providerCredentials).toEqual({});
    expect(config.configDiagnostics.join(' ')).toContain('providerCredentials');
    expect(config.configDiagnostics.join(' ')).not.toContain('secret-value');
    expect(() => readUserRuntimeConfigFile()).toThrow(/providerCredentials/);
  });

  it('rejects project personal fields before interpolation and keeps unknown/project strings literal', () => {
    vi.stubEnv('CONFIG_TEST_SECRET', 'secret-value');
    project({ provider: 'anthropic', providerCredentials: { openai: { apiKey: '$CONFIG_TEST_SECRET', baseUrl: 'https://invalid.test' } }, theme: '$CONFIG_TEST_SECRET', '$CONFIG_TEST_SECRET': '$CONFIG_TEST_SECRET' });
    const config = getRuntimeConfig(root);
    expect(config.provider).toBe('openai');
    expect(config.providerCredentials).toEqual({});
    expect(config.theme).toBe('$CONFIG_TEST_SECRET');
    expect(config.configDiagnostics.join(' ')).not.toContain('secret-value');
    expect(config.configDiagnostics.join(' ')).not.toContain('CONFIG_TEST_SECRET');
  });

  it('expands allowed user strings once after parsing, preserving quotes and literal dollars', () => {
    vi.stubEnv('CONFIG_TEST_SECRET', 'key"\\\n${CONFIG_SECOND}');
    vi.stubEnv('CONFIG_SECOND', 'must-not-expand');
    user({ providerCredentials: { openai: { apiKey: '${CONFIG_TEST_SECRET}', model: '$$CONFIG_SECOND' } }, theme: '$CONFIG_SECOND' });
    const config = getRuntimeConfig(root);
    expect(config.providerCredentials.openai?.apiKey).toBe('key"\\\n${CONFIG_SECOND}');
    expect(config.providerCredentials.openai?.model).toBe('$CONFIG_SECOND');
    expect(config.theme).toBe('$CONFIG_SECOND');
    expect(readUserRuntimeConfigFile().providerCredentials?.openai?.apiKey).toBe('${CONFIG_TEST_SECRET}');
  });

  it('diagnoses missing references without substituting an empty credential', () => {
    delete process.env.CONFIG_TEST_MISSING;
    user({ providerCredentials: { openai: { apiKey: '$CONFIG_TEST_MISSING' } } });
    const config = getRuntimeConfig(root);
    expect(config.providerCredentials).toEqual({});
    expect(config.configDiagnostics.join(' ')).toContain('missing-environment');
    expect(config.configDiagnostics.join(' ')).not.toContain('CONFIG_TEST_MISSING');
  });

  it('intersects allowlists and accumulates restrictions through overrides', () => {
    project({ allowedTools: ['read', 'write'], disabledTools: ['edit'], hiddenToolPrefixes: ['browser_'], denyRules: [{ tool: 'bash', pattern: 'rm' }], enableMcpTools: false });
    user({ allowedTools: ['read', 'bash'], disabledTools: [], hiddenToolPrefixes: [], denyRules: [], enableMcpTools: true });
    const config = getRuntimeConfig(root, { allowedTools: ['write', 'read'] });
    expect(config.allowedTools).toEqual(['read']);
    expect(config.disabledTools).toEqual(['edit']);
    expect(config.hiddenToolPrefixes).toEqual(['browser_']);
    expect(config.enableMcpTools).toBe(false);
    expect(matchDenyRule(config.denyRules, 'bash', 'rm marker')).toBeDefined();
  });

  it.each([{ denyRules: [{ tool: 'bash', pattern: 4 }] }, { allowedTools: null }, { enableMcpTools: 'true' }])('blocks tools for malformed restrictions even with overrides: %j', (value) => {
    project(value);
    const config = getRuntimeConfig(root, { allowedTools: ['write'], allowUntrustedHooks: true });
    expect(config.allowedTools).toEqual([]);
    expect(config.enableMcpTools).toBe(false);
    expect(config.allowUntrustedHooks).toBe(false);
    expect(matchDenyRule(config.denyRules, 'write', 'marker')).toBeDefined();
    expect(evaluateToolPermissionScope('write', { path: 'marker' }, 'allow-all', root, config.denyRules).denied).toBe(true);
    expect(config.configDiagnostics.join(' ')).toContain('blocked');
  });

  it.each(['{"secret-value":', '[]', '{"__proto__":{"polluted":true}}', '{"schemaVersion":2}', '{"deep":' + '['.repeat(40) + '0' + ']'.repeat(40) + '}'])('blocks malformed/unsupported documents without exposing contents', (content) => {
    fs.writeFileSync(userPath, content);
    const config = getRuntimeConfig(root);
    expect(config.allowedTools).toEqual([]);
    expect(matchDenyRule(config.denyRules, 'bash', 'anything')).toBeDefined();
    expect(config.configDiagnostics.join(' ')).not.toContain('secret-value');
    expect(() => writeUserRuntimeConfigFile({ theme: 'dark' }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()))).toThrow();
    expect(fs.readFileSync(userPath, 'utf8')).toBe(content);
  });

  it('bounds config bytes and distinguishes unreadable paths from absence', () => {
    fs.writeFileSync(userPath, JSON.stringify({ unknown: 'x'.repeat(1024 * 1024) }));
    expect(getRuntimeConfig(root).allowedTools).toEqual([]);
    fs.rmSync(userPath); fs.mkdirSync(userPath);
    expect(getRuntimeConfig(root).allowedTools).toEqual([]);
  });

  it('validates environment numbers and supported overrides', () => {
    user({ maxTurns: 12, instructionBudgetBytes: 100 }); vi.stubEnv('CHEERS_MAX_TURNS', 'NaN');
    const config = getRuntimeConfig(root, { instructionBudgetBytes: -1, offline: 'secret-value' } as unknown as RuntimeConfigOverrides);
    expect(config.maxTurns).toBe(12);
    expect(config.instructionBudgetBytes).toBe(100);
    expect(config.offline).toBe(false);
    expect(config.configDiagnostics).toHaveLength(3);
  });

  it('preserves unknown fields and references on writes and rejects invalid patches before writing', () => {
    user({ unknown: { retained: true }, providerCredentials: { openai: { apiKey: '${CONFIG_TEST_MISSING}' } } });
    writeUserRuntimeConfigFile({ theme: 'custom' } as RuntimeConfigFile, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    expect(JSON.parse(fs.readFileSync(userPath, 'utf8'))).toEqual({ unknown: { retained: true }, providerCredentials: { openai: { apiKey: '${CONFIG_TEST_MISSING}' } }, theme: 'custom' });
    const before = fs.readFileSync(userPath, 'utf8');
    expect(() => writeUserRuntimeConfigFile({ providerConnections: 'secret-value' } as unknown as RuntimeConfigFile, readRuntimeConfigEditAt(getUserRuntimeConfigPath()))).toThrow();
    expect(fs.readFileSync(userPath, 'utf8')).toBe(before);
  });

  it('preserves legacy connections, custom themes, and omitted timestamps', () => {
    user({ theme: 'custom', providerConnections: [{ id: 'legacy', provider: 'openai', authType: 'browser-oauth', apiKey: 'synthetic' }] });
    const config = getRuntimeConfig(root);
    expect(config.theme).toBe('custom');
    expect(config.providerConnections[0]).toMatchObject({ id: 'legacy', authType: 'browser-assisted-capture', createdAt: expect.any(String) });
    expect(config.configDiagnostics).toEqual([]);
  });

  it('validates TUI leaves with project precedence and legacy empty-list fallback', () => {
    user({ tui: { statusItems: ['cost'], diagrams: 'streaming' } });
    project({ tui: { statusItems: [], diagrams: 'off' } });
    expect(readStatusItems(root)).toEqual(['cost']);
    expect(readDiagramMode(root)).toBe('off');
    expect(getRuntimeConfig(root).tui).toEqual({ statusItems: ['cost'], diagrams: 'off' });
    project({ tui: { statusItems: ['model'], diagrams: 123 } });
    expect(readStatusItems(root)).toEqual(['model']);
    expect(readDiagramMode(root)).toBe('streaming');
  });

  it('keeps compact documents compact and rejects an oversized final patch', () => {
    const document = { unknown: 'x'.repeat(1024 * 1024 - 6000), rows: Array(1000).fill(1) };
    user(document);
    const before = fs.readFileSync(userPath);
    expect(before.length).toBeLessThan(1024 * 1024);
    expect(getRuntimeConfig(root).allowedTools).toBeUndefined();
    writeUserRuntimeConfigFile({ theme: 'custom' }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    expect(fs.readFileSync(userPath).length).toBeLessThan(1024 * 1024);
    expect(readUserRuntimeConfigFile()).toMatchObject(document);
    const patched = fs.readFileSync(userPath);
    expect(() => writeUserRuntimeConfigFile({ theme: 'x'.repeat(6000) }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()))).toThrow(/resource-limit/);
    expect(fs.readFileSync(userPath)).toEqual(patched);
    const newPath = path.join(root, 'new-config.json');
    expect(() => writeRuntimeConfigFileAt(newPath, document as RuntimeConfigFile, readRuntimeConfigEditAt(newPath))).toThrow(/resource-limit/);
    expect(fs.existsSync(newPath)).toBe(false);
  });

  it('accepts an explicit current version and retains it through saving', () => {
    user({ schemaVersion: 1, theme: 'custom' });
    expect(getRuntimeConfig(root).configDiagnostics).toEqual([]);
    writeUserRuntimeConfigFile({ maxTurns: 20 }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    expect(readUserRuntimeConfigFile()).toMatchObject({ schemaVersion: 1, maxTurns: 20 });
  });

  it('bounds cumulative environment expansion across credential leaves', () => {
    vi.stubEnv('CONFIG_TEST_LARGE', 'x'.repeat(600_000));
    user({ providerCredentials: { openai: { apiKey: '$CONFIG_TEST_LARGE', model: '$CONFIG_TEST_LARGE' } } });
    const config = getRuntimeConfig(root);
    expect(config.providerCredentials).toEqual({});
    expect(config.configDiagnostics.join(' ')).toContain('resource-limit');
  });

  it('preserves valid TUI siblings and selected project save scope', () => {
    user({ tui: { diagrams: 'streaming' } });
    project({ tui: { diagrams: 'off', statusItems: ['model'] } });
    expect(writeStatusItems(root, ['cost']).scope).toBe('project');
    expect(readStatusItems(root)).toEqual(['cost']);
    expect(readDiagramMode(root)).toBe('off');
    expect(readUserRuntimeConfigFile().tui).toEqual({ diagrams: 'streaming' });
  });
});
