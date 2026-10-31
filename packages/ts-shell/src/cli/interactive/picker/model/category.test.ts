import fs from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile,
  type RuntimeConfig } from '../../../../config/runtimeConfig.js';
import { writeCatalogCache } from '../../../../core/models/catalogStore.js';
import { defaultHookDispatcher } from '../../../../core/hooks/hookDispatcher.js';
import { resolveProviderCredential } from '../../../../core/shell/providerCredentials.js';
import { selectPooledConnection } from '../../../../core/auth/account/pool.js';
import { setReviewedModelTarget } from '../../../../core/commands/model/selection.js';
import { SessionManager } from '../../../../session/SessionManager.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../../../session/model/state.js';
import { projectSessionModel } from '../../../../session/model/projection.js';
import { modelPicker } from '../model.js';
import { OverlayHost, type PickerOutcome } from '../../overlay.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';
import { parseMouseReport } from '../../../../presentation/tui/input/mouse.js';

let root: string, sessionId: string;
const address = (name: string) => `https://${name}.invalid/v1`;
const target = (provider: string, connection: string | null = null) => `model:${JSON.stringify([connection, provider, 'shared'])}`;
const catalogue = () => ['missing', 'ready', 'later', 'extra'].map(name => ({ id: `relay-${name}`, label: `Relay ${name}`,
  runtime: 'openai' as const, baseUrl: address(name), models: [{ id: 'shared', contextWindow: 32000 }] }));
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/model-category-');
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('OPENAI_API_KEY', ''); vi.stubEnv('ANTHROPIC_API_KEY', '');
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'ready', providerConnections: [{ id: 'ready',
    provider: 'openai', authType: 'api-key', apiKey: 'synthetic-category', baseUrl: address('ready'), model: 'shared',
    status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01' }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  writeCatalogCache(catalogue());
  sessionId = new SessionManager().createNew(root).id;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
const commands = () => ({ cwd: root, projectRoot: root, sessionId });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

it.each((['local', 'host'] as const).flatMap(source => (['dismiss', 'activate'] as const).map(ending => ({ source, ending }))))(
  'keeps pool affinity through $source discovery and refresh until explicit $ending', async ({ source, ending }) => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const ready = edit.values.providerConnections![0]!;
  writeUserRuntimeConfigFile({ ...edit.values, activeProviderConnectionId: undefined,
    providerConnections: [ready, { ...ready, id: 'later', apiKey: 'synthetic-later', baseUrl: address('later') }],
    accountPool: { openai: { connections: ['ready', 'later'] } } }, edit);
  const config = getRuntimeConfig(root);
  selectPooledConnection({ config, provider: 'openai', connectionId: 'ready', sessionId });
  const resolve = (candidate: RuntimeConfig, id?: string) => resolveProviderCredential({ runtimeConfig: candidate, env: {}, pool: { sessionId: id } });
  const current = () => resolve(config, sessionId);
  const before = current();
  const picker = modelPicker({ ...commands(), ...(source === 'host' ? { resolveConfigTarget: resolve } : {}) });
  const rows = await picker.load();
  expect(rows.find(row => row.note === 'active')?.id).toBe(target('relay-ready', 'ready'));
  expect(current().credential).toEqual(before.credential);
  await picker.load();
  expect(current().credential).toEqual(before.credential);
  expect(picker.detail!(target('relay-later', 'later')).join('\n')).toContain('later');
  if (ending === 'activate') {
    const result = await picker.apply([target('relay-later', 'later')]);
    expect(result?.note).toContain('Model switched to shared.');
    expect(readSessionModel(sessionId)).toMatchObject({ connectionScope: 'session', connectionId: 'later', model: 'shared' });
    const effective = projectSessionModel(getRuntimeConfig(root), sessionId);
    expect(resolve(effective, sessionId).credential?.connectionId).toBe('later');
  } else {
    picker.previewEnd?.();
    expect(current().credential).toEqual(before.credential);
    expect(readSessionModel(sessionId)).toBeUndefined();
  }
});

it('orders the exact configured relay before unconfigured categories sharing its runtime and keeps their models browsable', async () => {
  const picker = modelPicker(commands()); const rows = await picker.load();
  const categories = picker.navigation!.items.filter(item => item.id.startsWith('relay-'));
  expect(categories.map(item => [item.id, item.note])).toEqual([
    ['relay-ready', undefined], ['relay-extra', '○'], ['relay-later', '○'], ['relay-missing', '○'],
  ]);
  const models = rows.filter(row => row.id.includes('relay-'));
  expect(models.map(row => row.id)).toEqual([target('relay-ready', 'ready'), target('relay-extra'), target('relay-later'), target('relay-missing')]);
  expect(models[0]?.disabled).not.toBe(true);
  expect(models.slice(1)).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: target('relay-missing'), disabled: true, focusable: true }),
    expect.objectContaining({ id: target('relay-later'), disabled: true, focusable: true }),
    expect.objectContaining({ id: target('relay-extra'), disabled: true, focusable: true }),
  ]));
});

it('marks only the exact relay target active instead of its canonical alias', async () => {
  writeCatalogCache([{ id: 'openai', runtime: 'openai', models: [{ id: 'shared' }] }, ...catalogue()]);
  writeSessionModel(sessionId, { connectionScope: 'session', connectionId: 'ready', provider: 'openai', model: 'shared' },
    readSessionModelEdit(sessionId));
  const picker = modelPicker(commands()); const rows = await picker.load();
  expect(rows.find(row => row.id === target('openai', 'ready'))).toMatchObject({ note: 'alias: Relay ready' });
  expect(rows.filter(row => row.note === 'active')).toEqual([
    expect.objectContaining({ id: target('relay-ready', 'ready'), label: 'shared' }),
  ]);
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

it('keeps environment credentials on the canonical provider and never borrows them for a relay endpoint', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'synthetic-environment');
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, activeProviderConnectionId: undefined, providerConnections: [] }, edit);
  writeCatalogCache([{ id: 'openai', runtime: 'openai', models: [{ id: 'shared' }] }, ...catalogue()]);
  const picker = modelPicker(commands()); const rows = await picker.load();
  const canonical = rows.find(row => row.id === target('openai'));
  const relay = rows.find(row => row.id === target('relay-ready'));
  expect(canonical?.disabled).not.toBe(true);
  expect(relay).toMatchObject({ disabled: true, focusable: true });
  expect(picker.detail!(target('relay-ready')).join('\n')).toContain('configure a connection');
});

it.each(['environment', 'profile'] as const)('keeps a non-current %s-backed provider disabled until an exact named connection exists', async source => {
  if (source === 'environment') vi.stubEnv('ANTHROPIC_API_KEY', 'synthetic-anthropic');
  else {
    const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
    writeUserRuntimeConfigFile({ ...edit.values, providerCredentials: {
      ...edit.values.providerCredentials,
      anthropic: { apiKey: 'synthetic-anthropic', baseUrl: 'https://profile-ambient.invalid/v1', model: 'shared' },
    } }, edit);
  }
  writeCatalogCache([{ id: 'openai', runtime: 'openai', models: [{ id: 'base' }] },
    { id: 'anthropic', runtime: 'anthropic', baseUrl: 'https://api.anthropic.invalid/v1', models: [{ id: 'shared' }] }]);
  const picker = modelPicker(commands()); const rows = await picker.load();
  const row = rows.find(row => row.id === target('anthropic'));
  expect(row).toMatchObject({
    disabled: true, focusable: true, note: 'named connection required',
  });
  expect(row?.detail).toContain(source === 'environment' ? 'api.anthropic.invalid/v1' : 'profile-ambient.invalid/v1');
  expect(row?.detail).toContain(source === 'environment' ? 'env credential' : 'config credential');
  expect(row?.detail).not.toContain('synthetic-anthropic');
  expect(picker.detail!(target('anthropic')).join('\n')).toContain(`Credential source: ${source === 'environment' ? 'env' : 'config'}`);
  expect(picker.detail!(target('anthropic')).join('\n')).toContain('named connection required');
  if (source === 'profile') {
    const details = (await picker.inspect!(target('anthropic')))!.next!;
    expect((await details.load()).map(item => item.id)).toEqual(['back', 'configure']);
    const outcome = await details.apply(['configure']);
    expect(outcome?.draft).toContain('profile-ambient.invalid/v1');
    expect(outcome?.draft).not.toContain('synthetic-anthropic');
  }
  expect(readSessionModel(sessionId)).toBeUndefined();
});

it.each([undefined, '', null, 42])('requires a valid reviewed resolution before applying a provider target: %j', async resolution => {
  const before = readSessionModelEdit(sessionId);
  expect(await setReviewedModelTarget({ connectionScope: 'provider', provider: 'anthropic', model: 'shared' }, commands(),
    { resolution: resolution as string }))
    .toContain('provider selection must come from the reviewed model picker');
  expect(readSessionModelEdit(sessionId)).toEqual(before);
});

it('expires a CLI-selected provider slot when its ambient credential changes after load', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'synthetic-first');
  writeCatalogCache([{ id: 'anthropic', runtime: 'anthropic', models: [{ id: 'shared' }] }]);
  const command = { ...commands(),
    resolveConfigTarget: (config: RuntimeConfig) => resolveProviderCredential({ runtimeConfig: config, cliProvider: 'anthropic' }) };
  const picker = modelPicker(command); const rows = await picker.load();
  expect(rows.find(row => row.id === target('anthropic'))?.disabled).not.toBe(true);
  const before = fs.readFileSync(getUserRuntimeConfigPath());
  vi.stubEnv('ANTHROPIC_API_KEY', 'synthetic-second');
  const result = await picker.apply([target('anthropic')]);
  expect(result?.note).toContain('selected credential or endpoint changed');
  expect(result?.note).not.toContain('synthetic-');
  expect(readSessionModel(sessionId)).toBeUndefined();
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before);
});

it('expires a provider slot when only its resolved endpoint changes after load', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'synthetic-stable');
  vi.stubEnv('FIXTURE_PROVIDER_ENDPOINT', 'https://first.invalid/v1');
  writeCatalogCache([{ id: 'anthropic', runtime: 'anthropic', models: [{ id: 'shared' }] }]);
  const resolveConfigTarget = (config: RuntimeConfig) => {
    const resolution = resolveProviderCredential({ runtimeConfig: config, cliProvider: 'anthropic' });
    const baseUrl = process.env.FIXTURE_PROVIDER_ENDPOINT;
    return resolution.credential ? { ...resolution, baseUrl, credential: { ...resolution.credential, baseUrl } } : resolution;
  };
  const picker = modelPicker({ ...commands(), resolveConfigTarget }); const rows = await picker.load();
  expect(rows.find(row => row.id === target('anthropic'))?.disabled).not.toBe(true);
  vi.stubEnv('FIXTURE_PROVIDER_ENDPOINT', 'https://second.invalid/v1');
  expect((await picker.apply([target('anthropic')]))?.note).toContain('selected credential or endpoint changed');
  expect(readSessionModel(sessionId)).toBeUndefined();
});

it('refuses a provider slot when its endpoint changes inside the switch hook', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'synthetic-stable');
  vi.stubEnv('FIXTURE_PROVIDER_ENDPOINT', 'https://first.invalid/v1');
  writeCatalogCache([{ id: 'anthropic', runtime: 'anthropic', models: [{ id: 'shared' }] }]);
  const resolveConfigTarget = (config: RuntimeConfig) => {
    const resolution = resolveProviderCredential({ runtimeConfig: config, cliProvider: 'anthropic' });
    const baseUrl = process.env.FIXTURE_PROVIDER_ENDPOINT;
    return resolution.credential ? { ...resolution, baseUrl, credential: { ...resolution.credential, baseUrl } } : resolution;
  };
  const picker = modelPicker({ ...commands(), resolveConfigTarget }); await picker.load();
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') vi.stubEnv('FIXTURE_PROVIDER_ENDPOINT', 'https://second.invalid/v1');
    return undefined;
  });
  const result = await picker.apply([target('anthropic')]);
  expect(result?.note).toContain('Session model conflict: this attempt did not write');
  expect(readSessionModel(sessionId)).toBeUndefined();
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
    .toEqual([['relay-missing', undefined], ['relay-extra', '○'], ['relay-later', '○'], ['relay-ready', '○']]);
  expect(picker.navigation!.active).toBe('relay-ready');
  expect(picker.navigation!.preferred).toBe(target('relay-ready', 'ready'));
  expect(picker.filterOptions!('', []).find(row => row.id === target('relay-ready', 'ready'))).toMatchObject({ disabled: true, focusable: true });
  expect(readSessionModelEdit(sessionId)).toEqual(before);
});

it.each([40, 80, 120])('sorts exact provider and model groups, skips the not-ready heading and inspects at %i columns', async width => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath()), configured = edit.values.providerConnections![0]!;
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: [configured,
    { ...configured, id: 'second', baseUrl: address('second') }] }, edit);
  const catalog = [
    { id: 'sort-aearly', label: 'Omega offline', baseUrl: address('omega'), models: ['sort-zed', 'sort-gamma'] },
    { id: 'sort-first', label: 'Zulu ready', baseUrl: address('ready'), models: ['sort-zulu', 'sort-alpha'] },
    { id: 'sort-zlast', label: 'Beta offline', baseUrl: address('beta'), models: ['sort-omega', 'sort-aardvark'] },
    { id: 'sort-second', label: 'Alpha ready', baseUrl: address('second'), models: ['sort-delta', 'sort-beta'] },
  ].map(provider => ({ ...provider, runtime: 'openai' as const, auth: 'api-key' as const,
    models: provider.models.map(id => ({ id })) }));
  const picker = modelPicker({ ...commands(), readConfiguration: () => ({ config: getRuntimeConfig(root), catalog, revision: 1 }) });
  const rows = await picker.load(), navigation = picker.navigation!;
  expect(navigation.items.map(item => item.label)).toEqual([
    'Roles', 'All models', 'Alpha ready', 'Zulu ready', 'Not ready', 'Beta offline', 'Omega offline',
  ]);
  const heading = navigation.items.find(item => item.disabled)!;
  expect(heading.label).toBe('Not ready'); expect(navigation.select(heading.id)).toBeUndefined();
  expect(rows[0]?.id).toBe('model:current');
  const labels = ['sort-alpha', 'sort-beta', 'sort-delta', 'sort-zulu', 'sort-aardvark', 'sort-gamma', 'sort-omega', 'sort-zed'];
  expect(rows.filter(row => row.label.startsWith('sort-')).map(row => row.label)).toEqual(labels);
  expect(picker.filterOptions!('sort-', rows).map(row => row.label)).toEqual(labels);
  expect(rows.filter(row => row.id.startsWith('role:')).map(row => row.id))
    .toEqual(['role:default', 'role:subagent', 'role:summary', 'role:advisor']);
  const before = readSessionModelEdit(sessionId), global = fs.readFileSync(getUserRuntimeConfigPath());
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected probe'));
  const overlay = new OverlayHost(() => {}); overlay.open(picker); await settle(); const apply = vi.fn();
  overlay.handleKey(parseKeyEvent('\t'), apply);
  for (let step = 0; step < navigation.items.length && navigation.active !== 'sort-first'; step++) overlay.handleKey(parseKeyEvent('\x1b[B'), apply);
  expect(navigation.active).toBe('sort-first');
  overlay.handleKey(parseKeyEvent('\x1b[B'), apply); expect(navigation.active).toBe('sort-zlast');
  const frame = overlay.render(width, 30).map(stripAnsi);
  const row = frame.findIndex(text => text.split('│')[0]?.includes('Not ready'));
  expect(row).toBeGreaterThan(0);
  const select = vi.spyOn(navigation, 'select');
  overlay.handlePointer(parseMouseReport(`\x1b[<0;3;${row + 1}M`)!, 0);
  expect(select).not.toHaveBeenCalled(); expect(navigation.active).toBe('sort-zlast');
  overlay.handleKey(parseKeyEvent('\x1b[A'), apply); expect(navigation.active).toBe('sort-first');
  overlay.handleKey(parseKeyEvent('\x1b[B'), apply); overlay.handleKey(parseKeyEvent('\r'), apply);
  const unavailable = rows.find(row => row.label === 'sort-aardvark')!;
  expect(unavailable).toMatchObject({ disabled: true, focusable: true });
  const detail = (await picker.inspect!(unavailable.id))!.next!;
  expect((await detail.load()).some(row => row.id === 'configure')).toBe(true);
  const draft = (await detail.apply(['configure']))?.draft;
  expect(draft).toContain('--model sort-aardvark'); expect(draft).toContain(address('beta'));
  expect(apply).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  expect(readSessionModelEdit(sessionId)).toEqual(before); expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
  overlay.close();
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
    host.handlePaste('no-such-model'); expect(frame()).toContain('No matching models.');
    await press('\x1b'); expect(frame()).toContain('▸ shared'); expect(frame()).toContain('Endpoint: later.invalid/v1');
    expect(frame(40, 18)).toContain('▸ shared');
    await press('\x1b[D'); await press('\x1b[A');
    expect(host.active).toBe(true);
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before); expect(readSessionModelEdit(sessionId)).toEqual(session);
    expect(fetch).not.toHaveBeenCalled();
  } finally { host.close(); }
});
