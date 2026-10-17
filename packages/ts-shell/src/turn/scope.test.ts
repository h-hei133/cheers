import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import { getRuntimeConfig, getUserRuntimeConfigPath } from '../config/runtimeConfig.js';
import { projectTrust } from '../core/security/trust/store.js';
import { toolScopeBinding, type ToolScopeBinding } from '../config/scope/tools.js';
import { bindToolScope, forgetToolScope, toolScopePolicy } from './scope.js';
import { createToolHooks } from './tools.js';

let home: string;
let root: string;
let binding: ToolScopeBinding;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'turn-scope-'));
  root = path.join(home, 'repo');
  for (const dir of ['a', 'b', 'empty']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_MAX_TURNS', '');
  fs.mkdirSync(path.dirname(getUserRuntimeConfigPath()), { recursive: true });
  projectTrust.setProjectTrust(root, 'session-only');
  fs.writeFileSync(path.join(root, '.cheers.json'), JSON.stringify({ pathRules: [
    { path: 'a', settings: { denyRules: [{ tool: 'write' }] } },
    { path: 'empty', settings: { allowedTools: [] } },
  ] }));
  binding = toolScopeBinding(getRuntimeConfig(root))!;
  expect(binding).toBeDefined();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

function options(scope: ToolScopeBinding = binding) {
  return { sessionId: 'sess_scope', workspaceRoot: root, configScope: scope,
    hooks: { dispatch: async () => ({ decision: 'allow' as const }) } as unknown as HookDispatcher,
    emit: () => {} };
}

it('derives one policy from the actual target and refuses a changed selection', () => {
  const gate = options();
  const args: Record<string, unknown> = { path: 'a/file' };
  expect(toolScopePolicy('read', args, gate).denyRules).toEqual([{ tool: 'write' }]);
  args.path = 'b/file';
  expect(() => toolScopePolicy('read', args, gate)).toThrow(/selection changed/i);
  forgetToolScope(args);
  expect(toolScopePolicy('read', args, gate).denyRules).toEqual([]);
});

it('never lets a prepared copy carry another runtime scope', () => {
  const gate = options();
  const args: Record<string, unknown> = { path: 'a/file' };
  toolScopePolicy('read', args, gate);
  expect(() => bindToolScope(args, {}, options())).toThrow(/another tool runtime/i);
  expect(() => bindToolScope(args, {}, gate)).not.toThrow();
});

it('blocks a denied tool before any effect and reports the owning rule', async () => {

  const gate = options();
  const hooks = createToolHooks({ ...gate, permissionScope: 'allow-all' });
  expect(await hooks.beforeToolCall!({ call: { id: 'call_write', name: 'write', args: { path: 'a/file', content: 'x' } },
    args: { path: 'a/file', content: 'x' } }))
    .toMatchObject({ block: true, reason: expect.stringMatching(/Refused by a rule/) });
  expect(await hooks.beforeToolCall!({ call: { id: 'call_read', name: 'read', args: { path: 'b/file' } }, args: { path: 'b/file' } }))
    .toBeUndefined();
});

it('refuses a tool outside an empty allowlist', async () => {

  const hooks = createToolHooks({ ...options(), permissionScope: 'allow-all' });
  expect(await hooks.beforeToolCall!({ call: { id: 'call_read', name: 'read', args: { path: 'empty/file' } }, args: { path: 'empty/file' } }))
    .toMatchObject({ block: true, reason: expect.stringMatching(/disabled in this configuration scope/) });
});
