import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath, type RuntimeConfigFile } from '../../../config/runtimeConfig.js';
import { catalogCachePath, userCatalogPath } from '../../models/catalogStore.js';
import * as refresh from '../../models/catalogRefresh.js';
import type { RefreshResult } from '../../models/catalogRefresh.js';
import { createShellRuntimeContext, refreshShellRuntimeConfig } from '../../shell/runtimeContext.js';
import { configurationAdmission } from '../../shell/configuration.js';
import { ShellCommandRuntime } from '../../shell/command.js';
import { resolveCliCredential } from '../../../cli/provider/cliProviderRuntimeBridge.js';
import { SessionManager } from '../../../session/SessionManager.js';
import { readModelCatalog, runModelCommand } from '../modelCommandRuntime.js';
import type { CommandContext } from '../types.js';

type RefreshOptions = NonNullable<Parameters<typeof refresh.refreshCatalog>[1]>;

let root: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  root = fs.mkdtempSync('/tmp/cheers-test/model-refresh-command-');
  vi.stubEnv('HOME', root);
  vi.stubEnv('USERPROFILE', root);
  vi.stubEnv('CHEERS_TEST_ROOT', root);
  const file = getUserRuntimeConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const connection = { authType: 'api-key' as const, apiKey: 'saved-synthetic',
    createdAt: '2026-01-01', updatedAt: '2026-01-01' };
  const settings: RuntimeConfigFile = { provider: 'google', activeProviderConnectionId: 'main',
    maxOutputTokens: 1024, reserveTokens: 0,
    providerConnections: [{ ...connection, id: 'main', provider: 'google',
      model: 'chosen', baseUrl: 'https://chosen.invalid' }],
  };
  fs.writeFileSync(file, JSON.stringify(settings));
  const providers = {
    google: { endpoint: 'openai-compatible', models: [
      { id: 'chosen', contextWindow: 16000, maxTokens: 2048 }, { id: 'accepted-only' },
    ] },
    auxiliary: { runtime: 'openai-compatible', baseUrl: 'https://auxiliary.invalid',
      models: [{ id: 'auxiliary-model' }] },
  };
  fs.writeFileSync(userCatalogPath(), JSON.stringify({ providers: { google: providers.google } }));
  fs.writeFileSync(catalogCachePath(), JSON.stringify({ providers, etag: '"accepted"',
    indexUrl: 'https://models.dev/api.json' }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const shell = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root,
    targetPathBase: root, rootMode: 'direct', gitRoot: null,
    gitContext: { insideGit: false, root: null, branch: null, isClean: null },
    session: new SessionManager().createNew(root), runtimeConfig: getRuntimeConfig(root),
    resolveConfigTarget: config => resolveCliCredential(config,
      { provider: 'google', apiKey: 'cli-synthetic' }, {}) });
  const apply = vi.fn((scope?: 'catalog') => refreshShellRuntimeConfig(shell, scope));
  const context: CommandContext = { cwd: root, projectRoot: root, sessionId: shell.session.id,
    runtimeConfig: shell.runtimeConfig, readConfiguration: () => shell.configuration.current,
    resolveConfigTarget: shell.resolveConfigTarget, admission: configurationAdmission(shell),
    refreshRuntimeConfig: apply };
  return { shell, context, apply };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function saved(): RefreshResult {
  return { ok: true, providers: 2, models: 3, cachePath: catalogCachePath(), cacheOutcome: 'saved' };
}

it.each(['saved', 'unknown'] as const)('retains an explicit %s storage failure in the refreshing data API', async outcome => {
  const { context, apply } = fixture();
  const response: RefreshResult = outcome === 'saved'
    ? { ...saved(), ok: false, errorKind: 'storage', error: 'Catalogue cache lock cleanup is unverified.' }
    : { ok: false, providers: 0, models: 0, cacheOutcome: 'unknown', errorKind: 'storage',
      error: 'Catalogue cache write outcome is unverified.' };
  vi.spyOn(refresh, 'refreshCatalog').mockResolvedValue(response);
  const result = await readModelCatalog(true, context.sessionId, context.runtimeConfig, context);
  expect(result).toMatchObject({ refresh: response });
  expect(result.models).toContain('accepted-only');
  expect(apply).not.toHaveBeenCalled();
});

it.each(['abort', 'admission', 'read'] as const)('keeps the saved refresh receipt when the data read fails after %s', async cause => {
  const { context, apply } = fixture();
  const controller = new AbortController();
  let refusal: string | undefined;
  vi.spyOn(refresh, 'refreshCatalog').mockImplementation(async () => {
    if (cause === 'abort') controller.abort();
    else if (cause === 'admission') refusal = 'Original binding retired.';
    return saved();
  });
  const failure = await readModelCatalog(true, context.sessionId, context.runtimeConfig, {
    ...context, signal: controller.signal, admission: () => refusal,
    readConfiguration: cause === 'read' ? () => { throw new Error('PRIVATE_READ_DETAIL'); } : context.readConfiguration,
  }).catch((error: unknown) => error);
  expect(failure).toMatchObject({ refresh: saved(), refreshNotice: expect.stringContaining('Catalogue') });
  expect(failure).not.toHaveProperty('models');
  expect(failure).toHaveProperty('name', cause === 'abort' ? 'AbortError' : 'CatalogReadError');
  expect(String(failure)).not.toContain('PRIVATE_READ_DETAIL');
  if (cause === 'abort') expect(controller.signal.reason).toHaveProperty('name', 'AbortError');
  if (cause !== 'read') expect(apply).not.toHaveBeenCalled();
});

it.each(['saved', 'unknown'] as const)('keeps an %s result when final data acquisition fails', async outcome => {
  const { context, apply } = fixture();
  const result: RefreshResult = { ...saved(), ok: false, cacheOutcome: outcome, errorKind: 'storage',
    error: 'Catalogue storage outcome needs review.' };
  vi.spyOn(refresh, 'refreshCatalog').mockResolvedValue(result);
  const failure = await readModelCatalog(true, context.sessionId, context.runtimeConfig, {
    ...context, readConfiguration: () => { throw new Error('PRIVATE_READ_DETAIL'); },
  }).catch((error: unknown) => error);
  expect(failure).toMatchObject({ refresh: result, refreshNotice: expect.stringContaining('Catalogue'), name: 'CatalogReadError' });
  expect(String(failure)).not.toContain('PRIVATE_READ_DETAIL');
  expect(apply).not.toHaveBeenCalled();
});

it('keeps a confirmed save notice when list acquisition fails after refresh', async () => {
  const { context, apply } = fixture();
  let refreshed = false;
  vi.spyOn(refresh, 'refreshCatalog').mockImplementation(async () => { refreshed = true; return saved(); });
  const result = await runModelCommand(['list', 'google', '--refresh'], {
    ...context, readConfiguration: () => {
      if (refreshed) throw new Error('PRIVATE_READ_DETAIL');
      return context.readConfiguration!();
    },
  });
  expect(result.output).toContain('Catalogue refreshed: 2 providers, 3 models');
  expect(result.output).toContain('Catalogue list is unavailable.');
  expect(result.output).not.toContain('PRIVATE_READ_DETAIL');
  expect(apply).toHaveBeenCalledOnce();
});

it.each(['data', 'refresh', 'list'] as const)('keeps the saved receipt when post-refresh admission throws through %s', async route => {
  const { context, apply } = fixture();
  let published = false;
  vi.spyOn(refresh, 'refreshCatalog').mockImplementation(async () => { published = true; return saved(); });
  const captured: CommandContext = { ...context, admission: () => {
    if (published) throw new Error('PRIVATE_ADMISSION_DETAIL');
    return undefined;
  } };
  if (route === 'data') {
    const error = await readModelCatalog(true, context.sessionId, context.runtimeConfig, captured).catch((failure: unknown) => failure);
    expect(error).toMatchObject({ refresh: saved(), refreshNotice: expect.stringContaining('not applied'), name: 'CatalogReadError' });
    expect(String(error)).not.toContain('PRIVATE_ADMISSION_DETAIL');
  } else {
    const result = await runModelCommand(route === 'refresh' ? ['refresh'] : ['list', 'google', '--refresh'], captured);
    expect(result.output).toContain('Catalogue refreshed: 2 providers, 3 models');
    expect(result.output).toContain('not applied');
    expect(result.output).not.toContain('PRIVATE_ADMISSION_DETAIL');
  }
  expect(apply).not.toHaveBeenCalled();
});

// Both public routes must stay registered until refresh settlement,
// configuration publication and (for list) the resulting catalogue read finish.
it.each([
  ['refresh', ['refresh']],
  ['list --refresh', ['list', 'google', '--refresh']],
] as const)('keeps %s registered through refresh, application and rendering', async (_name, args) => {
  const { context, apply } = fixture();
  const commands = new ShellCommandRuntime();
  const entered = deferred(), finishOwner = deferred();
  let options: RefreshOptions | undefined;
  let ownerSignal: AbortSignal | undefined;
  let ownerSettled = false, appliedWhileActive = false;
  const reads: boolean[] = [], readsAfterRefresh: boolean[] = [], admissionChecks: boolean[] = [];
  const register = vi.fn(<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> =>
    commands.run(signal => { ownerSignal = signal; return operation(signal); }));
  vi.spyOn(refresh, 'refreshCatalog').mockImplementation(async (_url, supplied) => {
    options = supplied;
    entered.resolve();
    await finishOwner.promise; // Includes any cleanup owned by refreshCatalog.
    ownerSettled = true;
    return saved();
  });
  const pending = runModelCommand([...args], { ...context, runCancellable: register,
    admission: () => {
      admissionChecks.push(Boolean(commands.current));
      return context.admission!();
    },
    readConfiguration: () => {
      reads.push(Boolean(commands.current));
      if (ownerSettled) readsAfterRefresh.push(Boolean(commands.current));
      return context.readConfiguration!();
    },
    refreshRuntimeConfig: scope => {
      appliedWhileActive = Boolean(commands.current);
      return apply(scope);
    },
  });
  try {
    await entered.promise;
    expect(register).toHaveBeenCalledOnce();
    expect(commands.current).toBeDefined();
    expect(options?.signal).toBe(ownerSignal);
    expect(ownerSignal).toBeDefined();
    expect(apply).not.toHaveBeenCalled();
    const original = commands.current;
    await Promise.resolve();
    expect(commands.current).toBe(original);
  } finally {
    finishOwner.resolve();
    await pending;
  }
  const result = await pending;
  expect(appliedWhileActive).toBe(true);
  expect(apply).toHaveBeenCalledOnce();
  expect(apply).toHaveBeenCalledWith('catalog');
  expect(admissionChecks.length).toBeGreaterThan(0);
  expect(admissionChecks.every(Boolean)).toBe(true);
  if (args[0] === 'list') {
    expect(reads.every(Boolean)).toBe(true);
    expect(readsAfterRefresh.length).toBeGreaterThan(0);
    expect(readsAfterRefresh.every(Boolean)).toBe(true);
    expect(result.output).toContain('accepted-only');
  }
  expect(commands.current).toBeUndefined();
});

// A forwarding test, deliberately NOT a real-store-fence proof. Replacing
// the mutable context callback must not renew authority of the pending refresh.
it('forwards the original admission callback, still live after asynchronous refresh work', async () => {
  const { context, apply } = fixture();
  const entered = deferred(), reachFence = deferred();
  let refusal: string | undefined;
  const original = vi.fn(() => refusal), successor = vi.fn(() => undefined);
  const suppliedContext: Omit<CommandContext, 'admission'> & { admission?: CommandContext['admission'] }
    = { ...context, admission: original };
  let forwarded: RefreshOptions | undefined, fenceReason: string | undefined;
  vi.spyOn(refresh, 'refreshCatalog').mockImplementation(async (_url, options) => {
    forwarded = options;
    entered.resolve();
    await reachFence.promise;
    fenceReason = forwarded?.admission?.();
    const result: RefreshResult = { ok: false, providers: 0, models: 0,
      cacheOutcome: 'unchanged', errorKind: 'admission',
      error: fenceReason ?? 'Original admission was not forwarded' };
    return result;
  });
  const pending = runModelCommand(['refresh'], suppliedContext);
  try {
    await entered.promise;
    refusal = 'original configuration binding changed';
    suppliedContext.admission = successor;
  } finally {
    reachFence.resolve();
    await pending;
  }
  const result = await pending;
  expect(forwarded?.admission).toBe(original);
  expect(fenceReason).toBe('original configuration binding changed');
  expect(successor).not.toHaveBeenCalled();
  expect(result.output).toContain('original configuration binding changed');
  expect(apply).not.toHaveBeenCalled();
});

// Producer's nonempty 304 sample: consumer must use its real counts/path
// and describe unchanged content rather than inventing a fresh write.
it('renders 304 unchanged with nonempty cached counts and a real cache path', async () => {
  const { context } = fixture();
  const response: RefreshResult = { ...saved(), cacheOutcome: 'unchanged', notModified: true,
    etag: '"accepted"' };
  vi.spyOn(refresh, 'refreshCatalog').mockResolvedValue(response);
  const result = await runModelCommand(['list', 'google', '--refresh'], context);
  expect(result.output).toMatch(/unchanged|not modified/i);
  expect(result.output).toContain('2 providers');
  expect(result.output).toContain('3 models');
  expect(result.output).toContain(catalogCachePath());
  expect(result.output).not.toMatch(/undefined|0 providers|0 models|catalogue refreshed|catalogue saved/i);
  expect(result.output).toContain('accepted-only');
});

// Explicit unchanged failure preserves the accepted publication. Legacy
// custom results that lack cacheOutcome may report failure but no cache verdict.
it('does not apply failed refreshes or infer cache state from a legacy failure', async () => {
  const { shell, context, apply } = fixture();
  const accepted = shell.configuration.current;
  const explicit: RefreshResult = { ok: false, providers: 0, models: 0, cacheOutcome: 'unchanged',
    errorKind: 'network', error: 'Catalogue index is unavailable.' };
  vi.spyOn(refresh, 'refreshCatalog').mockResolvedValueOnce(explicit).mockResolvedValueOnce({
    ok: false, providers: 0, models: 0, error: 'Catalogue index is unavailable.',
  });
  const failure = await runModelCommand(['list', 'google', '--refresh'], context);
  expect(failure.output).toMatch(/refresh failed/i);
  expect(failure.output).toContain('accepted-only');
  expect(shell.configuration.current).toBe(accepted);
  const legacy = await runModelCommand(['refresh'], context);
  expect(legacy.output).toMatch(/refresh failed/i);
  expect(legacy.output).not.toMatch(/unchanged|saved|applied/i);
  expect(apply).not.toHaveBeenCalled();
  expect(shell.configuration.current).toBe(accepted);
});

// A writer started but has no acknowledgement. Accepted-session state is
// separately preserved; it cannot be used to assert cache bytes were unchanged.
it('reports an unknown write without claiming unchanged or saved and without applying', async () => {
  const { shell, context, apply } = fixture();
  const accepted = shell.configuration.current;
  const response: RefreshResult = { ok: false, providers: 0, models: 0, cacheOutcome: 'unknown',
    errorKind: 'storage', error: 'Catalogue cache write outcome is unverified.' };
  vi.spyOn(refresh, 'refreshCatalog').mockResolvedValue(response);
  const result = await runModelCommand(['list', 'google', '--refresh'], context);
  expect(result.output).toMatch(/unknown|unverified/i);
  expect(result.output).not.toMatch(/unchanged|saved|catalogue refreshed|catalogue applied/i);
  expect(result.output).not.toMatch(/0 providers|0 models|undefined/);
  expect(result.output).toContain('accepted-only');
  expect(apply).not.toHaveBeenCalled();
  expect(shell.configuration.current).toBe(accepted);
});

// Confirmed persistence and unverified cleanup are separate facts. Preserve
// the warning and saved receipt while declining publication and full success.
it('retains a confirmed save with its unverified lock cleanup warning and does not apply', async () => {
  const { shell, context, apply } = fixture();
  const accepted = shell.configuration.current;
  const response: RefreshResult = { ...saved(), ok: false, errorKind: 'storage',
    error: 'Catalogue cache lock cleanup is unverified.' };
  vi.spyOn(refresh, 'refreshCatalog').mockResolvedValue(response);
  const result = await runModelCommand(['refresh'], context);
  expect(result.output).toMatch(/saved/i);
  expect(result.output).toMatch(/lock.*cleanup/i);
  expect(result.output).toMatch(/unverified|not verified|unknown/i);
  expect(result.output).toContain(catalogCachePath());
  expect(result.output).toContain('2 providers');
  expect(result.output).toContain('3 models');
  expect(result.output).not.toMatch(/catalogue refreshed|catalogue applied|saved for the next load|unchanged/i);
  expect(apply).not.toHaveBeenCalled();
  expect(shell.configuration.current).toBe(accepted);
});

// Negative transport guard only: throwing fetch cannot access a provider
// and supplies no Response. Accept either AbortError or explicit cancellation.
it.each([
  ['without a host', false, ['refresh']],
  ['inside a host', true, ['list', 'google', '--refresh']],
] as const)('rejects original pre-cancellation %s before any network call', async (_name, withHost, args) => {
  const { context, apply } = fixture();
  const original = new AbortController();
  original.abort();
  const commands = new ShellCommandRuntime();
  const runCancellable: CommandContext['runCancellable'] = withHost
    ? operation => commands.run(operation) : undefined;
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
    new Error('A pre-cancelled refresh reached network acquisition.'));
  const outcome = await runModelCommand([...args], { ...context, signal: original.signal, runCancellable })
    .then(value => ({ value }), error => ({ error }));
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
  if ('error' in outcome) expect(outcome.error).toMatchObject({ name: 'AbortError' });
  else {
    expect(outcome.value.output).toMatch(/cancelled|canceled|aborted/i);
    expect(outcome.value.output).not.toMatch(/catalogue refreshed|catalogue saved|catalogue applied/i);
  }
  expect(commands.current).toBeUndefined();
});
