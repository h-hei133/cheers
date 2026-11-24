import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath } from '../../../config/runtimeConfig.js';
import { SessionManager } from '../../../session/SessionManager.js';
import { createSessionStoreLayout, locateExistingSessionLayout } from '../../../session/store/sessionFileLayout.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../../session/model/state.js';
import type { SessionModelSelection } from '../../../session/model/contract.js';
import { registerCatalogContribution } from '../../catalog/contributions.js';
import { loadCatalog, userCatalogPath } from '../../models/catalogStore.js';
import { defaultHookDispatcher } from '../../hooks/hookDispatcher.js';
import { runModelCommand } from '../modelCommandRuntime.js';
import { runThinkingCommand } from '../thinkingCommandRuntime.js';
import { projectSessionModel } from '../../../session/model/projection.js';
import { activeModelName } from '../../../cli/interactive/sessionFacts.js';
import type { ShellRuntimeContext } from '../../shell/runtimeContext.js';
import { runSkillfulCommand } from '../skillfulCommandRuntime.js';
import { runSlowCommand } from './serviceTier.js';
import { createShellRuntimeContext } from '../../shell/runtimeContext.js';
import { configurationAdmission } from '../../shell/configuration.js';
import type { CommandContext } from '../types.js';
import { setVirtualModel } from './virtual.js';

let root: string;
let manager: SessionManager;
const retire: Array<() => void> = [];
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-virtual-selection-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
  manager = new SessionManager();
  fs.mkdirSync(path.dirname(getUserRuntimeConfigPath()), { recursive: true });
  fs.writeFileSync(getUserRuntimeConfigPath(), JSON.stringify({ provider: 'openai', providerCredentials: {
    openai: { apiKey: 'synthetic-key', model: 'physical', thinkingEffort: null },
  } }));
  fs.writeFileSync(userCatalogPath(), JSON.stringify({ providers: { openai: {
    models: [{ id: 'physical', reasoning: true, thinkingLevels: ['high', 'max'], contextWindow: 128000, maxTokens: 16000 }],
  } } }));
});
afterEach(() => { retire.splice(0).forEach(close => close()); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

function fixture(available = true) {
  const session = manager.createNew(root);
  const route = vi.fn(() => ({ provider: 'openai', modelId: 'physical' }));
  const close = registerCatalogContribution({ root, sessionId: session.id, commands: [], tools: [], skills: () => [],
    virtualModels: [{ provider: 'adaptive', id: 'auto', name: 'Adaptive', thinkingLevels: ['high', 'max'], route }] }, loadCatalog());
  retire.push(close);
  const physical = { connectionScope: 'provider' as const, provider: 'openai', model: 'physical', thinkingEffort: null,
    skillful: false, serviceTier: 'flex', contextWindow: 128000 };
  writeSessionModel(session.id, physical, readSessionModelEdit(session.id));
  if (!available) fs.writeFileSync(getUserRuntimeConfigPath(), JSON.stringify({ provider: 'openai', providerCredentials: {} }));
  return { session, route, close, physical, context: { cwd: root, projectRoot: root, sessionId: session.id } };
}

function seedVirtual(id: string, physical: object) {
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), id);
  const state = JSON.parse(fs.readFileSync(layout.statePath, 'utf8'));
  fs.writeFileSync(layout.statePath, JSON.stringify({ ...state, modelSelection: { ...physical,
    virtualModel: { provider: 'adaptive', model: 'auto', thinkingEffort: 'high' } } }));
}

it('selects a registered logical model while dormant physical auth is unavailable, preserving authority without routing', async () => {
  const { session, physical, route, context } = fixture(false);
  const output = await runModelCommand(['use', 'adaptive/auto', '--effort', 'high'], context);
  expect(output.output).toContain('Model switched to adaptive/auto.');
  expect(readSessionModel(session.id)).toEqual({ ...physical, virtualModel: { provider: 'adaptive', model: 'auto', thinkingEffort: 'high' } });
  expect(route).not.toHaveBeenCalled();
});

it('permits an absent physical model only with a valid logical marker', () => {
  const session = manager.createNew(root);
  const selection = { connectionScope: 'provider', provider: 'openai', virtualModel: { provider: 'adaptive', model: 'auto' } };
  writeSessionModel(session.id, selection as unknown as SessionModelSelection, readSessionModelEdit(session.id));
  expect(readSessionModel(session.id)).toEqual(selection);
  expect(() => writeSessionModel(session.id, { connectionScope: 'provider', provider: 'openai' } as unknown as SessionModelSelection,
    readSessionModelEdit(session.id))).toThrow();
});

it('refuses a logical choice retired during its switch hook', async () => {
  const { session, physical, close, route, context } = fixture();
  const hook = vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async payload => {
    if (payload.eventName === 'PreModelSwitch') close();
    return undefined;
  });
  const output = await runModelCommand(['use', 'adaptive/auto'], context);
  expect(hook).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'PreModelSwitch', toModel: 'adaptive/auto' }));
  expect(output.output).not.toContain('Model switched to');
  expect(readSessionModel(session.id)).toEqual(physical);
  expect(route).not.toHaveBeenCalled();
});

it('edits virtual effort through /thinking without changing dormant physical fields', async () => {
  const { session, physical, route, context } = fixture();
  seedVirtual(session.id, physical);
  const output = await runThinkingCommand(['max'], context);
  expect(output.output).toMatch(/Model (switched to|preference saved for) adaptive\/auto/);
  expect(readSessionModel(session.id)).toEqual({ ...physical, virtualModel: { provider: 'adaptive', model: 'auto', thinkingEffort: 'max' } });
  await runThinkingCommand(['auto'], context);
  expect(readSessionModel(session.id)).toEqual({ ...physical, virtualModel: { provider: 'adaptive', model: 'auto', thinkingEffort: null } });
  expect(route).not.toHaveBeenCalled();
});

it('reports selected logical identity in command status and the native model label', async () => {
  const { session, physical, context } = fixture();
  seedVirtual(session.id, physical);
  expect((await runModelCommand(['status'], context)).output).toContain('adaptive/auto');
  const config = projectSessionModel(getRuntimeConfig(root), session.id);
  const runtime = { cwd: root, projectRoot: root, session, configuration: { current: { config, catalog: loadCatalog() } } } as unknown as ShellRuntimeContext;
  expect(activeModelName(runtime)).toBe('adaptive/auto');
  expect((await runModelCommand(['list', 'adaptive'], context)).output).toContain('auto');
});

it('clears virtual selection when explicitly selecting a physical model', async () => {
  const { session, physical, context } = fixture();
  seedVirtual(session.id, physical);
  const output = await runModelCommand(['use', 'physical'], context);
  expect(output.output).toContain('Model switched to physical.');
  expect(readSessionModel(session.id)).not.toHaveProperty('virtualModel');
  expect(readSessionModel(session.id)?.thinkingEffort).toBeNull();
});

it('refuses malformed persisted logical selection instead of projecting a physical fallback', () => {
  const { session, physical } = fixture();
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), session.id);
  const state = JSON.parse(fs.readFileSync(layout.statePath, 'utf8'));
  fs.writeFileSync(layout.statePath, JSON.stringify({ ...state, modelSelection: { ...physical,
    virtualModel: { provider: 'adaptive', model: '' } } }));
  expect(() => projectSessionModel(getRuntimeConfig(root), session.id)).toThrow();
});

it('keeps an unavailable saved virtual choice selected and refuses effort or same-address fallback', async () => {
  const { session, physical, context, close, route } = fixture();
  seedVirtual(session.id, physical); close();
  const before = readSessionModel(session.id);
  expect((await runThinkingCommand(['max'], context)).output).toContain('virtual model is unavailable');
  expect((await runModelCommand(['use', 'adaptive/auto'], context)).output).toContain('virtual model is unavailable');
  expect(readSessionModel(session.id)).toEqual(before); expect(route).not.toHaveBeenCalled();
  expect((await runModelCommand(['status'], context)).output).toContain('Virtual model: unavailable');
});

it('edits independent session preferences with dormant auth unavailable', async () => {
  const { session, physical, context } = fixture(false);
  seedVirtual(session.id, physical);
  expect((await runSkillfulCommand(['on'], context)).output).toContain('Skill listing enabled');
  expect(readSessionModel(session.id)).toEqual({ ...physical, skillful: true,
    virtualModel: { provider: 'adaptive', model: 'auto', thinkingEffort: 'high' } });
});

it('does not claim the dormant physical service tier applies to a virtual selection', async () => {
  const { session, physical, context } = fixture(); seedVirtual(session.id, physical);
  const before = readSessionModel(session.id);
  expect((await runSlowCommand(['status'], context)).output).toContain('unavailable while a virtual model is selected');
  expect((await runSlowCommand(['on'], context)).output).toContain('unavailable while a virtual model is selected');
  expect(readSessionModel(session.id)).toEqual(before);
});

it.each(['model', 'independent', 'security'] as const)('uses logical admission only to defer dormant %s constraints', async mode => {
  const { session, context, route } = fixture();
  const base = getRuntimeConfig(root);
  const runtimeConfig = { ...base, maxOutputTokens: 200000,
    ...(mode === 'independent' ? { retryBaseDelayMs: 1000, retryMaxDelayMs: 1 } : {}),
    ...(mode === 'security' ? { configValidation: { ...base.configValidation, valid: false, securityBlocked: true } } : {}) };
  const runtime = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
    rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null }, session, runtimeConfig });
  const command: CommandContext = { ...context, runtimeConfig: runtime.runtimeConfig,
    readConfiguration: () => runtime.configuration.current, admission: configurationAdmission(runtime),
    logicalModelAdmission: configurationAdmission(runtime, { deferredModel: true }) };
  expect(command.admission!()).toBeDefined();
  const before = readSessionModel(session.id);
  const output = await runModelCommand(['use', 'adaptive/auto'], command);
  if (mode === 'model') {
    expect(output.output).toContain('Model switched to adaptive/auto');
    expect(readSessionModel(session.id)?.virtualModel).toEqual({ provider: 'adaptive', model: 'auto' });
  } else {
    expect(output.output).not.toContain('Model switched to');
    expect(readSessionModel(session.id)).toEqual(before);
  }
  expect(route).not.toHaveBeenCalled();
});

it('rejects caller-owned effort accessors before capability validation or hooks', async () => {
  const { session, context, close } = fixture(); close();
  retire.push(registerCatalogContribution({ root, sessionId: session.id, commands: [], tools: [], skills: () => [],
    virtualModels: [{ provider: 'adaptive', id: 'auto', name: 'Adaptive', thinkingLevels: ['high'],
      route: () => ({ provider: 'openai', modelId: 'physical' }) }] }));
  const before = readSessionModel(session.id);
  let reads = 0;
  const target = { provider: 'adaptive', model: 'auto', get thinkingEffort() { return ++reads < 4 ? 'high' as const : 'max' as const; } };
  const hook = vi.spyOn(defaultHookDispatcher, 'dispatch');
  const output = await setVirtualModel(target, context);
  expect(output).not.toContain('Model switched to');
  expect(readSessionModel(session.id)).toEqual(before);
  expect(hook).not.toHaveBeenCalled(); expect(reads).toBe(0);
});
