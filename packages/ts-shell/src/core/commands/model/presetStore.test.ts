import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../../session/SessionManager.js';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../config/runtimeConfig.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../../session/model/state.js';
import { routeSlashCommand } from '../slashRouter.js';
import { runModelPresetCommand } from './presetCommand.js';
import { writeCatalogCache } from '../../models/catalogStore.js';
import { deleteProfilePreset, profilePresetsPath, readProfilePresets, saveProfilePreset } from './presetStore.js';

let home = '';
let sessionId = '';
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-preset-library-'));
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
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

function context() { return { cwd: home, projectRoot: home, sessionId, runtimeConfig: getRuntimeConfig(home) }; }

it('saves, lists and deletes a profile preset without touching the user configuration', async () => {
  await routeSlashCommand('/model base-model', { ...context(), interactive: true });
  const before = fs.readFileSync(getUserRuntimeConfigPath(), 'utf8');
  const saved = await runModelPresetCommand(['save', 'library', '--profile'], context());
  expect(saved.output).toContain("saved in this profile's library");
  expect(readProfilePresets().library.roles.default.model).toBe('base-model');
  expect(fs.readFileSync(getUserRuntimeConfigPath(), 'utf8')).toBe(before);
  expect((await runModelPresetCommand(['list'], context())).output).toContain('library [profile]');
  expect((await runModelPresetCommand(['delete', 'library'], context())).output).toContain('deleted');
  expect((await runModelPresetCommand(['delete', 'library'], context())).output).toContain('was not found');
  expect(fs.existsSync(profilePresetsPath())).toBe(true);
});

it('hides a profile entry whole when the session owns the same name', async () => {
  await routeSlashCommand('/model base-model', { ...context(), interactive: true });
  saveProfilePreset('shared', { roles: { default: { connectionId: 'fixture', provider: 'openai', model: 'next-model' } } });
  const selected = readSessionModel(sessionId)!;
  writeSessionModel(sessionId, { ...selected, presets: { shared: { roles: { default: {
    connectionId: 'fixture', provider: 'openai', model: 'base-model',
  } } } } }, readSessionModelEdit(sessionId));
  const listed = (await runModelPresetCommand(['list'], context())).output;
  expect(listed).toContain('shared [session] (hides profile entry)');
  const applied = await runModelPresetCommand(['apply', 'shared'], context());
  expect(applied.output).toContain('from the session owner');
  expect(readSessionModel(sessionId)?.model).toBe('base-model');
});

it('promotes a session preset and applies the promoted copy', async () => {
  await routeSlashCommand('/model next-model', { ...context(), interactive: true });
  await runModelPresetCommand(['save', 'draft'], context());
  expect((await runModelPresetCommand(['promote', 'draft'], context())).output).toContain("saved in this profile's library");
  expect(readProfilePresets().draft.roles.default.model).toBe('next-model');
  const selected = readSessionModel(sessionId)!;
  writeSessionModel(sessionId, { ...selected, presets: undefined }, readSessionModelEdit(sessionId));
  const applied = await runModelPresetCommand(['apply', 'draft'], context());
  expect(applied.output).toContain('from the profile owner');
  expect(readSessionModel(sessionId)?.model).toBe('next-model');
});

it('reports a corrupt library instead of silently treating it as empty', async () => {
  fs.mkdirSync(path.dirname(profilePresetsPath()), { recursive: true });
  fs.writeFileSync(profilePresetsPath(), '{"version":1,"presets":{"bad":{"roles":{"default":{"model":""}}}}}');
  expect((await runModelPresetCommand(['list'], context())).output).toContain('invalid preset');
  expect(() => deleteProfilePreset('bad')).toThrow(/invalid/i);
});
