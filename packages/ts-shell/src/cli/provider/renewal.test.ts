import { accountToken, observeOAuthRenewal } from '../../test-utils/oauth.js';
import fs from 'node:fs';
import http from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { getRuntimeConfig, getUserAuthPath, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../config/runtimeConfig.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import * as persistence from '../../config/persistence.js';
import * as transport from '../../provider/request/fetch.js';
import { delegatedSteps } from './step.js';

const servers: http.Server[] = [];
function configBytes() {
  return [getUserRuntimeConfigPath(), getUserAuthPath()].map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined);
}
const old = { type: 'openai-chatgpt-account' as const, accountId: 'b', accessToken: 'synthetic-old', refreshToken: 'synthetic-refresh', expiresAt: 1 };
const fresh = { ...old, accessToken: accountToken('synthetic-fresh', 'b'), refreshToken: 'synthetic-rotated', expiresAt: Date.now() + 3600000 };
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
    expect(request.url).toBe('/codex/responses');
    expect(body).toMatchObject({ store: false, stream: true });
    expect(body).not.toHaveProperty('max_output_tokens');
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end('data: ' + JSON.stringify({ type: 'response.completed', response: { id: 'r', status: 'completed', output: [{ type: 'message', id: 'm', role: 'assistant', content: [{ type: 'output_text', text: 'Prepared account answer' }] }], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } }) + '\n\n');
  });
  servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Fixture missing address');
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  const create = transport.providerFetchForEndpoint;
  vi.spyOn(transport, 'providerFetchForEndpoint').mockImplementation((config, endpoint, shape, admission, beforeDispatch) => endpoint !== 'openai-account-responses'
    ? create(config, endpoint, shape, admission, beforeDispatch) : (url, init) => {
    expect(String(url)).toBe('https://chatgpt.com/backend-api/codex/responses');
    const refused = admission?.(); if (refused) throw new Error(refused); beforeDispatch?.(init);
    return fetch(`http://127.0.0.1:${address.port}/codex/responses`, init);
  });
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'a', retryEnabled: false, providerRetryMaxRetries: 0,
    reserveTokens: 0, providerConnections: [
      { id: 'a', provider: 'openai', authType: 'api-key', apiKey: 'synthetic-a', model: 'main', baseUrl, status: 'connected' },
      { id: 'b', provider: 'openai', authType: 'account-auth', accountAuth: { openai: old }, model: 'gpt-5.4', ...(catalogDefault ? { baseUrl } : { baseUrl: 'https://chatgpt.com/backend-api' }), status: 'connected' },
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
  const answers = await Promise.all([setup.send(), setup.send('gpt-5.2')]);
  expect(answers.map(answer => [answer.stopReason, answer.text])).toEqual([['stop', 'Prepared account answer'], ['stop', 'Prepared account answer']]);
  expect(renew).toHaveBeenCalledOnce(); expect(setup.published).toHaveBeenCalledOnce();
  expect(setup.requests).toHaveLength(2);
  expect(setup.requests.map(row => row.model).sort()).toEqual(['gpt-5.2', 'gpt-5.4']);
  expect(setup.requests.every(row => row.authorization === `Bearer ${fresh.accessToken}` && row.stored)).toBe(true);
});

it('refuses an explicit foreign account endpoint before renewal', async () => {
  const setup = await fixture(true);
  const renew = observeOAuthRenewal(fresh);
  const bytes = configBytes();
  expect(() => setup.send()).toThrow(/usable credential/);
  expect(renew).not.toHaveBeenCalled(); expect(setup.published).not.toHaveBeenCalled();
  expect(setup.requests).toEqual([]);
  expect(configBytes()).toEqual(bytes);
});

it.each(['logout', 'relogin', 'topology'] as const)('cached renewal cannot survive %s and never sends a replacement owner', async kind => {
  const setup = await fixture(); const renew = observeOAuthRenewal(fresh);
  await setup.select.prepare('b/gpt-5.4');
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath()); const connections = edit.values.providerConnections!;
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: kind === 'logout' ? connections.filter(row => row.id !== 'b')
    : kind === 'topology' ? [...connections, { id: 'c', provider: 'google', authType: 'api-key', apiKey: 'synthetic-c', status: 'connected' }]
      : connections.map(row => row.id === 'b' ? { ...row, accountAuth: { openai: { ...fresh, accountId: 'replacement', accessToken: 'synthetic-new-login' } } } : row) }, edit);
  const bytes = configBytes();
  await expect(setup.send()).rejects.toThrow();
  expect(renew).toHaveBeenCalledOnce(); expect(setup.requests).toEqual([]);
  expect(configBytes()).toEqual(bytes);
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
