import { observeOAuthRenewal } from '../../test-utils/oauth.js';
import fs from 'node:fs';
import http from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../config/runtimeConfig.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import * as persistence from '../../config/persistence.js';
import { delegatedSteps } from './step.js';

const servers: http.Server[] = [];
const old = { type: 'openai-chatgpt-account' as const, accountId: 'b', accessToken: 'synthetic-old', refreshToken: 'synthetic-refresh', expiresAt: 1 };
const fresh = { ...old, accessToken: 'synthetic-fresh', refreshToken: 'synthetic-rotated', expiresAt: Date.now() + 3600000 };
afterEach(async () => {
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  cleanupAdvisorHarnesses();
});

async function fixture(catalogDefault = false) {
  const setup = createAdvisorHarness(false, false); vi.stubEnv('OPENAI_API_KEY', '');
  const requests: { model: string; authorization?: string; stored: boolean }[] = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push({ model: body.model, authorization: request.headers.authorization,
      stored: getRuntimeConfig(setup.root).providerConnections.find(row => row.id === 'b')?.accountAuth?.openai?.accessToken === fresh.accessToken });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content: 'Prepared account answer' }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 1 } }));
  });
  servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Fixture missing address');
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'a', retryEnabled: false, providerRetryMaxRetries: 0,
    maxOutputTokens: 10, reserveTokens: 0, providerConnections: [
      { id: 'a', provider: 'openai', authType: 'api-key', apiKey: 'synthetic-a', model: 'main', baseUrl, status: 'connected' },
      { id: 'b', provider: 'openai', authType: 'account-auth', accountAuth: { openai: old }, model: 'gpt-5.4', ...(catalogDefault ? {} : { baseUrl }), status: 'connected' },
    ] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  const config = getRuntimeConfig(setup.root); const published = vi.fn();
  const select = delegatedSteps({ providerMode: 'real', providerCredentialResolution: resolveProviderCredential({ runtimeConfig: config, env: {} }),
    runtimeConfig: config, providerCatalog: [{ id: 'openai', baseUrl, endpoint: 'openai-compatible', models: ['main', 'gpt-5.4', 'gpt-5.2'].map(id => ({ id, maxTokens: 10, contextWindow: 10000 })) }],
    workspaceRoot: setup.root, sessionId: setup.session.id, agentMode: 'plan', onCredentialPersisted: published }, new Map(), {});
  const send = (model = 'gpt-5.4') => select({ connectionId: 'b', provider: 'openai', model })([{ role: 'user', content: 'Fixture' }], setup.signal, {}, { allowTools: false, agentMode: 'plan' });
  return { ...setup, requests, published, select, send };
}

it('shares one verified rotation across two delegated models and sends only the stored credential', async () => {
  const setup = await fixture();
  const renew = observeOAuthRenewal(fresh);
  await Promise.all([setup.send(), setup.send('gpt-5.2')]);
  expect(renew).toHaveBeenCalledOnce(); expect(setup.published).toHaveBeenCalledOnce();
  expect(setup.requests).toHaveLength(2);
  expect(setup.requests.map(row => row.model).sort()).toEqual(['gpt-5.2', 'gpt-5.4']);
  expect(setup.requests.every(row => row.authorization === 'Bearer synthetic-fresh' && row.stored)).toBe(true);
});

it('refuses a catalogue relocation before renewing an account with no declared endpoint', async () => {
  const setup = await fixture(true);
  const renew = observeOAuthRenewal(fresh);
  const bytes = fs.readFileSync(getUserRuntimeConfigPath());
  expect(() => setup.send()).toThrow(/catalogue cannot override/);
  expect(renew).not.toHaveBeenCalled(); expect(setup.published).not.toHaveBeenCalled();
  expect(setup.requests).toEqual([]);
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(bytes);
});

it.each(['logout', 'relogin', 'topology'] as const)('cached renewal cannot survive %s and never sends a replacement owner', async kind => {
  const setup = await fixture(); const renew = observeOAuthRenewal(fresh);
  await setup.select.prepare('b/gpt-5.4');
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath()); const connections = edit.values.providerConnections!;
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: kind === 'logout' ? connections.filter(row => row.id !== 'b')
    : kind === 'topology' ? [...connections, { id: 'c', provider: 'google', authType: 'api-key', apiKey: 'synthetic-c', status: 'connected' }]
      : connections.map(row => row.id === 'b' ? { ...row, accountAuth: { openai: { ...fresh, accountId: 'replacement', accessToken: 'synthetic-new-login' } } } : row) }, edit);
  const bytes = fs.readFileSync(getUserRuntimeConfigPath());
  await expect(setup.send()).rejects.toThrow();
  expect(renew).toHaveBeenCalledOnce(); expect(setup.requests).toEqual([]);
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(bytes);
});

it('unverified persistence prevents delegated publication and HTTP', async () => {
  const setup = await fixture(); observeOAuthRenewal(fresh);
  vi.spyOn(persistence, 'persistConfigEdit').mockImplementation(() => {});
  await expect(setup.send()).rejects.toThrow(/not accepted/);
  expect(setup.published).not.toHaveBeenCalled(); expect(setup.requests).toEqual([]);
});

it('concurrent normal and preparing waiters cannot adopt each other\'s publication', async () => {
  const setup = await fixture();
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  observeOAuthRenewal(fresh, () => held);
  const normal = setup.send();
  const publication = vi.fn((_rotation, publish) => publish());
  const preparing = setup.select.prepare('b/gpt-5.4', undefined, undefined, undefined, publication);
  release(); await Promise.all([normal, preparing]);
  expect(setup.published).toHaveBeenCalledOnce(); expect(publication).not.toHaveBeenCalled();
});
