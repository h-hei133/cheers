import fs from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { modelPicker } from '../model.js';
import { catalogueDetailSource, modelDetailsPicker, type ModelDetailAction, type ModelDetailSource,
  type ModelDetailView } from './details.js';
import { SessionManager } from '../../../../session/SessionManager.js';
import { getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../../config/runtimeConfig.js';
import { writeCatalogCache } from '../../../../core/models/catalogStore.js';
import { readSessionModelEdit } from '../../../../session/model/state.js';
import { OverlayHost, type Picker } from '../../overlay.js';
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

function detailSource(options: {
  readonly label?: string;
  readonly lines?: readonly string[];
  readonly actions?: readonly ModelDetailAction[];
  readonly admission?: () => string | undefined;
  readonly refresh?: () => Promise<ModelDetailView>;
  readonly subscribe?: (publish: (view: ModelDetailView) => void) => () => void;
  readonly back: () => Picker;
}): ModelDetailSource {
  let current: ModelDetailView = { label: options.label ?? 'shared', lines: options.lines ?? [],
    actions: options.actions ?? [], available: true };
  return {
    label: current.label,
    read: () => current,
    async refresh() {
      if (options.refresh) current = await options.refresh();
      return current;
    },
    admit(view) {
      if (current !== view) return 'Model details changed. Review the refreshed model before continuing.';
      const refusal = options.admission?.();
      return current === view ? refusal : 'Model details changed. Review the refreshed model before continuing.';
    },
    back: options.back,
    ...(options.subscribe ? { subscribe: options.subscribe } : {}),
  };
}

it('refuses stale list inspection before constructing a configuration form for an old endpoint', async () => {
  const signIn = vi.fn(); const picker = modelPicker(context(), undefined, undefined, undefined, undefined, signIn);
  await picker.load(); catalogue('https://replacement.invalid/v1');
  const result = await picker.inspect!(target);
  expect(result?.note).toContain('expired'); expect(result?.next).toBeUndefined(); expect(signIn).not.toHaveBeenCalled();
});

it.each(['configure', 'account', 'connection'] as const)('rechecks a displayed detail before its %s callback and still permits return', async action => {
  let current = true;
  const back: Picker = { title: 'models', form: 'panel', empty: '', load: async () => [], apply: async () => undefined };
  const callback = vi.fn(() => ({ draft: '/connect login old' }));
  const actions = ['configure', 'account', 'connection'].map(id => ({
    id, label: id, run: callback,
  }));
  const details = modelDetailsPicker(detailSource({ back: () => back, actions,
    admission: () => current ? undefined : 'Model selection expired. Reopen the model picker.' }));
  await details.load(); current = false;
  const result = await details.apply([action]);
  expect(result?.note).toContain('expired'); expect(result?.next).toBeUndefined(); expect(result?.draft).toBeUndefined();
  expect(callback).not.toHaveBeenCalled();
  expect((await details.apply(['back']))?.next).toBe(back);
});

it('rebuilds the actual relay key path from a changed catalogue before configuring', async () => {
  const signIn = vi.fn(); const picker = modelPicker(context(), undefined, undefined, undefined, undefined, signIn);
  await picker.load(); const details = (await picker.inspect!(target))!.next!; await details.load();
  catalogue('https://replacement.invalid/v1');
  const before = fs.readFileSync(getUserRuntimeConfigPath()), state = readSessionModelEdit(sessionId);
  const result = await details.apply(['configure']);
  expect(result?.note).toBeUndefined(); expect(result?.next?.input?.masked).toBe(true);
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before); expect(readSessionModelEdit(sessionId)).toEqual(state);
  expect(signIn).not.toHaveBeenCalled();
});

it('rebuilds a command draft from the changed catalogue without accepting an unsupported action', async () => {
  const picker = modelPicker(context()); await picker.load();
  const details = (await picker.inspect!(target))!.next!; await details.load();
  expect(await details.apply(['unsupported'])).toBeUndefined();
  catalogue('https://replacement.invalid/v1');
  expect((await details.apply(['configure']))?.draft).toContain('https://replacement.invalid/v1');
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
  const child = vi.fn(() => ({ draft: '/connect login old' })); const host = new OverlayHost(() => {});
  const details = modelDetailsPicker(detailSource({ back: () => modelPicker(context()),
    actions: [{ id: 'configure', label: 'Configure connection', run: child }],
    admission: () => { host.close(); return undefined; } }));
  host.open(details); await new Promise(resolve => setTimeout(resolve, 0));
  expect(await details.apply(['configure'])).toBeUndefined();
  expect(child).not.toHaveBeenCalled(); expect(host.active).toBe(false);
});

it('suppresses a real accepted detail refresh that settles after its host is replaced', async () => {
  let resolve!: (view: ModelDetailView) => void;
  const child = vi.fn(() => ({ draft: '/connect login new' }));
  const pendingRefresh = new Promise<ModelDetailView>(done => { resolve = done; });
  const initial: ModelDetailView = { label: 'shared', lines: [], available: true,
    actions: [{ id: 'configure', label: 'Configure connection', run: child }] };
  let refreshes = 0;
  const details = modelDetailsPicker(detailSource({ back: () => modelPicker(context()),
    actions: [{ id: 'configure', label: 'Configure connection', run: child }],
    refresh: () => ++refreshes === 1 ? Promise.resolve(initial) : pendingRefresh }));
  const host = new OverlayHost(() => {}); host.open(details); await new Promise(done => setTimeout(done, 0));
  host.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
  let pending!: Promise<unknown>;
  host.handleKey(parseKeyEvent('\r'), (selected, ids) => {
    pending = selected.apply(ids, host.acceptanceFor(selected));
  });
  host.open(modelPicker(context())); await new Promise(done => setTimeout(done, 0));
  resolve({ label: 'shared', lines: ['replacement'], available: true,
    actions: [{ id: 'configure', label: 'Configure connection', run: child }] });
  expect(await pending).toBeUndefined();
  expect(child).not.toHaveBeenCalled();
  host.close();
});

it('ignores a detail subscription update after the host retires the inspector', async () => {
  let publishDetail!: (view: ModelDetailView) => void;
  const details = modelDetailsPicker(detailSource({ back: () => modelPicker(context()),
    lines: ['original'],
    subscribe: publish => { publishDetail = publish; return vi.fn(); } }));
  const host = new OverlayHost(() => {}); host.open(details); await new Promise(done => setTimeout(done, 0));
  host.close();
  publishDetail({ label: 'shared', lines: ['late'], available: true, actions: [] });
  expect(details.detail!('back')).toEqual(['original']);
});

it('publishes a refresh failure without rereading a throwing revision source', () => {
  let fail!: () => void;
  const source = catalogueDetailSource({
    label: 'shared', identity: 'same', revision: () => { throw new Error('configuration unavailable'); },
    read: () => ({ identity: 'same', view: { label: 'shared', lines: ['original'], actions: [],
      available: true, revision: 1 } }),
    reload: async () => {},
    currentRows: () => ({ rows: [], crossCategory: false }),
    back: () => modelPicker(context()),
    watch: (_load, _publish, _observed, onFailure) => { fail = onFailure!; return vi.fn(); },
  });
  const details = modelDetailsPicker(source), publish = vi.fn();
  details.subscribe!(publish);
  expect(() => fail()).not.toThrow();
  expect(publish).toHaveBeenCalledWith([{ id: 'back', label: 'Back to models' }]);
  expect(details.detail!('back')).toContain('Status: model details could not be refreshed.');
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
