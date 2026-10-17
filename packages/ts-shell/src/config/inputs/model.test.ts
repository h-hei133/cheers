import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath } from '../runtimeConfig.js';
import { createConfigInputs } from './selection.js';
import { createShellRuntimeContext, refreshShellRuntimeConfig } from '../../core/shell/runtimeContext.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { SessionManager } from '../../session/SessionManager.js';
import { readSessionModel } from '../../session/model/state.js';
import { setModel } from '../../core/commands/model/selection.js';
import { writeCatalogCache } from '../../core/models/catalogStore.js';
import { defaultHookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { runModelPresetCommand } from '../../core/commands/model/presetCommand.js';
import type { CommandContext } from '../../core/commands/types.js';

let root: string;
let file: string;
let user: string;
const connection = { id: 'overlay', provider: 'openai', authType: 'api-key', apiKey: 'synthetic-input-key', model: 'base-model',
  status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'config-input-model-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
  user = getUserRuntimeConfigPath(); fs.mkdirSync(path.dirname(user), { recursive: true }); fs.writeFileSync(user, '{/* keep */"maxTurns":11}');
  file = path.join(root, 'overlay.json'); fs.writeFileSync(file, JSON.stringify({ activeProviderConnectionId: 'overlay', providerConnections: [connection] }));
  writeCatalogCache([{ id: 'openai', models: [{ id: 'base-model', reasoning: true }, { id: 'next-model', reasoning: true }] }]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
function fixture(): CommandContext {
  const inputs = createConfigInputs([{ path: file, source: 'user' }], root);
  const shell = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
    rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
    session: new SessionManager().createNew(root), runtimeConfig: getRuntimeConfig(root, undefined, inputs) });
  return { cwd: root, projectRoot: root, sessionId: shell.session.id, get runtimeConfig() { return shell.runtimeConfig; },
    readConfiguration: () => shell.configuration.current, refreshRuntimeConfig: () => refreshShellRuntimeConfig(shell), admission: configurationAdmission(shell) };
}

it('selects an overlay-only model and validates presets through the same fresh inputs without writing config', async () => {
  const context = fixture(); const before = fs.readFileSync(file); const primary = fs.readFileSync(user);
  expect(await setModel(['next-model'], context, false)).toContain('Model switched to next-model.');
  expect(readSessionModel(context.sessionId!)?.model).toBe('next-model');
  expect(context.readConfiguration?.().config.providerConnections[0].model).toBe('next-model');
  expect((await runModelPresetCommand(['save', 'input-preset'], context)).output).toContain('saved for this session');
  expect((await runModelPresetCommand(['apply', 'input-preset'], context)).output).toContain('applied for this session');
  expect(fs.readFileSync(file)).toEqual(before); expect(fs.readFileSync(user)).toEqual(primary);
});

it('fences an overlay connection replaced while a pre-switch hook is pending', async () => {
  const context = fixture();
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async input => {
    if (input.eventName === 'PreModelSwitch') fs.writeFileSync(file, JSON.stringify({ activeProviderConnectionId: 'overlay', providerConnections: [{ ...connection, apiKey: 'synthetic-replaced' }] }));
    return undefined;
  });
  expect(await setModel(['next-model'], context, false)).not.toContain('Model switched');
  expect(readSessionModel(context.sessionId!)).toBeUndefined();
  expect(fs.readFileSync(user, 'utf8')).toBe('{/* keep */"maxTurns":11}');
});

it('refuses global writes for an overlay-owned connection without copying effective credentials', async () => {
  const context = fixture();
  expect(await setModel(['next-model'], context, true)).toContain('read-only config input');
  expect(fs.readFileSync(user, 'utf8')).toBe('{/* keep */"maxTurns":11}');
  expect(readSessionModel(context.sessionId!)).toBeUndefined();
});
