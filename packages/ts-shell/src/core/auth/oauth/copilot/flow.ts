import { createHash } from 'node:crypto';
import { pollDeviceFlow, type DeviceCodeGrant } from '../deviceCode.js';
import { requestScope, withinRequest } from '../../../network/request.js';
import { discardResponse, parseResponseJson, readResponseText } from '../../../network/response.js';
import { isRecord } from '../../../values/record.js';
import { COPILOT_OAUTH, copilotBaseUrl } from './policy.js';
import { SubscriptionError, type CopilotCredential } from './model.js';

const proofs = new WeakMap<object, string>();
const headers = { accept: 'application/json', 'user-agent': 'cheers' };

function digest(credential: Omit<CopilotCredential, 'provider'>): string {
  return createHash('sha256').update(JSON.stringify([COPILOT_OAUTH.issuer, COPILOT_OAUTH.clientId, 'github-copilot',
    credential.accessToken, credential.refreshToken, credential.expiresAt, credential.baseUrl])).digest('hex');
}

/** Only a successfully decoded native device login may enroll its exact credential. */
export function nativeCopilotLogin(credential: Omit<CopilotCredential, 'provider'> & { readonly provider?: string }): boolean {
  return credential.provider === 'github-copilot' && !!credential.production && proofs.get(credential.production) === digest(credential);
}

async function requestJson(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<Record<string, unknown>> {
  const scope = requestScope(30_000, init.signal ?? undefined);
  try {
    scope.check();
    const response = await withinRequest(fetchImpl(url, { ...init, redirect: 'error', signal: scope.signal }), scope);
    if (!response.ok) {
      discardResponse(response);
      throw new SubscriptionError(`GitHub account exchange failed with HTTP ${response.status}.`);
    }
    const body = parseResponseJson(await readResponseText(response, scope, 128 * 1024));
    if (!isRecord(body)) throw new SubscriptionError('GitHub account response is invalid.');
    return body;
  } catch (error) {
    throw error instanceof SubscriptionError ? error : new SubscriptionError('GitHub account transport or response failed.');
  } finally { scope.dispose(); }
}

function form(values: Record<string, string>): RequestInit {
  return { method: 'POST', headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values).toString() };
}

function verificationUrl(value: unknown): string {
  if (typeof value !== 'string') throw new SubscriptionError('GitHub sign-in returned no verification address.');
  let url: URL;
  try { url = new URL(value); } catch { throw new SubscriptionError('GitHub sign-in verification address is invalid.'); }
  if (url.origin !== 'https://github.com' || url.pathname !== '/login/device' || url.username || url.password || url.hash) {
    throw new SubscriptionError('GitHub sign-in verification address is untrusted.');
  }
  return url.href;
}

export async function startGitHubDeviceFlow(options: { readonly fetchImpl?: typeof fetch; readonly signal?: AbortSignal } = {}): Promise<DeviceCodeGrant> {
  const body = await requestJson(COPILOT_OAUTH.deviceCode, { ...form({ client_id: COPILOT_OAUTH.clientId, scope: COPILOT_OAUTH.scope }),
    ...(options.signal ? { signal: options.signal } : {}) }, options.fetchImpl ?? fetch);
  if (typeof body.device_code !== 'string' || !body.device_code.trim() || typeof body.user_code !== 'string'
    || !/^[A-Za-z0-9-]{1,32}$/.test(body.user_code) || typeof body.expires_in !== 'number'
    || !Number.isFinite(body.expires_in) || body.expires_in <= 0 || body.expires_in > 86_400
    || (body.interval !== undefined && (typeof body.interval !== 'number' || !Number.isFinite(body.interval) || body.interval <= 0 || body.interval > 3600))) {
    throw new SubscriptionError('GitHub sign-in returned invalid device metadata.');
  }
  return { deviceCode: body.device_code, userCode: body.user_code, verificationUri: verificationUrl(body.verification_uri),
    ...(body.verification_uri_complete !== undefined ? { verificationUriComplete: verificationUrl(body.verification_uri_complete) } : {}),
    ...(typeof body.interval === 'number' ? { intervalSeconds: body.interval } : {}), expiresInSeconds: body.expires_in };
}

/** One GET re-exchanges the captured GitHub token; it is not replaced by a session token. */
export async function refreshCopilotToken(input: { readonly refreshToken: string; readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal }): Promise<CopilotCredential> {
  if (!input.refreshToken.trim()) throw new SubscriptionError('GitHub account renewal has no refresh credential.');
  const body = await requestJson(COPILOT_OAUTH.issuer, { headers: { ...headers, authorization: `Bearer ${input.refreshToken}` },
    ...(input.signal ? { signal: input.signal } : {}) }, input.fetchImpl ?? fetch);
  if (body.error !== undefined || typeof body.token !== 'string' || !body.token.trim() || typeof body.expires_at !== 'number'
    || !Number.isSafeInteger(body.expires_at) || body.expires_at * 1000 <= Date.now() || body.expires_at > 8_640_000_000_000) {
    throw new SubscriptionError('GitHub returned invalid or expired Copilot session metadata.');
  }
  let baseUrl: string;
  try { baseUrl = copilotBaseUrl(body.token); } catch {
    throw new SubscriptionError('GitHub returned invalid or untrusted Copilot session metadata.');
  }
  return { provider: 'github-copilot', accessToken: body.token, refreshToken: input.refreshToken,
    expiresAt: body.expires_at * 1000, baseUrl };
}

export async function completeGitHubDeviceFlow(input: { readonly grant: DeviceCodeGrant; readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal }): Promise<CopilotCredential> {
  const scope = requestScope(Math.min(5 * 60_000, (input.grant.expiresInSeconds ?? 300) * 1000), input.signal);
  try {
    const gitHubToken = await pollDeviceFlow<string>({ ...input.grant, signal: scope.signal,
      poll: async () => {
        const body = await requestJson(COPILOT_OAUTH.accessToken, { ...form({ client_id: COPILOT_OAUTH.clientId,
          device_code: input.grant.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }), signal: scope.signal }, input.fetchImpl ?? fetch);
        if (body.error === 'authorization_pending') return { status: 'pending' };
        if (body.error === 'slow_down') return { status: 'slow_down' };
        if (body.error !== undefined || typeof body.access_token !== 'string' || !body.access_token.trim()) {
          return { status: 'failed', message: 'GitHub sign-in was refused.' };
        }
        return { status: 'complete', value: body.access_token };
      } });
    const credential = await refreshCopilotToken({ refreshToken: gitHubToken, fetchImpl: input.fetchImpl, signal: scope.signal });
    scope.check();
    const production = Object.freeze({});
    proofs.set(production, digest(credential));
    return { ...credential, production };
  } finally { scope.dispose(); }
}
