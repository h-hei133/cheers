import fs from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { modelPicker } from '../model.js';
import { modelDetailsPicker } from './details.js';
import { SessionManager } from '../../../../session/SessionManager.js';
import { getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../../config/runtimeConfig.js';
import { writeCatalogCache } from '../../../../core/models/catalogStore.js';
import { readSessionModelEdit } from '../../../../session/model/state.js';
import { OverlayHost } from '../../overlay.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';

let root: string, sessionId: string;
const context = () => ({ cwd: root, projectRoot: root, sessionId });
const target = `model:${JSON.stringify([null, 'relay', 'shared'])}`;
const catalogue = (baseUrl = 'https://original.invalid/v1') => writeCatalogCache([{ id: 'relay', runtime: 'openai',
  baseUrl, models: [{ id: 'shared' }] }]);
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/model-admission-');
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('OPENAI_API_KEY', '');
  writeUserRuntimeConfigFile({ provider: 'openai', providerConnections: [] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  sessionId = new SessionManager().createNew(root).id; catalogue();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it('refuses stale list inspection before constructing a configuration form for an old endpoint', async () => {
  const signIn = vi.fn(); const picker = modelPicker(context(), undefined, undefined, undefined, undefined, signIn);
  await picker.load(); catalogue('https://replacement.invalid/v1');
  const result = await picker.inspect!(target);
  expect(result?.note).toContain('expired'); expect(result?.next).toBeUndefined(); expect(signIn).not.toHaveBeenCalled();
});

it.each(['configure', 'account', 'connection'] as const)('rechecks a displayed detail before its %s callback and still permits return', async action => {
  let current = true;
  const callback = vi.fn(() => ({ title: 'child', form: 'panel' as const, empty: '', load: async () => [], apply: async () => undefined }));
  const back = callback(); const connection = vi.fn(() => ({ next: back })); callback.mockClear();
  const details = modelDetailsPicker('shared', [], () => back, '/connect login old', callback, callback, connection,
    () => current ? undefined : 'Model selection expired. Reopen the model picker.');
  await details.load(); current = false;
  const result = await details.apply([action]);
  expect(result?.note).toContain('expired'); expect(result?.next).toBeUndefined(); expect(result?.draft).toBeUndefined();
  expect(callback).not.toHaveBeenCalled(); expect(connection).not.toHaveBeenCalled();
  expect((await details.apply(['back']))?.next).toBe(back);
});

it('refuses the actual relay key path after details were shown and the catalogue address changed', async () => {
  const signIn = vi.fn(); const picker = modelPicker(context(), undefined, undefined, undefined, undefined, signIn);
  await picker.load(); const details = (await picker.inspect!(target))!.next!; await details.load();
  catalogue('https://replacement.invalid/v1');
  const before = fs.readFileSync(getUserRuntimeConfigPath()), state = readSessionModelEdit(sessionId);
  const result = await details.apply(['configure']);
  expect(result?.note).toContain('expired'); expect(result?.next).toBeUndefined();
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before); expect(readSessionModelEdit(sessionId)).toEqual(state);
  expect(signIn).not.toHaveBeenCalled();
});

it('refuses a stale command draft and leaves an unsupported detail action available for a valid return', async () => {
  const picker = modelPicker(context()); await picker.load();
  const details = (await picker.inspect!(target))!.next!; await details.load();
  expect(await details.apply(['unsupported'])).toBeUndefined();
  catalogue('https://replacement.invalid/v1');
  expect(await details.apply(['configure'])).toMatchObject({ note: expect.stringContaining('expired') });
  const back = (await details.apply(['back']))!.next!; await back.load();
  const reopened = (await back.inspect!(target))!.next!; await reopened.load();
  expect((await reopened.apply(['configure']))?.draft).toContain('https://replacement.invalid/v1');
});

it('rechecks cancellation around inspection admission and does not create a stale child', async () => {
  const signal = new AbortController();
  let abortOnAdmission = false;
  const commands = { ...context(), signal: signal.signal, admission: () => { if (abortOnAdmission) signal.abort(); return undefined; } };
  const picker = modelPicker(commands, undefined, undefined, undefined, undefined, vi.fn());
  await picker.load(); const details = (await picker.inspect!(target))!.next!; await details.load();
  abortOnAdmission = true;
  const result = await details.apply(['configure']);
  expect(result?.note).toContain('cancelled'); expect(result?.next).toBeUndefined();
  expect((await picker.inspect!(target))?.note).toContain('cancelled');
});

it('does not execute a detail callback when its admission callback closes the actual host', async () => {
  const child = vi.fn(); const host = new OverlayHost(() => {});
  const details = modelDetailsPicker('shared', [], () => modelPicker(context()), undefined, undefined, child, undefined,
    () => { host.close(); return undefined; });
  host.open(details); await new Promise(resolve => setTimeout(resolve, 0));
  expect(await details.apply(['configure'])).toBeUndefined();
  expect(child).not.toHaveBeenCalled(); expect(host.active).toBe(false);
});

it.each(['escape', 'replace'] as const)('retires detail actions on real host %s and cannot revive them by a late load', async closing => {
  const signIn = vi.fn(); const picker = modelPicker(context(), undefined, undefined, undefined, undefined, signIn);
  await picker.load(); const details = (await picker.inspect!(target))!.next!;
  const host = new OverlayHost(() => {}); host.open(details); await new Promise(resolve => setTimeout(resolve, 0));
  if (closing === 'escape') host.handleKey(parseKeyEvent('\x1b'), vi.fn());
  else host.open(picker);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(await details.apply(['configure'])).toBeUndefined();
  expect(await details.load()).toEqual([]); expect(await details.apply(['configure'])).toBeUndefined();
  host.close(); expect(signIn).not.toHaveBeenCalled();
});

it('consumes a valid detail action once while the real host hands it to its child', async () => {
  const signIn = vi.fn(); const picker = modelPicker(context(), undefined, undefined, undefined, undefined, signIn);
  await picker.load(); const details = (await picker.inspect!(target))!.next!;
  const host = new OverlayHost(() => {}); host.open(details); await new Promise(resolve => setTimeout(resolve, 0));
  host.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
  let result: Awaited<ReturnType<typeof details.apply>>;
  host.handleKey(parseKeyEvent('\r'), (selected, ids) => {
    void selected.apply(ids).then(outcome => { result = outcome; if (outcome?.next) host.open(outcome.next); });
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(result!.next!.input?.masked).toBe(true);
  expect(await details.apply(['configure'])).toBeUndefined();
  host.close(); expect(signIn).not.toHaveBeenCalled();
});
