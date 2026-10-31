import { readRuntimeConfigEditAt, getUserAuthPath } from "../../config/runtimeConfig.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultHookDispatcher } from '../hooks/hookDispatcher.js';
import { getUserRuntimeConfigPath, getRuntimeConfig } from "../../config/runtimeConfig.js";
import { writeUserRuntimeConfigFile } from "../../config/runtimeConfig.js";
import { runConnectCommand } from "./connectCommandRuntime.js";
import { runModelCommand } from "./modelCommandRuntime.js";
import { credentialIdentityFor } from '../auth/account/pool.js';
import { ownedConnectionCredential } from '../auth/account/presence.js';
import { noteCredentialRateLimit, resetCredentialBackoffForTests } from '../auth/account/backoff.js';
import { loadCatalogSnapshot, userCatalogPath } from '../models/catalogStore.js';
import { resolveProviderCredential } from '../shell/providerCredentials.js';

describe("model command runtime", () => {
  const originalHome = process.env.USERPROFILE;
  const originalUnixHome = process.env.HOME;
  let fakeHome = "";
  let workspaceRoot = "";

  beforeEach(async () => {
    fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-model-home-"),
    );
    workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-model-root-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    await runConnectCommand(["login", "openai", "--api-key", "sk-test-key"], {
      cwd: workspaceRoot,
    });
  });

  afterEach(() => {
    resetCredentialBackoffForTests();
    vi.restoreAllMocks();
    if (originalHome === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalHome;
    if (originalUnixHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalUnixHome;
    fs.rmSync(fakeHome, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it.each([[], ['list'], ['list', 'missing-provider'], ['status']].map(args => ({ args })))(
    'reports safe catalogue failures through model $args', async ({ args }) => {
    fs.writeFileSync(userCatalogPath(), '{PRIVATE_CATALOG_VALUE');
    const before = fs.readFileSync(getUserRuntimeConfigPath());
    const result = await runModelCommand(args, { cwd: workspaceRoot });
    expect(result.output).toContain('models.json could not be parsed');
    expect(result.output).not.toContain('PRIVATE_CATALOG_VALUE');
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before);
    expect(fs.readFileSync(userCatalogPath(), 'utf8')).toBe('{PRIVATE_CATALOG_VALUE');
  });

  it('keeps model catalogue notices bound to the accepted snapshot', async () => {
    fs.writeFileSync(userCatalogPath(), '{bad');
    const snapshot = loadCatalogSnapshot(), config = getRuntimeConfig(workspaceRoot);
    fs.writeFileSync(userCatalogPath(), '{}');
    const result = await runModelCommand(['list'], { cwd: workspaceRoot,
      readConfiguration: () => ({ config, catalog: snapshot.providers, catalogDiagnostics: snapshot.diagnostics }) });
    expect(result.output).toContain('models.json could not be parsed');
    expect(result.output).toContain('settings: config.json; connections: auth.json');
    const help = await runModelCommand(['config'], { cwd: workspaceRoot });
    expect(help.output).toContain('user profile only');
    expect(help.output).toContain('inside the existing providers object');
    expect(fs.readFileSync(userCatalogPath(), 'utf8')).toBe('{}');
  });

  it("shows model status", async () => {
    const result = await runModelCommand(["status"], { cwd: workspaceRoot });
    expect(result.kind).toBe("local");
    expect(result.output).toContain("Model selection status");
    expect(result.output).toContain("Provider: openai");
    expect(result.output).toContain("Provider readiness");
    expect(result.output).toContain("npm run verify:provider-readiness");
  });

  it.each(['bedrock', 'vertex'] as const)('reports current %s signing without requiring a named connection or claiming credentials', async provider => {
    const runtime = getRuntimeConfig(workspaceRoot);
    const baseUrl = provider === 'bedrock' ? 'https://bedrock-runtime.us-east-1.amazonaws.com'
      : 'https://us-central1-aiplatform.googleapis.com/v1/projects/synthetic-project/locations/us-central1/publishers/google';
    const config = { ...runtime, provider, activeProviderConnectionId: undefined, providerConnections: [],
      providerCredentials: { [provider]: { baseUrl, model: 'shared', thinkingEffort: null } } };
    const catalog = [{ id: provider, label: provider, runtime: provider, auth: 'none' as const, baseUrl,
      endpoint: provider === 'bedrock' ? 'bedrock-converse-stream' : 'google-vertex', models: [{ id: 'shared' }] }];
    const documents = [getUserRuntimeConfigPath(), getUserAuthPath()];
    const before = documents.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined);
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected probe'));
    const command = { cwd: workspaceRoot, readConfiguration: () => ({ config, catalog }),
      resolveConfigTarget: (candidate: typeof config) => resolveProviderCredential({ runtimeConfig: candidate, env: {} }) };
    const result = await runModelCommand(['status'], command);
    expect(result.output).toContain('Active connection: none');
    expect(result.output).toContain('Request auth: authentication at request');
    expect(result.output).toContain('Request readiness');
    expect(result.output).toContain('Signing credentials and live endpoint are unverified');
    expect(result.output).not.toMatch(/Next: run \/connect|Auth type: request signing|credential present/);
    expect(fetch).not.toHaveBeenCalled();
    expect(documents.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined)).toEqual(before);
  });

  it('keeps saved authentication separate from a current signer provider override', async () => {
    const runtime = getRuntimeConfig(workspaceRoot);
    const baseUrl = 'https://bedrock-runtime.us-east-1.amazonaws.com';
    const config = { ...runtime, provider: 'openai' as const, activeProviderConnectionId: undefined, providerConnections: [],
      providerCredentials: { openai: { model: 'saved-model' }, bedrock: { baseUrl, model: 'request-model' } } };
    const catalog = [{ id: 'bedrock', label: 'Bedrock', runtime: 'bedrock' as const, auth: 'none' as const, baseUrl,
      endpoint: 'bedrock-converse-stream', models: [{ id: 'request-model' }] }];
    const documents = [getUserRuntimeConfigPath(), getUserAuthPath()];
    const before = documents.map(file => fs.readFileSync(file));
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected probe'));
    const result = await runModelCommand(['status'], { cwd: workspaceRoot, readConfiguration: () => ({ config, catalog }),
      resolveConfigTarget: candidate => resolveProviderCredential({ runtimeConfig: candidate, env: {},
        cliProvider: 'bedrock', cliModel: 'request-model' }) });
    expect(result.output).toContain('Provider: openai\nAuth type: api-key');
    expect(result.output).toContain('Model: saved-model');
    expect(result.output).toContain('Request provider: bedrock\nRequest model: request-model\nRequest auth: authentication at request');
    expect(result.output).toContain('Request readiness\n- Request status: authentication at request.');
    expect(result.output).not.toMatch(/Config status: authentication at request|Auth type: request signing|Next: run \/connect/);
    expect(fetch).not.toHaveBeenCalled();
    expect(documents.map(file => fs.readFileSync(file))).toEqual(before);
  });

  it('reports an explicit signed provider request over an unrelated saved named connection', async () => {
    const runtime = getRuntimeConfig(workspaceRoot);
    const selected = runtime.providerConnections.find(connection => connection.id === runtime.activeProviderConnectionId)!;
    const baseUrl = 'https://bedrock-runtime.us-east-1.amazonaws.com';
    const config = { ...runtime, providerCredentials: { ...runtime.providerCredentials,
      bedrock: { baseUrl, model: 'request-model' } } };
    const catalog = [{ id: 'bedrock', label: 'Bedrock', runtime: 'bedrock' as const, auth: 'none' as const, baseUrl,
      endpoint: 'bedrock-converse-stream', models: [{ id: 'request-model' }] }];
    const documents = [getUserRuntimeConfigPath(), getUserAuthPath()];
    const before = documents.map(file => fs.readFileSync(file));
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected probe'));
    const result = await runModelCommand(['status'], { cwd: workspaceRoot, readConfiguration: () => ({ config, catalog }),
      resolveConfigTarget: candidate => resolveProviderCredential({ runtimeConfig: { ...candidate, provider: 'bedrock',
        activeProviderConnectionId: undefined, sessionConnection: { scope: 'provider', provider: 'bedrock' } }, env: {} }) });
    expect(result.output).toContain(`Provider: ${selected.provider}\nAuth type: ${selected.authType}\nActive connection: ${selected.id}`);
    expect(result.output).toContain('Request provider: bedrock\nRequest model: request-model\nRequest auth: authentication at request');
    expect(result.output).toContain('Request readiness');
    expect(result.output).toContain('Signing credentials and live endpoint are unverified');
    expect(result.output).not.toMatch(/Auth type: request signing|credential present|Next: run \/connect/);
    expect(fetch).not.toHaveBeenCalled();
    expect(documents.map(file => fs.readFileSync(file))).toEqual(before);
  });

  it.each(['nonsigner', 'unknown', 'blocked', 'named', 'ambiguous', 'pool'] as const)(
    'does not report signing readiness for a %s current binding', async defect => {
      const runtime = getRuntimeConfig(workspaceRoot); const baseUrl = 'https://bedrock-runtime.us-east-1.amazonaws.com';
      const config = { ...runtime, provider: 'bedrock' as const, activeProviderConnectionId: defect === 'named' ? 'named' : undefined,
        providerConnections: defect === 'named' ? [{ id: 'named', provider: 'bedrock' as const, authType: 'api-key' as const,
          baseUrl, model: 'shared', status: 'connected' as const, createdAt: '2026-01-01', updatedAt: '2026-01-01' }] : [],
        providerCredentials: { bedrock: { baseUrl, model: 'shared', thinkingEffort: null } },
        ...(defect === 'pool' ? { accountPool: { bedrock: { connections: ['missing'] } } } : {}) };
      const catalog = [{ id: 'bedrock', label: 'Bedrock', runtime: 'bedrock' as const, auth: 'none' as const, baseUrl,
        endpoint: defect === 'nonsigner' ? 'openai-compatible' : defect === 'unknown' ? 'unknown-endpoint' : 'bedrock-converse-stream',
        models: [{ id: 'shared' }] }];
      if (defect === 'ambiguous') catalog.push({ ...catalog[0], id: 'first' }, { ...catalog[0], id: 'second' });
      const before = fs.readFileSync(getUserAuthPath());
      const result = await runModelCommand(['status'], { cwd: workspaceRoot, readConfiguration: () => ({ config, catalog }),
        resolveConfigTarget: candidate => ({ ...resolveProviderCredential({ runtimeConfig: candidate, env: {} }),
          ...(defect === 'blocked' ? { blocked: 'connection-unavailable' as const } : {}) }) });
      expect(result.output).not.toMatch(/Request (status|auth): authentication at request|Auth type: request signing/);
      expect(fs.readFileSync(getUserAuthPath())).toEqual(before);
    });

  it.each(['outside', 'waiting'])('reports the active %s connection as unavailable in its pool', async scenario => {
    const runtime = getRuntimeConfig(workspaceRoot);
    const active = runtime.providerConnections.find(connection => connection.id === runtime.activeProviderConnectionId)!;
    const sibling = { ...active, id: 'pool-sibling' };
    const runtimeConfig = { ...runtime, providerConnections: [active, sibling], accountPool: {
      [active.provider]: { connections: scenario === 'outside' ? [sibling.id] : [active.id] },
    } };
    if (scenario === 'waiting') noteCredentialRateLimit(credentialIdentityFor(active.provider, ownedConnectionCredential(active))!, 60_000);
    const before = fs.readFileSync(getUserRuntimeConfigPath());
    const result = await runModelCommand(['status'], { cwd: workspaceRoot, runtimeConfig });
    expect(result.output).toContain('active connection is unavailable in the account pool');
    expect(result.output).not.toContain('active connection and model are configured');
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before);
  });

  it('uses the accepted snapshot for model and connection status despite pending disk edits', async () => {
    const runtimeConfig = getRuntimeConfig(workspaceRoot);
    const before = await runModelCommand(['status'], { cwd: workspaceRoot, runtimeConfig });
    const file = getUserRuntimeConfigPath();
    writeUserRuntimeConfigFile({ providerConnections: runtimeConfig.providerConnections.map(connection => ({ ...connection, model: 'pending-model' })) }, readRuntimeConfigEditAt(file));
    const after = await runModelCommand(['status'], { cwd: workspaceRoot, runtimeConfig });
    expect(after.output).toBe(before.output);
    expect((await runConnectCommand(['status'], { cwd: workspaceRoot, runtimeConfig })).output)
      .toContain(`Active connection: ${runtimeConfig.activeProviderConnectionId}`);
  });

  it('keeps the baseline captured before an asynchronous model hook', async () => {
    const file = getUserRuntimeConfigPath();
    writeUserRuntimeConfigFile({ theme: 'dark' }, readRuntimeConfigEditAt(file));
    vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
      if (event.eventName === 'PreModelSwitch') {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        fs.writeFileSync(file, JSON.stringify({ ...raw, theme: 'light' }));
      }
      return undefined;
    });
    const result = await runModelCommand(['use', 'new-model', '--global'], { cwd: workspaceRoot });
    expect(result.output).toContain('Global default stored at');
    // The setting stays in the settings document; the connection it selected is
    // the credential document's, and both are confirmed separately.
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(saved.theme).toBe('light');
    expect(saved.providerConnections).toBeUndefined();
    const credential = JSON.parse(fs.readFileSync(getUserAuthPath(), 'utf8'));
    expect(credential.providerConnections[0].model).toBeUndefined();
    expect(saved.modelPreferences.connections[0].model).toBe('new-model');
  });

  it('reports conflict when an awaited hook changes the active connection', async () => {
    const file = getUserRuntimeConfigPath();
    const base = readRuntimeConfigEditAt(file);
    const connections = [...base.values.providerConnections!, { id: 'other', provider: 'openai' as const, model: 'other-model' }];
    writeUserRuntimeConfigFile({ providerConnections: connections }, base);
    let external: string;
    // The active connection is the credential document's, so a concurrent
    // change to it is a change to that file.
    vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
      if (event.eventName === 'PreModelSwitch') {
        const raw = JSON.parse(fs.readFileSync(getUserAuthPath(), 'utf8'));
        external = JSON.stringify({ ...raw, activeProviderConnectionId: 'other' });
        fs.writeFileSync(getUserAuthPath(), external);
      }
      return undefined;
    });
    const result = await runModelCommand(['use', 'new-model', '--global'], { cwd: workspaceRoot });
    expect(result.output).toContain('conflict: this attempt did not write');
    expect(result.output).not.toContain('Global default stored at');
    expect(fs.readFileSync(getUserAuthPath(), 'utf8')).toBe(external!);
  });

  it("explains missing active connection", async () => {
    writeUserRuntimeConfigFile({
      provider: "openai",
      activeProviderConnectionId: undefined,
      providerConnections: [
        {
          id: "openai-test",
          provider: "openai",
          authType: "api-key",
          apiKey: "sk-test",
          model: "gpt-4.1-mini",
          status: "connected",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));

    const result = await runModelCommand(["status"], { cwd: workspaceRoot });

    expect(result.output).toContain("Active connection: none");
    expect(result.output).toContain("Config status: no active connection selected");
    expect(result.output).toContain("/connect status");
  });

  it("explains incomplete active provider config", async () => {
    writeUserRuntimeConfigFile({
      provider: "openai-compatible",
      activeProviderConnectionId: "sf-test",
      providerConnections: [
        {
          id: "sf-test",
          provider: "openai-compatible",
          authType: "api-key",
          apiKey: "sk-test",
          status: "connected",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));

    const result = await runModelCommand(["status"], { cwd: workspaceRoot });

    expect(result.output).toContain("Provider: openai-compatible");
    expect(result.output).toContain("requires base URL");
    expect(result.output).toContain("--base-url <url> --model <model>");
  });

  it("explains pending and error connection states", async () => {
    writeUserRuntimeConfigFile({
      provider: "openai",
      activeProviderConnectionId: "pending-test",
      providerConnections: [
        {
          id: "pending-test",
          provider: "openai",
          authType: "browser-assisted-capture",
          status: "pending",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));

    const pending = await runModelCommand(["status"], { cwd: workspaceRoot });
    expect(pending.output).toContain("connection setup is pending");

    writeUserRuntimeConfigFile({
      provider: "openai",
      activeProviderConnectionId: "error-test",
      providerConnections: [
        {
          id: "error-test",
          provider: "openai",
          authType: "browser-assisted-capture",
          status: "error",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));

    const error = await runModelCommand(["status"], { cwd: workspaceRoot });
    expect(error.output).toContain("connection setup is in error state");
  });

  it("updates the global default only with the explicit flag", async () => {
    const result = await runModelCommand(["use", "gpt-5.4", "--global"], {
      cwd: workspaceRoot,
    });
    expect(result.kind).toBe("local");
    expect(result.output).toContain("Model switched to gpt-5.4");

    // Credential identity remains in auth; defaults live in settings.
    const stored = JSON.parse(
      fs.readFileSync(getUserAuthPath(), "utf8"),
    ) as {
      activeProviderConnectionId?: string;
      providerConnections?: Array<{ id: string; model?: string }>;
      providerCredentials?: { openai?: { model?: string } };
    };
    const active = stored.providerConnections?.find(
      (connection) => connection.id === stored.activeProviderConnectionId,
    );
    expect(active?.model).toBeUndefined();
    expect(readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values.providerConnections?.find(connection => connection.id === active?.id)?.model).toBe('gpt-5.4');
    expect(stored.providerCredentials).toBeUndefined();
  });

  it('saves named model defaults only on the selected connection and preserves an independent provider slot', async () => {
    const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
    const selected = edit.values.providerConnections![0]!;
    const independent = { apiKey: 'SYNTHETIC_INDEPENDENT_SLOT', baseUrl: 'https://independent.invalid/v1',
      model: 'independent-model', thinkingEffort: 'low' as const, serviceTier: 'priority' };
    const sibling = { ...selected, id: 'retained-sibling', model: 'sibling-model', thinkingEffort: 'medium' as const };
    writeUserRuntimeConfigFile({ ...edit.values, theme: 'dark', temperature: 0.2, topP: 0.8,
      providerCredentials: { openai: independent }, providerConnections: [selected, sibling] }, edit);
    const before = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values;
    const settings = JSON.parse(fs.readFileSync(getUserRuntimeConfigPath(), 'utf8'));
    const result = await runModelCommand(['use', 'gpt-5.4', '--effort', 'high', '--global'], { cwd: workspaceRoot });
    expect(result.output).toContain('Model switched to gpt-5.4');
    const stored = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values;
    expect(stored.providerCredentials).toEqual(before.providerCredentials);
    expect(stored.providerConnections?.find(connection => connection.id === sibling.id))
      .toEqual(before.providerConnections?.find(connection => connection.id === sibling.id));
    const active = stored.providerConnections?.find(connection => connection.id === selected.id);
    expect(active).toEqual({ ...before.providerConnections![0], model: 'gpt-5.4', thinkingEffort: 'high', updatedAt: expect.any(String) });
    const savedSettings = JSON.parse(fs.readFileSync(getUserRuntimeConfigPath(), 'utf8'));
    expect(savedSettings).toEqual({ ...settings, modelPreferences: { ...settings.modelPreferences,
      connections: settings.modelPreferences.connections.map((item: { id: string }) => item.id === selected.id ? { ...item, model: 'gpt-5.4', thinkingEffort: 'high' } : item),
    } });
    expect(JSON.parse(fs.readFileSync(getUserAuthPath(), 'utf8')).providerConnections.find((item: { id: string }) => item.id === selected.id).model).toBeUndefined();
    const resolution = resolveProviderCredential({ runtimeConfig: getRuntimeConfig(workspaceRoot), env: {} });
    expect(resolution).toMatchObject({ model: 'gpt-5.4', thinkingEffort: 'high',
      credential: { source: 'connection', connectionId: selected.id, apiKey: selected.apiKey } });
  });

  it('retains provider-slot model default persistence when no named connection owns the choice', async () => {
    const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
    const credential = { apiKey: 'SYNTHETIC_PROVIDER_SLOT', model: 'gpt-5.3', thinkingEffort: 'low' as const };
    writeUserRuntimeConfigFile({ theme: 'dark', provider: 'openai', activeProviderConnectionId: undefined, providerConnections: [],
      providerCredentials: { openai: credential, google: { apiKey: 'SYNTHETIC_SIBLING_SLOT', model: 'sibling-model' } } }, edit);
    const before = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values;
    const settings = JSON.parse(fs.readFileSync(getUserRuntimeConfigPath(), 'utf8'));
    const result = await runModelCommand(['use', 'gpt-5.4', '--effort', 'high', '--global'], { cwd: workspaceRoot });
    expect(result.output).toContain('Model switched to gpt-5.4');
    const stored = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values;
    expect(stored.providerConnections).toEqual([]);
    expect(stored.activeProviderConnectionId).toBeUndefined();
    expect(stored.providerCredentials?.openai).toEqual({ ...credential, model: 'gpt-5.4', thinkingEffort: 'high' });
    expect(stored.providerCredentials?.google).toEqual(before.providerCredentials?.google);
    expect(JSON.parse(fs.readFileSync(getUserRuntimeConfigPath(), 'utf8'))).toEqual({ ...settings,
      modelPreferences: { ...settings.modelPreferences, providers: { ...settings.modelPreferences.providers,
        openai: { model: 'gpt-5.4', thinkingEffort: 'high' },
      } },
    });
    expect(resolveProviderCredential({ runtimeConfig: getRuntimeConfig(workspaceRoot), env: {} }))
      .toMatchObject({ model: 'gpt-5.4', thinkingEffort: 'high', credential: { source: 'config', apiKey: credential.apiKey } });
  });

  it("answers a bare /model with the catalogue, grouped by provider", async () => {
    const result = await runModelCommand([], { cwd: workspaceRoot });

    expect(result.output).toContain("### Providers and models");
    expect(result.output).toContain("**Anthropic**");
    expect(result.output).toContain("**SiliconFlow**");
    // Grouping is the point: the same model name can appear under two providers,
    // so a row is only meaningful with its provider attached.
    expect(result.output).toContain("`/model use <provider>/<model>`");
  });

  it("refuses a model that belongs to a provider that is not connected", async () => {
    const result = await runModelCommand(["use", "openrouter/openai/gpt-5.3"], {
      cwd: workspaceRoot,
    });

    expect(result.output).toMatch(/openrouter|No active connection/);
  });
});
