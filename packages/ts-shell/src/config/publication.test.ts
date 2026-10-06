import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath } from './runtimeConfig.js';
import { ConfigState, type ConfigBinding } from './state.js';

let root: string;
let file: string;
let binding: ConfigBinding;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'config-publish-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
  file = getUserRuntimeConfigPath(); fs.mkdirSync(path.dirname(file), { recursive: true });
  binding = { workspaceRoot: root, sessionId: 'one', trustRevision: 'trusted-1', overrides: { offline: true } };
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
const load = () => getRuntimeConfig(root, binding.overrides);

it('separates harmless warnings from invalid candidates without parsing diagnostic strings', () => {
  fs.writeFileSync(file, '{"unknown":true,"maxTurns":12}');
  expect(load().configValidation).toEqual({ valid: true, securityBlocked: false });
  fs.writeFileSync(file, '{"maxTurns":"wrong"}');
  expect(load().configValidation).toEqual({ valid: false, securityBlocked: false });
  fs.writeFileSync(file, '{"tui":{"diagrams":42}}');
  expect(load().configValidation).toEqual({ valid: false, securityBlocked: false });
  fs.writeFileSync(file, '{"allowedTools":false}');
  expect(load().configValidation).toEqual({ valid: false, securityBlocked: true });
});

it('retains the complete last-good snapshot on ordinary rejection and preserves launch overrides', () => {
  fs.writeFileSync(file, '{"maxTurns":12}');
  const state = new ConfigState(load(), binding);
  const before = state.current;
  fs.writeFileSync(file, '{"maxTurns":"wrong","offline":false}');
  const result = state.publish(state.begin(binding), load(), binding);
  expect(result.status).toBe('rejected');
  expect(state.current.config).toBe(before.config);
  expect(state.current.config.maxTurns).toBe(12);
  expect(state.current.config.offline).toBe(true);
  expect(state.current.admissionBlocked).toBe(false);
  expect(state.current.diagnostics.join(' ')).toContain('invalid-value');
});

it.each(['{"allowedTools":false}', '{broken', '{"schemaVersion":99}'])('publishes blocked admission without replacing accepted values: %s', text => {
  fs.writeFileSync(file, '{"maxTurns":12}');
  const state = new ConfigState(load(), binding); const before = state.current.config;
  fs.writeFileSync(file, text);
  expect(state.publish(state.begin(binding), load(), binding).status).toBe('rejected');
  expect(state.current.config).toBe(before); expect(state.current.admissionBlocked).toBe(true);
  fs.writeFileSync(file, '{"maxTurns":"wrong"}');
  state.publish(state.begin(binding), load(), binding);
  expect(state.current.admissionBlocked).toBe(true);
  fs.writeFileSync(file, '{"maxTurns":8}');
  expect(state.publish(state.begin(binding), load(), binding).status).toBe('applied');
  expect(state.current.admissionBlocked).toBe(false); expect(state.current.config.maxTurns).toBe(8);
});

it('rejects older tickets and ABA transitions before applying prepared resources', () => {
  const state = new ConfigState(load(), binding);
  const stale = state.begin(binding); const newer = state.begin(binding);
  state.publish(newer, load(), binding);
  const apply = vi.fn();
  expect(state.publish(newer, load(), binding, apply).status).toBe('superseded');
  expect(state.publish(stale, load(), binding, apply).status).toBe('superseded');
  const beforeTransition = state.begin(binding);
  state.transition({ ...binding, sessionId: 'two' });
  state.transition(binding);
  expect(state.publish(beforeTransition, load(), binding, apply).status).toBe('superseded');
  expect(apply).not.toHaveBeenCalled();
});

it('rejects resource preparation without calling a commit or blocking ordinary settings', () => {
  const state = new ConfigState(load(), binding); const before = state.current.config;
  const result = state.rejectCandidate(state.begin(binding), binding, ['Configured theme could not be prepared.']);
  expect(result.status).toBe('rejected'); expect(result.after).toBe(before);
  expect(state.current.admissionBlocked).toBe(false);
});

it('checks actual workspace, session, trust and overrides before resource application', () => {
  const state = new ConfigState(load(), binding);
  for (const changed of [ { workspaceRoot: root + '/other' }, { sessionId: 'two' }, { trustRevision: 'trusted-2' }, { overrides: { offline: false } } ]) {
    const ticket = state.begin(binding); const apply = vi.fn();
    expect(state.publish(ticket, load(), { ...binding, ...changed }, apply).status).toBe('superseded');
    expect(apply).not.toHaveBeenCalled();
  }
});

it('freezes published settings and reports unexpected resource application as unverified', () => {
  const state = new ConfigState(load(), binding); const before = state.current;
  fs.writeFileSync(file, '{"maxTurns":7}');
  const result = state.publish(state.begin(binding), load(), binding, () => { throw new Error('private resource detail'); });
  expect(result.status).toBe('application-unverified');
  expect(state.current.config).toBe(before.config);
  expect(JSON.stringify(result)).not.toContain('private resource detail');
  expect(state.current.admissionBlocked).toBe(true);
  expect(Object.isFrozen(state.current.config.denyRules)).toBe(true);
});
