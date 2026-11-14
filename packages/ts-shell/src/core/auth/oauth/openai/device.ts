import { DeviceFlowError, pollDeviceFlow } from '../deviceCode.js';
import { runOAuthDeviceLogin, type OAuthLoginOptions, type OAuthLoginResult, type OAuthProviderConfig } from '../flow.js';
import { loginLifetime } from '../lifetime.js';
import { requestScope, withinRequest } from '../../../network/request.js';
import { discardResponse, parseResponseJson, readResponseText } from '../../../network/response.js';
import { isRecord } from '../../../values/record.js';

const origin = 'https://auth.openai.com';
const verificationUri = `${origin}/codex/device`;
const redirectUri = `${origin}/deviceauth/callback`;

export class OpenAIDeviceAuthError extends Error {
  constructor(readonly code: 'http' | 'transport' | 'response' | 'refused' | 'display' | 'cancelled' | 'timeout', readonly status?: number) {
    super(`OpenAI device sign-in: ${
      { http: `request failed with HTTP ${status}`, transport: 'transport failed', response: 'returned invalid device metadata',
        refused: 'authorization was refused or expired', display: 'requires a sign-in instruction display',
        cancelled: 'cancelled', timeout: 'timed out' }[code]}.`);
  }
}

export interface OpenAIDeviceCodeStart {
  readonly deviceAuthId: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly intervalSeconds: number;
}

interface DeviceRequestOptions { readonly fetchImpl?: typeof fetch; readonly signal?: AbortSignal }

/** Bound headers and bodies; late transport outcomes cannot resume a cancelled login. */
async function requestJson(path: string, body: Readonly<Record<string, string>>, options: DeviceRequestOptions) {
  const scope = requestScope(30_000, options.signal);
  let response: Response | undefined;
  try {
    scope.check();
    const pending = (options.fetchImpl ?? fetch)(`${origin}${path}`, { method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: scope.signal });
    void pending.then(late => { if (scope.signal.aborted) discardResponse(late); }, () => undefined);
    response = await withinRequest(pending, scope);
    if (response.status === 403 || response.status === 404 || response.status === 429 || response.status >= 500) {
      discardResponse(response);
      return { ok: response.ok, status: response.status, body: undefined };
    }
    let decoded: unknown;
    try { decoded = parseResponseJson(await withinRequest(readResponseText(response, scope, 128 * 1024), scope)); }
    catch { throw new OpenAIDeviceAuthError('response'); }
    if (!isRecord(decoded)) throw new OpenAIDeviceAuthError('response');
    return { ok: response.ok, status: response.status, body: decoded };
  } catch (error) {
    if (response) discardResponse(response);
    if (options.signal?.aborted) throw new OpenAIDeviceAuthError('cancelled');
    if (scope.signal.aborted) throw new OpenAIDeviceAuthError('timeout');
    throw error instanceof OpenAIDeviceAuthError ? error : new OpenAIDeviceAuthError('transport');
  } finally { scope.dispose(); }
}

/** Only bounded printable values may reach the instruction display or token exchange. */
function opaque(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && /^[\x21-\x7e]+$/.test(value);
}

export async function startOpenAIDeviceAuth(clientId: string, options: DeviceRequestOptions = {}): Promise<OpenAIDeviceCodeStart> {
  const result = await requestJson('/api/accounts/deviceauth/usercode', { client_id: clientId }, options);
  if (!result.ok) throw new OpenAIDeviceAuthError('http', result.status);
  const body = result.body, userCode = body?.user_code ?? body?.usercode;
  if (!body || !opaque(body.device_auth_id, 4096) || typeof userCode !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(userCode)) {
    throw new OpenAIDeviceAuthError('response');
  }
  const parsedInterval = Number(body.interval ?? 5);
  return { deviceAuthId: body.device_auth_id, userCode, verificationUri,
    intervalSeconds: Number.isFinite(parsedInterval) && parsedInterval > 0 ? Math.min(300, parsedInterval) : 5 };
}

export async function pollOpenAIDeviceAuth(start: OpenAIDeviceCodeStart, options: DeviceRequestOptions = {}) {
  const lifetime = loginLifetime(15 * 60_000, options.signal);
  try {
    return await pollDeviceFlow<{ readonly authorizationCode: string; readonly codeVerifier: string }>({
      intervalSeconds: start.intervalSeconds, expiresInSeconds: 15 * 60, signal: lifetime.signal,
      poll: async () => {
        let result: Awaited<ReturnType<typeof requestJson>>;
        try { result = await requestJson('/api/accounts/deviceauth/token', { device_auth_id: start.deviceAuthId, user_code: start.userCode },
          { ...options, signal: lifetime.signal }); }
        catch (error) {
          if (lifetime.signal.aborted) throw new OpenAIDeviceAuthError('cancelled');
          if (error instanceof OpenAIDeviceAuthError && (error.code === 'transport' || error.code === 'timeout')) return { status: 'pending' };
          throw error;
        }
        if (result.status === 403 || result.status === 404 || result.status >= 500) return { status: 'pending' };
        if (result.status === 429) return { status: 'slow_down' };
        const body = result.body;
        const error = typeof body?.error === 'string' ? body.error : isRecord(body?.error) ? body.error.code : undefined;
        if (error === 'authorization_pending' || error === 'deviceauth_authorization_pending') return { status: 'pending' };
        if (error === 'slow_down') return { status: 'slow_down' };
        if (!result.ok || body?.error !== undefined) throw new OpenAIDeviceAuthError('refused');
        if (!body || !opaque(body.authorization_code, 4096) || typeof body.code_verifier !== 'string'
          || !/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier)) throw new OpenAIDeviceAuthError('response');
        return { status: 'complete', value: { authorizationCode: body.authorization_code, codeVerifier: body.code_verifier } };
      },
    });
  } catch (error) {
    if (lifetime.signal.aborted) throw new OpenAIDeviceAuthError(lifetime.signal.reason?.name === 'TimeoutError' ? 'timeout' : 'cancelled');
    if (error instanceof DeviceFlowError) throw new OpenAIDeviceAuthError(error.kind === 'timeout' ? 'timeout' : error.kind === 'cancelled' ? 'cancelled' : 'refused');
    throw error;
  } finally { lifetime.close(); }
}

/** The user sees the code before polling; the shared owner alone exchanges and mints proof. */
export async function runOpenAIDeviceLogin(config: OAuthProviderConfig, options: OAuthLoginOptions = {}): Promise<OAuthLoginResult> {
  if (!options.onProgress) throw new OpenAIDeviceAuthError('display');
  return runOAuthDeviceLogin(config, async signal => {
    const start = await startOpenAIDeviceAuth(config.clientId, { fetchImpl: options.fetchImpl, signal });
    signal.throwIfAborted();
    options.onProgress!({ authorizeUrl: start.verificationUri, userCode: start.userCode });
    signal.throwIfAborted();
    const code = await pollOpenAIDeviceAuth(start, { fetchImpl: options.fetchImpl, signal });
    return { code: code.authorizationCode, verifier: code.codeVerifier, authorizeUrl: start.verificationUri, redirectUri };
  }, options);
}
