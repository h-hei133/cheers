import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath } from '../runtimeConfig.js';
import { projectTrust } from '../../core/security/trust/store.js';
import { scopeAdmission } from './admission.js';

let home: string;
let root: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-admit-'));
  root = path.join(home, 'repo'); fs.mkdirSync(path.join(root, 'a'), { recursive: true });
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_MAX_TURNS', '');
  fs.mkdirSync(path.dirname(getUserRuntimeConfigPath()), { recursive: true });
  projectTrust.setProjectTrust(root, 'session-only');
  fs.writeFileSync(path.join(root, '.cheers.json'), JSON.stringify({ pathRules: [{ path: 'a', settings: { maxTurns: 2 } }] }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

it('admits the captured path and reports a changed workspace root', () => {
  const config = getRuntimeConfig(root);
  const admission = scopeAdmission(config.configScopes, path.join(root, 'a'));
  expect(admission()).toBeUndefined();
  fs.renameSync(root, `${root}-retired`); fs.mkdirSync(root);
  expect(admission()).toMatch(/changed|verified/);
});

it('never selects another scope when the captured target is replaced', () => {
  const config = getRuntimeConfig(root);
  const admission = scopeAdmission(config.configScopes, path.join(root, 'a'));
  expect(admission()).toBeUndefined();
  fs.renameSync(path.join(root, 'a'), path.join(root, 'retired')); fs.mkdirSync(path.join(root, 'a'));
  expect(admission()).toMatch(/changed|verified/);
});

it('passes through when the configuration declares no path rules', () => {
  fs.writeFileSync(path.join(root, '.cheers.json'), '{}');
  const config = getRuntimeConfig(root);
  expect(config.configScopes).toBeUndefined();
  expect(scopeAdmission(undefined, root)()).toBeUndefined();
});
