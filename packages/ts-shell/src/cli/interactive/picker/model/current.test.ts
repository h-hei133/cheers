import fs from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../../../session/SessionManager.js';
import { getUserAuthPath, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../../config/runtimeConfig.js';
import { writeCatalogCache } from '../../../../core/models/catalogStore.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../../../session/model/state.js';
import { modelPicker } from '../model.js';
import { runConnectCommand } from '../../../../core/commands/connectCommandRuntime.js';
import type { ModelSignIn } from './auth.js';
import { OverlayHost } from '../../overlay.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';

let root: string, sessionId: string;
const context = () => ({ cwd: root, projectRoot: root, sessionId });
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/current-model-');
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('OPENAI_API_KEY', '');
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'broken', providerConnections: [
    { id: 'broken', provider: 'openai', authType: 'api-key', label: 'Exact relay', baseUrl: 'https://exact.invalid/v1', model: 'shared',
      status: 'pending', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    { id: 'other', provider: 'openai', authType: 'api-key', apiKey: 'synthetic-other', baseUrl: 'https://other.invalid/v1', model: 'shared',
      status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  ] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  sessionId = new SessionManager().createNew(root).id;
  writeCatalogCache([{ id: 'exact', runtime: 'openai', baseUrl: 'https://exact.invalid/v1',
    models: [{ id: 'shared', contextWindow: 48000, inputLimit: 40000, maxTokens: 8000, vision: false,
      reasoning: true, cost: { promptPerMTok: 1, completionPerMTok: 2 } }] },
    { id: 'other', runtime: 'openai', baseUrl: 'https://other.invalid/v1', models: [{ id: 'shared' }] }]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it.each(['pending', 'error', 'credential-missing'] as const)('opens the exact %s connection from the blocked current report without activating a same-name relay', async state => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: edit.values.providerConnections!.map(row => row.id === 'broken'
    ? { ...row, status: state === 'credential-missing' ? 'connected' : state } : row) }, edit);
  writeSessionModel(sessionId, { connectionScope: 'session', connectionId: 'broken', provider: 'openai', model: 'shared' }, readSessionModelEdit(sessionId));
  const before = readSessionModel(sessionId); const global = fs.readFileSync(getUserRuntimeConfigPath());
  const signIn = vi.fn(); const picker = modelPicker(context(), undefined, undefined, undefined, undefined, signIn);
  const rows = await picker.load();
  expect(rows.find(row => row.id === 'model:current')).toMatchObject({ label: 'shared', note: 'request blocked', disabled: true, focusable: true });
  expect(picker.detail!('model:current')).toContain('Selected connection: broken');
  const report = (await picker.inspect!('model:current'))!.next!;
  expect((await report.load()).map(row => row.id)).toEqual(['back', 'connection']);
  expect(report.detail!(undefined)).toContain('Context: 48000 tokens');
  expect(report.detail!(undefined)).toContain('Images: unsupported');
  expect(report.detail!(undefined)).toContain('Price per 1M tokens: input 1 · output 2');
  const exact = (await report.apply(['connection']))!.next!;
  expect((await exact.load()).map(row => row.id)).toEqual(['back', 'configure']);
  expect(exact.detail!()).toContain('Connection: broken'); expect(exact.detail!()).toContain('Endpoint: exact.invalid/v1');
  const form = (await exact.apply(['configure']))!.next!; await form.load(); expect(form.input?.masked).toBe(true);
  const returned = form.back!(); await returned.load();
  expect(returned.initialSelection).toBe(`model:${JSON.stringify(['broken', 'exact', 'shared'])}`);
  expect(readSessionModel(sessionId)).toEqual(before); expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
  expect(signIn).not.toHaveBeenCalled();
});

it('saves a new exact connection through current-report keyboard navigation and activates it only after explicit choice', async () => {
  const original = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values.providerConnections!.find(row => row.id === 'broken');
  const signIn: ModelSignIn = async (provider, key) => ({ context: context(), note: (await runConnectCommand([
    'login', provider, '--api-key', key!.apiKey, '--model', key!.model, '--base-url', key!.baseUrl!, '--label', key!.label,
  ], context())).output.split('\n').filter(line => !line.startsWith('Saved key:')).join('\n') });
  const picker = modelPicker(context(), 'model:current', undefined, undefined, undefined, signIn);
  expect((await picker.load()).find(row => row.id === 'model:current')).toMatchObject({ note: 'request blocked' });
  const overlay = new OverlayHost(() => {}); overlay.open(picker);
  await new Promise(resolve => setTimeout(resolve, 0));
  let pending: Promise<unknown> | undefined;
  const key = async (value: string) => {
    overlay.handleKey(parseKeyEvent(value), (selected, ids) => {
      pending = selected.apply(ids).then(result => { if (result?.next) overlay.open(result.next); });
    });
    await pending; pending = undefined; await new Promise(resolve => setTimeout(resolve, 0));
  };
  const frame = overlay.render(120, 32).map(stripAnsi).join('\n');
  expect(frame).toContain('Status: request blocked'); expect(frame).toContain('Selected connection: broken');
  await key('\r'); expect(overlay.render(120, 32).map(stripAnsi).join('\n')).toContain('Connection details');
  await key('\x1b[B'); await key('\r');
  expect(overlay.render(80, 24).map(stripAnsi).join('\n')).toContain('Connection: broken');
  await key('\x1b[B'); await key('\r'); overlay.handlePaste('synthetic-replacement');
  expect(overlay.render(80, 24).join('\n')).not.toContain('synthetic-replacement');
  await key('\r');
  const connections = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values.providerConnections!;
  expect(connections.find(row => row.id === 'broken')).toEqual(original);
  expect(connections[0]).toMatchObject({ provider: 'openai', model: 'shared', baseUrl: 'https://exact.invalid/v1', label: 'Exact relay' });
  expect(readSessionModel(sessionId)).toBeUndefined();
  expect(overlay.render(80, 24).map(stripAnsi).join('\n')).toContain('▸ shared');
  await key('\r'); expect(readSessionModel(sessionId)?.connectionId).toBe(connections[0]!.id); overlay.close();
});

it.each(['deleted', 'provider-changed', 'ambiguous', 'overridden', 'pool'] as const)('does not redirect %s current-report identity to a different connection', async change => {
  if (change === 'ambiguous') writeCatalogCache([{ id: 'duplicate', runtime: 'openai', baseUrl: 'https://exact.invalid/v1', models: [{ id: 'shared' }] },
    { id: 'exact', runtime: 'openai', baseUrl: 'https://exact.invalid/v1', models: [{ id: 'shared' }] }]);
  const picker = modelPicker({ ...context(), ...(change === 'overridden' || change === 'pool' ? {
    resolveConfigTarget: () => ({ provider: 'openai' as const, model: 'shared', expectedEnvVarName: 'OPENAI_API_KEY',
      blocked: change === 'pool' ? 'pool-unavailable' as const : 'connection-overridden' as const }),
  } : {}) }, undefined, undefined, undefined, undefined, vi.fn());
  if (change === 'deleted' || change === 'provider-changed') {
    writeSessionModel(sessionId, { connectionScope: 'session', connectionId: 'broken', provider: 'openai', model: 'shared' }, readSessionModelEdit(sessionId));
    const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
    if (change === 'deleted') writeUserRuntimeConfigFile({ ...edit.values, activeProviderConnectionId: undefined,
      providerConnections: edit.values.providerConnections!.filter(row => row.id !== 'broken') }, edit);
    else {
      // Simulate an external identity replacement. A guarded save refuses to
      // rebind an acquired ID to another provider during preference migration.
      const authPath = getUserAuthPath();
      const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
      delete auth.activeProviderConnectionId;
      auth.providerConnections = auth.providerConnections.map((row: { id: string }) => row.id === 'broken' ? { ...row, provider: 'anthropic' } : row);
      fs.writeFileSync(authPath, JSON.stringify(auth), { mode: 0o600 });
      const settingsPath = getUserRuntimeConfigPath();
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      settings.modelPreferences.connections = settings.modelPreferences.connections.map((row: { id: string }) => row.id === 'broken' ? { ...row, provider: 'anthropic' } : row);
      fs.writeFileSync(settingsPath, JSON.stringify(settings));
    }
  }
  await picker.load(); const report = (await picker.inspect!('model:current'))!.next!;
  expect((await report.load()).map(row => row.id)).toEqual(['back']);
  expect(await report.apply(['connection'])).toBeUndefined();
});

it('replaces a current report with unavailable details when another blocked connection reuses its row id', async () => {
  const picker = modelPicker(context()); await picker.load();
  const report = (await picker.inspect!('model:current'))!.next!; await report.load();
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, activeProviderConnectionId: 'other',
    providerConnections: edit.values.providerConnections!.map(row => row.id === 'other' ? { ...row, status: 'pending' } : row) }, edit);
  const original = fs.readFileSync(getUserRuntimeConfigPath());
  expect((await modelPicker(context()).load()).find(row => row.id === 'model:current')?.detail).toContain('other');
  const result = await report.apply(['connection']); const unavailable = result?.next!;
  expect((await unavailable.load()).map(row => row.id)).toEqual(['back']);
  expect(unavailable.detail!().join('\n')).toContain('no longer available in the accepted catalogue');
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(original);
});

it('offers native login from an exact builtin current report and retains cancelled configuration bytes', async () => {
  writeCatalogCache([{ id: 'openai', models: [{ id: 'gpt-5.4-mini' }] }]);
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: edit.values.providerConnections!.map(row => row.id === 'broken'
    ? { ...row, authType: 'account-auth', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.4-mini' } : row) }, edit);
  const signIn = vi.fn(); const picker = modelPicker(context(), undefined, undefined, undefined, undefined, signIn);
  await picker.load(); const report = (await picker.inspect!('model:current'))!.next!; await report.load();
  const details = (await report.apply(['connection']))!.next!;
  expect((await details.load()).map(row => row.id)).toEqual(['back', 'account', 'configure']);
  const confirm = (await details.apply(['account']))!.next!; await confirm.load();
  const original = fs.readFileSync(getUserRuntimeConfigPath());
  const returned = (await confirm.apply(['cancel']))!.next!; await returned.load();
  expect(returned.initialSelection).toBe(`model:${JSON.stringify(['broken', 'openai', 'gpt-5.4-mini'])}`);
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(original); expect(signIn).not.toHaveBeenCalled();
});
