import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getProjectConfigPath, getUserRuntimeConfigPath, getRuntimeConfig, readProjectRuntimeConfigFile, readUserRuntimeConfigFile } from '../../config/runtimeConfig.js';
import { createShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { SessionManager } from '../../session/SessionManager.js';
import { settingsCommandFor } from './settings.js';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-settings-'));
  vi.stubEnv('HOME', root);
  vi.stubEnv('USERPROFILE', root);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

function runtime() {
  const session = new SessionManager().createNew(root);
  return createShellRuntimeContext({
    cwd: root,
    originalCwd: root,
    projectRoot: root,
    rootMode: 'direct',
    targetPathBase: root,
    gitRoot: null,
    gitContext: { insideGit: false, root: null, branch: null, isClean: true },
    runtimeConfig: getRuntimeConfig(root),
    session,
  });
}

it('saves user and explicit project settings through the shared CAS writer', async () => {
  const context = runtime();
  const command = settingsCommandFor(context);
  const commandContext = { cwd: root, projectRoot: root, sessionId: context.session.id };

  const user = await command(['set', 'maxTurns', '7'], commandContext);
  expect(user.output).toContain('Saved to your user configuration');
  expect(readUserRuntimeConfigFile().maxTurns).toBe(7);

  const project = await command(['set', 'maxTurns', '9', '--project'], commandContext);
  expect(project.output).toContain('Saved to your project configuration');
  expect(readProjectRuntimeConfigFile(root).maxTurns).toBe(9);
  expect(readUserRuntimeConfigFile().maxTurns).toBe(7);

  const list = await command(['set', 'allowedTools', '["read","write"]'], commandContext);
  expect(list.output).toContain('Saved to your user configuration');
  expect(readUserRuntimeConfigFile().allowedTools).toEqual(['read', 'write']);
});

it('rejects invalid, unknown, and moved-session saves without writing either scope', async () => {
  const context = runtime();
  const command = settingsCommandFor(context);
  const commandContext = { cwd: root, projectRoot: root, sessionId: context.session.id };
  const userFile = getUserRuntimeConfigPath();
  const projectFile = getProjectConfigPath(root);

  expect((await command(['set', 'maxTurns', '0'], commandContext)).output).toContain('Invalid value');
  expect((await command(['set', 'unknown', 'true'], commandContext)).output).toContain('Unknown setting key');
  expect((await command(['set', 'maxTurns', '7'], { ...commandContext, sessionId: 'other-session' })).output)
    .toContain('session or project changed');
  expect(fs.existsSync(userFile)).toBe(false);
  expect(fs.existsSync(projectFile)).toBe(false);
});
