import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../../../session/SessionManager.js';
import { getUserAuthPath, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../../config/runtimeConfig.js';
import { writeCatalogCache } from '../../../../core/models/catalogStore.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../../../session/model/state.js';
import { runConnectCommand } from '../../../../core/commands/connectCommandRuntime.js';
import { modelPicker } from '../model.js';
import type { ModelSignIn } from './auth.js';
import { OverlayHost } from '../../overlay.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';
import { modelKeyPicker } from './key.js';
import { connectionEndpoint } from '../connections.js';

let home: string, sessionId: string;
const context = () => ({ cwd: home, projectRoot: home, sessionId });
function configBytes() {
  return [getUserRuntimeConfigPath(), getUserAuthPath()].map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined);
}
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); home = fs.mkdtempSync('/tmp/cheers-test/model-key-');
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('OPENAI_API_KEY', '');
  writeUserRuntimeConfigFile({ provider: 'anthropic', activeProviderConnectionId: 'default', providerConnections: [{
    id: 'default', provider: 'anthropic', authType: 'api-key', apiKey: 'synthetic-default', model: 'default-model',
    status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  sessionId = new SessionManager().createNew(home).id;
  writeSessionModel(sessionId, { connectionScope: 'session', connectionId: 'default', provider: 'anthropic', model: 'default-model' }, readSessionModelEdit(sessionId));
  writeCatalogCache([{ id: 'custom', runtime: 'openai', baseUrl: 'https://relay.example.invalid/v1',
    models: [{ id: 'relay-model', reasoning: true }] }]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

it.each([undefined, 'advisor'] as const)('saves the exact relay key and returns before explicit activation (role: %s)', async role => {
  const original = readSessionModel(sessionId), calls: unknown[] = [];
  const signIn: ModelSignIn = async (provider, key) => {
    calls.push({ provider, model: key?.model, baseUrl: key?.baseUrl, label: key?.label });
    const result = await runConnectCommand(['login', provider, '--api-key', key!.apiKey, '--model', key!.model,
      '--base-url', key!.baseUrl!, '--label', key!.label], context());
    return { context: context(), note: result.output.split('\n').filter(line => !line.startsWith('Saved key:')).join('\n') };
  };
  const picker = modelPicker(context(), undefined, undefined, undefined, undefined, signIn); await picker.load();
  const actions = role ? (await picker.inspect!(`role:${role}`))!.next! : undefined;
  await actions?.load(); const browser = actions ? (await actions.apply(['choose']))!.next! : picker;
  const model = (await browser.load()).find(row => row.label === 'relay-model')!;
  const details = (await browser.inspect!(model.id))!.next!;
  expect((await details.load()).some(row => row.id === 'account')).toBe(false);
  const form = (await details.apply(['configure']))!.next!; await form.load();
  expect(form.input?.masked).toBe(true); expect(await form.input!.apply('')).toBeUndefined();
  const overlay = new OverlayHost(() => {}); overlay.open(form);
  await new Promise(resolve => setTimeout(resolve, 0)); overlay.handlePaste('synthetic-relay-key');
  expect(overlay.render(80, 24).map(stripAnsi).join('\n')).toContain('••••');
  expect(overlay.render(80, 24).join('\n')).not.toContain('synthetic-relay-key');
  let applied: ReturnType<typeof form.apply> | undefined;
  overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => { applied = selected.apply(ids); });
  const result = (await applied!)!; const returned = result.next!; await returned.load();
  const connection = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values.providerConnections![0]!;
  expect(connection).toMatchObject({ provider: 'openai', model: 'relay-model', baseUrl: 'https://relay.example.invalid/v1', apiKey: 'synthetic-relay-key' });
  expect(calls).toEqual([{ provider: 'openai', model: 'relay-model', baseUrl: 'https://relay.example.invalid/v1', label: 'custom' }]);
  expect(returned.initialSelection).toBe(`model:${JSON.stringify([connection.id, 'custom', 'relay-model'])}`);
  expect(readSessionModel(sessionId)).toEqual(original); expect(result.note).not.toContain('synthetic-relay-key');
  const chosen = await returned.apply([returned.initialSelection!]);
  expect(chosen?.note).toContain(role ? 'advisor uses' : 'relay-model');
  expect(role ? readSessionModel(sessionId)?.roles?.advisor?.model : readSessionModel(sessionId)?.model).toBe('relay-model');
});

it('cancels a masked key through Escape without invoking the credential owner or changing files', async () => {
  const signIn = vi.fn(); const original = configBytes();
  const form = modelKeyPicker(context(), 'openai', { model: 'relay-model', label: 'custom' }, signIn, current => modelPicker(current));
  const overlay = new OverlayHost(() => {}); overlay.open(form); await new Promise(resolve => setTimeout(resolve, 0));
  overlay.handlePaste('synthetic-discard-key'); overlay.handleKey(parseKeyEvent('\x1b'), vi.fn());
  await new Promise(resolve => setTimeout(resolve, 0)); expect(overlay.active).toBe(true);
  expect(await form.input!.apply('synthetic-discard-key')).toBeUndefined();
  expect(signIn).not.toHaveBeenCalled(); expect(configBytes()).toEqual(original); overlay.close();
});

it('removes endpoint credentials before key submission and expires actions when the catalogue changes', async () => {
  expect(connectionEndpoint('https://user:synthetic-url-secret@relay.example.invalid/v1?key=synthetic-query#fragment'))
    .toBe('https://relay.example.invalid/v1');
  expect(connectionEndpoint('file:///secret')).toBeUndefined();
  const signIn = vi.fn(); const form = modelKeyPicker(context(), 'openai', { model: 'relay-model', label: 'custom' }, signIn, current => modelPicker(current));
  await form.load(); const original = configBytes();
  writeCatalogCache([{ id: 'custom', runtime: 'openai', baseUrl: 'https://changed.example.invalid/v1', models: [{ id: 'relay-model' }] }]);
  expect((await form.input!.apply('synthetic-expired-key'))?.note).toContain('expired');
  expect(signIn).not.toHaveBeenCalled(); expect(configBytes()).toEqual(original);
});

it('does not reopen after the original key sign-in signal is cancelled during authentication', async () => {
  const controller = new AbortController();
  let release!: (value: { context: ReturnType<typeof context>; note: string }) => void;
  const pending = new Promise<{ context: ReturnType<typeof context>; note: string }>(resolve => { release = resolve; });
  const original = { ...context(), signal: controller.signal };
  const signIn: ModelSignIn = () => pending;
  const form = modelKeyPicker(original, 'openai', { model: 'relay-model', label: 'custom' }, signIn, current => modelPicker(current));
  await form.load();
  const started = form.input!.apply('synthetic-key');
  controller.abort();
  release({ context: original, note: 'Authentication result retained' });
  expect(await started).toEqual({ note: 'Authentication result retained' });
});

it('does not fall back to a builtin credential endpoint when a relay has no usable HTTP address', async () => {
  writeCatalogCache([{ id: 'custom', runtime: 'openai', baseUrl: 'file:///secret', models: [{ id: 'relay-model' }] }]);
  const picker = modelPicker(context(), undefined, undefined, undefined, undefined, vi.fn());
  const model = (await picker.load()).find(row => row.label === 'relay-model')!;
  const details = (await picker.inspect!(model.id))!.next!;
  expect((await details.load()).map(row => row.id)).toEqual(['back']);
  expect(await details.apply(['configure'])).toBeUndefined();
});

it.each(['credential-missing', 'pending', 'error'] as const)('offers masked reconnection for an existing %s relay while retaining its exact target and old record', async state => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const previous = { id: 'broken', provider: 'openai' as const, model: 'relay-model', label: 'Relay exact', authType: 'api-key' as const,
    baseUrl: 'https://relay.example.invalid/v1', status: state === 'credential-missing' ? 'connected' as const : state,
    ...(state === 'credential-missing' ? {} : { apiKey: 'synthetic-old-key' }), createdAt: '2026-01-01', updatedAt: '2026-01-01' };
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: [...edit.values.providerConnections!, previous] }, edit);
  const original = readSessionModel(sessionId);
  const signIn: ModelSignIn = async (provider, key) => ({ context: context(), note: (await runConnectCommand([
    'login', provider, '--api-key', key!.apiKey, '--model', key!.model, '--base-url', key!.baseUrl!, '--label', key!.label,
  ], context())).output.split('\n').filter(line => !line.startsWith('Saved key:')).join('\n') });
  const picker = modelPicker(context(), undefined, undefined, undefined, undefined, signIn);
  const target = (await picker.load()).find(row => row.id === `model:${JSON.stringify(['broken', 'custom', 'relay-model'])}`)!;
  expect(target).toMatchObject({ disabled: true, focusable: true });
  expect(picker.detail!(target.id)).toContain(`Availability: ${state === 'pending' ? 'setup pending' : state === 'error' ? 'setup error' : 'credential missing'}`);
  const details = (await picker.inspect!(target.id))!.next!;
  expect((await details.load()).map(row => row.id)).toEqual(['back', 'configure']);
  const form = (await details.apply(['configure']))!.next!; await form.load(); expect(form.input?.masked).toBe(true);
  const result = (await form.input!.apply('synthetic-reconnected-key'))!;
  const config = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values;
  expect(config.providerConnections!.find(row => row.id === 'broken')).toEqual(previous);
  const next = config.providerConnections![0]!;
  expect(next).toMatchObject({ label: 'Relay exact', baseUrl: previous.baseUrl, model: previous.model, status: 'connected' });
  expect(next.id).not.toBe('broken'); expect(readSessionModel(sessionId)).toEqual(original);
  await result.next!.load(); expect(result.next!.initialSelection).toBe(`model:${JSON.stringify([next.id, 'custom', 'relay-model'])}`);
  expect((await result.next!.apply([result.next!.initialSelection!]))?.note).toContain('relay-model');
  expect(readSessionModel(sessionId)?.connectionId).toBe(next.id);
});
