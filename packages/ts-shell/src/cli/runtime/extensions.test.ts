import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { initialConfiguration } from '../../core/shell/configuration.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { ShellCommandRuntime } from '../../core/shell/command.js';
import { closeExtensionsFor, extensionManagerFor, installExtensionRuntime, isExtensionControl } from './extensions.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';

let directory: string; let context: ShellRuntimeContext;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'extension-view-'));
  vi.stubEnv('HOME', path.join(directory, 'home')); vi.stubEnv('USERPROFILE', path.join(directory, 'home'));
  vi.stubEnv('CHEERS_MARKETPLACES_FILE', path.join(directory, 'sources.json'));
  vi.stubEnv('CHEERS_EXTENSIONS_FILE', path.join(directory, 'registry.json'));
  context = { cwd: directory, projectRoot: directory, session: { id: 'view', createdAt: '2026-10-21', projectRoot: directory },
    runtimeConfig: getRuntimeConfig(directory) } as ShellRuntimeContext;
  context.configuration = initialConfiguration(context);
});
afterEach(async () => { await closeExtensionsFor(context); vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true }); });

function install() {
  const commands = new ShellCommandRuntime();
  const runtime = { commands, getPermissionScope: () => 'ask' } as unknown as ShellSessionRuntime;
  installExtensionRuntime(context, runtime, () => ({ sessionId: 'view', workspaceRoot: directory,
    hooks: new HookDispatcher(), emit: () => {}, permissionScope: 'ask' }));
  return commands;
}

it('exposes only the installed runtime and shares aliases without legacy fallback', () => {
  expect(extensionManagerFor(context)).toBeUndefined();
  install();
  expect(extensionManagerFor(context)!.read()).toMatchObject({ state: 'ready', snapshot: { items: [] } });
  for (const alias of ['plugin', 'plugins', 'extensions']) {
    expect(isExtensionControl(`/${alias} list`)).toBe(true);
    expect(isExtensionControl(`/${alias} cancel`)).toBe(true);
    expect(isExtensionControl(`/${alias} install source:one@1.0.0`)).toBe(false);
  }
});

it('captures binding and configuration admission, allows same-binding metadata refresh and refuses a root rebind', () => {
  install(); const view = extensionManagerFor(context)!;
  context.session = { ...context.session };
  expect(view.read().state).toBe('ready');
  context.cwd = path.join(directory, 'other'); fs.mkdirSync(context.cwd);
  expect(view.read()).toEqual({ state: 'stale' });
  context.cwd = directory;
  context.workspaceRevision = (context.workspaceRevision ?? 0) + 1;
  expect(view.read()).toEqual({ state: 'stale' });
});

it('keeps corrupt installation state unavailable and captures command cancellation before preparation', async () => {
  const commands = install();
  fs.writeFileSync(path.join(directory, 'registry.json'), '{');
  expect(extensionManagerFor(context)!.read()).toEqual({ state: 'unavailable' });
  fs.unlinkSync(path.join(directory, 'registry.json'));
  const view = extensionManagerFor(context)!; const current = view.read();
  if (current.state !== 'ready') throw new Error('Missing fixture snapshot');
  const pending = view.prepare(current.snapshot.version, { action: current.snapshot.install.id, input: 'source:one@1.0.0' });
  commands.current!.controller.abort();
  await expect(pending).rejects.toThrow();
  expect(fs.existsSync(path.join(directory, 'registry.json'))).toBe(false);
});
