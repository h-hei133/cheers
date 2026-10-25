import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runTrustCommand } from '../../commands/trustCommandRuntime.js';
import { projectTrust } from './store.js';
import { getRuntimeConfig } from '../../../config/runtimeConfig.js';
import { ConfigState } from '../../../config/state.js';
import { configurationAdmission, configurationBinding, refreshConfiguration } from '../../shell/configuration.js';
import * as files from '../../../session/store/sessionFileStore.js';
import * as documents from '../../../config/document.js';

let home: string;
let root: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'trust-command-')); root = path.join(home, 'workspace');
  fs.mkdirSync(path.join(root, '.agents'), { recursive: true }); fs.mkdirSync(path.join(root, 'nested'));
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });
function host() {
  const source = { projectRoot: root, session: { id: 'trust-session' }, runtimeConfigOverrides: { offline: true } };
  return { ...source, configuration: new ConfigState(getRuntimeConfig(root, source.runtimeConfigOverrides), configurationBinding(source)) };
}

it('detects and reports the directory MCP source before a trust decision', async () => {
  const file = path.join(root, '.cheers', 'mcp.json'); fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, '{"mcpServers":{"local":{"command":"synthetic-server"}}}');
  expect(projectTrust.hasSensitiveProjectResources(root)).toBe(true);
  const result = await runTrustCommand([], { cwd: root });
  expect(result.output).toContain('declares resources that would run');
  expect(result.output).toContain(`mcp config: ${file}`);
  expect(result.output).not.toContain('No project resources');
});

it('reports the new effective decision for the configured workspace and refreshes its binding', async () => {
  const context = host(); const oldAdmission = configurationAdmission(context); const background = context.configuration.backgroundSignal;
  const result = await runTrustCommand(['off'], { cwd: path.join(root, 'nested'), projectRoot: root,
    runtimeConfig: context.configuration.current.config, refreshRuntimeConfig: () => refreshConfiguration(context) });
  expect(result.output).toContain('Saved decision verified on disk');
  expect(result.output).toContain('Decision: untrusted'); expect(projectTrust.decision(root)).toBe('untrusted');
  expect(oldAdmission()).toBeDefined(); expect(configurationAdmission(context)()).toBeUndefined();
  expect(background.aborted).toBe(true); expect(context.configuration.current.config.offline).toBe(true);
});

it('blocks both captured and newly created admissions after external trust change until valid reload', () => {
  const context = host(); const old = configurationAdmission(context);
  projectTrust.setProjectTrust(root, 'untrusted');
  expect(old()).toBeDefined(); expect(configurationAdmission(context)()).toContain('reload configuration');
  fs.writeFileSync(path.join(root, '.cheers.json'), '{broken');
  expect(refreshConfiguration(context).status).toBe('rejected'); expect(configurationAdmission(context)()).toBeDefined();
  fs.rmSync(path.join(root, '.cheers.json'));
  expect(refreshConfiguration(context).status).toBe('applied'); expect(configurationAdmission(context)()).toBeUndefined();
});

it('reports process scope without pretending to save the grant durably', async () => {
  await runTrustCommand(['off'], { cwd: root }); const file = path.join(home, '.cheers', 'trust.json'); const before = fs.readFileSync(file);
  const result = await runTrustCommand(['session'], { cwd: root });
  expect(result.output).toContain('Scope: this process only'); expect(result.output).toContain('Decision: trusted');
  expect(result.output).not.toContain('verified on disk'); expect(fs.readFileSync(file)).toEqual(before);
});

it('distinguishes recorded child allowance from an effective inherited refusal', async () => {
  projectTrust.setProjectTrust(home, 'untrusted');
  const result = await runTrustCommand(['on'], { cwd: root });
  expect(result.output).toContain("Recorded 'trusted'"); expect(result.output).toContain('Decision: untrusted');
  expect(projectTrust.isProjectTrusted(root)).toBe(false);
});

it('reports suppressed writes as unverified without a recorded or applied claim', async () => {
  await runTrustCommand(['off'], { cwd: root });
  vi.spyOn(files, 'writeTextFileAtomic').mockImplementation(() => {});
  const refreshRuntimeConfig = vi.fn(); const result = await runTrustCommand(['on'], { cwd: root, refreshRuntimeConfig });
  expect(result.output).toContain('verification-failed'); expect(result.output).not.toContain('Recorded');
  expect(refreshRuntimeConfig).not.toHaveBeenCalled(); expect(projectTrust.decision(root)).toBe('untrusted');
});

it('reports an unreadable decision separately from an explicit refusal', async () => {
  const file = path.join(home, '.cheers', 'trust.json'); fs.mkdirSync(path.dirname(file)); fs.writeFileSync(file, '{SENSITIVE_BROKEN_VALUE');
  const result = await runTrustCommand(['status'], { cwd: root });
  expect(result.output).toContain('Decision: unavailable'); expect(result.output).not.toContain('SENSITIVE_BROKEN_VALUE');
  expect(projectTrust.isProjectUntrusted(root)).toBe(true);
});

it('invalidates accepted configuration when a transient read failure evicts a process grant', () => {
  projectTrust.setProjectTrust(root, 'untrusted'); projectTrust.setProjectTrust(root, 'session-only');
  const context = host(); const before = projectTrust.revision(); const admission = configurationAdmission(context);
  const read = vi.spyOn(documents, 'readConfigSnapshot').mockImplementationOnce(() => { throw new Error('PRIVATE_IO_FAILURE'); });
  expect(projectTrust.decision(root)).toBe('unavailable'); read.mockRestore();
  expect(projectTrust.revision()).not.toBe(before); expect(projectTrust.decision(root)).toBe('untrusted');
  expect(admission()).toBeDefined(); expect(configurationAdmission(context)()).toContain('reload configuration');
  expect(refreshConfiguration(context).status).toBe('applied'); expect(configurationAdmission(context)()).toBeUndefined();
});

it.each(['file', 'ancestor'])('blocks admission before another trust decision read when a missing source becomes a dangling %s link', kind => {
  projectTrust.setProjectTrust(root, 'session-only');
  const context = host(); const before = projectTrust.revision(); const admission = configurationAdmission(context);
  const current = path.join(home, '.cheers');
  if (kind === 'file') { fs.mkdirSync(current, { recursive: true }); fs.symlinkSync(path.join(home, 'missing'), path.join(current, 'trust.json')); }
  else { fs.rmSync(current, { recursive: true, force: true }); fs.symlinkSync(path.join(home, 'missing'), current, 'dir'); }
  expect(admission()).toBeDefined(); expect(configurationAdmission(context)()).toContain('reload configuration');
  expect(projectTrust.revision()).not.toBe(before); expect(projectTrust.decision(root)).toBe('unavailable');
});
