import { vi } from 'vitest';
import type { AccountAuthConfig } from '../config/runtimeConfig.js';
import * as authorization from '../provider/request/authorization.js';
import * as transport from '../provider/request/fetch.js';

/** Intercept only synthetic OAuth HTTP; the actual flow, dispatch marker and native proof still run. */
export function observeOAuthRenewal(account: AccountAuthConfig, beforeResponse?: () => Promise<void> | void) {
  const create = transport.providerFetchFromTimeouts;
  vi.spyOn(transport, 'providerFetchFromTimeouts').mockImplementation(timeouts => {
    const send = create(timeouts);
    return (async (url: RequestInfo | URL, init?: RequestInit) => {
      const address = url instanceof Request ? url.url : String(url);
      if (address !== 'https://auth.openai.com/oauth/token' && address !== 'https://oauth2.googleapis.com/token') return send(url, init);
      await beforeResponse?.();
      return new Response(JSON.stringify({ access_token: account.accessToken, refresh_token: account.refreshToken, expires_in: 3600 }),
        { headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
  });
  return vi.spyOn(authorization, 'renewAccountAuthIfExpiring');
}
