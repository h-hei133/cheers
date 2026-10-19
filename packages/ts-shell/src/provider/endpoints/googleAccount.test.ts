import http from 'node:http';
import { afterEach, expect, it } from 'vitest';
import { providerAuthorization } from '../request/authorization.js';
import { providerFetchForEndpoint } from '../request/fetch.js';
import { requestSimpleCompletion } from '../request/completion.js';
import { requestCompactionSummary } from '../../core/query/compaction/summarize.js';
import { createStepFunction } from '../../turn/step.js';
import { endpointShape } from './index.js';
import { checkRealProviderReadiness } from '../../core/shell/providerReadiness.js';

const account = { type: 'google-gemini-account' as const, accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh',
  expiresAt: Date.now() + 3600_000, clientId: 'synthetic-client', scopes: ['https://www.googleapis.com/auth/cloud-platform'], quotaProject: 'synthetic-project' };
const servers: http.Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
  server.closeAllConnections(); server.close(() => resolve());
}))); });
async function listen(server: http.Server): Promise<string> {
  servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

it('sends main SSE and auxiliary native JSON through actual HTTP with the selected account project', async () => {
  const requests: { url: string; body: Record<string, unknown>; headers: http.IncomingHttpHeaders }[] = [];
  const baseUrl = await listen(http.createServer((request, response) => {
    let raw = ''; request.setEncoding('utf8'); request.on('data', chunk => { raw += chunk; }); request.on('end', () => {
      requests.push({ url: request.url!, body: JSON.parse(raw), headers: request.headers });
      const answer = { candidates: [{ content: { parts: [{ text: 'native answer' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3, totalTokenCount: 10 } };
      const stream = request.url!.includes('streamGenerateContent');
      response.setHeader('content-type', stream ? 'text/event-stream' : 'application/json');
      response.end(stream ? `data: ${JSON.stringify(answer)}\n\n` : JSON.stringify(answer));
    });
  }));
  const provider = { providerId: 'google', endpoint: 'google-account-generative-ai', baseUrl, model: 'gemini-fixture',
    headers: providerAuthorization({ accountAuth: account, endpoint: 'google-account-generative-ai' }).headers };
  const messages = [{ role: 'user' as const, content: 'hello' }];
  expect(await requestSimpleCompletion({ provider, messages })).toBe('native answer');
  expect(await requestCompactionSummary({ provider, messages, fetchImpl: fetch })).toContain('native answer');
  const step = createStepFunction({ provider, workspaceRoot: process.cwd(), sessionId: 'google-native-http',
    systemPrompt: 'brief', tools: [] });
  const result = await step(messages, undefined, {}, { allowTools: false });
  expect(result.text).toBe('native answer'); expect(result.stopReason).toBe('stop');
  expect(requests.map(request => request.url)).toEqual([
    '/v1beta/models/gemini-fixture:generateContent', '/v1beta/models/gemini-fixture:generateContent',
    '/v1beta/models/gemini-fixture:streamGenerateContent?alt=sse',
  ]);
  for (const request of requests) {
    expect(request.headers.authorization).toBe('Bearer synthetic-access');
    expect(request.headers['x-goog-user-project']).toBe('synthetic-project'); expect(request.headers['x-goog-api-key']).toBeUndefined();
    expect(request.body).toHaveProperty('contents'); expect(request.body).not.toHaveProperty('messages');
  }
});

it.each([307, 308])('refuses a native generation redirect %s before forwarding bearer or billing project', async status => {
  let foreignHits = 0, issuerHits = 0;
  const foreign = await listen(http.createServer((_request, response) => { foreignHits++; response.end('{}'); }));
  const issuer = await listen(http.createServer((_request, response) => { issuerHits++; response.writeHead(status, { location: foreign }); response.end(); }));
  const send = providerFetchForEndpoint(undefined, 'google-account-generative-ai', endpointShape);
  await expect(send(issuer, { method: 'POST', body: '{}', headers: providerAuthorization({ accountAuth: account, endpoint: 'google-account-generative-ai' }).headers })).rejects.toThrow();
  expect(issuerHits).toBe(1); expect(foreignHits).toBe(0);
});

it.each([307, 308])('refuses an actual native models redirect %s before forwarding the billing project', async status => {
  let foreignHits = 0, issuerHits = 0;
  const foreign = await listen(http.createServer((_request, response) => { foreignHits++; response.end('{}'); }));
  const issuer = await listen(http.createServer((request, response) => {
    issuerHits++;
    expect(request.url).toBe('/v1beta/models'); expect(request.headers.authorization).toBe('Bearer synthetic-access');
    expect(request.headers['x-goog-user-project']).toBe('synthetic-project'); expect(request.headers['x-goog-api-key']).toBeUndefined();
    response.writeHead(status, { location: foreign }); response.end();
  }));
  const result = await checkRealProviderReadiness({ provider: 'google', model: 'gemini-fixture', accountAuth: account,
    fetchImpl: (input, init) => fetch(String(input).replace('https://generativelanguage.googleapis.com', issuer), init) });
  expect(result).toMatchObject({ ok: false, failure: { kind: 'network' } }); expect(issuerHits).toBeGreaterThan(0); expect(foreignHits).toBe(0);
});
