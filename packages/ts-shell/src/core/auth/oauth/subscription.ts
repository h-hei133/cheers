/**
 * Signing in with a subscription rather than an API key.
 *
 * Two providers offer this and they differ in how: one asks GitHub for a code to
 * enter on a web page, the other opens a browser to its own consent screen. What
 * they share is the shape of the answer — a credential the account already has,
 * rather than one bought for this machine.
 *
 * Kept apart from the OAuth flow that does the browser work because these are
 * declarations: endpoints, a client identity, and what to do with what comes
 * back. The flows are shared.
 */

import { pollDeviceFlow, classifyDeviceTokenResponse, type DeviceCodeGrant } from "./deviceCode.js";

/** Where a provider's sign-in lives. */
export interface SubscriptionProvider {
  readonly id: string;
  readonly label: string;
  /** How this provider signs a person in. */
  readonly kind: "device-code" | "browser";
}

/** A subscription credential, as it is stored. */
export interface SubscriptionCredential {
  readonly provider: string;
  readonly accessToken: string;
  /** What to use when the access token stops working; often the same value. */
  readonly refreshToken: string;
  readonly expiresAt: number;
  /** The API base this subscription is reached at, when the provider states one. */
  readonly baseUrl?: string;
}

/** A sign-in that did not produce a credential. */
export class SubscriptionError extends Error {
  constructor(message: string, readonly provider: string) {
    super(message);
    this.name = "SubscriptionError";
  }
}

/**
 * The address a GitHub sign-in runs against.
 *
 * An enterprise account has its own host, and the paths are the same beneath it,
 * so only the domain differs. Taking the domain rather than the two full URLs
 * means a caller cannot supply one that disagrees with the other.
 */
export function gitHubEndpoints(domain: string): {
  readonly deviceCode: string;
  readonly accessToken: string;
  readonly apiBase: string;
  readonly copilotToken: string;
} {
  return {
    deviceCode: `https://${domain}/login/device/code`,
    accessToken: `https://${domain}/login/oauth/access_token`,
    apiBase: `https://api.${domain}`,
    copilotToken: `https://api.${domain}/copilot_internal/v2/token`,
  };
}

/**
 * The client that asks for the code.
 *
 * A public client identifier, which is what a desktop application has: it cannot
 * keep a secret, and the device flow is designed for exactly that.
 */
const GITHUB_CLIENT_ID = "Iv1.b507a08c87ecfe98";
const GITHUB_SCOPE = "read:user";

/** The headers GitHub's endpoints require. */
const GITHUB_HEADERS: Readonly<Record<string, string>> = {
  accept: "application/json",
  "content-type": "application/x-www-form-urlencoded",
  "user-agent": "cheers",
};

/** Ask GitHub for a code to show someone. */
export async function startGitHubDeviceFlow(options: {
  readonly domain?: string;
  readonly fetchImpl?: typeof fetch;
}): Promise<DeviceCodeGrant> {
  const endpoints = gitHubEndpoints(options.domain ?? "github.com");
  const response = await (options.fetchImpl ?? fetch)(endpoints.deviceCode, {
    method: "POST",
    headers: GITHUB_HEADERS,
    body: new URLSearchParams({ client_id: GITHUB_CLIENT_ID, scope: GITHUB_SCOPE }).toString(),
  });
  if (!response.ok) {
    throw new SubscriptionError(`GitHub refused the sign-in start: ${response.status}`, "github-copilot");
  }
  const body = (await response.json()) as Record<string, unknown>;
  const deviceCode = body.device_code;
  const userCode = body.user_code;
  const verificationUri = body.verification_uri;
  if (typeof deviceCode !== "string" || typeof userCode !== "string" || typeof verificationUri !== "string") {
    throw new SubscriptionError("GitHub's answer carried no code to show", "github-copilot");
  }
  return {
    deviceCode,
    userCode,
    verificationUri,
    ...(typeof body.verification_uri_complete === "string"
      ? { verificationUriComplete: body.verification_uri_complete }
      : {}),
    ...(typeof body.interval === "number" ? { intervalSeconds: body.interval } : {}),
    ...(typeof body.expires_in === "number" ? { expiresInSeconds: body.expires_in } : {}),
  };
}

/**
 * Wait until the code has been entered, and return the credential.
 *
 * Polling GitHub's device flow produces a GitHub OAuth access token. That token is
 * then exchanged at the Copilot token endpoint for a short-lived Copilot session
 * token, which carries its own expiry and routing endpoint. The long-lived GitHub
 * token is retained as the refresh token for future renewals.
 */
export async function completeGitHubDeviceFlow(input: {
  readonly grant: DeviceCodeGrant;
  readonly domain?: string;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}): Promise<SubscriptionCredential> {
  const domain = input.domain ?? "github.com";
  const endpoints = gitHubEndpoints(domain);
  let gitHubToken = "";

  await pollDeviceFlow<null>({
    ...(input.grant.intervalSeconds !== undefined ? { intervalSeconds: input.grant.intervalSeconds } : {}),
    ...(input.grant.expiresInSeconds !== undefined ? { expiresInSeconds: input.grant.expiresInSeconds } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
    poll: async () => {
      const response = await (input.fetchImpl ?? fetch)(endpoints.accessToken, {
        method: "POST",
        headers: GITHUB_HEADERS,
        body: new URLSearchParams({
          client_id: GITHUB_CLIENT_ID,
          device_code: input.grant.deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }).toString(),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const outcome = classifyDeviceTokenResponse(body);
      if (outcome.status === "complete") {
        gitHubToken = String((outcome.value as Record<string, unknown>).access_token);
        return { status: "complete", value: null };
      }
      return outcome;
    },
  });

  const exchangeResponse = await (input.fetchImpl ?? fetch)(endpoints.copilotToken, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${gitHubToken}`,
      "user-agent": "cheers",
    },
    ...(input.signal ? { signal: input.signal } : {}),
  });
  const responseText = await exchangeResponse.text();
  if (!exchangeResponse.ok) {
    throw new SubscriptionError(
      `GitHub refused the Copilot token exchange: ${responseText.slice(0, 200)}`,
      "github-copilot",
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    throw new SubscriptionError("GitHub's Copilot token answer was not JSON", "github-copilot");
  }

  const sessionToken = payload.token;
  if (typeof sessionToken !== "string") {
    throw new SubscriptionError("GitHub's Copilot token answer carried no token", "github-copilot");
  }

  const expiresAtSec = typeof payload.expires_at === "number" ? payload.expires_at : Math.floor(Date.now() / 1_000) + 3_600;
  const expiresAtMs = (expiresAtSec - 60) * 1_000;

  return {
    provider: "github-copilot",
    accessToken: sessionToken,
    refreshToken: gitHubToken,
    expiresAt: expiresAtMs,
    baseUrl: copilotBaseUrl(sessionToken, endpoints.apiBase),
  };
}

/**
 * The base URL a Copilot credential should be used at.
 *
 * The token carries the host in its own text, and that host is the one the
 * subscription is entitled to reach — an account routed through a different
 * endpoint would otherwise be sent somewhere it is not allowed. A token with
 * nothing to say about it keeps the default.
 */
export function copilotBaseUrl(token: string, fallback: string): string {
  const match = /proxy-ep=([^;]+)/.exec(token);
  const host = match?.[1]?.trim();
  if (!host) return fallback;
  return `https://${host.replace(/^proxy\./, "api.")}`;
}

// ---------------------------------------------------------------------------
// Anthropic subscription
// ---------------------------------------------------------------------------

/**
 * Where the Anthropic consent screen and its token live.
 *
 * The client identifier is a public one, as a desktop application's must be.
 * The port is fixed rather than chosen because the consent screen is registered
 * against this exact address — a different port is a redirect the server refuses.
 */
export const ANTHROPIC_SUBSCRIPTION = {
  authorizeUrl: "https://claude.ai/oauth/authorize",
  tokenUrl: "https://platform.claude.com/v1/oauth/token",
  clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  scope: "org:create_api_key user:profile user:inference",
  callbackPort: 53692,
  callbackPath: "/callback",
} as const;

/**
 * Exchange an authorization code for an Anthropic subscription credential.
 *
 * The body is JSON here where most providers take a form, which is a property of
 * this endpoint rather than a preference — it answers a form-encoded request with
 * an error about the content type.
 */
export async function exchangeAnthropicCode(input: {
  readonly code: string;
  readonly verifier: string;
  readonly redirectUri: string;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}): Promise<SubscriptionCredential> {
  const response = await (input.fetchImpl ?? fetch)(ANTHROPIC_SUBSCRIPTION.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.verifier,
      client_id: ANTHROPIC_SUBSCRIPTION.clientId,
      redirect_uri: input.redirectUri,
    }),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new SubscriptionError(`Anthropic refused the exchange: ${text.slice(0, 200)}`, "anthropic");
  }
  return readAnthropicToken(text);
}

/** Renew an Anthropic subscription credential. */
export async function refreshAnthropicToken(input: {
  readonly refreshToken: string;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}): Promise<SubscriptionCredential> {
  const response = await (input.fetchImpl ?? fetch)(ANTHROPIC_SUBSCRIPTION.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
      client_id: ANTHROPIC_SUBSCRIPTION.clientId,
    }),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new SubscriptionError(`Anthropic refused the renewal: ${text.slice(0, 200)}`, "anthropic");
  }
  return readAnthropicToken(text);
}

/** The credential out of a token answer, or why there is none. */
function readAnthropicToken(text: string): SubscriptionCredential {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new SubscriptionError("Anthropic's answer was not JSON", "anthropic");
  }
  const accessToken = body.access_token;
  if (typeof accessToken !== "string") {
    throw new SubscriptionError("Anthropic's answer carried no token", "anthropic");
  }
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : accessToken;
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3_600;
  return {
    provider: "anthropic",
    accessToken,
    refreshToken,
    // Renewed a minute early rather than at the moment of expiry, so a request
    // does not go out with a token that lapses in flight.
    expiresAt: Date.now() + (expiresIn - 60) * 1_000,
  };
}

/**
 * The code out of whatever a person pasted.
 *
 * The consent screen ends by sending the browser somewhere that may not be
 * reachable — a remote machine, or a browser without a handler — so the value in
 * the address bar is accepted as it is. A whole URL and a bare code are both
 * taken, because which one a person copies depends on where they are.
 */
export function parseAuthorizationInput(input: string): { readonly code: string; readonly state?: string } | undefined {
  const text = input.trim();
  if (text === "") return undefined;
  if (!text.includes("://") && !text.includes("?") && !text.includes("code=")) {
    return { code: text };
  }
  const query = text.includes("?") ? text.slice(text.indexOf("?") + 1) : text;
  const params = new URLSearchParams(query.split("#")[0]);
  const code = params.get("code");
  if (!code) return undefined;
  const state = params.get("state");
  return { code, ...(state ? { state } : {}) };
}
