import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAgentSession, DefaultResourceLoader, type ExtensionAPI, type ExtensionUiHost } from '../../index.js';
import { configurationAdmission, refreshConfiguration } from '../../core/shell/configuration.js';
import { applyShellSubstrateTransition, switchActiveSession } from '../../core/shell/runtimeContext.js';
import { projectTrust } from '../../core/security/projectTrust.js';

let root: string;
beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(temporary, { recursive: true });
  root = fs.mkdtempSync(path.join(temporary, 'sdk-ui-retirement-'));
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
  vi.stubEnv('CHEERS_PROVIDER_MODE', 'synthetic');
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it.each(['session', 'workspace', 'trust', 'substrate'] as const)(
  'keeps retained SDK UI retired after %s changes and the original binding returns', async kind => {
    let api!: ExtensionAPI;
    const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true,
      extensionFactories: [value => { api = value; }] });
    await loader.reload();
    let late!: (value: string | undefined) => void;
    const signals: Array<AbortSignal | undefined> = [];
    const input = vi.fn<NonNullable<ExtensionUiHost['input']>>((_title, _placeholder, options) => {
      signals.push(options?.signal);
      return new Promise(resolve => { late = resolve; });
    });
    const notify = vi.fn();
    const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all', ui: { input, notify } });
    try {
      const pending = api.ui.input('Original dialog');
      const observed = pending.catch(() => undefined);
      await vi.waitFor(() => expect(input).toHaveBeenCalledTimes(1));
      const context = session.runtimeContext;
      const original = context.session;
      const binding = context.configuration.current.binding;
      const admitted = configurationAdmission(context);
      if (kind === 'session') {
        switchActiveSession(context, session.sessionManager.createNew(root, { activate: false }));
        switchActiveSession(context, original);
      } else if (kind === 'workspace') {
        const other = path.join(root, 'other'); fs.mkdirSync(other);
        applyShellSubstrateTransition(context, { cwd: other, projectRoot: other });
        applyShellSubstrateTransition(context, { cwd: root, projectRoot: root });
      } else if (kind === 'trust') {
        projectTrust.setProjectTrust(root, 'untrusted');
        expect(refreshConfiguration(context).status).toBe('applied');
        projectTrust.setProjectTrust(root, 'trusted');
        expect(refreshConfiguration(context).status).toBe('applied');
      } else {
        context.configuration.transition(binding);
        expect(refreshConfiguration(context).status).toBe('applied');
      }
      expect(configurationAdmission(context)()).toBeUndefined();
      expect(admitted()).toBeDefined();
      expect(context.session.id).toBe(original.id);
      expect(context.projectRoot).toBe(root);
      expect(context.configuration.current.binding).toMatchObject({ workspaceRoot: binding.workspaceRoot, sessionId: binding.sessionId });
      expect(signals[0]?.aborted).toBe(true);
      expect(await observed).toBeUndefined();
      late('Late original answer');
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(await api.ui.input('After restoration')).toBeUndefined();
      api.ui.notify('After restoration');
      expect(input).toHaveBeenCalledTimes(1);
      expect(notify).not.toHaveBeenCalled();
    } finally { await session.dispose(); }
  },
);

it.each([false, true])('keeps rejected publication UI unavailable until correction, with an unobserved accepted publication: %s', async unobserved => {
  let api!: ExtensionAPI;
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true,
    extensionFactories: [value => { api = value; }] });
  await loader.reload();
  const confirm = vi.fn(async () => true);
  const notify = vi.fn();
  const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all', ui: { confirm, notify } });
  try {
    expect(await api.ui.confirm('Before rejection', 'Ready?')).toBe(true);
    const state = session.runtimeContext.configuration;
    const before = state.current;
    if (unobserved) expect(state.publish(state.begin(before.binding), before.requested, before.binding).status).toBe('applied');
    expect(state.rejectCandidate(state.begin(before.binding), before.binding, ['Rejected fixture candidate']).status).toBe('rejected');
    expect(state.current.admissionBlocked).toBe(false);
    expect(configurationAdmission(session.runtimeContext)()).toBeUndefined();
    expect(await api.ui.confirm('After rejection', 'Ready?')).toBe(false);
    api.ui.notify('Rejected direct call');
    expect(state.publish(state.begin(before.binding), before.requested, before.binding).status).toBe('applied');
    expect(await api.ui.confirm('After correction', 'Ready?')).toBe(true);
    api.ui.notify('Corrected direct call');
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('Corrected direct call', undefined);
  } finally { await session.dispose(); }
});

it.each([
  ['candidate', false], ['candidate', true], ['invalid', false], ['application', false],
] as const)('requires an explicit new binding after a blocked %s is corrected, with blocked UI access: %s', async (kind, observed) => {
  let api!: ExtensionAPI;
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true,
    extensionFactories: [value => { api = value; }] });
  await loader.reload();
  const confirm = vi.fn(async () => true);
  const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all', ui: { confirm } });
  try {
    expect(await api.ui.confirm('Before blocked candidate', 'Ready?')).toBe(true);
    const state = session.runtimeContext.configuration;
    const before = state.current;
    const substrate = state.substrateRevision;
    if (kind === 'application') {
      expect(state.publish(state.begin(before.binding), before.requested, before.binding, () => { throw new Error('Fixture resource failure'); }).status)
        .toBe('application-unverified');
    } else if (kind === 'invalid') {
      expect(state.publish(state.begin(before.binding), { ...before.requested,
        configValidation: { valid: false, securityBlocked: true }, configDiagnostics: ['Invalid fixture security value; tools blocked.'] }, before.binding).status)
        .toBe('rejected');
    } else {
      expect(state.rejectCandidate(state.begin(before.binding), before.binding, ['Blocked fixture candidate'], true).status).toBe('rejected');
    }
    expect(state.substrateRevision).toBe(substrate);
    expect(configurationAdmission(session.runtimeContext)()).toBeDefined();
    if (observed) expect(await api.ui.confirm('Blocked candidate', 'Ready?')).toBe(false);
    expect(state.publish(state.begin(before.binding), before.requested, before.binding).status).toBe('applied');
    expect(state.substrateRevision).toBe(substrate);
    expect(configurationAdmission(session.runtimeContext)()).toBeUndefined();
    expect(await api.ui.confirm('After correction', 'Ready?')).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
    const release = session.bindUi({ confirm });
    expect(await api.ui.confirm('Explicit new binding', 'Ready?')).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
    release();
  } finally { await session.dispose(); }
});
