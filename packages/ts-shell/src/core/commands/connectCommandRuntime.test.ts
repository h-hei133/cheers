import { accountToken } from '../../test-utils/oauth.js';
import { readRuntimeConfigEditAt, getUserAuthPath } from '../../config/runtimeConfig.js';
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as configStore from '../../config/runtimeConfig.js';
import { resolveProviderCredential } from '../shell/providerCredentials.js';
import * as persistence from '../../config/persistence.js';
import { loginOpenAIAccountViaAuthorizationCodeFlow } from './openaiAccountAuth.js';
import * as store from '../../session/store/sessionFileStore.js';
import { refreshLeasesPath } from '../auth/account/lease.js';
import { renewStoredAccount } from '../auth/account/renewal.js';
import { ConfigWriteError } from '../../config/outcome.js';
import { __setOpenAIProviderAuthLoginForTest } from '../auth/providerAuthRuntime.js';
import {
  getUserRuntimeConfigPath,
  writeUserRuntimeConfigFile,
} from "../../config/runtimeConfig.js";
import {
  __setConnectBrowserFlowRunnerForTest,
  __setOpenAIAccountAuthRunnerForTest,
  runConnectCommand,
} from "./connectCommandRuntime.js";

async function nativeLogin(accessToken = 'native-access', refreshToken = 'native-refresh', accountId = 'native-account', response?: () => Promise<Response> | Response) {
  return loginOpenAIAccountViaAuthorizationCodeFlow({
    openBrowser: async address => {
      const url = new URL(address), redirect = new URL(url.searchParams.get('redirect_uri')!);
      redirect.searchParams.set('code', 'synthetic-code'); redirect.searchParams.set('state', url.searchParams.get('state')!);
      const callback = await fetch(redirect); expect(callback.ok).toBe(true);
    },
    fetchImpl: vi.fn(async () => response ? response() : new Response(JSON.stringify({ access_token: accountToken(accessToken, accountId), refresh_token: refreshToken, expires_in: 3600,
      id_token: `header.${Buffer.from(JSON.stringify({ sub: 'distinct-subject' })).toString('base64url')}.signature` }),
      { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch,
  });
}

describe("connect command runtime", () => {
  const originalHome = process.env.USERPROFILE;
  const originalUnixHome = process.env.HOME;
  let fakeHome = "";
  let workspaceRoot = "";

  beforeEach(() => {
    fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-connect-home-"),
    );
    workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-connect-root-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;
    __setConnectBrowserFlowRunnerForTest(undefined);
    __setOpenAIAccountAuthRunnerForTest(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalHome === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalHome;
    if (originalUnixHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalUnixHome;
    __setConnectBrowserFlowRunnerForTest(undefined);
    __setOpenAIAccountAuthRunnerForTest(undefined);
    fs.rmSync(fakeHome, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('does not insert a pending connection when cancellation preceded native login admission', async () => {
    const controller = new AbortController(); controller.abort();
    writeUserRuntimeConfigFile({ model: 'retained' }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    const before = fs.readFileSync(getUserRuntimeConfigPath(), 'utf8');
    await expect(runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fs.readFileSync(getUserRuntimeConfigPath(), 'utf8')).toBe(before);
  });

  it('cancels the real browser callback through the command host without storing late credentials', async () => {
    const controller = new AbortController(), progress: string[] = [];
    __setOpenAIProviderAuthLoginForTest(options => loginOpenAIAccountViaAuthorizationCodeFlow({ ...options,
      openBrowser: () => { controller.abort('private cancellation reason'); }, fetchImpl: vi.fn() as unknown as typeof fetch }));
    const result = await runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot,
      runCancellable: operation => operation(controller.signal), signInProgress: value => progress.push(value.authorizeUrl) });
    expect(progress).toHaveLength(1); expect(progress[0]).toMatch(/^https:\/\/auth\.openai\.com\//);
    expect(result.output).toContain('pending -> error'); expect(result.output).toContain('sign-in cancelled');
    expect(result.output).not.toMatch(/pending -> connected|private cancellation reason/);
    const stored = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values;
    expect(stored.providerConnections?.[0]?.status).toBe('error');
    expect(stored.providerConnections?.[0]?.accountAuth).toBeUndefined(); expect(stored.providerCredentials?.openai).toBeUndefined();
    const callback = new URL(progress[0]!).searchParams.get('redirect_uri')!;
    await expect(fetch(callback)).rejects.toThrow();
  });

  it("creates a siliconflow connection and sets it as active runtime provider", async () => {
    const result = await runConnectCommand(
      ["login", "siliconflow", "--api-key", "sk-siliconflow-test"],
      {
        cwd: workspaceRoot,
      },
    );

    expect(result.kind).toBe("local");
    expect(result.output).toContain("Connected provider openai-compatible");
    expect(result.output).toContain(`Stored at: ${getUserAuthPath()}`);

    const configPath = getUserAuthPath();
    const stored = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      provider?: string;
      activeProviderConnectionId?: string;
      providerConnections?: Array<{
        id: string;
        provider: string;
        authType: string;
        apiKey?: string;
        baseUrl?: string;
        model?: string;
      }>;
    };

    expect(stored.provider).toBe("openai-compatible");
    expect(stored.activeProviderConnectionId).toBeTruthy();
    expect(stored.providerConnections?.length).toBe(1);
    expect(stored.providerConnections?.[0]?.provider).toBe("openai-compatible");
    expect(stored.providerConnections?.[0]?.authType).toBe("api-key");
    expect(stored.providerConnections?.[0]?.apiKey).toBe("sk-siliconflow-test");
    expect(stored.providerConnections?.[0]?.baseUrl).toBe(
      "https://api.siliconflow.cn/v1",
    );
    expect(stored.providerConnections?.[0]?.model).toBeUndefined();
    expect(readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values.providerConnections?.[0]?.model).toBe(
      "deepseek-ai/DeepSeek-V4-Flash",
    );
    expect(readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values.providerCredentials).toBeUndefined();
  });

  it.each(['api-key', 'browser', 'account'] as const)('keeps an independent provider slot unchanged when activating a %s connection', async mode => {
    const provider = mode === 'browser' ? 'openai-compatible' : 'openai';
    const independent = { apiKey: 'SYNTHETIC_INDEPENDENT_SLOT', baseUrl: 'https://independent.invalid/v1',
      model: 'independent-model', thinkingEffort: 'low' as const, serviceTier: 'priority' };
    writeUserRuntimeConfigFile({ theme: 'dark', provider, providerCredentials: { [provider]: independent },
      providerConnections: [{ id: 'retained-sibling', provider, apiKey: 'SYNTHETIC_SIBLING',
        baseUrl: 'https://sibling.invalid/v1', model: 'sibling-model', authType: 'api-key', status: 'connected',
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }] },
    readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    const before = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values;
    const settings = JSON.parse(fs.readFileSync(getUserRuntimeConfigPath(), 'utf8'));
    __setConnectBrowserFlowRunnerForTest(async () => ({ apiKey: 'SYNTHETIC_NEW_CONNECTION',
      baseUrl: 'https://new.invalid/v1', model: 'new-model' }));
    __setOpenAIAccountAuthRunnerForTest(() => nativeLogin());
    const args = mode === 'account' ? ['login', 'openai', '--account']
      : mode === 'browser' ? ['login', 'siliconflow', '--browser']
      : ['login', 'openai', '--api-key', 'SYNTHETIC_NEW_CONNECTION', '--base-url', 'https://new.invalid/v1', '--model', 'new-model'];
    const result = await runConnectCommand(args, { cwd: workspaceRoot });
    const stored = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values;
    expect(stored.providerCredentials).toEqual(before.providerCredentials);
    expect(stored.providerConnections?.find(connection => connection.id === 'retained-sibling'))
      .toEqual(before.providerConnections?.[0]);
    const savedSettings = JSON.parse(fs.readFileSync(getUserRuntimeConfigPath(), 'utf8'));
    expect(savedSettings.theme).toBe(settings.theme);
    expect(savedSettings.modelPreferences.providers).toEqual(settings.modelPreferences.providers);
    expect(savedSettings.modelPreferences.connections.find((item: { id: string }) => item.id === 'retained-sibling'))
      .toEqual(settings.modelPreferences.connections.find((item: { id: string }) => item.id === 'retained-sibling'));
    const active = stored.providerConnections?.find(connection => connection.id === stored.activeProviderConnectionId);
    expect(active?.id).not.toBe('retained-sibling');
    const resolution = resolveProviderCredential({ runtimeConfig: configStore.getRuntimeConfig(workspaceRoot), env: {} });
    expect(resolution.credential).toMatchObject({ source: 'connection', connectionId: active!.id });
    expect(result.output).toContain(`Stored at: ${getUserAuthPath()}`);
    if (mode === 'account') {
      expect(active?.accountAuth?.openai?.refreshToken).toBe('native-refresh');
      expect(resolution.credential?.authMode).toBe('account-auth');
      expect(result.output).not.toContain('Automatic renewal remains unverified');
    } else {
      expect(active).toMatchObject({ apiKey: 'SYNTHETIC_NEW_CONNECTION', baseUrl: 'https://new.invalid/v1', model: 'new-model' });
      expect(resolution.credential).toMatchObject({ apiKey: 'SYNTHETIC_NEW_CONNECTION', baseUrl: 'https://new.invalid/v1', model: 'new-model' });
    }
  });

  it('refreshes only after a confirmed save and reports publication rejection separately', async () => {
    const config = configStore.getRuntimeConfig(workspaceRoot);
    const refresh = vi.fn(() => ({ status: 'rejected' as const, before: config, after: config, revision: 1,
      admissionBlocked: false, diagnostics: [], restartRequired: [] }));
    const context = { cwd: workspaceRoot, refreshRuntimeConfig: refresh };
    await runConnectCommand(['use', 'missing'], context);
    expect(refresh).not.toHaveBeenCalled();
    const result = await runConnectCommand(['login', 'openai', '--api-key', 'synthetic-key'], context);
    expect(refresh).toHaveBeenCalledOnce();
    expect(result.output).toContain(`Stored at: ${getUserAuthPath()}`);
    expect(result.output).toContain('Configuration was not applied (rejected)');
  });

  it.each([
    ['api-key', 'empty'], ['api-key', 'profile'], ['api-key', 'connection'],
    ['browser', 'empty'], ['browser', 'profile'], ['browser', 'connection'],
    ['account', 'empty'], ['account', 'profile'], ['account', 'connection'],
  ] as const)('saves a %s connection without changing defaults (existing selection: %s)', async (mode, selected) => {
    if (selected === 'connection') await runConnectCommand(['login', 'anthropic', '--api-key', 'synthetic-existing'], { cwd: workspaceRoot });
    const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
    writeUserRuntimeConfigFile({ ...edit.values, model: 'retained', ...(selected !== 'empty' ? { providerCredentials: {
      ...edit.values.providerCredentials, openai: { apiKey: 'synthetic-mirror', model: 'mirror-model' },
    } } : {}) }, edit);
    const before = configStore.readUserRuntimeConfigFile();
    const targetBefore = resolveProviderCredential({ runtimeConfig: configStore.getRuntimeConfig(workspaceRoot), env: {} });
    const currentTarget = () => resolveProviderCredential({ runtimeConfig: configStore.getRuntimeConfig(workspaceRoot), env: {} });
    __setConnectBrowserFlowRunnerForTest(async () => {
      expect(currentTarget()).toEqual(targetBefore);
      return { apiKey: 'synthetic-captured', model: 'captured-model' };
    });
    __setOpenAIAccountAuthRunnerForTest(() => { expect(currentTarget()).toEqual(targetBefore); return nativeLogin(); });
    const args = mode === 'api-key' ? ['--api-key', 'synthetic-saved'] : [`--${mode}`];
    const refresh = vi.fn();
    const result = await runConnectCommand(['login', 'openai', ...args], { cwd: workspaceRoot,
      refreshRuntimeConfig: refresh }, undefined, { activate: false });
    const saved = configStore.readUserRuntimeConfigFile();
    const { providerConnections: previousConnections, ...previousDefaults } = before;
    const { providerConnections: savedConnections, ...savedDefaults } = saved;
    expect(savedDefaults).toEqual(previousDefaults);
    expect(savedConnections?.slice(1)).toEqual(previousConnections ?? []);
    expect(savedConnections?.[0]).toMatchObject({ provider: 'openai', status: 'connected', autoSelect: false,
      authType: mode === 'account' ? 'account-auth' : mode === 'browser' ? 'browser-assisted-capture' : 'api-key' });
    expect(resolveProviderCredential({ runtimeConfig: configStore.getRuntimeConfig(workspaceRoot), env: {} })).toEqual(targetBefore);
    expect(refresh).toHaveBeenCalledOnce();
    expect(result.output).toContain('Connection saved. Select a model to enable it.');
    expect(result.output).not.toMatch(/Stored provider default:|Default runtime provider switched|Automatic renewal remains unverified/);
    if (mode === 'account') expect(savedConnections?.[0]?.accountAuth?.openai?.accessToken).toBe(accountToken('native-access', 'native-account'));
    else expect(savedConnections?.[0]?.apiKey).toBe(mode === 'browser' ? 'synthetic-captured' : 'synthetic-saved');
  });

  it('grants and renews a saved native account through its exact session slot without replacing the profile mirror', async () => {
    await runConnectCommand(['login', 'openai', '--api-key', 'synthetic-existing'], { cwd: workspaceRoot });
    const before = configStore.readUserRuntimeConfigFile();
    __setOpenAIAccountAuthRunnerForTest(() => nativeLogin());
    const result = await runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot }, undefined, { activate: false });
    expect(result.output).not.toContain('Automatic renewal remains unverified');
    const saved = configStore.readUserRuntimeConfigFile(), added = saved.providerConnections![0]!;
    expect(saved.activeProviderConnectionId).toBe(before.activeProviderConnectionId);
    expect(saved.providerCredentials).toEqual(before.providerCredentials);
    const rows = JSON.parse(fs.readFileSync(refreshLeasesPath(), 'utf8')).leases;
    expect(Object.values(rows).map((row: any) => row.grant?.origin)).toEqual(['login']);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 7200000);
    const runtime = configStore.getRuntimeConfig(workspaceRoot);
    const resolution = resolveProviderCredential({ runtimeConfig: { ...runtime, activeProviderConnectionId: added.id,
      sessionConnection: { id: added.id, provider: 'openai' } }, env: {} });
    expect(resolution.credential).toMatchObject({ source: 'connection', connectionId: added.id });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ access_token: accountToken('renewed-access', 'native-account'),
      refresh_token: 'renewed-refresh', expires_in: 3600 }), { headers: { 'content-type': 'application/json' } }));
    const renewed = await renewStoredAccount({ workspaceRoot, resolution, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(renewed).toMatchObject({ stored: true, writeState: 'persisted', accountAuth: { refreshToken: 'renewed-refresh' } });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const current = configStore.readUserRuntimeConfigFile();
    expect(current.provider).toBe(before.provider); expect(current.activeProviderConnectionId).toBe(before.activeProviderConnectionId);
    expect(current.providerCredentials).toEqual(before.providerCredentials);
    expect(current.providerConnections?.slice(1)).toEqual(before.providerConnections);
    expect(current.providerConnections?.[0]?.accountAuth?.openai).toEqual(renewed.accountAuth);
  });

  it('leaves saved-only connections unselected after logout and permits explicit activation', async () => {
    await runConnectCommand(['login', 'openai', '--api-key', 'synthetic-existing'], { cwd: workspaceRoot });
    const oldId = configStore.getRuntimeConfig(workspaceRoot).activeProviderConnectionId!;
    await runConnectCommand(['login', 'openai', '--api-key', 'synthetic-saved'], { cwd: workspaceRoot }, undefined, { activate: false });
    const savedId = configStore.readUserRuntimeConfigFile().providerConnections![0]!.id;
    const result = await runConnectCommand(['logout', oldId], { cwd: workspaceRoot });
    expect(result.output).toContain('Stored active connection now: none');
    const config = configStore.getRuntimeConfig(workspaceRoot);
    expect(config.activeProviderConnectionId).toBeUndefined();
    expect(resolveProviderCredential({ runtimeConfig: config, env: {} }).credential).toBeUndefined();
    await runConnectCommand(['use', savedId], { cwd: workspaceRoot });
    expect(resolveProviderCredential({ runtimeConfig: configStore.getRuntimeConfig(workspaceRoot), env: {} }).credential)
      .toMatchObject({ source: 'connection', connectionId: savedId, apiKey: 'synthetic-saved' });
  });

  it.each(['browser', 'account'] as const)('keeps a failed save-only %s login separate from activation', async mode => {
    await runConnectCommand(['login', 'anthropic', '--api-key', 'synthetic-existing'], { cwd: workspaceRoot });
    const before = configStore.readUserRuntimeConfigFile();
    __setConnectBrowserFlowRunnerForTest(async () => { throw new Error('synthetic capture failure'); });
    __setOpenAIAccountAuthRunnerForTest(async () => { throw new Error('synthetic login failure'); });
    const result = await runConnectCommand(['login', 'openai', `--${mode}`], { cwd: workspaceRoot }, undefined, { activate: false });
    const saved = configStore.readUserRuntimeConfigFile();
    expect(saved.provider).toBe(before.provider); expect(saved.activeProviderConnectionId).toBe(before.activeProviderConnectionId);
    expect(saved.providerCredentials).toEqual(before.providerCredentials);
    expect(saved.providerConnections?.slice(1)).toEqual(before.providerConnections);
    expect(saved.providerConnections?.[0]?.status).toBe('error');
    expect(result.output).toContain('pending -> error');
    expect(result.output).not.toMatch(/Connection saved|Stored provider default:|Default runtime provider switched/);
  });

  it.each([
    ['--browser', 'unknown'], ['--browser', 'persisted'],
    ['--account', 'unknown'], ['--account', 'persisted'],
  ] as const)('preserves %s persistence outcome %s without marking credentials as failed', async (mode, state) => {
    __setConnectBrowserFlowRunnerForTest(async () => ({ apiKey: 'synthetic-browser-key' }));
    __setOpenAIAccountAuthRunnerForTest(async () => ({
      accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', expiresAt: Date.now() + 3600000,
      authorizeUrl: 'https://example.invalid/authorize', callbackUrl: 'http://localhost/callback',
    }));
    const save = persistence.persistConfigEdit;
    let calls = 0;
    const spy = vi.spyOn(persistence, 'persistConfigEdit').mockImplementation((...args: Parameters<typeof persistence.persistConfigEdit>) => {
      calls++;
      if (calls !== 2) return save(...args);
      if (state === 'persisted') save(...args);
      throw new ConfigWriteError(state === 'persisted' ? 'lock-failed' : 'write-failed', state);
    });
    await expect(runConnectCommand(['login', 'openai', mode], { cwd: workspaceRoot })).rejects.toMatchObject({ state });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(configStore.readUserRuntimeConfigFile().providerConnections?.[0]?.status).toBe(state === 'persisted' ? 'connected' : 'pending');
  });

  it("explains config status versus live provider readiness", async () => {
    await runConnectCommand(
      ["login", "siliconflow", "--api-key", "sk-siliconflow-test"],
      {
        cwd: workspaceRoot,
      },
    );

    const result = await runConnectCommand(["status"], { cwd: workspaceRoot });

    expect(result.kind).toBe("local");
    expect(result.output).toContain("Provider readiness");
    expect(result.output).toContain("Config status: configured");
    expect(result.output).toContain("npm run verify:provider-readiness");
    expect(result.output).toContain("provider-network-inconclusive");
  });

  it("explains no-connection status with an actionable login path", async () => {
    const result = await runConnectCommand(["status"], { cwd: workspaceRoot });

    expect(result.kind).toBe("local");
    expect(result.output).toContain("No saved connections.");
    expect(result.output).toContain("Config status: not configured");
    expect(result.output).toContain("/connect login <provider>");
  });

  it("explains missing active connection selection", async () => {
    writeUserRuntimeConfigFile({
      provider: "openai",
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

    const result = await runConnectCommand(["status"], { cwd: workspaceRoot });

    expect(result.output).toContain("Config status: no active connection selected");
    expect(result.output).toContain("/connect use <connection-id|provider>");
  });

  it("explains incomplete openai-compatible connection config", async () => {
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

    const result = await runConnectCommand(["status"], { cwd: workspaceRoot });

    expect(result.output).toContain(
      "Config status: openai-compatible requires base URL and model",
    );
    expect(result.output).toContain("--base-url <url> --model <model>");
  });

  it("explains missing credential for active connection", async () => {
    writeUserRuntimeConfigFile({
      provider: "openai",
      activeProviderConnectionId: "openai-test",
      providerConnections: [
        {
          id: "openai-test",
          provider: "openai",
          authType: "api-key",
          status: "connected",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));

    const result = await runConnectCommand(["status"], { cwd: workspaceRoot });

    expect(result.output).toContain(
      "Config status: credential missing for active connection",
    );
    expect(result.output).toContain("/connect login openai --api-key <key>");
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

    const pending = await runConnectCommand(["status"], { cwd: workspaceRoot });
    expect(pending.output).toContain("connection setup is pending");
    expect(pending.output).toContain("finish the login/browser flow");

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

    const error = await runConnectCommand(["status"], { cwd: workspaceRoot });
    expect(error.output).toContain("connection setup is in error state");
    expect(error.output).toContain("rerun /connect login");
  });

  it("supports legacy /auth set semantics via /connect set", async () => {
    const result = await runConnectCommand(
      [
        "set",
        "openai-compatible",
        "sk-legacy-openai-compatible",
        "https://api.siliconflow.cn/v1",
        "deepseek-ai/DeepSeek-V3",
      ],
      { cwd: workspaceRoot },
    );

    expect(result.kind).toBe("local");
    expect(result.output).toContain("Connected provider openai-compatible");
    expect(result.output).toContain("legacy compatibility path");

    const configPath = getUserAuthPath();
    const stored = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      provider?: string;
      activeProviderConnectionId?: string;
      providerConnections?: Array<{
        id: string;
        provider: string;
        authType: string;
        apiKey?: string;
        baseUrl?: string;
        model?: string;
      }>;
    };

    expect(stored.provider).toBe("openai-compatible");
    expect(stored.activeProviderConnectionId).toBeTruthy();
    expect(stored.providerConnections?.[0]?.provider).toBe("openai-compatible");
    expect(stored.providerConnections?.[0]?.authType).toBe("api-key");
    expect(stored.providerConnections?.[0]?.apiKey).toBe(
      "sk-legacy-openai-compatible",
    );
  });

  it("switches active connection by provider alias", async () => {
    await runConnectCommand(
      ["login", "openai", "--api-key", "sk-openai-test"],
      {
        cwd: workspaceRoot,
      },
    );
    await runConnectCommand(
      ["login", "anthropic", "--api-key", "sk-anthropic-test"],
      {
        cwd: workspaceRoot,
      },
    );

    const switched = await runConnectCommand(["use", "openai"], {
      cwd: workspaceRoot,
    });
    expect(switched.kind).toBe("local");
    expect(switched.output).toContain("Provider: openai");

    const configPath = getUserAuthPath();
    const stored = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      provider?: string;
      activeProviderConnectionId?: string;
      providerConnections?: Array<{ id: string; provider: string }>;
    };

    const active = stored.providerConnections?.find(
      (connection) => connection.id === stored.activeProviderConnectionId,
    );
    expect(stored.provider).toBe("openai");
    expect(active?.provider).toBe("openai");
  });

  it("completes browser-assisted local capture and activates connection", async () => {
    __setConnectBrowserFlowRunnerForTest(async () => ({
      apiKey: "browser-key-test",
      baseUrl: "https://api.siliconflow.cn/v1/",
      model: "deepseek-ai/DeepSeek-V3",
    }));

    const result = await runConnectCommand(
      ["login", "siliconflow", "--browser"],
      {
        cwd: workspaceRoot,
      },
    );

    expect(result.kind).toBe("local");
    expect(result.output).toContain(
      "Browser-assisted local credential capture completed",
    );
    expect(result.output).toContain("pending -> connected");

    const configPath = getUserAuthPath();
    const stored = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      provider?: string;
      activeProviderConnectionId?: string;
      providerConnections?: Array<{
        id: string;
        authType: string;
        status?: string;
        apiKey?: string;
      }>;
    };

    expect(stored.provider).toBe("openai-compatible");
    expect(stored.activeProviderConnectionId).toBeTruthy();
    expect(stored.providerConnections?.[0]?.authType).toBe(
      "browser-assisted-capture",
    );
    expect(stored.providerConnections?.[0]?.status).toBe("connected");
    expect(stored.providerConnections?.[0]?.apiKey).toBe("browser-key-test");
    expect(stored.providerConnections?.[0]?.id).toBe(
      stored.activeProviderConnectionId,
    );
    expect(readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values.providerCredentials).toBeUndefined();
  });

  it("records browser-assisted local capture failure as pending -> error", async () => {
    __setConnectBrowserFlowRunnerForTest(async () => {
      throw new Error("callback timeout");
    });

    const result = await runConnectCommand(
      ["login", "openai", "--browser"],
      {
        cwd: workspaceRoot,
      },
    );

    expect(result.kind).toBe("local");
    expect(result.output).toContain(
      "Browser-assisted local credential capture failed",
    );
    expect(result.output).toContain("pending -> error");

    const configPath = getUserAuthPath();
    const stored = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      providerConnections?: Array<{ status?: string }>;
    };

    expect(stored.providerConnections?.[0]?.status).toBe("error");
  });

  it("creates openai account-auth connection and marks it active", async () => {
    __setOpenAIAccountAuthRunnerForTest(() => nativeLogin('acct-access-token', 'acct-refresh-token', 'acct_123'));

    const result = await runConnectCommand(["login", "openai", "--account"], {
      cwd: workspaceRoot,
    });

    expect(result.kind).toBe("local");
    expect(result.output).toContain("OpenAI account-auth connected");
    expect(result.output).toContain("Connection type: account-auth");

    const configPath = getUserAuthPath();
    const stored = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      provider?: string;
      activeProviderConnectionId?: string;
      providerConnections?: Array<{
        id: string;
        authType: string;
        accountAuth?: {
          openai?: {
            type: string;
            accessToken: string;
            refreshToken: string;
            accountId?: string;
          };
        };
      }>;
      providerCredentials?: {
        openai?: {
          accountAuth?: {
            openai?: { type: string };
          };
        };
      };
    };

    expect(stored.provider).toBe("openai");
    expect(stored.activeProviderConnectionId).toBeTruthy();
    expect(stored.providerConnections?.[0]?.authType).toBe("account-auth");
    expect(stored.providerConnections?.[0]?.accountAuth?.openai?.type).toBe(
      "openai-chatgpt-account",
    );
    expect(stored.providerCredentials).toBeUndefined();
    expect(result.output).not.toContain('Automatic renewal remains unverified');
  });

  it.each(['api-key', 'account'])('removes the last %s connection and its credential mirror from fresh resolution', async auth => {
    __setOpenAIAccountAuthRunnerForTest(async () => ({ accessToken: 'SYNTHETIC_LOGOUT_ACCESS', refreshToken: 'SYNTHETIC_LOGOUT_REFRESH',
      expiresAt: Date.now() + 3600000, authorizeUrl: 'https://auth.example.invalid/', callbackUrl: 'http://localhost/' }));
    const args = auth === 'account' ? ['login', 'openai', '--account'] : ['login', 'openai', '--api-key', 'SYNTHETIC_LOGOUT_KEY'];
    await runConnectCommand(args, { cwd: workspaceRoot });
    // Exercise a pre-convergence file: only a matching legacy credential mirror
    // is removed with its last owning connection.
    const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
    const connection = edit.values.providerConnections![0]!;
    writeUserRuntimeConfigFile({ ...edit.values, providerCredentials: { openai: {
      ...(connection.apiKey ? { apiKey: connection.apiKey } : {}),
      ...(connection.accountAuth ? { accountAuth: connection.accountAuth } : {}),
    } } }, edit);
    const before = configStore.getRuntimeConfig(workspaceRoot);
    expect(resolveProviderCredential({ runtimeConfig: before, env: {} }).credential).toBeDefined();
    const result = await runConnectCommand(['logout', before.activeProviderConnectionId!], { cwd: workspaceRoot });
    expect(result.output).toContain('Stored active connection now: none');
    const fresh = configStore.getRuntimeConfig(workspaceRoot);
    expect(resolveProviderCredential({ runtimeConfig: fresh, env: {} }).credential).toBeUndefined();
    expect(JSON.stringify(configStore.readUserRuntimeConfigFile())).not.toMatch(/SYNTHETIC_LOGOUT_(?:ACCESS|REFRESH|KEY)/);
    expect(resolveProviderCredential({ runtimeConfig: fresh, env: { OPENAI_API_KEY: 'SYNTHETIC_EXTERNAL_KEY' } }).credential)
      .toMatchObject({ source: 'env', apiKey: 'SYNTHETIC_EXTERNAL_KEY' });
  });

  it('preserves another connection and an independently replaced fallback credential on logout', async () => {
    await runConnectCommand(['login', 'openai', '--api-key', 'SYNTHETIC_FIRST'], { cwd: workspaceRoot });
    const first = configStore.getRuntimeConfig(workspaceRoot).activeProviderConnectionId!;
    await runConnectCommand(['login', 'openai', '--api-key', 'SYNTHETIC_SECOND'], { cwd: workspaceRoot });
    await runConnectCommand(['logout', first], { cwd: workspaceRoot });
    let fresh = configStore.getRuntimeConfig(workspaceRoot);
    expect(resolveProviderCredential({ runtimeConfig: fresh, env: {} }).credential).toMatchObject({ apiKey: 'SYNTHETIC_SECOND', source: 'connection' });
    const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
    writeUserRuntimeConfigFile({ ...edit.values, providerCredentials: { ...edit.values.providerCredentials,
      openai: { ...edit.values.providerCredentials?.openai, apiKey: 'SYNTHETIC_INDEPENDENT' } } }, edit);
    await runConnectCommand(['logout', fresh.activeProviderConnectionId!], { cwd: workspaceRoot });
    fresh = configStore.getRuntimeConfig(workspaceRoot);
    expect(fresh.providerConnections).toHaveLength(0);
    expect(resolveProviderCredential({ runtimeConfig: fresh, env: {} }).credential).toMatchObject({ apiKey: 'SYNTHETIC_INDEPENDENT', source: 'config' });
  });

  it('retains credentials shared by a surviving connection until its own logout', async () => {
    await runConnectCommand(['login', 'openai', '--api-key', 'SYNTHETIC_SHARED'], { cwd: workspaceRoot });
    const first = configStore.getRuntimeConfig(workspaceRoot).activeProviderConnectionId!;
    await runConnectCommand(['login', 'openai', '--api-key', 'SYNTHETIC_SHARED'], { cwd: workspaceRoot });
    const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
    writeUserRuntimeConfigFile({ ...edit.values, providerCredentials: { openai: { apiKey: 'SYNTHETIC_SHARED' } } }, edit);
    await runConnectCommand(['logout', first], { cwd: workspaceRoot });
    let fresh = configStore.getRuntimeConfig(workspaceRoot);
    expect(fresh.providerCredentials.openai?.apiKey).toBe('SYNTHETIC_SHARED');
    await runConnectCommand(['logout', fresh.activeProviderConnectionId!], { cwd: workspaceRoot });
    fresh = configStore.getRuntimeConfig(workspaceRoot);
    expect(resolveProviderCredential({ runtimeConfig: fresh, env: {} }).credential).toBeUndefined();
  });

  it('mints a login grant only for a native token exchange and never for a raw override', async () => {
    __setOpenAIAccountAuthRunnerForTest(async () => ({ accessToken: 'raw-access', refreshToken: 'raw-refresh', expiresAt: Date.now() + 3600000,
      authorizeUrl: 'https://example.invalid/', callbackUrl: 'http://localhost/', production: {} }));
    const raw = await runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot });
    expect(raw.output).toContain('Automatic renewal remains unverified');
    const rejected = JSON.parse(fs.readFileSync(refreshLeasesPath(), 'utf8')).leases;
    expect(Object.values(rejected).map((row: any) => row.grant)).toEqual([undefined]);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 7200000);
    const resolution = resolveProviderCredential({ runtimeConfig: configStore.getRuntimeConfig(workspaceRoot), env: {} });
    const replay = vi.fn() as unknown as typeof fetch;
    expect((await renewStoredAccount({ workspaceRoot, resolution, fetchImpl: replay })).stored).toBe(false);
    expect(replay).not.toHaveBeenCalled(); clock.mockRestore();
    __setOpenAIAccountAuthRunnerForTest(() => nativeLogin());
    const native = await runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot });
    expect(native.output).not.toContain('Automatic renewal remains unverified');
    const ledger = fs.readFileSync(refreshLeasesPath(), 'utf8'); const rows = JSON.parse(ledger).leases as Record<string, { grant?: { origin?: string } }>;
    expect(Object.values(rows).map(row => row.grant?.origin)).toContain('login');
    expect(ledger).not.toMatch(/native-access|native-refresh|raw-access|raw-refresh/);
  });

  function linkedDocuments(): { settings: string; auth: string } {
    const targets = { settings: path.join(fakeHome, 'settings-owner.json'), auth: path.join(fakeHome, 'auth-owner.json') };
    fs.mkdirSync(path.dirname(getUserRuntimeConfigPath()), { recursive: true });
    fs.writeFileSync(targets.settings, '{"theme":"dark"}');
    fs.writeFileSync(targets.auth, '{}', { mode: 0o600 });
    fs.symlinkSync(targets.settings, getUserRuntimeConfigPath());
    fs.symlinkSync(targets.auth, getUserAuthPath());
    return targets;
  }

  it('keeps stable document links through native grant publication and failed-login cleanup', async () => {
    const targets = linkedDocuments();
    __setOpenAIAccountAuthRunnerForTest(() => nativeLogin());
    const result = await runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot });
    expect(result.output).toContain(`Stored at: ${getUserAuthPath()}`);
    expect(result.output).not.toContain('Automatic renewal remains unverified');
    const rows = JSON.parse(fs.readFileSync(refreshLeasesPath(), 'utf8')).leases;
    expect(Object.values(rows).map((row: any) => row.grant?.origin)).toContain('login');
    __setOpenAIAccountAuthRunnerForTest(async () => { throw new Error('synthetic failed login'); });
    const failed = await runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot });
    expect(failed.output).toContain('pending -> error');
    expect(failed.output).toContain(`Stored at: ${getUserAuthPath()}`);
    expect(fs.realpathSync(getUserRuntimeConfigPath())).toBe(targets.settings);
    expect(fs.realpathSync(getUserAuthPath())).toBe(targets.auth);
  });

  it.each(['settings', 'auth'] as const)('refuses a native login after an identical %s source changes target', async kind => {
    const targets = linkedDocuments();
    let before: Buffer | undefined;
    __setOpenAIAccountAuthRunnerForTest(async () => {
      const result = await nativeLogin();
      const source = kind === 'settings' ? getUserRuntimeConfigPath() : getUserAuthPath();
      before = fs.readFileSync(targets.auth);
      const replacement = path.join(fakeHome, `replacement-${kind}.json`);
      fs.copyFileSync(targets[kind], replacement);
      fs.unlinkSync(source); fs.symlinkSync(replacement, source);
      return result;
    });
    await expect(runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot }))
      .rejects.toMatchObject({ code: 'conflict', state: 'unchanged' });
    expect(fs.existsSync(refreshLeasesPath())).toBe(false);
    expect(fs.readFileSync(targets.auth)).toEqual(before);
    expect(fs.readFileSync(getUserAuthPath())).toEqual(before);
  });

  it.each(['delete', 'provider', 'duplicate', 'status', 'mirror'] as const)('rejects a native login when its pending owner changes: %s', async change => {
    __setOpenAIAccountAuthRunnerForTest(async () => {
      const result = await nativeLogin();
      // Connections are the credential document's; a concurrent change to them
      // is a change to that file.
      const file = getUserAuthPath(), value = JSON.parse(fs.readFileSync(file, 'utf8')) as configStore.RuntimeConfigFile;
      const pending = value.providerConnections![0]!;
      if (change === 'delete') value.providerConnections = [];
      if (change === 'provider') value.providerConnections = [{ ...pending, provider: 'google' }];
      if (change === 'duplicate') value.providerConnections!.push({ ...pending });
      if (change === 'status') value.providerConnections = [{ ...pending, status: 'connected' }];
      if (change === 'mirror') value.providerCredentials = { openai: { apiKey: 'independent-key' } };
      fs.writeFileSync(file, JSON.stringify(value)); return result;
    });
    await expect(runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot })).rejects.toMatchObject({ code: 'conflict', state: 'unchanged' });
    expect(fs.existsSync(refreshLeasesPath())).toBe(false);
    expect(fs.readFileSync(getUserRuntimeConfigPath(), 'utf8')).not.toContain('native-access');
  });

  it('rechecks pending identity under the actual config lock before granting native credentials', async () => {
    __setOpenAIAccountAuthRunnerForTest(() => nativeLogin());
    const lock = store.withFileLock; let captures = 0;
    // The pending connection is in the credential document, so that is the lock
    // whose interior a concurrent writer can change.
    vi.spyOn(store, 'withFileLock').mockImplementation((name, run, options) => lock(name, () => {
      if (name === `${getUserAuthPath()}.lock` && ++captures === 2) {
        const value = JSON.parse(fs.readFileSync(getUserAuthPath(), 'utf8'));
        value.providerConnections[0].label = 'changed-during-lock'; fs.writeFileSync(getUserAuthPath(), JSON.stringify(value));
      }
      return run();
    }, options));
    await expect(runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot })).rejects.toMatchObject({ code: 'conflict', state: 'unchanged' });
    const rows = JSON.parse(fs.readFileSync(refreshLeasesPath(), 'utf8')).leases;
    expect(Object.values(rows).every((row: any) => !row.grant)).toBe(true);
  });

  it('preserves old opaque uncertainty and truthful native access storage without issuing a login grant', async () => {
    fs.mkdirSync(path.dirname(refreshLeasesPath()), { recursive: true });
    fs.writeFileSync(refreshLeasesPath(), JSON.stringify({ version: 1, leases: { opaque: { owner: 'old', phase: 'unknown',
      generation: 'old', expiresAt: 1, updatedAt: 1 } } }));
    __setOpenAIAccountAuthRunnerForTest(() => nativeLogin());
    const result = await runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot });
    expect(result.output).toContain('Access credentials were stored'); expect(result.output).toContain('independent fresh profile');
    expect(configStore.readUserRuntimeConfigFile().providerConnections?.[0]?.accountAuth?.openai?.accessToken).toBe(accountToken('native-access', 'native-account'));
    const ledger = JSON.parse(fs.readFileSync(refreshLeasesPath(), 'utf8')); expect(ledger.legacy.opaque.phase).toBe('unknown');
    expect(Object.keys(ledger.leases)).toHaveLength(0);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 7200000);
    const resolution = resolveProviderCredential({ runtimeConfig: configStore.getRuntimeConfig(workspaceRoot), env: {} });
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect((await renewStoredAccount({ workspaceRoot, resolution, fetchImpl })).stored).toBe(false); expect(fetchImpl).not.toHaveBeenCalled();
  });


  it.each(['http', 'malformed', 'transport'] as const)('renders native login %s failures without token endpoint content', async kind => {
    const marker = 'PRIVATE_LOGIN_RESPONSE_SENTINEL';
    __setOpenAIAccountAuthRunnerForTest(() => nativeLogin('', '', '', () => {
      if (kind === 'transport') throw new Error(marker);
      return new Response(marker, { status: kind === 'http' ? 400 : 200 });
    }));
    const result = await runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot });
    expect(result.output).toContain('account-auth login failed'); expect(result.output).not.toContain(marker);
    expect(result.output).toContain(kind === 'http' ? 'HTTP 400' : kind === 'malformed' ? 'could not be decoded' : 'transport failed');
    expect(configStore.readUserRuntimeConfigFile().providerConnections?.[0]?.status).toBe('error');
  });

  it('keeps known consumption blocked through a same-token native login and grants an independent native token', async () => {
    __setOpenAIAccountAuthRunnerForTest(() => nativeLogin('first-access', 'shared-token'));
    await runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot });
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 7200000);
    let resolution = resolveProviderCredential({ runtimeConfig: configStore.getRuntimeConfig(workspaceRoot), env: {} });
    const lost = vi.fn(async () => { throw new Error('synthetic response lost'); }) as unknown as typeof fetch;
    expect((await renewStoredAccount({ workspaceRoot, resolution, fetchImpl: lost })).stored).toBe(false); expect(lost).toHaveBeenCalledOnce();
    __setOpenAIAccountAuthRunnerForTest(() => nativeLogin('repeated-access', 'shared-token'));
    const repeated = await runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot });
    expect(repeated.output).toContain('Automatic renewal remains unverified');
    clock.mockReturnValue(Date.now() + 7200000);
    resolution = resolveProviderCredential({ runtimeConfig: configStore.getRuntimeConfig(workspaceRoot), env: {} });
    const replay = vi.fn() as unknown as typeof fetch;
    expect((await renewStoredAccount({ workspaceRoot, resolution, fetchImpl: replay })).stored).toBe(false); expect(replay).not.toHaveBeenCalled();
    __setOpenAIAccountAuthRunnerForTest(() => nativeLogin('independent-access', 'independent-token'));
    const independent = await runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot });
    expect(independent.output).not.toContain('Automatic renewal remains unverified');
    const ledger = JSON.parse(fs.readFileSync(refreshLeasesPath(), 'utf8'));
    expect(Object.values(ledger.leases).flatMap((row: any) => Object.values(row.attempts)).some((attempt: any) => attempt.phase === 'unknown')).toBe(true);
    expect(Object.values(ledger.leases).filter((row: any) => row.grant?.origin === 'login')).toHaveLength(2);
  });

  it('does not follow a changed runtime home after native login returns', async () => {
    const source = getUserRuntimeConfigPath(), other = path.join(fakeHome, 'replacement-home');
    fs.mkdirSync(other, { recursive: true });
    __setOpenAIAccountAuthRunnerForTest(async () => {
      const result = await nativeLogin(); process.env.HOME = other; process.env.USERPROFILE = other; return result;
    });
    await expect(runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot })).rejects.toMatchObject({ code: 'conflict', state: 'unchanged' });
    expect(fs.readFileSync(source, 'utf8')).not.toContain('native-access');
    expect(fs.existsSync(getUserRuntimeConfigPath())).toBe(false);
  });


  it.each(['drop', 'throw'] as const)('refuses credential storage when native login reservation cannot be verified: %s', async failure => {
    __setOpenAIAccountAuthRunnerForTest(() => nativeLogin());
    const writer = store.writeJsonFileAtomic;
    vi.spyOn(store, 'writeJsonFileAtomic').mockImplementation((target, value) => {
      if (target !== refreshLeasesPath()) return writer(target, value);
      if (failure === 'throw') throw new Error('PRIVATE_RESERVATION_WRITE_SENTINEL');
    });
    await expect(runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot })).rejects.toMatchObject({ code: 'write-failed', state: 'unchanged' });
    const stored = configStore.readUserRuntimeConfigFile();
    expect(stored.providerConnections?.[0]?.status).toBe('pending'); expect(stored.providerConnections?.[0]?.accountAuth).toBeUndefined();
    expect(stored.providerCredentials?.openai?.accountAuth).toBeUndefined();
    const resolution = resolveProviderCredential({ runtimeConfig: configStore.getRuntimeConfig(workspaceRoot), env: {} });
    const replay = vi.fn() as unknown as typeof fetch;
    expect((await renewStoredAccount({ workspaceRoot, resolution, fetchImpl: replay })).stored).toBe(false); expect(replay).not.toHaveBeenCalled();
    expect(fs.readFileSync(getUserRuntimeConfigPath(), 'utf8')).not.toMatch(/native-access|native-refresh|PRIVATE_RESERVATION/);
  });


  it('does not publish a native login grant or default-switch claim after the verified writer target changes', async () => {
    __setOpenAIAccountAuthRunnerForTest(() => nativeLogin());
    const persist = persistence.persistConfigEdit; let writes = 0;
    vi.spyOn(persistence, 'persistConfigEdit').mockImplementation((...args: Parameters<typeof persistence.persistConfigEdit>) => {
      const result = persist(...args);
      if (++writes === 2) {
        // The selection the verification reads is the credential document's.
        const value = JSON.parse(fs.readFileSync(getUserAuthPath(), 'utf8')); value.activeProviderConnectionId = 'another';
        fs.writeFileSync(getUserAuthPath(), JSON.stringify(value));
      }
      return result;
    });
    await expect(runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot })).rejects.toMatchObject({ code: 'verification-failed', state: 'persisted' });
    const rows = JSON.parse(fs.readFileSync(refreshLeasesPath(), 'utf8')).leases;
    expect(Object.values(rows).every((row: any) => !row.grant)).toBe(true);
    expect(configStore.readUserRuntimeConfigFile().providerConnections?.[0]?.accountAuth?.openai?.accessToken).toBe(accountToken('native-access', 'native-account'));
  });


  it.each(['zero', 'delayed'] as const)('rejects an expired native login result before enrollment or credential storage: %s', async kind => {
    const now = Date.now(), clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    __setOpenAIAccountAuthRunnerForTest(async () => {
      const result = kind === 'zero' ? await nativeLogin('', '', '', () => new Response(JSON.stringify({
        access_token: accountToken('expired-native-access', 'native-account'), refresh_token: 'expired-native-refresh', expires_in: 0,
      }), { headers: { 'content-type': 'application/json' } })) : await nativeLogin();
      if (kind === 'delayed') clock.mockReturnValue(now + 7200000);
      return result;
    });
    const result = await runConnectCommand(['login', 'openai', '--account'], { cwd: workspaceRoot });
    expect(result.output).toContain('account-auth login failed'); expect(result.output).toContain('expired access token');
    const stored = configStore.readUserRuntimeConfigFile();
    expect(stored.providerConnections?.[0]?.status).toBe('error'); expect(stored.providerConnections?.[0]?.accountAuth).toBeUndefined();
    expect(stored.providerCredentials?.openai?.accountAuth).toBeUndefined(); expect(fs.existsSync(refreshLeasesPath())).toBe(false);
    expect(result.output).not.toMatch(/expired-native-access|expired-native-refresh/);
  });

});
