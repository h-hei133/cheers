import fs from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../../config/runtimeConfig.js';
import { writeCatalogCache } from '../../../../core/models/catalogStore.js';
import { defaultHookDispatcher } from '../../../../core/hooks/hookDispatcher.js';
import { saveProfileModelPreset } from '../../../../core/commands/model/preset.js';
import { SessionManager } from '../../../../session/SessionManager.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../../../session/model/state.js';
import { OverlayHost } from '../../overlay.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { modelPicker } from '../model.js';

let root: string, sessionId: string;
const context = () => ({ cwd: root, projectRoot: root, sessionId });
const rowId = 'model:["b","openai","other"]';
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/model-activation-');
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'a', providerConnections: ['a', 'b'].map(id => ({
    id, provider: 'openai' as const, authType: 'api-key' as const, apiKey: `synthetic-${id}`, model: 'shared',
    status: 'connected' as const, createdAt: '2026-01-01', updatedAt: '2026-01-01',
  })) }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  writeCatalogCache([{ id: 'openai', models: [{ id: 'shared', reasoning: true }, { id: 'other', reasoning: true }] }]);
  sessionId = new SessionManager().createNew(root).id;
  const target = { connectionId: 'a', provider: 'openai' as const, model: 'shared', thinkingEffort: 'high' as const };
  writeSessionModel(sessionId, { ...target, roles: { advisor: target, summary: target }, skillful: false }, readSessionModelEdit(sessionId));
  expect(saveProfileModelPreset('work', { default: { ...target, connectionId: 'b', model: 'other' },
    advisor: { ...target, connectionId: 'b', model: 'other', thinkingEffort: 'low' } }, context())).toContain('saved');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it.each((['model', 'preset', 'whole'] as const).flatMap(surface =>
  (['PreModelSwitch', 'PostModelSwitch'] as const).flatMap(eventName =>
    (['close', 'replace'] as const).map(ending => ({ surface, eventName, ending })))))(
  'fences accepted $surface activation when $eventName will $ending its host', async ({ surface, eventName, ending }) => {
    const id = surface === 'model' ? rowId : surface === 'preset' ? 'preset:work' : 'preset-all:work';
    const back = vi.fn(() => modelPicker(context())), picker = modelPicker(context(), id, undefined, undefined, undefined, undefined, back);
    const host = new OverlayHost(() => {}); host.open(picker);
    await new Promise(resolve => setTimeout(resolve, 0));
    const before = readSessionModelEdit(sessionId), config = fs.readFileSync(getUserRuntimeConfigPath());
    const replacement = { title: 'Replacement', empty: 'Kept', load: async () => [], apply: async () => undefined };
    const hook = vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
      if (event.eventName === eventName) { if (ending === 'close') host.close(); else host.open(replacement); }
      return undefined;
    });
    let pending: ReturnType<typeof picker.apply> | undefined;
    try {
      host.handleKey(parseKeyEvent('\r'), (selected, ids) => { pending = selected.apply(ids, host.acceptanceFor(selected)); });
      expect(pending).toBeDefined(); const result = await pending;
      expect(hook).toHaveBeenCalledWith(expect.objectContaining({ eventName }));
      if (eventName === 'PreModelSwitch') {
        expect(JSON.stringify(readSessionModelEdit(sessionId))).toBe(JSON.stringify(before));
        expect(result?.note).toContain('blocked');
        expect(hook.mock.calls.filter(([event]) => event.eventName === 'PostModelSwitch')).toHaveLength(0);
      } else {
        expect(readSessionModel(sessionId)).toMatchObject({ connectionId: 'b', model: 'other', thinkingEffort: 'high', skillful: false });
        expect(result?.note).toContain('Model switched to other.');
        expect(readSessionModel(sessionId)?.roles).toEqual(surface === 'whole'
          ? { advisor: { connectionId: 'b', provider: 'openai', model: 'other', thinkingEffort: 'low' } } : before.selection?.roles);
      }
      expect(result?.next).toBeUndefined(); expect(back).not.toHaveBeenCalled();
      expect(host.active).toBe(ending === 'replace'); expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(config);
      const after = JSON.stringify(readSessionModelEdit(sessionId));
      expect(await picker.apply([id])).toBeUndefined(); await picker.load();
      expect(await picker.apply([id])).toBeUndefined(); expect(JSON.stringify(readSessionModelEdit(sessionId))).toBe(after);
    } finally { host.close(); }
  });

it.each(['escape', 'signal'] as const)('retires a ready model action after %s without reviving it on catalogue load', async ending => {
  const controller = new AbortController(), picker = modelPicker({ ...context(), signal: controller.signal }, rowId);
  const host = new OverlayHost(() => {}); host.open(picker); await new Promise(resolve => setTimeout(resolve, 0));
  const before = JSON.stringify(readSessionModelEdit(sessionId)), hook = vi.spyOn(defaultHookDispatcher, 'dispatch');
  try {
    if (ending === 'escape') {
      for (let count = 0; count < 4 && host.active; count++) host.handleKey(parseKeyEvent('\x1b'), vi.fn());
      expect(host.active).toBe(false);
    } else controller.abort();
    expect(await picker.apply([rowId])).toBeUndefined(); await picker.load(); expect(await picker.apply([rowId])).toBeUndefined();
    expect(JSON.stringify(readSessionModelEdit(sessionId))).toBe(before); expect(hook).not.toHaveBeenCalled();
  } finally { host.close(); }
});

it('gates duplicate pending activation and lets explicit reopening acquire a new action generation', async () => {
  const picker = modelPicker(context(), rowId), host = new OverlayHost(() => {});
  host.open(picker); await new Promise(resolve => setTimeout(resolve, 0));
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') { entered(); await held; }
    return undefined;
  });
  let pending: ReturnType<typeof picker.apply> | undefined, duplicate: Promise<void> | undefined;
  try {
    host.handleKey(parseKeyEvent('\r'), (selected, ids) => { pending = selected.apply(ids, host.acceptanceFor(selected)); });
    await started;
    let duplicateResult: unknown = 'pending'; duplicate = picker.apply([rowId]).then(result => { duplicateResult = result; });
    await new Promise(resolve => setImmediate(resolve)); expect(duplicateResult).toBeUndefined();
    host.open(picker); await new Promise(resolve => setTimeout(resolve, 0));
    release(); expect((await pending)?.note).toContain('blocked');
    expect((await picker.apply([rowId]))?.note).toContain('Model switched to other.');
    expect(readSessionModel(sessionId)).toMatchObject({ connectionId: 'b', model: 'other' });
  } finally { release(); await pending; await duplicate; host.close(); }
});

it.each(['model', 'preset', 'whole'] as const)('consumes a successful %s activation once while retaining its normal parent', async surface => {
  const id = surface === 'model' ? rowId : surface === 'preset' ? 'preset:work' : 'preset-all:work';
  const back = vi.fn(() => modelPicker(context()));
  const picker = modelPicker(context(), id, undefined, undefined, undefined, undefined, back); await picker.load();
  const result = await picker.apply([id]); expect(result?.note).toContain('Model switched to other.');
  expect(result?.next).toBeDefined(); expect(back).toHaveBeenCalledOnce();
  const after = JSON.stringify(readSessionModelEdit(sessionId));
  expect(await picker.apply([id])).toBeUndefined(); await picker.load(); expect(await picker.apply([id])).toBeUndefined();
  expect(JSON.stringify(readSessionModelEdit(sessionId))).toBe(after); expect(back).toHaveBeenCalledOnce();
});

it.each(['refuse', 'abort', 'throw', 'close', 'replace'] as const)(
  'preserves the completed model result without a parent when browser return will %s', async ending => {
    const controller = new AbortController(), host = new OverlayHost(() => {}), back = vi.fn(() => modelPicker(context()));
    let completed = false;
    const admission = () => {
      if (!completed) return undefined;
      if (ending === 'refuse') return 'Workspace changed.';
      if (ending === 'abort') controller.abort();
      if (ending === 'throw') throw new Error('private browser return diagnostic');
      if (ending === 'close') host.close();
      if (ending === 'replace') host.open({ title: 'Replacement', empty: 'Kept', load: async () => [], apply: async () => undefined });
      return undefined;
    };
    const picker = modelPicker({ ...context(), signal: controller.signal, admission }, rowId, undefined, undefined, undefined, undefined, back);
    host.open(picker); await new Promise(resolve => setTimeout(resolve, 0));
    vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
      if (event.eventName === 'PostModelSwitch') completed = true;
      return undefined;
    });
    let pending: ReturnType<typeof picker.apply> | undefined;
    try {
      host.handleKey(parseKeyEvent('\r'), (selected, ids) => { pending = selected.apply(ids, host.acceptanceFor(selected)); });
      const result = await pending;
      expect(result?.note).toContain('Model switched to other.'); expect(result?.note).not.toContain('private');
      expect(result?.next).toBeUndefined(); expect(back).not.toHaveBeenCalled();
      expect(readSessionModel(sessionId)).toMatchObject({ connectionId: 'b', model: 'other' });
      expect(await picker.apply([rowId])).toBeUndefined();
    } finally { host.close(); }
  });
