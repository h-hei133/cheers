import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../../session/SessionManager.js';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../config/runtimeConfig.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../../session/model/state.js';
import { projectSessionModel } from '../../../session/model/projection.js';
import { writeCatalogCache } from '../../models/catalogStore.js';
import { defaultHookDispatcher } from '../../hooks/hookDispatcher.js';
import * as storage from '../../../session/store/sessionFileStore.js';
import { runModelPresetCommand } from './presetCommand.js';
import { runModelCommand } from '../modelCommandRuntime.js';
import { modelPicker } from '../../../cli/interactive/picker/model.js';

let home: string;
let manager: SessionManager;
let sessionId: string;
const context = () => ({ cwd: home, projectRoot: home, sessionId });
beforeEach(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-model-policy-'));
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('OPENAI_API_KEY', '');
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'a', providerConnections: ['a', 'b'].map(id => ({
    id, provider: 'openai', authType: 'api-key', apiKey: `synthetic-${id}`, model: 'main', baseUrl: `https://${id}.invalid/v1`,
    status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  })) }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  writeCatalogCache([{ id: 'openai', models: [{ id: 'main', reasoning: true }, { id: 'namespace/child', reasoning: true }] }]);
  manager = new SessionManager(); sessionId = manager.createNew(home).id;
  expect((await runModelPresetCommand(['save', 'work', '--profile', 'default=a/main@low', 'subagent=b/namespace/child@high'], context())).output).toContain('saved');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

it('applies default and subagent in one persisted session update, restores policy on resume, and leaves global defaults unchanged', async () => {
  const global = fs.readFileSync(getUserRuntimeConfigPath());
  const persist = vi.spyOn(storage, 'writeJsonFileAtomic');
  const baseline = readSessionModelEdit(sessionId);
  const result = await runModelPresetCommand(['apply', 'work', '--all'], context());
  expect(result.output).toContain('all roles applied for this session');
  expect(persist.mock.calls.filter(([file]) => file === baseline.statePath)).toHaveLength(1);
  expect(readSessionModel(sessionId)).toMatchObject({ connectionId: 'a', model: 'main', thinkingEffort: 'low', roles: {
    subagent: { connectionId: 'b', provider: 'openai', model: 'namespace/child', thinkingEffort: 'high' },
  } });
  expect(readSessionModelEdit(sessionId).revision).not.toBe(baseline.revision);
  manager.persistUserPromptBarrier(sessionId, 'retain policy'); manager.saveInterrupted(sessionId);
  expect(new SessionManager().tryResume(sessionId)).toMatchObject({ ok: true });
  expect(projectSessionModel(getRuntimeConfig(home), sessionId).sessionModelRoles).toEqual(readSessionModel(sessionId)!.roles);
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
});

it('preserves the policy during individual choices and clears omitted assignments on the next whole application', async () => {
  await runModelPresetCommand(['apply', 'work', '--all'], context());
  const roles = readSessionModel(sessionId)!.roles;
  expect((await runModelPresetCommand(['apply', 'work', 'subagent'], context())).output).toContain("role 'subagent' applied");
  expect(readSessionModel(sessionId)!.roles).toEqual(roles);
  expect((await runModelCommand(['main'], context())).output).toContain('Model switched');
  expect(readSessionModel(sessionId)!.roles).toEqual(roles);
  await runModelPresetCommand(['save', 'plain', '--profile', 'default=a/main'], context());
  expect((await runModelPresetCommand(['apply', 'plain', '--all'], context())).output).toContain('all roles applied');
  expect(readSessionModel(sessionId)!.roles).toEqual({});
  expect(projectSessionModel(getRuntimeConfig(home), sessionId).sessionModelRoles).toEqual({});
});

it('refuses unknown automatic consumers and a missing default before any session write while preserving manual named roles', async () => {
  await runModelPresetCommand(['save', 'manual', '--profile', 'default=a/main', 'review=b/namespace/child'], context());
  const baseline = readSessionModelEdit(sessionId);
  expect((await runModelPresetCommand(['apply', 'manual', '--all'], context())).output).toContain('no automatic consumer');
  expect(readSessionModelEdit(sessionId)).toEqual(baseline);
  expect((await runModelPresetCommand(['apply', 'manual', 'review'], context())).output).toContain("role 'review' applied");
  await runModelPresetCommand(['save', 'missing', '--profile', 'subagent=b/namespace/child'], context());
  const selected = readSessionModelEdit(sessionId);
  expect((await runModelPresetCommand(['apply', 'missing', '--all'], context())).output).toContain('requires a default role');
  expect(readSessionModelEdit(sessionId)).toEqual(selected);
});

it.each(['connection', 'preset', 'session'])('keeps both default and roles untouched when %s changes during the hook', async change => {
  const before = readSessionModelEdit(sessionId);
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName !== 'PreModelSwitch') return undefined;
    if (change === 'connection') {
      const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
      writeUserRuntimeConfigFile({ ...edit.values, providerConnections: edit.values.providerConnections!.filter(item => item.id !== 'b') }, edit);
    } else if (change === 'preset') await runModelPresetCommand(['delete', 'work'], context());
    else writeSessionModel(sessionId, { connectionId: 'a', provider: 'openai', model: 'main', thinkingEffort: null }, before);
    return undefined;
  });
  expect((await runModelPresetCommand(['apply', 'work', '--all'], context())).output).toContain('blocked');
  if (change === 'session') expect(readSessionModel(sessionId)).toEqual({ connectionId: 'a', provider: 'openai', model: 'main', thinkingEffort: null });
  else expect(readSessionModelEdit(sessionId)).toEqual(before);
});

it('refuses the entire application when a secondary role violates the current request budget', async () => {
  writeCatalogCache([{ id: 'openai', models: [{ id: 'main', reasoning: true }, { id: 'namespace/child', reasoning: true, maxTokens: 1 }] }]);
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, maxOutputTokens: 10 }, edit);
  const baseline = readSessionModelEdit(sessionId);
  expect((await runModelPresetCommand(['apply', 'work', '--all'], context())).output).toContain("role 'subagent'");
  expect(readSessionModelEdit(sessionId)).toEqual(baseline);
});

it('offers whole-preset application through the model picker with the same stale preset guard', async () => {
  const picker = modelPicker(context());
  expect((await picker.load()).find(row => row.id === 'preset-all:work')?.disabled).not.toBe(true);
  expect((await picker.apply(['preset-all:work']))?.note).toContain('all roles applied');
  const stale = modelPicker(context()); await stale.load();
  await runModelPresetCommand(['delete', 'work'], context());
  const before = readSessionModelEdit(sessionId);
  expect((await stale.apply(['preset-all:work']))?.note).toContain('changed');
  expect(readSessionModelEdit(sessionId)).toEqual(before);
});

it.each([false, true])('keeps write uncertainty explicit when state persistence throws (published=%s)', async published => {
  const before = readSessionModelEdit(sessionId);
  const persist = storage.writeJsonFileAtomic;
  vi.spyOn(storage, 'writeJsonFileAtomic').mockImplementation((file, value) => {
    if (file !== before.statePath) return persist(file, value);
    if (published) persist(file, value);
    throw new Error('synthetic publication failure');
  });
  const output = (await runModelPresetCommand(['apply', 'work', '--all'], context())).output;
  expect(output).not.toContain('all roles applied');
  expect(output).toMatch(/unknown|unverified/);
  const saved = readSessionModel(sessionId);
  if (published) expect(saved).toMatchObject({ connectionId: 'a', thinkingEffort: 'low', roles: { subagent: { connectionId: 'b', thinkingEffort: 'high' } } });
  else expect(readSessionModelEdit(sessionId)).toEqual(before);
});
