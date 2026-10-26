import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../config/runtimeConfig.js';
import { loadCatalog, writeCatalogCache } from '../../../core/models/catalogStore.js';
import { resolveProviderCredential } from '../../../core/shell/providerCredentials.js';
import { SessionManager } from '../../../session/SessionManager.js';
import { readSessionModel } from '../../../session/model/state.js';
import { projectSessionModel } from '../../../session/model/projection.js';
import type { CommandContext } from '../../../core/commands/types.js';
import { thinkingPicker } from './thinking.js';
import { OverlayHost } from '../overlay.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';
import { defaultHookDispatcher } from '../../../core/hooks/hookDispatcher.js';

let home: string;
let manager: SessionManager;
let sessionId: string;

beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  home = fs.mkdtempSync(path.join('/tmp/cheers-test', 'thinking-picker-'));
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

it('focuses the actual thinking preference on open without saving', async () => {
  const config = getUserRuntimeConfigPath(); const edit = readRuntimeConfigEditAt(config);
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: edit.values.providerConnections!.map(row => ({ ...row, thinkingEffort: 'medium' })) }, edit);
  const picker = thinkingPicker(context()); const overlay = new OverlayHost(() => {});
  overlay.open(picker); await Promise.resolve(); await Promise.resolve();
  const apply = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply.mock.calls[0]?.[1]).toEqual(['medium']);
  expect(readSessionModel(sessionId)).toBeUndefined(); overlay.close();
});

it('retains an unsupported active effort as read-only focus instead of offering auto on Enter', async () => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: edit.values.providerConnections!.map(row => ({ ...row, thinkingEffort: 'high' })) }, edit);
  const picker = thinkingPicker(context()); const rows = await picker.load();
  expect(rows.find(row => row.id === 'high')).toMatchObject({ disabled: true, focusable: true });
  const overlay = new OverlayHost(() => {}); overlay.open(picker); await Promise.resolve(); await Promise.resolve();
  const apply = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).not.toHaveBeenCalled(); expect(readSessionModel(sessionId)).toBeUndefined(); overlay.close();
});

it('reopens the same picker on its freshly accepted session effort', async () => {
  const current: CommandContext = { ...context(), readConfiguration: () => ({
    config: projectSessionModel(getRuntimeConfig(home), sessionId), catalog: loadCatalog() }) };
  const picker = thinkingPicker(current); await picker.load();
  expect((await picker.apply(['medium']))?.note).toContain('Reasoning effort: medium');
  const overlay = new OverlayHost(() => {}); overlay.open(picker); await Promise.resolve(); await Promise.resolve();
  const apply = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply.mock.calls[0]?.[1]).toEqual(['medium']); overlay.close();
});

it.each(['escape', 'close', 'replace'] as const)('retires thinking choices after actual host %s and does not revive them through a late load', async closing => {
  const chosen = thinkingPicker(context()), host = new OverlayHost(() => {});
  host.open(chosen); await Promise.resolve(); await Promise.resolve();
  const config = fs.readFileSync(getUserRuntimeConfigPath());
  try {
    if (closing === 'escape') host.handleKey(parseKeyEvent('\x1b'), vi.fn());
    else if (closing === 'close') host.close();
    else host.open(thinkingPicker(context()));
    expect(await chosen.apply(['low'])).toBeUndefined(); expect(await chosen.load()).toEqual([]);
    expect(await chosen.apply(['medium'])).toBeUndefined(); expect(readSessionModel(sessionId)).toBeUndefined();
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(config);
  } finally { host.close(); }
});

it('does not submit thinking choices before load or from a multi-choice request', async () => {
  const chosen = thinkingPicker(context());
  expect(await chosen.apply(['low'])).toBeUndefined(); await chosen.load();
  expect(await chosen.apply(['low', 'medium'])).toBeUndefined(); expect(readSessionModel(sessionId)).toBeUndefined();
});

it('does not save when thinking admission closes the actual host', async () => {
  const host = new OverlayHost(() => {});
  const chosen = thinkingPicker({ ...context(), admission: () => { host.close(); return undefined; } });
  host.open(chosen); await Promise.resolve(); await Promise.resolve();
  expect(await chosen.apply(['low'])).toBeUndefined(); expect(readSessionModel(sessionId)).toBeUndefined();
  expect(host.active).toBe(false);
});

it.each(['close', 'reopen'] as const)('refuses old thinking work after a pending hook crosses host %s', async closing => {
  let unblock: () => void = () => {};
  const pending = new Promise<void>(resolve => { unblock = resolve; });
  let entered = false;
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') { entered = true; await pending; }
    return undefined;
  });
  const chosen = thinkingPicker(context()), host = new OverlayHost(() => {});
  host.open(chosen); await Promise.resolve(); await Promise.resolve();
  const work = chosen.apply(['low']); await vi.waitFor(() => expect(entered).toBe(true));
  host.close(); if (closing === 'reopen') { host.open(chosen); await Promise.resolve(); await Promise.resolve(); }
  try { unblock(); const outcome = await work; expect(outcome?.note).toContain('blocked');
    expect(outcome?.next).toBeUndefined(); expect(readSessionModel(sessionId)).toBeUndefined(); }
  finally { unblock(); host.close(); }
});

it('retains a confirmed thinking write notice if a post-switch hook closes its panel without reopening the parent', async () => {
  const host = new OverlayHost(() => {}), back = vi.fn(() => thinkingPicker(context()));
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PostModelSwitch') host.close();
    return undefined;
  });
  const chosen = thinkingPicker(context(), back); host.open(chosen); await Promise.resolve(); await Promise.resolve();
  const outcome = await chosen.apply(['low']);
  expect(outcome?.note).toContain('Reasoning effort: low'); expect(outcome?.next).toBeUndefined();
  expect(back).not.toHaveBeenCalled(); expect(readSessionModel(sessionId)?.thinkingEffort).toBe('low');
  expect(host.active).toBe(false);
});

it('admits one thinking action while its hook is pending and allows a fresh explicit selection after reopening', async () => {
  let unblock: () => void = () => {};
  const pending = new Promise<void>(resolve => { unblock = resolve; }); let entered = false;
  const dispatch = vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') { entered = true; await pending; }
    return undefined;
  });
  const current: CommandContext = { ...context(), readConfiguration: () => ({
    config: projectSessionModel(getRuntimeConfig(home), sessionId), catalog: loadCatalog() }) };
  const chosen = thinkingPicker(current), host = new OverlayHost(() => {}); host.open(chosen); await Promise.resolve(); await Promise.resolve();
  const work = chosen.apply(['low']); await vi.waitFor(() => expect(entered).toBe(true));
  try {
    const duplicate = chosen.apply(['medium']); await Promise.resolve(); unblock();
    expect(await duplicate).toBeUndefined(); await work;
    expect(dispatch.mock.calls.filter(([event]) => event.eventName === 'PreModelSwitch')).toHaveLength(1);
    expect(readSessionModel(sessionId)?.thinkingEffort).toBe('low');
    host.close(); host.open(chosen); await Promise.resolve(); await Promise.resolve();
    expect(chosen.initialSelection).toBe('low'); await chosen.apply(['medium']);
    expect(readSessionModel(sessionId)?.thinkingEffort).toBe('medium');
  } finally { unblock(); host.close(); }
});
