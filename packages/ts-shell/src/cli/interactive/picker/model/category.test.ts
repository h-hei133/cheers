import fs from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../../config/runtimeConfig.js';
import { writeCatalogCache } from '../../../../core/models/catalogStore.js';
import { SessionManager } from '../../../../session/SessionManager.js';
import { readSessionModelEdit, writeSessionModel } from '../../../../session/model/state.js';
import { modelPicker } from '../model.js';
import { OverlayHost, type PickerOutcome } from '../../overlay.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';

let root: string, sessionId: string;
const address = (name: string) => `https://${name}.invalid/v1`;
const target = (provider: string, connection: string | null = null) => `model:${JSON.stringify([connection, provider, 'shared'])}`;
const catalogue = () => ['missing', 'ready', 'later', 'extra'].map(name => ({ id: `relay-${name}`, label: `Relay ${name}`,
  runtime: 'openai' as const, baseUrl: address(name), models: [{ id: 'shared', contextWindow: 32000 }] }));
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/model-category-');
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('OPENAI_API_KEY', '');
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'ready', providerConnections: [{ id: 'ready',
    provider: 'openai', authType: 'api-key', apiKey: 'synthetic-category', baseUrl: address('ready'), model: 'shared',
    status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01' }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  writeCatalogCache(catalogue());
  sessionId = new SessionManager().createNew(root).id;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
const commands = () => ({ cwd: root, projectRoot: root, sessionId });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

it('orders the exact configured relay before unconfigured categories sharing its runtime and keeps their models browsable', async () => {
  const picker = modelPicker(commands()); const rows = await picker.load();
  const categories = picker.navigation!.items.filter(item => item.id.startsWith('relay-'));
  expect(categories.map(item => [item.id, item.note])).toEqual([
    ['relay-ready', undefined], ['relay-missing', '○'], ['relay-later', '○'], ['relay-extra', '○'],
  ]);
  const models = rows.filter(row => row.id.includes('relay-'));
  expect(models.map(row => row.id)).toEqual([target('relay-ready', 'ready'), target('relay-missing'), target('relay-later'), target('relay-extra')]);
  expect(models[0]?.disabled).not.toBe(true);
  expect(models.slice(1)).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: target('relay-missing'), disabled: true, focusable: true }),
    expect.objectContaining({ id: target('relay-later'), disabled: true, focusable: true }),
    expect.objectContaining({ id: target('relay-extra'), disabled: true, focusable: true }),
  ]));
});

it.each(['pending', 'error', 'credential-missing'] as const)('does not borrow another relay credential for a %s category', async state => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: [...edit.values.providerConnections!, { id: 'missing',
    provider: 'openai', authType: 'api-key', ...(state === 'credential-missing' ? {} : { apiKey: 'synthetic-unready' }),
    baseUrl: address('missing'), model: 'shared', status: state === 'credential-missing' ? 'connected' : state,
    createdAt: '2026-01-01', updatedAt: '2026-01-01' }] }, edit);
  const picker = modelPicker(commands()); const rows = await picker.load();
  expect(picker.navigation!.items.find(item => item.id === 'relay-missing')?.note).toBe('○');
  expect(rows.find(row => row.id === target('relay-missing', 'missing'))).toMatchObject({ disabled: true, focusable: true });
  expect(picker.navigation!.items.findIndex(item => item.id === 'relay-ready'))
    .toBeLessThan(picker.navigation!.items.findIndex(item => item.id === 'relay-missing'));
});

it('does not label a named relay ready when only an environment fallback is present for its missing credential', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'synthetic-environment');
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: [...edit.values.providerConnections!, { id: 'missing',
    provider: 'openai', authType: 'api-key', baseUrl: address('missing'), model: 'shared', status: 'connected',
    createdAt: '2026-01-01', updatedAt: '2026-01-01' }] }, edit);
  const picker = modelPicker(commands()); const rows = await picker.load();
  expect(picker.navigation!.items.find(item => item.id === 'relay-missing')?.note).toBe('○');
  expect(rows.find(row => row.id === target('relay-missing', 'missing'))).toMatchObject({ disabled: true, focusable: true });
});

it('keeps ambiguous exact-address categories unavailable even with a configured connection', async () => {
  writeCatalogCache([...catalogue(), { id: 'relay-duplicate', runtime: 'openai',
    baseUrl: address('ready') + '/', models: [{ id: 'shared' }] }]);
  const picker = modelPicker(commands()); const rows = await picker.load();
  for (const provider of ['relay-ready', 'relay-duplicate']) {
    expect(picker.navigation!.items.find(item => item.id === provider)?.note).toBe('○');
    expect(rows.find(row => row.id === target(provider, 'ready'))).toMatchObject({ disabled: true, focusable: true });
  }
});

it('marks an exact category unavailable when its configured models cannot accept the current effort', async () => {
  writeSessionModel(sessionId, { connectionId: 'ready', provider: 'openai', model: 'shared', thinkingEffort: 'high' }, readSessionModelEdit(sessionId));
  writeCatalogCache(catalogue().map(provider => provider.id === 'relay-ready'
    ? { ...provider, models: [{ id: 'shared', contextWindow: 32000, reasoning: true, thinkingLevelMap: { high: null } }] } : provider));
  const picker = modelPicker(commands()); const rows = await picker.load();
  expect(picker.navigation!.items.find(item => item.id === 'relay-ready')?.note).toBe('○');
  expect(rows.find(row => row.id === target('relay-ready', 'ready'))).toMatchObject({ disabled: true, focusable: true });
  expect(picker.detail!(target('relay-ready', 'ready'))).toContain('reasoning effort unsupported');
  const details = (await picker.inspect!(target('relay-ready', 'ready')))!.next!;
  expect((await details.load()).map(row => row.id)).toContain('effort');
});

it('keeps an empty exact category unavailable and makes no placeholder actionable', async () => {
  writeCatalogCache(catalogue().map(provider => provider.id === 'relay-ready' ? { ...provider, models: [] } : provider));
  const picker = modelPicker(commands()); const rows = await picker.load();
  expect(picker.navigation!.items.find(item => item.id === 'relay-ready')?.note).toBe('○');
  const empty = rows.find(row => row.id === 'model:' + JSON.stringify(['ready', 'relay-ready', '']));
  expect(empty).toMatchObject({ disabled: true, note: 'no models listed' });
  expect(empty?.focusable).not.toBe(true);
});

it('derives readiness from any admitted exact connection while preserving connection order and separate blockers', async () => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const configured = edit.values.providerConnections![0]!;
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: [
    { ...configured, id: 'pending', status: 'pending' }, configured,
  ] }, edit);
  const picker = modelPicker(commands()); const rows = await picker.load();
  expect(picker.navigation!.items.find(item => item.id === 'relay-ready')?.note).toBeUndefined();
  expect(rows.filter(row => row.id.includes('relay-ready')).map(row => row.id))
    .toEqual([target('relay-ready', 'pending'), target('relay-ready', 'ready')]);
  expect(rows.find(row => row.id === target('relay-ready', 'pending'))).toMatchObject({ disabled: true, focusable: true });
  expect(rows.find(row => row.id === target('relay-ready', 'ready'))?.disabled).not.toBe(true);
});

it('reorders refreshed exact categories without moving manual focus and refuses the prior activation before reload', async () => {
  const picker = modelPicker(commands()); await picker.load();
  picker.navigation!.select('relay-ready'); picker.navigation!.point(target('relay-ready', 'ready'), '');
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const original = edit.values.providerConnections![0]!;
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: [
    { ...original, status: 'error' }, { ...original, id: 'missing', baseUrl: address('missing') },
  ] }, edit);
  const before = readSessionModelEdit(sessionId);
  expect((await picker.apply([target('relay-ready', 'ready')]))?.note).toContain('expired');
  expect(readSessionModelEdit(sessionId)).toEqual(before);
  await picker.load();
  expect(picker.navigation!.items.filter(item => item.id.startsWith('relay-')).map(item => [item.id, item.note]))
    .toEqual([['relay-missing', undefined], ['relay-ready', '○'], ['relay-later', '○'], ['relay-extra', '○']]);
  expect(picker.navigation!.active).toBe('relay-ready');
  expect(picker.navigation!.preferred).toBe(target('relay-ready', 'ready'));
  expect(picker.filterOptions!('').find(row => row.id === target('relay-ready', 'ready'))).toMatchObject({ disabled: true, focusable: true });
  expect(readSessionModelEdit(sessionId)).toEqual(before);
});

it.each([false, true])('navigates exact relay categories, clears empty search and returns from details without writes (all missing: %s)', async allMissing => {
  if (allMissing) {
    const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
    writeUserRuntimeConfigFile({ ...edit.values, activeProviderConnectionId: undefined, providerConnections: [] }, edit);
  }
  const picker = modelPicker(commands(), target('relay-missing'));
  const before = fs.readFileSync(getUserRuntimeConfigPath()); const session = readSessionModelEdit(sessionId);
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
  const host = new OverlayHost(() => {}); host.open(picker); await settle();
  const frame = (width = 130, height = 35) => host.render(width, height).map(stripAnsi).join('\n');
  const press = async (raw: string) => {
    let work: Promise<PickerOutcome | undefined> | undefined;
    host.handleKey(parseKeyEvent(raw), (selected, ids) => { work = selected.apply(ids).then(outcome => {
      if (outcome?.next) host.open(outcome.next); return outcome;
    }); });
    await work; await settle();
  };
  try {
    expect(frame()).toContain('▸ shared'); expect(frame()).toContain('Endpoint: missing.invalid/v1');
    await press('\x1b[D'); expect(picker.navigation!.focused).toBe(true);
    for (let step = 0; step < picker.navigation!.items.length && picker.navigation!.active !== 'relay-later'; step++) await press('\x1b[B');
    expect(picker.navigation!.active).toBe('relay-later');
    await press('\x1b[C'); expect(frame()).toContain('Endpoint: later.invalid/v1');
    await press('\r'); expect(frame()).toContain('Configure connection');
    await press('\x1b'); expect(frame()).toContain('▸ shared'); expect(frame()).toContain('Endpoint: later.invalid/v1');
    host.handlePaste('no-such-model'); expect(frame()).toContain('No providers in the catalogue.');
    await press('\x1b'); expect(frame()).toContain('▸ shared'); expect(frame()).toContain('Endpoint: later.invalid/v1');
    expect(frame(40, 18)).toContain('▸ shared');
    await press('\x1b[D'); await press('\x1b[A');
    expect(host.active).toBe(true);
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before); expect(readSessionModelEdit(sessionId)).toEqual(session);
    expect(fetch).not.toHaveBeenCalled();
  } finally { host.close(); }
});
