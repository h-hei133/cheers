import fs from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getUserRuntimeConfigPath, getRuntimeConfig, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../../config/runtimeConfig.js';
import { loadCatalog, writeCatalogCache } from '../../../../core/models/catalogStore.js';
import { SessionManager } from '../../../../session/SessionManager.js';
import { readSessionModelEdit } from '../../../../session/model/state.js';
import { modelPicker } from '../model.js';
import { OverlayHost } from '../../overlay.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';
import { ModelFocus } from './focus.js';

let root: string, sessionId: string;
const id = (model: string) => `model:${JSON.stringify(['ready', 'relay', model])}`;
const catalogue = (names = ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) => [{ id: 'relay', label: 'Relay', runtime: 'openai' as const,
  baseUrl: 'https://relay.invalid/v1', models: names.map(name => ({ id: name, contextWindow: 32000 })) }];
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/model-focus-');
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('OPENAI_API_KEY', '');
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'ready', providerConnections: [{ id: 'ready',
    provider: 'openai', authType: 'api-key', apiKey: 'synthetic-fixture', baseUrl: 'https://relay.invalid/v1', model: 'alpha',
    status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01' }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  writeCatalogCache(catalogue()); sessionId = new SessionManager().createNew(root).id;
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it.each([
  { category: 'all', focused: 'delta', remaining: ['alpha', 'beta', 'gamma', 'epsilon'], next: 'epsilon' },
  { category: 'relay', focused: 'delta', remaining: ['alpha', 'beta', 'gamma', 'epsilon'], next: 'epsilon' },
  { category: 'all', focused: 'epsilon', remaining: ['alpha', 'beta', 'gamma', 'delta'], next: 'delta' },
  { category: 'relay', focused: 'epsilon', remaining: ['alpha', 'beta', 'gamma', 'delta'], next: 'delta' },
  { category: 'all', focused: 'gamma', remaining: ['alpha', 'epsilon'], next: 'epsilon' },
  { category: 'relay', focused: 'gamma', remaining: ['alpha', 'epsilon'], next: 'epsilon' },
  { category: 'all', focused: 'delta', remaining: ['new-a', 'new-b'], next: 'new-b' },
  { category: 'relay', focused: 'delta', remaining: ['new-a', 'new-b'], next: 'new-b' },
])('moves removed $focused to its surviving neighbour $next in $category without writing', async ({ category, focused, remaining, next }) => {
  vi.useFakeTimers();
  let publication = { config: getRuntimeConfig(root), catalog: catalogue(), revision: 1 };
  const picker = modelPicker({ cwd: root, projectRoot: root, sessionId, readConfiguration: () => publication }, id(focused));
  const before = fs.readFileSync(getUserRuntimeConfigPath()); const session = readSessionModelEdit(sessionId);
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
  const host = new OverlayHost(() => {}); host.open(picker); await vi.advanceTimersByTimeAsync(0);
  const frame = (width = 120) => host.render(width, 30).map(stripAnsi).join('\n');
  try {
    if (category !== 'all') {
      picker.navigation!.select(category);
      host.handleKey(parseKeyEvent('\x1b[C'), vi.fn());
    }
    host.handleKey(parseKeyEvent('\x1b[A'), vi.fn()); host.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
    expect(frame()).toContain(`▸ ${focused}`);
    publication = { ...publication, catalog: catalogue(remaining), revision: 2 };
    writeCatalogCache(publication.catalog); await vi.advanceTimersByTimeAsync(500);
    expect(frame()).toContain(`▸ ${next}`); expect(frame(40)).toContain(`▸ ${next}`);
    expect(frame()).toContain('Focused model left the catalogue');
    expect(picker.navigation!.preferred).toBe(id(next)); expect(picker.navigation!.active).toBe(category);
    host.handleKey(parseKeyEvent('\x1b[D'), vi.fn()); host.handleKey(parseKeyEvent('\x1b[C'), vi.fn());
    expect(frame()).toContain(`▸ ${next}`);
    host.handleKey(parseKeyEvent('\x1b[A'), vi.fn());
    const manuallySelected = picker.navigation!.preferred;
    publication = { ...publication, catalog: catalogue([...remaining].reverse()), revision: 3 };
    writeCatalogCache(publication.catalog); await vi.advanceTimersByTimeAsync(500);
    expect(picker.navigation!.preferred).toBe(manuallySelected);
    expect(frame()).toContain(`▸ ${JSON.parse(manuallySelected!.slice(6))[2]}`);
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before); expect(readSessionModelEdit(sessionId)).toEqual(session);
    expect(fetch).not.toHaveBeenCalled();
  } finally { host.close(); }
});

it('returns from details to the next surviving neighbour when the focused model and its old successor were deleted', async () => {
  vi.useFakeTimers();
  const configured = getRuntimeConfig(root);
  const config = { ...configured, activeProviderConnectionId: undefined,
    providerConnections: configured.providerConnections.map(({ apiKey: _apiKey, ...connection }) => ({ ...connection, status: 'connected' as const })) };
  let publication = { config, catalog: catalogue(), revision: 1 };
  const picker = modelPicker({ cwd: root, projectRoot: root, sessionId, readConfiguration: () => publication }, id('beta'));
  const before = fs.readFileSync(getUserRuntimeConfigPath()); const session = readSessionModelEdit(sessionId);
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
  const host = new OverlayHost(() => {}); host.open(picker); await vi.advanceTimersByTimeAsync(0);
  const frame = () => host.render(120, 30).map(stripAnsi).join('\n');
  const press = async (raw: string) => {
    let pending: Promise<unknown> | undefined;
    host.handleKey(parseKeyEvent(raw), (selected, ids) => {
      pending = selected.apply(ids).then(outcome => { if (outcome?.next) host.open(outcome.next); });
    });
    await pending; await vi.advanceTimersByTimeAsync(0);
  };
  try {
    expect(frame()).toContain('▸ beta');
    await press('\r'); expect(frame()).toContain('Configure connection');
    publication = { ...publication, catalog: catalogue(['alpha', 'delta']), revision: 2 };
    await vi.advanceTimersByTimeAsync(500);
    expect(frame()).toContain('no longer available in the accepted catalogue');
    expect(frame()).not.toContain('Configure connection');
    await press('\r');
    expect(frame()).toContain('▸ delta');
    expect(frame()).toContain('Focused model left the catalogue');
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before); expect(readSessionModelEdit(sessionId)).toEqual(session);
    expect(fetch).not.toHaveBeenCalled();
  } finally { host.close(); }
});

it('refreshes exact detail facts and its action closure while the inspector remains open', async () => {
  vi.useFakeTimers();
  const unconfigured = `model:${JSON.stringify([null, 'other', 'shared'])}`;
  const other = (baseUrl: string, contextWindow: number) => ({ id: 'other', label: 'Other relay', runtime: 'openai' as const,
    baseUrl, models: [{ id: 'shared', contextWindow }] });
  let publication = { config: getRuntimeConfig(root), catalog: [...catalogue(), other('https://original.invalid/v1', 32000)], revision: 1 };
  const picker = modelPicker({ cwd: root, projectRoot: root, sessionId, readConfiguration: () => publication }, unconfigured);
  const host = new OverlayHost(() => {}); host.open(picker); await vi.advanceTimersByTimeAsync(0);
  const frame = () => host.render(140, 36).map(stripAnsi).join('\n');
  try {
    const details = (await picker.inspect!(unconfigured))!.next!;
    host.open(details); await vi.advanceTimersByTimeAsync(0);
    expect(frame()).toContain('Endpoint: original.invalid/v1');
    expect(frame()).toContain('Context: 32000 tokens');
    publication = { ...publication, catalog: [...catalogue(), other('https://replacement.invalid/v1', 64000)], revision: 2 };
    await vi.advanceTimersByTimeAsync(500);
    expect(frame()).toContain('Endpoint: replacement.invalid/v1');
    expect(frame()).toContain('Context: 64000 tokens');
    expect((await details.apply(['configure']))?.draft).toContain('https://replacement.invalid/v1');
  } finally { host.close(); }
});

it('reads the current accepted revision before the first detail paint', async () => {
  vi.useFakeTimers();
  const unconfigured = `model:${JSON.stringify([null, 'other', 'shared'])}`;
  const other = (contextWindow: number) => ({ id: 'other', label: 'Other relay', runtime: 'openai' as const,
    baseUrl: 'https://replacement.invalid/v1', models: [{ id: 'shared', contextWindow }] });
  let publication = { config: getRuntimeConfig(root), catalog: [...catalogue(), other(32000)], revision: 1 };
  const picker = modelPicker({ cwd: root, projectRoot: root, sessionId, readConfiguration: () => publication }, unconfigured);
  await picker.load();
  const details = (await picker.inspect!(unconfigured))!.next!;
  publication = { ...publication, catalog: [...catalogue(), other(64000)], revision: 2 };
  const host = new OverlayHost(() => {}); host.open(details); await vi.advanceTimersByTimeAsync(0);
  try {
    const frame = host.render(140, 36).map(stripAnsi).join('\n');
    expect(frame).toContain('Context: 64000 tokens');
    expect(frame).not.toContain('Context: 32000 tokens');
  } finally { host.close(); }
});

it('removes detail actions when a changed accepted revision cannot be reloaded', async () => {
  vi.useFakeTimers();
  const unconfigured = `model:${JSON.stringify([null, 'other', 'shared'])}`;
  const other = (contextWindow: number) => ({ id: 'other', label: 'Other relay', runtime: 'openai' as const,
    baseUrl: 'https://other.invalid/v1', models: [{ id: 'shared', contextWindow }] });
  writeCatalogCache([...catalogue(), other(32000)] as never);
  const original = loadCatalog();
  let publication = { config: getRuntimeConfig(root), catalog: original, revision: 1 };
  const refresh = vi.fn(() => ({ status: 'rejected' as const }) as never);
  const picker = modelPicker({ cwd: root, projectRoot: root, sessionId, readConfiguration: () => publication,
    refreshRuntimeConfig: refresh }, unconfigured);
  const host = new OverlayHost(() => {}); host.open(picker); await vi.advanceTimersByTimeAsync(0);
  try {
    const details = (await picker.inspect!(unconfigured))!.next!;
    host.open(details); await vi.advanceTimersByTimeAsync(0);
    expect(host.render(140, 36).map(stripAnsi).join('\n')).toContain('Configure connection');
    publication = { ...publication, catalog: [...catalogue(), other(64000)], revision: 2 };
    await vi.advanceTimersByTimeAsync(500);
    const frame = host.render(140, 36).map(stripAnsi).join('\n');
    expect(refresh).toHaveBeenCalledOnce();
    expect(frame).toContain('model details could not be refreshed');
    expect(frame).not.toContain('Configure connection');
  } finally { host.close(); }
});

it('uses the visible cross-provider search result as the deleted detail origin', async () => {
  vi.useFakeTimers();
  const config = { ...getRuntimeConfig(root), activeProviderConnectionId: undefined, providerConnections: [] };
  const twoProviders = (removeCandidates = false) => [
    { id: 'first', label: 'First provider', runtime: 'openai' as const, baseUrl: 'https://first.invalid/v1',
      models: [{ id: 'shared-a' }, { id: 'shared-d' }] },
    { id: 'second', label: 'Second provider', runtime: 'openai' as const, baseUrl: 'https://second.invalid/v1',
      models: removeCandidates ? [{ id: 'shared-e' }] : [{ id: 'shared-b' }, { id: 'shared-c' }, { id: 'shared-e' }] },
  ];
  const target = `model:${JSON.stringify([null, 'second', 'shared-b'])}`;
  let publication = { config, catalog: twoProviders(), revision: 1 };
  const picker = modelPicker({ cwd: root, projectRoot: root, sessionId, readConfiguration: () => publication });
  const host = new OverlayHost(() => {}); host.open(picker); await vi.advanceTimersByTimeAsync(0);
  const frame = () => host.render(120, 32).map(stripAnsi).join('\n');
  const press = async (raw: string) => {
    let pending: Promise<unknown> | undefined;
    host.handleKey(parseKeyEvent(raw), (selected, ids) => {
      pending = selected.apply(ids, host.acceptanceFor(selected)).then(outcome => { if (outcome?.next) host.open(outcome.next); });
    });
    await pending; await vi.advanceTimersByTimeAsync(0);
  };
  try {
    picker.navigation!.select('first');
    host.handleKey(parseKeyEvent('\x1b[C'), vi.fn());
    host.handlePaste('shared');
    expect(frame()).toContain('▸ shared-a');
    await press('\x1b[B'); await press('\x1b[B');
    expect(frame()).toContain('▸ shared-b');
    await press('\r');
    expect(frame()).toContain('Configure connection');
    publication = { ...publication, catalog: twoProviders(true), revision: 2 };
    await vi.advanceTimersByTimeAsync(500);
    expect(target).not.toBe(picker.navigation!.preferred);
    await press('\r');
    expect(frame()).toContain('▸ shared-e');
    expect(picker.navigation!.active).toBe('second');
  } finally { host.close(); }
});

it('preserves the visible detail origin through a nested key-form return', async () => {
  vi.useFakeTimers();
  const config = { ...getRuntimeConfig(root), activeProviderConnectionId: undefined, providerConnections: [] };
  const catalog = [
    { id: 'first', label: 'First provider', runtime: 'openai' as const, baseUrl: 'https://first.invalid/v1',
      models: [{ id: 'shared-a' }, { id: 'shared-d' }] },
    { id: 'second', label: 'Second provider', runtime: 'openai' as const, baseUrl: 'https://second.invalid/v1',
      models: [{ id: 'shared-b' }, { id: 'shared-c' }] },
  ];
  let publication = { config, catalog, revision: 1 };
  const signIn = vi.fn(async () => ({ context: { cwd: root, projectRoot: root, sessionId }, note: '' }));
  const picker = modelPicker({ cwd: root, projectRoot: root, sessionId, readConfiguration: () => publication },
    undefined, undefined, undefined, undefined, signIn);
  const host = new OverlayHost(() => {}); host.open(picker); await vi.advanceTimersByTimeAsync(0);
  const frame = () => host.render(120, 32).map(stripAnsi).join('\n');
  const press = async (raw: string) => {
    let pending: Promise<unknown> | undefined;
    host.handleKey(parseKeyEvent(raw), (selected, ids) => {
      pending = selected.apply(ids, host.acceptanceFor(selected)).then(outcome => { if (outcome?.next) host.open(outcome.next); });
    });
    await pending; await vi.advanceTimersByTimeAsync(0);
  };
  try {
    picker.navigation!.select('first');
    host.handleKey(parseKeyEvent('\x1b[C'), vi.fn());
    host.handlePaste('shared');
    await press('\x1b[B'); await press('\x1b[B');
    await press('\r'); expect(frame()).toContain('Configure connection');
    await press('\x1b[B'); await press('\r'); expect(frame()).toContain('API key');
    publication = { ...publication, catalog: [catalog[0]!, { ...catalog[1]!, models: [{ id: 'shared-c' }] }], revision: 2 };
    await press('\x1b');
    expect(frame()).toContain('▸ shared-c');
    expect(picker.navigation!.active).toBe('second');
  } finally { host.close(); }
});

it('preserves the visible detail origin when nested key setup succeeds without a new connection id', async () => {
  vi.useFakeTimers();
  const config = { ...getRuntimeConfig(root), activeProviderConnectionId: undefined, providerConnections: [] };
  const catalog = [
    { id: 'first', label: 'First provider', runtime: 'openai' as const, baseUrl: 'https://first.invalid/v1',
      models: [{ id: 'shared-a' }, { id: 'shared-d' }] },
    { id: 'second', label: 'Second provider', runtime: 'openai' as const, baseUrl: 'https://second.invalid/v1',
      models: [{ id: 'shared-b' }, { id: 'shared-c' }] },
  ];
  let publication = { config, catalog, revision: 1 };
  const signIn = vi.fn(async () => {
    publication = { ...publication, catalog: [catalog[0]!, { ...catalog[1]!, models: [{ id: 'shared-c' }] }], revision: 2 };
    return { note: 'Connection saved.',
      context: { cwd: root, projectRoot: root, sessionId, readConfiguration: () => publication } };
  });
  const picker = modelPicker({ cwd: root, projectRoot: root, sessionId, readConfiguration: () => publication },
    undefined, undefined, undefined, undefined, signIn);
  const host = new OverlayHost(() => {}); host.open(picker); await vi.advanceTimersByTimeAsync(0);
  const frame = () => host.render(120, 32).map(stripAnsi).join('\n');
  const press = async (raw: string) => {
    let pending: Promise<unknown> | undefined;
    host.handleKey(parseKeyEvent(raw), (selected, ids) => {
      pending = selected.apply(ids, host.acceptanceFor(selected)).then(outcome => { if (outcome?.next) host.open(outcome.next); });
    });
    await pending; await vi.advanceTimersByTimeAsync(0);
  };
  try {
    picker.navigation!.select('first');
    host.handleKey(parseKeyEvent('\x1b[C'), vi.fn());
    host.handlePaste('shared');
    await press('\x1b[B'); await press('\x1b[B'); await press('\r');
    await press('\x1b[B'); await press('\r'); expect(frame()).toContain('API key');
    host.handlePaste('synthetic-success');
    await press('\r');
    expect(signIn).toHaveBeenCalledOnce();
    expect(frame()).toContain('▸ shared-c');
    expect(frame()).toContain('Connection saved.');
    expect(picker.navigation!.active).toBe('second');
  } finally { host.close(); }
});

it('preserves a surviving manual identity through a catalogue reorder without announcing removal', async () => {
  vi.useFakeTimers();
  let publication = { config: getRuntimeConfig(root), catalog: catalogue(), revision: 1 };
  const picker = modelPicker({ cwd: root, projectRoot: root, sessionId, readConfiguration: () => publication }, id('delta'));
  const host = new OverlayHost(() => {}); host.open(picker); await vi.advanceTimersByTimeAsync(0);
  try {
    host.handleKey(parseKeyEvent('\x1b[A'), vi.fn()); host.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
    publication = { ...publication, catalog: catalogue(['epsilon', 'delta', 'gamma', 'beta', 'alpha']), revision: 2 };
    writeCatalogCache(publication.catalog); await vi.advanceTimersByTimeAsync(500);
    const frame = host.render(120, 30).map(stripAnsi).join('\n');
    expect(frame).toContain('▸ delta'); expect(frame).not.toContain('left the catalogue');
    expect(picker.navigation!.preferred).toBe(id('delta'));
  } finally { host.close(); }
});

it('reports an empty refreshed category without choosing its disabled placeholder or writing a model', async () => {
  vi.useFakeTimers();
  let publication = { config: getRuntimeConfig(root), catalog: catalogue(), revision: 1 };
  const picker = modelPicker({ cwd: root, projectRoot: root, sessionId, readConfiguration: () => publication }, id('delta'));
  const before = readSessionModelEdit(sessionId);
  const host = new OverlayHost(() => {}); host.open(picker); await vi.advanceTimersByTimeAsync(0);
  try {
    picker.navigation!.select('relay'); host.handleKey(parseKeyEvent('\x1b[C'), vi.fn());
    host.handleKey(parseKeyEvent('\x1b[A'), vi.fn()); host.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
    expect(picker.navigation!.preferred).toBe(id('delta'));
    publication = { ...publication, catalog: catalogue([]), revision: 2 }; writeCatalogCache(publication.catalog);
    await vi.advanceTimersByTimeAsync(500);
    const frame = host.render(120, 30).map(stripAnsi).join('\n');
    expect(frame).toContain('No nearby models remain'); expect(frame).toContain('no models listed');
    expect(picker.navigation!.preferred).toBeUndefined();
    const apply = vi.fn(); host.handleKey(parseKeyEvent('\r'), apply); expect(apply).not.toHaveBeenCalled();
    expect(readSessionModelEdit(sessionId)).toEqual(before);
  } finally { host.close(); }
});

it('keeps disabled neighbours browsable without selecting a placeholder and resets notices on reopening', () => {
  const focus = new ModelFocus();
  const original = ['alpha', 'beta', 'gamma'].map(name => ({ id: id(name), label: name }));
  const rows = [original[0]!, { ...original[2]!, disabled: true, focusable: true }, { id: id(''), label: 'empty', disabled: true }];
  expect(focus.select(rows, original, id('beta'))).toBe(id('gamma'));
  focus.reset(); expect(focus.notice).toBeUndefined();
});

it('does not report removal when a refreshed search hides an identity still present in the catalogue', async () => {
  vi.useFakeTimers();
  let publication = { config: getRuntimeConfig(root), catalog: catalogue(), revision: 1 };
  const picker = modelPicker({ cwd: root, projectRoot: root, sessionId, readConfiguration: () => publication }, id('delta'));
  const host = new OverlayHost(() => {}); host.open(picker); await vi.advanceTimersByTimeAsync(0);
  try {
    // Search the displayed 32k capacity, then change its metadata without
    // deleting the model. A lost match cannot be called a deleted target.
    host.handlePaste('32k');
    expect(host.render(120, 30).map(stripAnsi).join('\n')).toContain('delta');
    publication = { ...publication, catalog: catalogue().map(provider => ({ ...provider,
      models: provider.models.map(model => ({ ...model, contextWindow: 64000 })) })), revision: 2 };
    writeCatalogCache(publication.catalog); await vi.advanceTimersByTimeAsync(500);
    const frame = host.render(120, 30).map(stripAnsi).join('\n');
    expect(frame).toContain('No matching models.'); expect(frame).not.toContain('left the catalogue');
    host.handleKey(parseKeyEvent('\x1b'), vi.fn());
    expect(host.render(120, 30).map(stripAnsi).join('\n')).toContain('▸ delta');
  } finally { host.close(); }
});

it('clears a transient focus notice on the next accepted revision without clearing transaction feedback', async () => {
  vi.useFakeTimers();
  let publication = { config: getRuntimeConfig(root), catalog: catalogue(['alpha', 'beta', 'gamma']), revision: 1 };
  const picker = modelPicker({ cwd: root, projectRoot: root, sessionId, readConfiguration: () => publication },
    id('beta'), undefined, undefined, 'Connection saved.');
  const host = new OverlayHost(() => {}); host.open(picker); await vi.advanceTimersByTimeAsync(0);
  const frame = () => host.render(140, 30).map(stripAnsi).join('\n');
  try {
    publication = { ...publication, catalog: catalogue(['alpha', 'gamma']), revision: 2 };
    await vi.advanceTimersByTimeAsync(500);
    expect(frame()).toContain('Focused model left the catalogue');
    expect(frame()).toContain('Connection saved.');
    publication = { ...publication, catalog: catalogue(['alpha', 'beta', 'gamma']), revision: 3 };
    await vi.advanceTimersByTimeAsync(500);
    expect(frame()).not.toContain('Focused model left the catalogue');
    expect(frame()).toContain('Connection saved.');
  } finally { host.close(); }
});
