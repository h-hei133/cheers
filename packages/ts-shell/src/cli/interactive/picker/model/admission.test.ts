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
  readonly canReturn?: () => boolean;
  readonly refresh?: () => Promise<ModelDetailView>;
  readonly subscribe?: (publish: (view: ModelDetailView) => void) => () => void;
  readonly back: (notice?: string) => Picker;
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
    ...(options.canReturn ? { canReturn: options.canReturn } : {}),
    ...(options.subscribe ? { subscribe: options.subscribe } : {}),
  };
}

it('refuses stale list inspection before constructing a configuration form for an old endpoint', async () => {
  const signIn = vi.fn(); const picker = modelPicker(context(), undefined, undefined, undefined, undefined, signIn);
  await picker.load(); catalogue('https://replacement.invalid/v1');
  const result = await picker.inspect!(target);
  expect(result?.note).toContain('expired'); expect(result?.next).toBeUndefined(); expect(signIn).not.toHaveBeenCalled();
});

it.each(['configure', 'account', 'connection'] as const)('returns fresh models after a displayed %s detail is refused without running its callback', async action => {
  let current = true;
  const back: Picker = { title: 'models', form: 'panel', empty: '', load: async () => [], apply: async () => undefined };
  const callback = vi.fn(() => ({ draft: '/connect login old' }));
  const actions = ['configure', 'account', 'connection'].map(id => ({
    id, label: id, run: callback,
  }));
  const details = modelDetailsPicker(detailSource({ back: () => back, actions, canReturn: () => true,
    admission: () => current ? undefined : 'Model selection expired. Reopen the model picker.' }));
  await details.load(); current = false;
  const result = await details.apply([action]);
  expect(result?.note).toContain('expired'); expect(result?.next).toBe(back); expect(result?.draft).toBeUndefined();
  expect(callback).not.toHaveBeenCalled();
  current = true;
  expect(await details.apply([action])).toBeUndefined(); expect(await details.apply(['back'])).toBeUndefined();
  expect(await details.load()).toEqual([]); expect(callback).not.toHaveBeenCalled();
});

it.each(['close', 'replace'] as const)('suppresses a refused detail return when its return guard causes host %s', async ending => {
  const host = new OverlayHost(() => {}), back = vi.fn(() => modelPicker(context())), callback = vi.fn();
  const details = modelDetailsPicker(detailSource({ back, actions: [{ id: 'configure', label: 'Configure', run: callback }],
    admission: () => 'Model selection expired. Reopen the model picker.',
    canReturn: () => { if (ending === 'close') host.close(); else host.open(modelPicker(context())); return true; } }));
  host.open(details); await new Promise(resolve => setTimeout(resolve, 0));
  let pending!: ReturnType<typeof details.apply>;
  try {
    host.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
    host.handleKey(parseKeyEvent('\r'), (selected, ids) => { pending = selected.apply(ids, host.acceptanceFor(selected)); });
    expect(await pending).toBeUndefined(); expect(back).not.toHaveBeenCalled(); expect(callback).not.toHaveBeenCalled();
    expect(await details.apply(['configure'])).toBeUndefined(); expect(await details.load()).toEqual([]);
  } finally { host.close(); }
});

it('retains the original refusal and retires the detail when its return guard throws', async () => {
  const back = vi.fn(() => modelPicker(context())), callback = vi.fn();
  const details = modelDetailsPicker(detailSource({ back, actions: [{ id: 'configure', label: 'Configure', run: callback }],
    admission: () => 'Model selection expired. Reopen the model picker.',
    canReturn: () => { throw new Error('private return diagnostic'); } }));
  await details.load();
  expect(await details.apply(['configure'])).toEqual({ note: 'Model selection expired. Reopen the model picker.' });
  expect(back).not.toHaveBeenCalled(); expect(callback).not.toHaveBeenCalled();
  expect(await details.apply(['configure'])).toBeUndefined(); expect(await details.load()).toEqual([]);
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
  expect(await details.apply(['back'])).toBeUndefined(); expect(await details.load()).toEqual([]);
  expect((await picker.inspect!(target))?.note).toContain('cancelled');
});

it.each(['refuse', 'abort', 'throw'] as const)('does not return a refused detail if its original owner will %s on revalidation', async ending => {
  const controller = new AbortController(); let armed = false, reads = 0;
  const signIn = vi.fn();
  const picker = modelPicker({ ...context(), signal: controller.signal, admission: () => {
    if (!armed) return undefined;
    if (++reads === 1) return 'The original selection expired.';
    if (ending === 'abort') { controller.abort(); return undefined; }
    if (ending === 'throw') throw new Error('private owner diagnostic');
    return 'Workspace changed.';
  } }, undefined, undefined, undefined, undefined, signIn);
  await picker.load(); const details = (await picker.inspect!(target))!.next!; await details.load(); armed = true;
  const before = fs.readFileSync(getUserRuntimeConfigPath()), state = readSessionModelEdit(sessionId);
  const result = await details.apply(['configure']);
  expect(result?.note).toContain('expired'); expect(result?.next).toBeUndefined(); expect(result?.draft).toBeUndefined();
  expect(reads).toBe(2); expect(await details.apply(['configure'])).toBeUndefined(); expect(await details.load()).toEqual([]);
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before); expect(readSessionModelEdit(sessionId)).toEqual(state);
  expect(signIn).not.toHaveBeenCalled();
});

it.each(['configure', 'account', 'connection'] as const)('returns to fresh models after the accepted %s detail refresh rejects', async action => {
  const callback = vi.fn(() => ({ draft: '/connect login old' }));
  const back = vi.fn((notice?: string) => modelPicker(context(), target, undefined, undefined, notice));
  let refreshes = 0;
  const initial: ModelDetailView = { label: 'shared', lines: ['original'], available: true,
    actions: [{ id: action, label: action, run: callback }] };
  const details = modelDetailsPicker(detailSource({ back, actions: initial.actions, canReturn: () => true,
    refresh: async () => { if (++refreshes > 1) throw new Error('private diagnostic'); return initial; } }));
  const host = new OverlayHost(() => {}), before = fs.readFileSync(getUserRuntimeConfigPath()), state = readSessionModelEdit(sessionId);
  host.open(details); await new Promise(resolve => setTimeout(resolve, 0));
  let result: Awaited<ReturnType<typeof details.apply>>;
  try {
    host.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
    host.handleKey(parseKeyEvent('\r'), (selected, ids) => {
      void selected.apply(ids, host.acceptanceFor(selected)).then(outcome => { result = outcome; if (outcome?.next) host.open(outcome.next); });
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(result!.note).toBe('Model catalogue could not be refreshed. Reopen the model picker.');
    expect(back).toHaveBeenCalledWith(result!.note); expect(host.active).toBe(true);
    expect(result!.next?.initialSelection).toBe(target); expect(result!.next?.status?.()).toContain(result!.note);
    expect(await details.apply([action])).toBeUndefined(); expect(await details.load()).toEqual([]);
    expect(callback).not.toHaveBeenCalled();
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before); expect(readSessionModelEdit(sessionId)).toEqual(state);
  } finally { host.close(); }
});

it.each(['close', 'replace'] as const)('discards a rejected detail refresh after the accepted host is %s', async ending => {
  let reject!: (error: Error) => void;
  const pending = new Promise<ModelDetailView>((_resolve, fail) => { reject = fail; });
  const callback = vi.fn(() => ({ draft: '/connect login old' })), back = vi.fn(() => modelPicker(context()));
  const initial: ModelDetailView = { label: 'shared', lines: [], available: true,
    actions: [{ id: 'configure', label: 'Configure connection', run: callback }] };
  let refreshes = 0;
  const details = modelDetailsPicker(detailSource({ back, actions: initial.actions,
    refresh: () => ++refreshes === 1 ? Promise.resolve(initial) : pending }));
  const host = new OverlayHost(() => {}); host.open(details); await new Promise(resolve => setTimeout(resolve, 0));
  let accepted!: ReturnType<typeof details.apply>;
  try {
    host.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
    host.handleKey(parseKeyEvent('\r'), (selected, ids) => { accepted = selected.apply(ids, host.acceptanceFor(selected)); });
    if (ending === 'close') host.close(); else host.open(modelPicker(context()));
    reject(new Error('private diagnostic'));
    expect(await accepted).toBeUndefined(); expect(back).not.toHaveBeenCalled(); expect(callback).not.toHaveBeenCalled();
    expect(await details.apply(['configure'])).toBeUndefined(); expect(await details.load()).toEqual([]);
  } finally { host.close(); }
});

it.each(['configure', 'account', 'connection'] as const)(
  'returns to fresh models when the accepted %s detail admission throws', async action => {
    const callback = vi.fn(() => ({ draft: '/connect login old' }));
    const back = vi.fn((notice?: string) => modelPicker(context(), target, undefined, undefined, notice));
    const details = modelDetailsPicker(detailSource({ back, canReturn: () => true,
      actions: [{ id: action, label: action, run: callback }],
      admission: () => { throw new Error('private admission diagnostic'); } }));
    const host = new OverlayHost(() => {}), before = fs.readFileSync(getUserRuntimeConfigPath()), state = readSessionModelEdit(sessionId);
    host.open(details); await new Promise(resolve => setTimeout(resolve, 0));
    let accepted!: ReturnType<typeof details.apply>;
    try {
      host.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
      host.handleKey(parseKeyEvent('\r'), (selected, ids) => { accepted = selected.apply(ids, host.acceptanceFor(selected)); });
      const result = await accepted;
      expect(result?.note).toBe('Model details could not be verified. Reopen the model picker.');
      expect(back).toHaveBeenCalledWith(result!.note); expect(result!.next?.initialSelection).toBe(target);
      expect(result!.next?.status?.()).toContain(result!.note);
      host.open(result!.next!); await new Promise(resolve => setTimeout(resolve, 0));
      expect(host.active).toBe(true); expect(await details.apply([action])).toBeUndefined();
      expect(await details.load()).toEqual([]); expect(callback).not.toHaveBeenCalled();
      expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before); expect(readSessionModelEdit(sessionId)).toEqual(state);
    } finally { host.close(); }
  });

it.each((['refresh', 'admission'] as const).flatMap(failure =>
  (['absent', 'refuse', 'throw'] as const).map(guard => ({ failure, guard }))))(
  'keeps a $failure failure retired without a verified browser return ($guard guard)', async ({ failure, guard }) => {
    const callback = vi.fn(), back = vi.fn(() => modelPicker(context()));
    const canReturn = guard === 'absent' ? undefined : vi.fn(() => {
      if (guard === 'throw') throw new Error('private return diagnostic');
      return false;
    });
    const initial: ModelDetailView = { label: 'shared', lines: [], available: true,
      actions: [{ id: 'configure', label: 'Configure', run: callback }] };
    let refreshes = 0;
    const details = modelDetailsPicker(detailSource({ back, canReturn, actions: initial.actions,
      refresh: async () => {
        if (++refreshes > 1 && failure === 'refresh') throw new Error('private refresh diagnostic');
        return initial;
      },
      admission: () => { throw new Error('private admission diagnostic'); } }));
    await details.load();
    const result = await details.apply(['configure']);
    expect(result).toEqual({ note: failure === 'refresh' ? 'Model catalogue could not be refreshed. Reopen the model picker.'
      : 'Model details could not be verified. Reopen the model picker.' });
    if (canReturn) expect(canReturn).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled(); expect(callback).not.toHaveBeenCalled();
    expect(await details.apply(['configure'])).toBeUndefined(); expect(await details.load()).toEqual([]);
    expect(await details.apply(['back'])).toBeUndefined();
  });

it.each((['refresh', 'admission'] as const).flatMap(failure =>
  (['close', 'replace'] as const).map(ending => ({ failure, ending }))))(
  'discards a $failure failure if browser-return admission causes host $ending', async ({ failure, ending }) => {
    const host = new OverlayHost(() => {}), callback = vi.fn(), back = vi.fn(() => modelPicker(context()));
    const initial: ModelDetailView = { label: 'shared', lines: [], available: true,
      actions: [{ id: 'configure', label: 'Configure', run: callback }] };
    let refreshes = 0;
    const canReturn = vi.fn(() => { if (ending === 'close') host.close(); else host.open(modelPicker(context())); return true; });
    const details = modelDetailsPicker(detailSource({ back, canReturn, actions: initial.actions,
      refresh: async () => {
        if (++refreshes > 1 && failure === 'refresh') throw new Error('private refresh diagnostic');
        return initial;
      },
      admission: () => { throw new Error('private admission diagnostic'); } }));
    host.open(details); await new Promise(resolve => setTimeout(resolve, 0));
    let accepted!: ReturnType<typeof details.apply>;
    try {
      host.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
      host.handleKey(parseKeyEvent('\r'), (selected, ids) => { accepted = selected.apply(ids, host.acceptanceFor(selected)); });
      expect(await accepted).toBeUndefined(); expect(canReturn).toHaveBeenCalledTimes(1);
      expect(back).not.toHaveBeenCalled(); expect(callback).not.toHaveBeenCalled();
      expect(await details.apply(['configure'])).toBeUndefined(); expect(await details.load()).toEqual([]);
    } finally { host.close(); }
  });

it.each((['close', 'replace'] as const).flatMap(ending =>
  (['refuse', 'throw'] as const).map(outcome => ({ ending, outcome }))))(
  'discards detail admission $outcome results after its accepted host is $ending', async ({ ending, outcome }) => {
    const callback = vi.fn(() => ({ draft: '/connect login old' })), back = vi.fn(() => modelPicker(context()));
    const host = new OverlayHost(() => {});
    const details = modelDetailsPicker(detailSource({ back,
      actions: [{ id: 'configure', label: 'Configure connection', run: callback }],
      admission: () => {
        if (ending === 'close') host.close(); else host.open(modelPicker(context()));
        if (outcome === 'throw') throw new Error('private admission diagnostic');
        return 'Model selection expired. Reopen the model picker.';
      } }));
    host.open(details); await new Promise(resolve => setTimeout(resolve, 0));
    let accepted!: ReturnType<typeof details.apply>;
    try {
      host.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
      host.handleKey(parseKeyEvent('\r'), (selected, ids) => { accepted = selected.apply(ids, host.acceptanceFor(selected)); });
      expect(await accepted).toBeUndefined(); expect(back).not.toHaveBeenCalled(); expect(callback).not.toHaveBeenCalled();
      expect(await details.apply(['configure'])).toBeUndefined();
    } finally { host.close(); }
  });

it.each(['configure', 'back'] as const)('retires an already revoked detail acceptance before its %s action reads or returns', async action => {
  const callback = vi.fn(() => ({ draft: '/connect login old' })), back = vi.fn(() => modelPicker(context()));
  const source = detailSource({ back, actions: [{ id: 'configure', label: 'Configure connection', run: callback }] });
  const refresh = vi.spyOn(source, 'refresh'), details = modelDetailsPicker(source), host = new OverlayHost(() => {});
  host.open(details); await new Promise(resolve => setTimeout(resolve, 0));
  let accepted!: () => ReturnType<typeof details.apply>;
  try {
    if (action === 'configure') host.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
    host.handleKey(parseKeyEvent('\r'), (selected, ids) => {
      const owned = host.acceptanceFor(selected); accepted = () => selected.apply(ids, owned);
    });
    host.close();
    expect(await accepted()).toBeUndefined(); expect(refresh).toHaveBeenCalledTimes(1);
    expect(await details.load()).toEqual([]); expect(await details.apply([action])).toBeUndefined();
    expect(back).not.toHaveBeenCalled(); expect(callback).not.toHaveBeenCalled();
  } finally { host.close(); }
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
  expect(await details.apply(['configure'])).toBeUndefined(); expect(await details.load()).toEqual([]);
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
