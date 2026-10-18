import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../../session/SessionManager.js';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../config/runtimeConfig.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../../session/model/state.js';
import { createCommandRegistry } from '../registry.js';
import { routeSlashCommand } from '../slashRouter.js';
import { runModelPresetCommand } from './presetCommand.js';
import { writeCatalogCache } from '../../models/catalogStore.js';
import { projectSessionModel } from '../../../session/model/projection.js';

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

it('saves a preset for legacy connections whose optional timestamps are synthesized during reads', async () => {
  const file = getUserRuntimeConfigPath();
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
  const global = fs.readFileSync(getUserRuntimeConfigPath());
  expect((await runModelPresetCommand(['apply', 'second'], context)).output).toContain('applied for this session');
  expect(readSessionModel(sessionId)).toMatchObject({ connectionId: 'second', model: 'next-model', connectionScope: 'session' });
  expect(projectSessionModel(getRuntimeConfig(home), sessionId).activeProviderConnectionId).toBe('second');
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
  writeSessionModel(sessionId, { ...before!, presets: { mixed: { roles: {
    default: { connectionId: 'fixture', provider: 'openai', model: 'next-model' },
    reviewer: { connectionId: 'fixture', provider: 'openai', model: 'unknown-model' },
  } } } }, readSessionModelEdit(sessionId));
  expect((await runModelPresetCommand(['apply', 'mixed'], context)).output).toContain('no verified catalogue entry');
  expect(readSessionModel(sessionId)?.model).toBe('base-model');
});
