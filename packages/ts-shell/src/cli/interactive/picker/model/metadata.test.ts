import fs from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { modelPicker } from '../model.js';
import { SessionManager } from '../../../../session/SessionManager.js';
import { writeCatalogCache } from '../../../../core/models/catalogStore.js';
import { getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../../config/runtimeConfig.js';
import { readSessionModelEdit } from '../../../../session/model/state.js';
import { OverlayHost } from '../../overlay.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';

let root: string, sessionId: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/model-metadata-');
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('OPENAI_API_KEY', '');
  writeUserRuntimeConfigFile({ provider: 'openai', providerConnections: [] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  writeCatalogCache([
    { id: 'openai', models: [{ id: 'shared', contextWindow: 400000, vision: true, reasoning: true }] },
    { id: 'relay', label: 'Exact relay', runtime: 'openai', baseUrl: 'https://relay.invalid/v1', models: [
      { id: 'shared', contextWindow: 32000, inputLimit: 24000, maxTokens: 4096, vision: false, reasoning: true,
        thinkingLevelMap: { high: null }, cost: { promptPerMTok: 0, completionPerMTok: 2, cacheReadPerMTok: 0 } },
      { id: 'unknown' },
      { id: 'no-tools', toolCalling: false },
    ] },
  ]);
  sessionId = new SessionManager().createNew(root).id;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
const context = () => ({ cwd: root, projectRoot: root, sessionId });
const target = (model = 'shared') => `model:${JSON.stringify([null, 'relay', model])}`;

it('shows an unconfigured relay model using its exact metadata rather than the same-name official entry', async () => {
  const picker = modelPicker(context()), rows = await picker.load();
  const row = rows.find(value => value.id === target())!;
  expect(row).toMatchObject({ disabled: true, focusable: true });
  expect(row.detail).toContain('32k'); expect(row.detail).not.toContain('400k');
  const details = picker.detail!(row.id);
  expect(details).toContain('Endpoint: relay.invalid/v1');
  expect(details).toContain('Context: 32000 tokens');
  expect(details).toContain('Input limit: 24000 tokens');
  expect(details).toContain('Max output: 4096 tokens');
  expect(details).toContain('Images: unsupported');
  expect(details).toContain('Tool calls: unverified');
  expect(details).toContain('Reasoning settings: supported');
  expect(details).toContain('Effort levels: low supported · medium supported · high unsupported');
  expect(details).toContain('Price per 1M tokens: input 0 · output 2 · cache read 0');
});

it('keeps absent capabilities unverified and does not invent free pricing or a context window', async () => {
  const picker = modelPicker(context()); await picker.load();
  const details = picker.detail!(target('unknown'));
  expect(details).toContain('Images: unverified'); expect(details).toContain('Reasoning settings: unverified');
  expect(details).toContain('Tool calls: unverified');
  expect(details).toContain('Effort levels: low unverified · medium unverified · high unverified');
  expect(details.join('\n')).not.toMatch(/Context:|Input limit:|Max output:|Price per/);
});

it('states that a model declaring no tool support is unsupported rather than unverified', async () => {
  // The detail line is the only place the picker can say what the session will
  // lose: a model marked tool_call:false receives no tool declarations, so the
  // run cannot read, edit or act even though the row stays selectable.
  const picker = modelPicker(context()); await picker.load();
  const details = picker.detail!(target('no-tools'));
  expect(details).toContain('Tool calls: unsupported');
  expect(details).not.toContain('Tool calls: unverified');
});

it('retains a listed custom model declaration when its request address is not configured yet', async () => {
  writeCatalogCache([{ id: 'openai', models: [{ id: 'shared', contextWindow: 400000, reasoning: true, vision: true }] },
    { id: 'relay', label: 'Exact relay', runtime: 'openai', models: [{ id: 'shared', contextWindow: 32000, reasoning: false, vision: false }] }]);
  const picker = modelPicker(context()); await picker.load();
  expect(picker.detail!(target())).toContain('Context: 32000 tokens');
  expect(picker.detail!(target())).toContain('Images: unsupported');
  expect(picker.detail!(target())).toContain('Reasoning settings: unsupported');
  expect(picker.detail!(target()).join('\n')).not.toContain('Endpoint:');
});

it('withholds ambiguous endpoint metadata and updates facts after the exact catalogue changes', async () => {
  writeCatalogCache([{ id: 'relay', label: 'Exact relay', runtime: 'openai', baseUrl: 'https://relay.invalid/v1', models: [{ id: 'shared', contextWindow: 32000 }] },
    { id: 'duplicate', runtime: 'openai', baseUrl: 'https://relay.invalid/v1/', models: [{ id: 'shared', contextWindow: 64000 }] }]);
  const picker = modelPicker(context()); await picker.load();
  expect(picker.detail!(target()).join('\n')).not.toContain('Context:');
  writeCatalogCache([{ id: 'relay', label: 'Exact relay', runtime: 'openai', baseUrl: 'https://relay.invalid/v1', models: [{ id: 'shared', contextWindow: 16000, vision: true, reasoning: false }] }]);
  await picker.load();
  expect(picker.detail!(target())).toContain('Context: 16000 tokens');
  expect(picker.detail!(target())).toContain('Images: supported');
  expect(picker.detail!(target())).toContain('Reasoning settings: unsupported');
});

it.each(['pending', 'error', 'credential-missing'] as const)('keeps exact relay facts for a %s connection in canonical and relay catalogue rows', async state => {
  writeUserRuntimeConfigFile({ provider: 'openai', providerConnections: [{ id: 'blocked', provider: 'openai',
    authType: 'api-key', model: 'shared', baseUrl: 'https://relay.invalid/v1',
    status: state === 'credential-missing' ? 'connected' : state, createdAt: '2026-01-01', updatedAt: '2026-01-01' }] },
  readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  const picker = modelPicker(context()), rows = await picker.load();
  for (const provider of ['openai', 'relay']) {
    const rowId = `model:${JSON.stringify(['blocked', provider, 'shared'])}`;
    expect(rows.find(row => row.id === rowId)).toMatchObject({ disabled: true, focusable: true, detail: expect.stringContaining('32k') });
    expect(picker.detail!(rowId)).toContain('Context: 32000 tokens');
    expect(picker.detail!(rowId)).toContain('Images: unsupported');
  }
});

it('renders exact facts through keyboard focus and inspection return without activation, writes or network', async () => {
  const picker = modelPicker(context(), target()), before = readSessionModelEdit(sessionId), config = fs.readFileSync(getUserRuntimeConfigPath());
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
  const host = new OverlayHost(() => {}); host.open(picker);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(host.render(140, 40).map(stripAnsi).join('\n')).toContain('Context: 32000 tokens');
  let pending: Promise<unknown> | undefined;
  host.handleKey(parseKeyEvent('\r'), (selected, ids) => {
    pending = selected.apply(ids).then(outcome => { if (outcome?.next) host.open(outcome.next); });
  });
  await pending; await new Promise(resolve => setTimeout(resolve, 0));
  expect(host.render(140, 40).map(stripAnsi).join('\n')).toContain('Images: unsupported');
  host.handleKey(parseKeyEvent('\x1b'), vi.fn());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(host.render(140, 40).map(stripAnsi).join('\n')).toContain('Context: 32000 tokens');
  expect(host.render(40, 18).map(stripAnsi).join('\n')).toContain('▸ shared');
  host.close();
  expect(readSessionModelEdit(sessionId)).toEqual(before); expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(config);
  expect(fetch).not.toHaveBeenCalled();
});
