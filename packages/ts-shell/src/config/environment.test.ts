import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CONFIG_FIELDS } from './runtimeConfig.js';
import { getRuntimeConfig, getUserRuntimeConfigPath } from './runtimeConfig.js';
import { projectTrust } from '../core/security/trust/store.js';

let home: string;
let root: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'config-env-'));
  root = path.join(home, 'repo'); fs.mkdirSync(root);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  fs.mkdirSync(path.dirname(getUserRuntimeConfigPath()), { recursive: true });
  projectTrust.setProjectTrust(root, 'session-only');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

function project(value: unknown) { fs.writeFileSync(path.join(root, '.cheers.json'), JSON.stringify(value)); }

it('declares environment inputs only on fields that accept the environment source', () => {
  const declared = Object.entries(CONFIG_FIELDS).filter(([, field]) => field.environment !== undefined);
  expect(declared.map(([key, field]) => [key, field.environment])).toEqual([['maxTurns', 'CHEERS_MAX_TURNS']]);
  for (const [, field] of declared) expect(field.sources).toContain('environment');
  expect(new Set(declared.map(([, field]) => field.environment)).size).toBe(declared.length);
});

it('applies a declared value above files and below runtime overrides', () => {
  project({ maxTurns: 4 });
  vi.stubEnv('CHEERS_MAX_TURNS', '9');
  const config = getRuntimeConfig(root);
  expect(config.maxTurns).toBe(9);
  expect(config.configProvenance.maxTurns.sources).toEqual(['environment']);
});

it('treats empty or whitespace as unset without a diagnostic', () => {
  project({ maxTurns: 4 });
  for (const value of ['', '   ']) {
    vi.stubEnv('CHEERS_MAX_TURNS', value);
    const config = getRuntimeConfig(root);
    expect(config.maxTurns).toBe(4);
    expect(config.configDiagnostics).toEqual([]);
  }
});

it('rejects malformed, fractional and out-of-range text without echoing it', () => {
  project({ maxTurns: 4 });
  for (const value of ['abc', '1.5', '0', '-3', '9007199254740992']) {
    vi.stubEnv('CHEERS_MAX_TURNS', value);
    const config = getRuntimeConfig(root);
    expect(config.configValidation.valid).toBe(false);
    expect(config.configDiagnostics.join(' ')).toContain('Config environment maxTurns: invalid-value');
    expect(config.configDiagnostics.join(' ')).not.toContain(value);
    expect(config.maxTurns).toBe(4);
  }
});
