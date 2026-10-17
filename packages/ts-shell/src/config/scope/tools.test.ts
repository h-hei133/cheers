import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath } from '../runtimeConfig.js';
import { projectTrust } from '../../core/security/trust/store.js';
import { assertScopeToolAllowed, captureToolScope, toolScopeBinding } from './tools.js';

let home: string;
let root: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-tools-'));
  root = path.join(home, 'repo');
  for (const dir of ['a', 'b', 'empty']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_MAX_TURNS', '');
  fs.mkdirSync(path.dirname(getUserRuntimeConfigPath()), { recursive: true });
  projectTrust.setProjectTrust(root, 'session-only');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

function project(value: unknown) { fs.writeFileSync(path.join(root, '.cheers.json'), JSON.stringify(value)); }

function binding() {
  project({
    allowedTools: ['read', 'write', 'bash'],
    denyRules: [{ tool: 'bash', pattern: 'rm -rf' }],
    pathRules: [
      { path: '.', settings: { allowedTools: ['read', 'write'], disabledTools: ['write'], denyRules: [{ tool: 'bash' }], enableMcpTools: false } },
      { path: 'a', settings: { allowedTools: ['read', 'bash'], disabledTools: [], denyRules: [], enableMcpTools: true } },
      { path: 'empty', settings: { allowedTools: [] } },
    ],
  });
  const selected = toolScopeBinding(getRuntimeConfig(root));
  expect(selected).toBeDefined();
  return selected!;
}

it('meets parent and per-target restrictions instead of letting a child rule widen them', () => {
  const scope = binding();
  const inside = captureToolScope(scope, [path.join(root, 'a/file')]);
  expect(inside.settings.allowedTools).toEqual(['read']);
  expect(inside.settings.disabledTools).toEqual(['write']);
  expect(inside.settings.enableMcpTools).toBe(false);
  expect(inside.settings.denyRules).toEqual([{ tool: 'bash', pattern: 'rm -rf' }, { tool: 'bash' }]);
  assertScopeToolAllowed(inside.settings, 'read');
  expect(() => assertScopeToolAllowed(inside.settings, 'write')).toThrow(/disabled/);
  expect(() => assertScopeToolAllowed(inside.settings, 'bash')).toThrow(/disabled/);
  expect(() => assertScopeToolAllowed(inside.settings, 'mcp__server__tool')).toThrow(/disabled/);
  const across = captureToolScope(scope, [path.join(root, 'a/file'), path.join(root, 'b/file')]);
  expect(across.settings.allowedTools).toEqual(['read']);
});

it('treats an empty allowlist as zero authorization, not as no restriction', () => {
  const inside = captureToolScope(binding(), [path.join(root, 'empty/file')]);
  expect(inside.settings.allowedTools).toEqual([]);
  for (const tool of ['read', 'write', 'bash']) expect(() => assertScopeToolAllowed(inside.settings, tool)).toThrow(/disabled/);
});

it('binds a bounded target set and rejects more work than one operation may carry', () => {
  const scope = binding();
  expect(() => captureToolScope(scope, Array.from({ length: 257 }, (_, index) => path.join(root, `target-${index}`))))
    .toThrow(/bounded/);
  expect(() => captureToolScope(scope, [])).toThrow(/bounded/);
});

it('invalidates captured restrictions when a rule prefix changes identity', () => {
  fs.symlinkSync('a', path.join(root, 'alias'));
  project({ pathRules: [{ path: 'alias', settings: { allowedTools: ['read'] } }] });
  const scope = toolScopeBinding(getRuntimeConfig(root))!;
  const captured = captureToolScope(scope, [path.join(root, 'a/file')]);
  expect(() => captured.assert()).not.toThrow();
  fs.mkdirSync(path.join(root, 'other')); fs.unlinkSync(path.join(root, 'alias')); fs.symlinkSync('other', path.join(root, 'alias'));
  expect(() => captured.assert()).toThrow(/identity/i);
});
