import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../config/runtimeConfig.js';
import { loadCatalog, writeCatalogCache } from '../../../core/models/catalogStore.js';
import { resolveProviderCredential } from '../../../core/shell/providerCredentials.js';
import { SessionManager } from '../../../session/SessionManager.js';
import { readSessionModel } from '../../../session/model/state.js';
import type { CommandContext } from '../../../core/commands/types.js';
import { thinkingPicker } from './thinking.js';

let home: string;
let manager: SessionManager;
let sessionId: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-thinking-picker-'));
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('OPENAI_API_KEY', '');
  writeCatalogCache([relay('relay', 'https://relay.example.invalid/v1', { high: null })]);
  writeConfig('shared');
  manager = new SessionManager();
  sessionId = manager.createNew(home).id;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(home, { recursive: true, force: true });
});

function relay(id: string, baseUrl: string, thinkingLevelMap: { readonly high: null }) {
  return {
    id,
    label: id,
    runtime: 'openai' as const,
    auth: 'api-key' as const,
    baseUrl,
    endpoint: 'anthropic-messages' as const,
    models: [{ id: 'shared', reasoning: true, thinkingLevelMap }],
  };
}

function writeConfig(model: string): void {
  const file = getUserRuntimeConfigPath();
  const edit = readRuntimeConfigEditAt(file);
  writeUserRuntimeConfigFile({
    provider: 'openai',
    activeProviderConnectionId: 'relay',
    providerConnections: [{
      id: 'relay',
      provider: 'openai',
      authType: 'api-key',
      apiKey: 'synthetic-relay-key',
      baseUrl: 'https://relay.example.invalid/v1',
      model,
      thinkingEffort: null,
      status: 'connected',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    }],
  }, edit);
}

function context(): CommandContext {
  const config = getRuntimeConfig(home);
  return {
    cwd: home,
    projectRoot: home,
    sessionId,
    runtimeConfig: config,
    readConfiguration: () => ({ config, catalog: loadCatalog() }),
    resolveConfigTarget: value => resolveProviderCredential({ runtimeConfig: value, env: {} }),
  };
}

it('uses the exact relay capabilities and refuses an unsupported level even when applied directly', async () => {
  const picker = thinkingPicker(context());
  const rows = await picker.load();
  expect(rows.find(row => row.id === 'auto')).toMatchObject({ disabled: false, note: 'active' });
  expect(rows.find(row => row.id === 'low')).toMatchObject({ disabled: false, note: 'supported' });
  expect(rows.find(row => row.id === 'high')).toMatchObject({ disabled: true, note: 'unsupported' });

  const global = fs.readFileSync(getUserRuntimeConfigPath());
  expect((await picker.apply(['high']))?.note).toContain('does not support');
  expect(readSessionModel(sessionId)).toBeUndefined();
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);

  expect((await picker.apply(['low']))?.note).toContain('Reasoning effort: low');
  expect(readSessionModel(sessionId)).toMatchObject({ connectionId: 'relay', model: 'shared', thinkingEffort: 'low' });
});

it('keeps an unlisted model selectable but reports its effort as unverified', async () => {
  writeConfig('custom-unlisted');
  const picker = thinkingPicker(context());
  const rows = await picker.load();
  expect(rows.filter(row => row.id !== 'auto')).toEqual([
    expect.objectContaining({ id: 'low', disabled: false, note: 'unverified' }),
    expect.objectContaining({ id: 'medium', disabled: false, note: 'unverified' }),
    expect.objectContaining({ id: 'high', disabled: false, note: 'unverified' }),
  ]);

  const result = await picker.apply(['medium']);
  expect(result?.note).toContain('capability is unverified');
  expect(readSessionModel(sessionId)).toMatchObject({ model: 'custom-unlisted', thinkingEffort: 'medium' });
});

it('does not guess between duplicate relay owners', async () => {
  const baseUrl = 'https://relay.example.invalid/v1';
  writeCatalogCache([
    relay('relay-a', baseUrl, { high: null }),
    relay('relay-b', baseUrl, { high: null }),
  ]);
  const picker = thinkingPicker(context());
  const rows = await picker.load();
  expect(rows.every(row => row.disabled && row.note === 'model catalogue endpoint is ambiguous')).toBe(true);

  expect((await picker.apply(['auto']))?.note).toContain('multiple catalogue entries');
  expect(readSessionModel(sessionId)).toBeUndefined();
});
