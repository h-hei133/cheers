import { pollDeviceFlow, type DeviceFlowOptions } from "./deviceCode.js";
import type { OAuthProviderConfig } from "./flow.js";
/**
 * What each provider needs, and nothing else.
 *
 * Every entry here is a declaration: endpoints, a client id, a scope string, a
 * port. The flow that uses them is shared, so adding a provider is a dozen lines
 * rather than another five hundred.
 *
 * The client ids are public — a desktop application cannot keep a secret, which is
 * the reason PKCE exists. Where a provider requires its own vendor-specific
 * authorize parameters, they are named as such: they are values that server
 * demands, not labels chosen here, and changing them makes the login fail.
 */

/** Ports chosen high and provider-specific, so two logins cannot collide. */
const OPENAI_PORT = 1455;
const GOOGLE_PORT = 8085;

/** Sign in with an OpenAI account. */
export function openAIOAuthConfig(): OAuthProviderConfig {
  return {
    id: "openai",
    label: "OpenAI account sign-in",
    authorizeUrl: "https://auth.openai.com/oauth/authorize",
    tokenUrl: "https://auth.openai.com/oauth/token",
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    scope: [
      "openid",
      "profile",
      "email",
      "offline_access",
      "api.connectors.read",
      "api.connectors.invoke",
    ].join(" "),
    callbackPort: OPENAI_PORT,
    callbackPath: "/auth/callback",
    // Required by the authorization server for this client: without them the
    // authorize request is rejected and no code is issued. They are wire values,
    // not names this project chose, and are kept verbatim for that reason.
    authorizeParams: {
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      originator: "codex_cli_rs",
    },
  };
}

/**
 * Sign in with a Google account.
 *
 * Google has no public desktop client for this: the user registers their own and
 * supplies the id. That is more setup than the alternative and it is the honest
 * one — the alternative is shipping someone else's client credentials and signing
 * in as their application.
 */
export function googleOAuthConfig(clientId: string, clientSecret?: string): OAuthProviderConfig {
  return {
    id: "google",
    label: "Google account sign-in",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/cloud-platform",
    ].join(" "),
    callbackPort: GOOGLE_PORT,
    callbackPath: "/auth/callback",
    authorizeParams: {
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    },
  };
}

/** The client id a Google sign-in should use, or why there is none. */
export function resolveGoogleClientId(explicit?: string): string {
  const provided = explicit?.trim() || process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (provided) return provided;
  throw new Error(
    "Google sign-in needs a Desktop OAuth client id. Register one in Google Cloud and set GOOGLE_OAUTH_CLIENT_ID, or pass it to /connect.",
  );
}

/**
 * Every provider that can be signed into, for a surface that lists them.
 *
 * Derived from the declarations above rather than written out. A second list is
 * a second thing to keep in step, and the way it fails is quiet: a provider added
 * to one and not the other is either offered by a surface that cannot sign it in,
 * or reachable but invisible.
 *
 * A provider whose config needs a value from the caller is listed all the same —
 * that it is signable is a fact about the build, and whether it is configured yet
 * is a fact about the account.
 */
export function oauthProviderIds(): readonly string[] {
  return signInProviders.map((provider) => provider.id);
}

/** The declarations, in the order a chooser should offer them. */
const signInProviders: readonly OAuthProviderDeclaration[] = [
  { id: "openai", make: () => openAIOAuthConfig() },
  { id: "google", make: (clientId) => googleOAuthConfig(resolveGoogleClientId(clientId)) },
];

/** One signable provider: its name, and how to build its configuration. */
interface OAuthProviderDeclaration {
  readonly id: string;
  /**
   * Its configuration, given a client id the caller may have.
   *
   * A parameter because some providers cannot ship one: the account registers its
   * own, and refusing there is what turns a missing client id into a sentence
   * rather than a failed authorization. Listing a provider does not build its
   * configuration, which is why the missing value is not an error until one is
   * asked for.
   */
  readonly make: (clientId?: string) => OAuthProviderConfig;
}

/**
 * The configuration for a provider, or nothing when this build cannot sign it in.
 *
 * The single place a caller asks "can this be signed into, and with what", so a
 * surface does not have to know which providers exist.
 */
export function oauthConfigFor(provider: string, clientId?: string, clientSecret?: string, quotaProject?: string): OAuthProviderConfig | undefined {
  const config = signInProviders.find((candidate) => candidate.id === provider)?.make(clientId);
  return config && provider === 'google' ? { ...config, ...(clientSecret ? { clientSecret } : {}), ...(quotaProject ? { quotaProject } : {}) } : config;
}

export interface OpenAIDeviceCodeStart {
  readonly deviceAuthId: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly intervalSeconds: number;
}

/** Start headless OpenAI Codex device-code authorization. */
export async function startOpenAIDeviceAuth(
  options: typeof fetch | { readonly fetchImpl?: typeof fetch; readonly signal?: AbortSignal } = {},
): Promise<OpenAIDeviceCodeStart> {
  const fetchImpl = typeof options === "function" ? options : (options.fetchImpl ?? fetch);
  const signal = typeof options === "function" ? undefined : options.signal;
  const config = openAIOAuthConfig();
  const response = await fetchImpl("https://auth.openai.com/api/accounts/deviceauth/usercode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: config.clientId }),
    signal,
    redirect: "error",
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`OpenAI device authorization request failed with HTTP ${response.status}`);
  }
  const raw: unknown = await response.json();
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined;
  if (!data || typeof data.device_auth_id !== "string" || !data.device_auth_id || typeof data.user_code !== "string" || !data.user_code) {
    throw new Error("OpenAI device authorization returned an incomplete payload.");
  }
  const parsedInterval = Number(data.interval ?? 5);
  const intervalSeconds = Number.isFinite(parsedInterval) && parsedInterval > 0
    ? Math.min(300, parsedInterval)
    : 5;
  return {
    deviceAuthId: data.device_auth_id,
    userCode: data.user_code,
    verificationUri: "https://auth.openai.com/codex/device",
    intervalSeconds,
  };
}

/** Poll OpenAI device authorization endpoint until an authorization code + verifier are issued. */
export async function pollOpenAIDeviceAuth(
  start: OpenAIDeviceCodeStart,
  options: Pick<DeviceFlowOptions<unknown>, "signal"> & { readonly fetchImpl?: typeof fetch } = {},
): Promise<{ readonly authorizationCode: string; readonly codeVerifier: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const config = openAIOAuthConfig();
  return pollDeviceFlow<{ readonly authorizationCode: string; readonly codeVerifier: string }>({
    intervalSeconds: start.intervalSeconds,
    expiresInSeconds: 15 * 60,
    signal: options.signal,
    poll: async () => {
      let res: Response;
      try {
        res = await fetchImpl("https://auth.openai.com/api/accounts/deviceauth/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ device_auth_id: start.deviceAuthId, user_code: start.userCode, client_id: config.clientId }),
          signal: options.signal,
          redirect: "error",
        });
      } catch (err) {
        if (options.signal?.aborted) {
          return { status: "failed", message: err instanceof Error ? err.message : "Aborted" };
        }
        return { status: "pending" };
      }
      if (res.status === 403 || res.status === 404) {
        await res.body?.cancel().catch(() => {});
        return { status: "pending" };
      }
      if (res.status === 429) {
        await res.body?.cancel().catch(() => {});
        return { status: "slow_down" };
      }
      if (res.status >= 500) {
        await res.body?.cancel().catch(() => {});
        return { status: "pending" };
      }
      let raw: unknown;
      try {
        raw = await res.json();
      } catch {
        await res.body?.cancel().catch(() => {});
        return res.ok ? { status: "pending" } : { status: "failed", message: `HTTP ${res.status}` };
      }
      const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined;
      const oauthError = typeof body?.error === "string" ? body.error : undefined;
      if (oauthError === "authorization_pending") return { status: "pending" };
      if (oauthError === "slow_down") return { status: "slow_down" };
      if (oauthError === "access_denied" || oauthError === "expired_token") {
        return { status: "failed", message: oauthError };
      }
      if (!res.ok) {
        return { status: "failed", message: oauthError ?? `HTTP ${res.status}` };
      }
      if (typeof body?.authorization_code !== "string" || !body.authorization_code || typeof body.code_verifier !== "string" || !body.code_verifier) {
        return { status: "pending" };
      }
      return {
        status: "complete",
        value: { authorizationCode: body.authorization_code, codeVerifier: body.code_verifier },
      };
    },
  });
}
