import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as config from '../../../config/runtimeConfig.js';
import { runConnectCommand, __setOpenAIAccountAuthRunnerForTest } from '../../../core/commands/connectCommandRuntime.js';
import type { CommandContext } from '../../../core/commands/types.js';
import type { Picker } from '../overlay.js';
import { authPicker } from './auth.js';
import { opensPicker, pickerFor, type PickerHost } from './registry.js';

let root: string;
const stamp = '2026-10-21T00:00:00.000Z';
const connection = (id: string, label = id): config.ProviderConnectionConfig => ({
  id, label, provider: 'openai', authType: 'api-key', apiKey: 'sk-synthetic-connection-only',
  baseUrl: 'https://user:password@example.invalid/v1?api_key=secret', model: 'fixture-model',
  status: 'connected', createdAt: stamp, updatedAt: stamp,
});
const context = (): CommandContext => ({ cwd: root, sessionId: 's' });
const read = () => config.readRuntimeConfigEditAt(config.getUserRuntimeConfigPath());
function save(values: config.RuntimeConfigFile) { config.writeUserRuntimeConfigFile(values, read()); }
function bytes() {
  return JSON.stringify([config.getUserRuntimeConfigPath(), config.getUserAuthPath()]
    .map(file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null));
}
async function select(picker: Picker, id: string): Promise<Picker> {
  await picker.load();
  return (await picker.apply([id]))!.next!;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-auth-picker-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
  save({ provider: 'openai', activeProviderConnectionId: 'relay-b', providerConnections: [connection('relay-a'), connection('relay-b')] });
});
afterEach(() => { __setOpenAIAccountAuthRunnerForTest(undefined); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

describe('authentication chooser boundaries', () => {
  it.each(['/login', '/logout'])('opens bare %s while argument forms retain their command route', command => {
    expect(opensPicker(command)).toBe(true);
    expect(opensPicker(`${command} openai`)).toBe(false);
    expect(pickerFor(command, { commandContext: context() } as PickerHost)).toBeDefined();
  });

  it('lists saved identities without credentials or endpoint userinfo/query and cancels without writing', async () => {
    const before = bytes(), picker = authPicker(context(), 'logout');
    const rows = await picker.load();
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).toContain('example.invalid/v1');
    expect(JSON.stringify(rows)).not.toMatch(/sk-synthetic|password|api_key=|user:/);
    const confirmation = (await picker.apply([rows[1]!.id]))!.next!;
    expect(confirmation.initialSelection).toBe('cancel');
    expect(await confirmation.apply(['remove'])).toBeUndefined();
    await confirmation.load();
    expect(await confirmation.apply(['cancel'])).toBeUndefined();
    expect(bytes()).toBe(before);
  });

  it('offers each saved relay once even when many catalog entries share its protocol', async () => {
    save({ ...read().values, provider: 'openai-compatible', activeProviderConnectionId: 'custom-relay',
      providerConnections: [{ ...connection('custom-relay'), provider: 'openai-compatible' }] });
    const rows = await authPicker(context(), 'logout').load();
    expect(rows).toHaveLength(1); expect(rows[0]!.detail).toContain('custom-relay');
  });

  it('removes only the explicitly confirmed connection and consumes confirmation once', async () => {
    const picker = authPicker(context(), 'logout'), rows = await picker.load();
    const confirmation = (await picker.apply([rows[0]!.id]))!.next!;
    await confirmation.load();
    for (const ids of [[], ['unknown'], ['remove', 'cancel']]) expect(await confirmation.apply(ids)).toBeUndefined();
    const result = await confirmation.apply(['remove']);
    expect(result?.note).toContain('Removed provider connection relay-a');
    expect(read().values.providerConnections?.map(item => item.id)).toEqual(['relay-b']);
    expect(read().values.activeProviderConnectionId).toBe('relay-b');
    expect(await confirmation.apply(['remove'])).toBeUndefined();
  });

  it('removes a literal flag-shaped saved ID through the existing end-of-options syntax', async () => {
    save({ ...read().values, activeProviderConnectionId: '--saved-relay', providerConnections: [connection('--saved-relay'), connection('peer')] });
    const confirmation = await select(authPicker(context(), 'logout'), 'connection:0'); await confirmation.load();
    expect((await confirmation.apply(['remove']))?.note).toContain('Removed provider connection --saved-relay');
    expect(read().values.providerConnections?.map(item => item.id)).toEqual(['peer']);
  });

  it('rejects an unoffered, mixed or unloaded identity', async () => {
    const picker = authPicker(context(), 'logout'), before = bytes();
    expect(await picker.apply(['connection:0'])).toBeUndefined();
    await picker.load();
    expect(await picker.apply(['relay-a'])).toBeUndefined();
    expect(await picker.apply(['connection:0', 'connection:1'])).toBeUndefined();
    expect(bytes()).toBe(before);
  });

  it('rejects changed credentials even when connection identity and label are unchanged', async () => {
    const confirmation = await select(authPicker(context(), 'logout'), 'connection:0');
    await confirmation.load();
    save({ ...read().values, providerConnections: [ { ...connection('relay-a'), apiKey: 'sk-new-synthetic-generation' }, connection('relay-b')] });
    const before = bytes();
    expect((await confirmation.apply(['remove']))?.note).toContain('expired');
    expect(bytes()).toBe(before);
  });

  it('rejects a deleted selection without falling back to a same-provider peer', async () => {
    const confirmation = await select(authPicker(context(), 'logout'), 'connection:0');
    await confirmation.load(); save({ ...read().values, providerConnections: [connection('relay-b')] });
    const before = bytes();
    expect((await confirmation.apply(['remove']))?.note).toContain('expired');
    expect(bytes()).toBe(before);
  });

  it('retains the genuine config baseline when a competing update reaches the writer', async () => {
    const confirmation = await select(authPicker(context(), 'logout'), 'connection:0');
    await confirmation.load();
    const original = config.writeUserRuntimeConfigFile;
    vi.spyOn(config, 'writeUserRuntimeConfigFile').mockImplementationOnce((values, baseline) => {
      const current = read();
      original({ ...current.values, providerConnections: [ { ...connection('relay-a'), apiKey: 'sk-new-generation' }, connection('relay-b')] }, current);
      return original(values, baseline);
    });
    await expect(confirmation.apply(['remove'])).rejects.toThrow();
    expect(read().values.providerConnections?.[0]?.apiKey).toBe('sk-new-generation');
  });

  it('refuses a changed connection at the command boundary instead of renewing the selected baseline', async () => {
    const baseline = read();
    save({ ...baseline.values, providerConnections: [{ ...connection('relay-a'), apiKey: 'sk-replacement' }, connection('relay-b')] });
    const before = bytes();
    await expect(runConnectCommand(['logout', 'relay-a'], context(), baseline)).rejects.toThrow();
    expect(bytes()).toBe(before);
  });

  it('invalidates a choice when its accepted publication changes', async () => {
    let revision = 1;
    const commandContext = { ...context(), readConfiguration: () => ({ config: config.getRuntimeConfig(root), catalog: [], revision }) };
    const confirmation = await select(authPicker(commandContext, 'logout'), 'connection:0'); await confirmation.load();
    const before = bytes(); revision++;
    expect((await confirmation.apply(['remove']))?.note).toContain('expired');
    expect(bytes()).toBe(before);
  });

  it('binds choices to admission, publication and runtime home changes', async () => {
    let blocked = false;
    const picker = authPicker({ ...context(), admission: () => blocked ? 'changed' : undefined }, 'logout');
    const confirmation = await select(picker, 'connection:0'); await confirmation.load(); blocked = true;
    expect((await confirmation.apply(['remove']))?.note).toContain('expired');
    const another = await select(authPicker(context(), 'logout'), 'connection:0'); await another.load();
    vi.stubEnv('USERPROFILE', path.join(root, 'other')); vi.stubEnv('HOME', path.join(root, 'other'));
    expect((await another.apply(['remove']))?.note).toContain('expired');
  });

  it('distinguishes unavailable storage from an empty saved set and resets failed reloads', async () => {
    const picker = authPicker(context(), 'logout'); await picker.load();
    fs.writeFileSync(config.getUserRuntimeConfigPath(), '{broken');
    await expect(picker.load()).rejects.toThrow();
    expect(await picker.apply(['connection:0'])).toBeUndefined();
    expect(picker.loadError).toContain('unavailable');
  });

  it('keeps search misses and the actual empty saved set distinct', async () => {
    const picker = authPicker(context(), 'logout'); await picker.load();
    expect(picker.status?.([], 'missing')).toBe('No matches for this search.');
    expect(picker.empty).not.toContain('saved');
    save({ ...read().values, activeProviderConnectionId: undefined, providerConnections: [] }); await picker.load();
    expect(picker.status?.([], '')).toContain('No connections saved');
  });

  it('disables ambiguous and unsafe saved connection identities without exposing unsafe labels', async () => {
    // This deliberately malformed legacy set has no separate preference owner.
    fs.writeFileSync(config.getUserRuntimeConfigPath(), '{}');
    fs.writeFileSync(config.getUserAuthPath(), JSON.stringify({ providerConnections:
      [connection('duplicate'), connection('duplicate'), connection('bad\x1b[31m', 'Bearer synthetic-secret\x1b[31m')] }), { mode: 0o600 });
    const picker = authPicker(context(), 'logout'), rows = await picker.load();
    expect(rows.every(row => row.disabled)).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/synthetic-secret|\\u001b/);
    for (const row of rows) expect(await picker.apply([row.id])).toBeUndefined();
  });

  it('offers native account auth only for supported contracts and starts only after explicit confirmation', async () => {
    const run = vi.fn(async () => undefined), before = bytes();
    const picker = authPicker(context(), 'login', run);
    const methods = await select(picker, 'openai');
    expect((await methods.load()).map(row => row.id)).toEqual(['key', 'account']);
    const confirmation = (await methods.apply(['account']))!.next!;
    expect(confirmation.initialSelection).toBe('cancel');
    expect(await confirmation.apply(['start'])).toBeUndefined();
    await confirmation.load(); await confirmation.apply(['cancel']);
    expect(run).not.toHaveBeenCalled(); expect(bytes()).toBe(before);
    expect(await confirmation.apply(['start'])).toBeUndefined(); expect(run).not.toHaveBeenCalled();
    const started = await select(methods, 'account'); await started.load();
    await started.apply(['start']);
    expect(run).toHaveBeenCalledWith(['login', 'openai', '--account']);
    await started.apply(['start']); expect(run).toHaveBeenCalledTimes(1);
    const unsupported = await select(authPicker(context(), 'login', run), 'anthropic');
    expect((await unsupported.load()).map(row => row.id)).toEqual(['key']);
    expect(await unsupported.apply(['account'])).toBeUndefined();
  });

  it('prepares the exact API key command without collecting or saving a secret', async () => {
    const before = bytes();
    const methods = await select(authPicker(context(), 'login'), 'openai-compatible');
    await methods.load();
    expect(await methods.apply(['key'])).toEqual({ draft: '/login openai-compatible --api-key ' });
    expect(bytes()).toBe(before);
  });

  it('invalidates a staged sign-in after configuration changes and never invokes the host', async () => {
    const run = vi.fn(async () => undefined);
    const methods = await select(authPicker(context(), 'login', run), 'openai');
    const confirmation = await select(methods, 'account'); await confirmation.load();
    save({ ...read().values, model: 'changed' });
    expect((await confirmation.apply(['start']))?.note).toContain('expired'); expect(run).not.toHaveBeenCalled();
  });

  it('runs the existing cancellable account owner and retains a failed result after cancellation', async () => {
    const controller = new AbortController();
    let signal: AbortSignal | undefined, output = '';
    __setOpenAIAccountAuthRunnerForTest(async () => {
      expect(read().values.providerConnections?.[0]?.status).toBe('pending');
      controller.abort(); throw new DOMException('synthetic cancellation', 'AbortError');
    });
    const run = async (args: readonly string[]): Promise<undefined> => {
      const result = await runConnectCommand([...args], { ...context(), runCancellable: operation => {
        signal = controller.signal; return operation(controller.signal);
      } });
      output = result.output;
      return undefined;
    };
    const methods = await select(authPicker(context(), 'login', run), 'openai');
    const confirmation = await select(methods, 'account'); await confirmation.load();
    await confirmation.apply(['start']);
    expect(signal?.aborted).toBe(true);
    expect(output).toContain('pending -> error'); expect(output).not.toContain('pending -> connected');
    expect(read().values.providerConnections?.[0]?.status).toBe('error');
    expect(read().values.providerConnections?.slice(1).map(item => item.id)).toEqual(['relay-a', 'relay-b']);
  });

  it('keeps direct argument shortcuts delegated to the existing owner', async () => {
    const output = await runConnectCommand(['logout', 'relay-a'], context());
    expect(output.output).toContain('Removed provider connection relay-a');
  });
});
