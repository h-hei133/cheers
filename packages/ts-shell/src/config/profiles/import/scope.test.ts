import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProfileContext, withProfile } from '../../../core/paths/profile/context.js';
import { getRuntimeConfig } from '../../runtimeConfig.js';
import { captureToolScope, assertScopeToolAllowed, toolScopeBinding } from '../../scope/tools.js';
import { createProfile } from '../context.js';
import { importRequest, planImport } from './plan.js';
import { applyImport } from './runtime.js';

let home: string;
let workspace: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(process.cwd(), '.profile-scope-'));
  workspace = path.join(home, 'workspace');
  fs.mkdirSync(workspace);
  vi.stubEnv('CHEERS_MAX_TURNS', '');
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

it.each(['default', 'named', 'legacy'])('preserves %s configuration rule targets across an explicit profile import', sourceKind => {
  const source = createProfileContext({ name: sourceKind === 'named' ? 'source' : 'default', homeDir: home, env: {} });
  const target = createProfile('target', source).profile;
  if (sourceKind === 'named') {
    workspace = path.join(source.root, 'workspace');
    fs.mkdirSync(workspace);
  }
  const directory = sourceKind === 'legacy' ? path.join(home, '.cheer') : source.root;
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'config.json');
  const original = JSON.stringify({ pathRules: [
    { path: path.relative(directory, workspace), settings: { allowedTools: [] } },
    { path: workspace, settings: { maxTurns: 2 } },
  ] });
  fs.writeFileSync(file, original);

  const plan = planImport(importRequest({ source: source.id, target: target.id, homeDir: home, workspace, categories: ['config'] }));
  expect(fs.existsSync(path.join(target.root, 'config.json'))).toBe(false);
  expect(plan.sources.some(item => item.path === file)).toBe(true);
  expect(applyImport(plan, plan.digest).status).toBe('complete');
  withProfile(target, () => {
    const binding = toolScopeBinding(getRuntimeConfig(workspace));
    expect(binding).toBeDefined();
    const scope = captureToolScope(binding!, [path.join(workspace, 'future.txt')]);
    expect(scope.settings.allowedTools).toEqual([]);
    expect(() => assertScopeToolAllowed(scope.settings, 'read')).toThrow('disabled');
  });
  const imported = JSON.parse(fs.readFileSync(path.join(target.root, 'config.json'), 'utf8'));
  expect(imported.pathRules.map((rule: { path: string }) => rule.path)).toEqual([workspace, workspace]);
  expect(fs.readFileSync(file, 'utf8')).toBe(original);
});

it('rejects a changed rule target after preview without publishing the old transformed configuration', () => {
  const source = createProfileContext({ name: 'default', homeDir: home, env: {} });
  const target = createProfile('target', source).profile;
  const file = path.join(source.root, 'config.json');
  fs.writeFileSync(file, JSON.stringify({ pathRules: [{ path: '../workspace', settings: { allowedTools: [] } }] }));
  const plan = planImport(importRequest({ source: source.id, target: target.id, homeDir: home, workspace, categories: ['config'] }));
  fs.writeFileSync(file, JSON.stringify({ pathRules: [{ path: '../elsewhere', settings: { allowedTools: [] } }] }));
  expect(applyImport(plan, plan.digest).status).toBe('rejected');
  expect(fs.existsSync(path.join(target.root, 'config.json'))).toBe(false);
});
