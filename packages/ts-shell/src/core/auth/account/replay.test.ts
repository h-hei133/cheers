import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { getRuntimeConfig, getUserAuthPath, type RuntimeConfigFile } from '../../../config/runtimeConfig.js';
import { accountToken } from '../../../test-utils/oauth.js';
import { createProfileContext, withProfile, type ProfileContext } from '../../paths/profile/context.js';
import { resolveProviderCredential } from '../../shell/providerCredentials.js';
import { runOAuthLogin } from '../oauth/flow.js';
import { openAIOAuthConfig } from '../oauth/providers.js';
import { __setOpenAIProviderAuthLoginForTest, runProviderAccountAuthLogin } from '../providerAuthRuntime.js';
import { accountReplayOwner } from './replay.js';
import { renewStoredAccount } from './renewal.js';
import { acquireRefreshLease, markRefreshDispatched, markRefreshUnknown, refreshLeasesPath } from './lease.js';
import { accountBinding, captureAccountEdit } from './state.js';
import { requestReplayBinding } from '../../../provider/request/replay.js';

let fixture: string;
let workspace: string;
let profile: ProfileContext;
let sequence = 0;
beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'account-replay-')); workspace = path.join(fixture, 'workspace'); fs.mkdirSync(workspace);
  profile = createProfileContext({ name: 'a', homeDir: fixture, env: {} });
});
afterEach(() => { __setOpenAIProviderAuthLoginForTest(); fs.rmSync(fixture, { recursive: true, force: true }); });
const resolve = () => resolveProviderCredential({ runtimeConfig: getRuntimeConfig(workspace), env: {} });
const owner = () => accountReplayOwner(workspace, resolve());
const read = (): RuntimeConfigFile => JSON.parse(fs.readFileSync(getUserAuthPath(), 'utf8'));
const write = (value: RuntimeConfigFile) => fs.writeFileSync(getUserAuthPath(), JSON.stringify(value), { mode: 0o600 });
const binding = () => {
  const resolution = resolve(), account = resolution.credential!.accountAuth!;
  return requestReplayBinding({ ...resolution, baseUrl: 'https://chatgpt.com/backend-api', endpoint: 'openai-account-responses',
    credentialId: resolution.credential!.connectionId, replayOwner: owner(), headers: { authorization: `Bearer ${account.accessToken}` } });
};
async function login() {
  const config = openAIOAuthConfig();
  const native = await runOAuthLogin({ ...config, callbackPort: 0 }, {
    openBrowser: async address => {
      const url = new URL(address), callback = new URL(url.searchParams.get('redirect_uri')!);
      callback.searchParams.set('code', 'synthetic-code'); callback.searchParams.set('state', url.searchParams.get('state')!);
      expect((await fetch(callback)).ok).toBe(true);
    },
    fetchImpl: async (address, init) => {
      expect(String(address)).toBe(config.tokenUrl); expect(init?.redirect).toBe('error');
      return Response.json({ access_token: accountToken(`login-${++sequence}`), refresh_token: `refresh-${sequence}`, expires_in: 30 });
    },
  });
  __setOpenAIProviderAuthLoginForTest(async () => native);
  try {
    const result = await runProviderAccountAuthLogin({ provider: 'openai', providerLabel: 'OpenAI', workspaceRoot: workspace });
    expect(result).toContain('connected via browser login'); expect(result).not.toContain('unverified'); expect(owner()).toBeDefined();
  } finally { __setOpenAIProviderAuthLoginForTest(); }
}

it('preserves replay only after actual native login and verified stored renewal, while relogin changes it', async () => {
  await withProfile(profile, async () => {
    await login(); const before = owner(), oldBinding = binding(), loginId = resolve().credential!.accountAuth, original = read();
    const result = await renewStoredAccount({ workspaceRoot: workspace, resolution: resolve(), fetchImpl: async () =>
      Response.json({ access_token: accountToken('renewal'), refresh_token: 'rotated', expires_in: 3600 }) });
    expect(result).toMatchObject({ stored: true, writeState: 'persisted' }); expect(result.rotation).toBeDefined();
    expect(result.accountAuth?.type === 'openai-chatgpt-account' && result.accountAuth.loginId).toBe(loginId?.type === 'openai-chatgpt-account' && loginId.loginId);
    expect(owner()).toBe(before); expect(binding()).toBe(oldBinding);
    const rotated = read(); write(original);
    expect(owner()).toBeUndefined(); expect(binding()).not.toBe(oldBinding);
    write(rotated); expect(owner()).toBe(before);
    await login(); expect(owner()).not.toBe(before); expect(binding()).not.toBe(oldBinding);
  });
});

it.each(['accessToken', 'refreshToken', 'expiresAt', 'loginId', 'accountId', 'slot', 'baseline', 'active', 'unknown'])('fences %s from preserving native replay', async change => {
  await withProfile(profile, async () => {
    await login(); const before = owner(), oldBinding = binding();
    if (change === 'baseline') fs.rmSync(refreshLeasesPath());
    else if (change === 'active' || change === 'unknown') {
      const resolution = resolve();
      const lease = acquireRefreshLease({ provider: 'openai', refreshToken: resolution.credential!.accountAuth!.refreshToken,
        binding: accountBinding(captureAccountEdit(workspace, resolution)) });
      expect(lease.claim).toBeDefined();
      if (change === 'unknown') { markRefreshDispatched(lease.claim!); markRefreshUnknown(lease.claim!); }
    } else {
      const config = read(), connection = config.providerConnections![0]!;
      if (change === 'slot') { connection.id = 'copied'; config.activeProviderConnectionId = 'copied'; }
      else {
        const account = connection.accountAuth!.openai!;
        const changed = { ...account, [change]: change === 'expiresAt' ? account.expiresAt + 1 : 'replacement' };
        connection.accountAuth = { openai: changed };
      }
      write(config);
    }
    expect(before).toBeDefined(); expect(owner()).toBeUndefined(); expect(binding()).not.toBe(oldBinding);
  });
});

it('fences copied profile config and ledger, and a replaced profile directory', async () => {
  await withProfile(profile, login);
  const other = createProfileContext({ name: 'b', homeDir: fixture, env: {} });
  for (const name of ['config.json', 'auth.json', 'refresh-leases.json']) fs.copyFileSync(path.join(profile.root, name), path.join(other.root, name));
  await withProfile(other, () => { expect(owner()).toBeUndefined(); });
  await withProfile(profile, () => {
    const captured = resolve(); fs.renameSync(profile.root, `${profile.root}.old`); fs.mkdirSync(profile.root);
    for (const name of ['config.json', 'auth.json', 'refresh-leases.json']) fs.copyFileSync(path.join(`${profile.root}.old`, name), path.join(profile.root, name));
    expect(accountReplayOwner(workspace, captured)).toBeUndefined();
  });
});
