import { NetworkError } from '../../../network/error.js';
import { requestScope, withinRequest } from '../../../network/request.js';
import { discardResponse, parseResponseJson, readResponseText } from '../../../network/response.js';
import { isRecord } from '../../../values/record.js';
import { authorizeLoopback } from '../browser.js';
import { OAuthExchangeError, type OAuthCodeAuthorization, type OAuthLoginOptions } from '../flow.js';
import { loginLifetime } from '../lifetime.js';
import { OPENROUTER_BASE_URL } from './policy.js';

const LABEL = 'OpenRouter';
const EXCHANGE = 'API key exchange';
const LOGIN_TIMEOUT_MS = 5 * 60_000;

/** The provider grants a revocable API key to a public loopback client. */
export async function loginOpenRouter(options: OAuthLoginOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? LOGIN_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) throw new Error('Invalid sign-in timeout.');
  const lifetime = loginLifetime(timeoutMs, options.signal);
  try {
    const authorization = await authorizeLoopback({ path: '/callback', port: 0, timeoutMs, label: LABEL,
      signal: lifetime.signal, stateInPath: true },
      ({ redirectUri, challenge }) => {
        const url = new URL('https://openrouter.ai/auth');
        url.search = new URLSearchParams({ callback_url: redirectUri, code_challenge: challenge,
          code_challenge_method: 'S256', key_label: 'Cheers' }).toString();
        return url.toString();
      }, options);
    return await exchangeKey(authorization, lifetime.signal, options.fetchImpl ?? fetch);
  } catch (error) {
    if (lifetime.signal.aborted) throw new OAuthExchangeError(lifetime.signal.reason?.name === 'TimeoutError' ? 'timeout' : 'cancelled', LABEL, 'sign-in');
    if (error instanceof OAuthExchangeError) throw error;
    throw new OAuthExchangeError('transport', LABEL, 'browser authorization');
  } finally { lifetime.close(); }
}

async function exchangeKey(authorization: OAuthCodeAuthorization, signal: AbortSignal, fetchImpl: typeof fetch): Promise<string> {
  const { code, verifier } = authorization;
  if (!code || code.length > 8192 || /[\x00-\x20\x7f-\x9f]/.test(code)) throw new OAuthExchangeError('response', LABEL, 'browser authorization');
  const scope = requestScope(30_000, signal);
  let step: 'transport' | 'decode' = 'transport';
  try {
    scope.check();
    const pending = fetchImpl(`${OPENROUTER_BASE_URL}/auth/keys`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, redirect: 'error',
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }), signal: scope.signal,
    });
    void pending.then(response => { if (scope.signal.aborted) discardResponse(response); }, () => undefined);
    const response = await withinRequest(pending, scope);
    if (!response.ok) { discardResponse(response); throw new OAuthExchangeError('http', LABEL, EXCHANGE, response.status); }
    step = 'decode';
    const value = parseResponseJson(await withinRequest(readResponseText(response, scope, 128 * 1024), scope));
    if (!isRecord(value) || typeof value.key !== 'string' || !value.key || value.key.length > 8192 || /[\x00-\x20\x7f-\x9f]/.test(value.key)) {
      throw new OAuthExchangeError('response', LABEL, EXCHANGE);
    }
    scope.check();
    return value.key;
  } catch (error) {
    if (scope.signal.aborted) {
      const reason = scope.signal.reason;
      throw new OAuthExchangeError(reason instanceof NetworkError && reason.code === 'timeout' ? 'timeout' : 'cancelled', LABEL, EXCHANGE);
    }
    if (error instanceof OAuthExchangeError) throw error;
    throw new OAuthExchangeError(step, LABEL, EXCHANGE);
  } finally { scope.dispose(); }
}
