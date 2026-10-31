import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../../session/SessionManager.js';
import { getRuntimeConfig, getUserAuthPath, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../config/runtimeConfig.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../../session/model/state.js';
import { createCommandRegistry } from '../registry.js';
import { routeSlashCommand } from '../slashRouter.js';
import { runModelPresetCommand } from './presetCommand.js';
import { writeCatalogCache } from '../../models/catalogStore.js';
import { projectSessionModel } from '../../../session/model/projection.js';
import { readProfilePresets } from './presetStore.js';

let home = '';
let sessionId = '';

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-model-preset-'));
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  writeCatalogCache([{ id: 'openai', models: [{ id: 'base-model', reasoning: true }, { id: 'next-model', reasoning: true }] }]);
  writeUserRuntimeConfigFile({
    provider: 'openai',
    activeProviderConnectionId: 'fixture',
    providerConnections: [{
      id: 'fixture', provider: 'openai', authType: 'api-key', apiKey: 'synthetic-key', model: 'base-model',
      createdAt: '2026-01-01', updatedAt: '2026-01-01', status: 'connected',
    }],
  }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  sessionId = new SessionManager().createNew(home).id;
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(home, { recursive: true, force: true });
});

it('saves and applies a session preset through the command owner', async () => {
  const context = { cwd: home, projectRoot: home, sessionId, runtimeConfig: getRuntimeConfig(home) };
  await routeSlashCommand('/model base-model', { ...context, interactive: true });
  const saved = await runModelPresetCommand(['save', 'review'], context);
  expect(saved.output).toContain("saved for this session");
  expect(readSessionModel(sessionId)?.presets?.review.roles.default.model).toBe('base-model');

  const applied = await runModelPresetCommand(['apply', 'review'], context);
  expect(applied.output).toContain("applied for this session");
  expect(readSessionModel(sessionId)?.model).toBe('base-model');
});

it('saves, validates and applies an explicit profile role before a session model has been selected', async () => {
  const context = { cwd: home, projectRoot: home, sessionId };
  const global = [getUserRuntimeConfigPath(), getUserAuthPath()].map(file => fs.readFileSync(file));
  expect(readSessionModel(sessionId)).toBeUndefined();
  expect((await runModelPresetCommand(['save', 'fresh', '--profile', 'default=fixture/next-model@high'], context)).output).toContain('saved');
  expect((await runModelPresetCommand(['validate', 'fresh'], context)).output).toContain('is valid');
  expect((await runModelPresetCommand(['apply', 'fresh'], context)).output).toContain('applied for this session');
  expect(readSessionModel(sessionId)).toMatchObject({ connectionId: 'fixture', model: 'next-model', thinkingEffort: 'high' });
  expect([getUserRuntimeConfigPath(), getUserAuthPath()].map(file => fs.readFileSync(file))).toEqual(global);
});

it('binds explicit same-provider relay targets and refuses ambiguous provider-only saves without a current choice', async () => {
  const context = { cwd: home, projectRoot: home, sessionId };
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: [...edit.values.providerConnections!, {
    ...edit.values.providerConnections![0]!, id: 'second', baseUrl: 'https://second.example.invalid/v1',
  }] }, edit);
  expect((await runModelPresetCommand(['save', 'ambiguous', '--profile', 'review=openai/next-model'], context)).output).toContain('ambiguous');
  expect(readProfilePresets().ambiguous).toBeUndefined();
  expect((await runModelPresetCommand(['save', 'exact', '--profile', 'review=second/next-model@auto'], context)).output).toContain('saved');
  expect(readProfilePresets().exact.roles.review).toEqual({ connectionId: 'second', provider: 'openai', model: 'next-model', thinkingEffort: null });
  expect((await runModelPresetCommand(['apply', 'exact', 'review'], context)).output).toContain('Connection: second');
});

it('does not use a stale session connection with a changed provider to resolve an ambiguous role', async () => {
  const context = { cwd: home, projectRoot: home, sessionId };
  await routeSlashCommand('/model base-model', { ...context, interactive: true });
  writeCatalogCache([{ id: 'google', models: [{ id: 'next-model', reasoning: true }] }]);
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  // Reuse a retired ID; an existing preference owner cannot be rebound in place.
  writeUserRuntimeConfigFile({ providerConnections: [], activeProviderConnectionId: undefined }, edit);
  writeUserRuntimeConfigFile({ ...edit.values, provider: 'google', providerConnections: ['fixture', 'second'].map(id => ({
    ...edit.values.providerConnections![0]!, id, provider: 'google' as const, model: 'next-model',
  })) }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  expect(readSessionModel(sessionId)?.provider).toBe('openai');
  expect((await runModelPresetCommand(['save', 'stale', '--profile', 'review=google/next-model'], context)).output).toContain('ambiguous');
  expect(readProfilePresets().stale).toBeUndefined();
});

it('allows explicit profile library management without a session but refuses session application', async () => {
  const context = { cwd: home, projectRoot: home };
  expect((await runModelPresetCommand(['save', 'library', '--profile', 'review=fixture/next-model'], context)).output).toContain('saved');
  expect((await runModelPresetCommand(['validate', 'library'], context)).output).toContain('is valid');
  expect((await runModelPresetCommand(['apply', 'library', 'review'], context)).output).toContain('requires an active session');
  expect(readSessionModel(sessionId)).toBeUndefined();
});

it('keeps slash-containing model ids after an exact connection prefix', async () => {
  writeCatalogCache([{ id: 'openai', models: [{ id: 'namespace/model', reasoning: true }] }]);
  const context = { cwd: home, projectRoot: home, sessionId };
  expect((await runModelPresetCommand(['save', 'slash', '--profile', 'review=fixture/namespace/model@low'], context)).output).toContain('saved');
  expect(readProfilePresets().slash.roles.review.model).toBe('namespace/model');
});

it('reports the remaining session owner after deleting a shadowed profile preset', async () => {
  const context = { cwd: home, projectRoot: home, sessionId };
  await routeSlashCommand('/model base-model', { ...context, interactive: true });
  expect((await runModelPresetCommand(['save', 'shared'], context)).output).toContain('saved');
  expect((await runModelPresetCommand(['promote', 'shared'], context)).output).toContain('saved');
  expect((await runModelPresetCommand(['delete', 'shared'], context)).output).toContain("The session preset 'shared' remains available");
  expect(readProfilePresets().shared).toBeUndefined();
  expect((await runModelPresetCommand(['apply', 'shared'], context)).output).toContain('from the session owner');
});

it('saves a preset for legacy connections whose optional timestamps are synthesized during reads', async () => {
  const file = getUserAuthPath();
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete raw.providerConnections[0].createdAt;
  delete raw.providerConnections[0].updatedAt;
  fs.writeFileSync(file, JSON.stringify(raw));
  const context = { cwd: home, projectRoot: home, sessionId };
  await routeSlashCommand('/model base-model', { ...context, interactive: true });
  const saved = await runModelPresetCommand(['save', 'legacy'], context);
  expect(saved.output).toContain('saved for this session');
  expect(readSessionModel(sessionId)?.presets?.legacy.roles.default.model).toBe('base-model');
});

it('routes /switch to the existing model owner and exposes preset syntax', async () => {
  const registry = createCommandRegistry(home);
  expect(registry.get('model')?.aliases).toContain('switch');
  expect(registry.get('modelpreset')?.getArgumentCompletions?.('sa')?.map(item => item.value)).toContain('save');
  const result = await routeSlashCommand('/switch switched-model', { cwd: home, projectRoot: home, sessionId, interactive: true });
  expect(result?.kind).toBe('local');
  expect(result && result.kind === 'local' ? result.output : '').toContain('Model switched to switched-model');
  const nested = await routeSlashCommand('/model preset status', { cwd: home, projectRoot: home, sessionId, interactive: true });
  expect(nested?.kind).toBe('local');
  expect(nested && nested.kind === 'local' ? nested.output : '').toContain('No model presets');
});

it('keeps session skill controls while clearing model-specific controls on apply', async () => {
  const context = { cwd: home, projectRoot: home, sessionId, runtimeConfig: getRuntimeConfig(home) };
  await routeSlashCommand('/model base-model', { ...context, interactive: true });
  const selected = readSessionModel(sessionId)!;
  writeSessionModel(sessionId, { ...selected, skillful: false, serviceTier: 'flex', contextWindow: 128_000 }, readSessionModelEdit(sessionId));
  await runModelPresetCommand(['save', 'review'], context);
  const applied = await runModelPresetCommand(['apply', 'review'], context);
  expect(applied.output).toContain('applied for this session');
  expect(readSessionModel(sessionId)).toMatchObject({ skillful: false });
  expect(readSessionModel(sessionId)?.serviceTier).toBeUndefined();
  expect(readSessionModel(sessionId)?.contextWindow).toBeUndefined();
});

it('applies a role on a different connection and rejects unavailable companion roles before any selection write', async () => {
  const context = { cwd: home, projectRoot: home, sessionId };
  await routeSlashCommand('/model base-model', { ...context, interactive: true });
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: [...edit.values.providerConnections!, {
    ...edit.values.providerConnections![0]!, id: 'second', model: 'next-model',
  }] }, edit);
  const selected = readSessionModel(sessionId)!;
  writeSessionModel(sessionId, { ...selected, presets: { second: { roles: { default: {
    connectionId: 'second', provider: 'openai', model: 'next-model',
  } } } } }, readSessionModelEdit(sessionId));
  const before = readSessionModel(sessionId);
  const global = [getUserRuntimeConfigPath(), getUserAuthPath()].map(file => fs.readFileSync(file));
  expect((await runModelPresetCommand(['apply', 'second'], context)).output).toContain('applied for this session');
  expect(readSessionModel(sessionId)).toMatchObject({ connectionId: 'second', model: 'next-model', connectionScope: 'session' });
  expect(projectSessionModel(getRuntimeConfig(home), sessionId).activeProviderConnectionId).toBe('second');
  expect([getUserRuntimeConfigPath(), getUserAuthPath()].map(file => fs.readFileSync(file))).toEqual(global);
  writeSessionModel(sessionId, { ...before!, presets: { mixed: { roles: {
    default: { connectionId: 'fixture', provider: 'openai', model: 'next-model' },
    reviewer: { connectionId: 'fixture', provider: 'openai', model: 'unknown-model' },
  } } } }, readSessionModelEdit(sessionId));
  expect((await runModelPresetCommand(['apply', 'mixed'], context)).output).toContain('no verified catalogue entry');
  expect(readSessionModel(sessionId)?.model).toBe('base-model');
});
