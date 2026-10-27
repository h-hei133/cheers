import fs from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getUserRuntimeConfigPath, getRuntimeConfig, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../../config/runtimeConfig.js';
import { writeCatalogCache } from '../../../../core/models/catalogStore.js';
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

it('returns from details to a surviving neighbour when the focused model was deleted', async () => {
  const configured = getRuntimeConfig(root);
  const config = { ...configured, activeProviderConnectionId: undefined,
    providerConnections: configured.providerConnections.map(({ apiKey: _apiKey, ...connection }) => ({ ...connection, status: 'connected' as const })) };
  let publication = { config, catalog: catalogue(), revision: 1 };
  const picker = modelPicker({ cwd: root, projectRoot: root, sessionId, readConfiguration: () => publication }, id('beta'));
  const before = fs.readFileSync(getUserRuntimeConfigPath()); const session = readSessionModelEdit(sessionId);
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
  const host = new OverlayHost(() => {}); host.open(picker); await new Promise(resolve => setTimeout(resolve, 0));
  const frame = () => host.render(120, 30).map(stripAnsi).join('\n');
  const press = async (raw: string) => {
    let pending: Promise<unknown> | undefined;
    host.handleKey(parseKeyEvent(raw), (selected, ids) => {
      pending = selected.apply(ids).then(outcome => { if (outcome?.next) host.open(outcome.next); });
    });
    await pending; await new Promise(resolve => setTimeout(resolve, 0));
  };
  try {
    expect(frame()).toContain('▸ beta');
    await press('\r'); expect(frame()).toContain('Configure connection');
    publication = { ...publication, catalog: catalogue(['alpha', 'gamma']), revision: 2 };
    await press('\x1b');
    expect(frame()).toContain('▸ gamma');
    expect(frame()).toContain('Focused model left the catalogue');
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before); expect(readSessionModelEdit(sessionId)).toEqual(session);
    expect(fetch).not.toHaveBeenCalled();
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
