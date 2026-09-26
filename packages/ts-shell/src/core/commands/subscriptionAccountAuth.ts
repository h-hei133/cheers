import type { ProviderAuthContract, ProviderAccountAuthResult } from "../auth/providerAuthContract.js";
import { startCallbackServer } from "../auth/oauth/callback.js";
import { createPkcePair, createState } from "../auth/oauth/pkce.js";
import {
  ANTHROPIC_SUBSCRIPTION,
  completeGitHubDeviceFlow,
  exchangeAnthropicCode,
  refreshAnthropicToken,
  startGitHubDeviceFlow,
  type SubscriptionCredential,
} from "../auth/oauth/subscription.js";

/**
 * Signing in with a subscription rather than an API key.
 *
 * Both flows here exist because the machine may have no browser: one shows a
 * code to be entered elsewhere, and the other listens on a fixed port so the
 * redirect comes back to a value the provider already knows. What they share is
 * that the credential is issued to the account rather than to a registered
 * client, so there is no client id to configure and no key to paste.
 */

/** The shape the connection store files a subscription credential under. */
function toAuthResult(credential: SubscriptionCredential, authorizeUrl: string): ProviderAccountAuthResult {
  return {
    accessToken: credential.accessToken,
    refreshToken: credential.refreshToken,
    expiresAt: credential.expiresAt,
    authorizeUrl,
    callbackUrl: credential.baseUrl ?? "",
  };
}

/**
 * Sign in with a GitHub Copilot subscription.
 *
 * GitHub's device flow has two steps that both need showing: the code, and the
 * address it is entered at. The address is stable, so it is the one reported to
 * a surface before the wait begins — a surface that learned it afterwards would
 * have nothing to display while the person is waiting.
 */
export async function loginGitHubCopilotViaDeviceFlow(options: {
  readonly timeoutMs?: number;
  readonly onProgress?: (progress: { readonly authorizeUrl: string; readonly userCode?: string }) => void;
} = {}): Promise<ProviderAccountAuthResult> {
  const grant = await startGitHubDeviceFlow({});
  options.onProgress?.({
    authorizeUrl: grant.verificationUri,
    userCode: grant.userCode,
  });
  const credential = await completeGitHubDeviceFlow({
    grant,
    ...(options.timeoutMs !== undefined ? { signal: AbortSignal.timeout(options.timeoutMs) } : {}),
  });
  return toAuthResult(credential, grant.verificationUriComplete ?? grant.verificationUri);
}

export const gitHubCopilotProviderAuthContract: ProviderAuthContract = {
  provider: "github-copilot",
  methods: [
    { kind: "device-code", label: "Sign in with a GitHub Copilot subscription (code)" },
    { kind: "account-auth", label: "Sign in with a GitHub Copilot subscription (browser)" },
  ],
  loginAccountAuth: async (options) => loginGitHubCopilotViaDeviceFlow(options ?? {}),
};

export const anthropicSubscriptionProviderAuthContract: ProviderAuthContract = {
  provider: "anthropic",
  methods: [
    { kind: "account-auth", label: "Sign in with a Claude subscription (browser)" },
    { kind: "api-key", label: "Use an API key" },
  ],
  loginAccountAuth: async (options) => loginAnthropicSubscription(options ?? {}),
};

/**
 * Sign in with a Claude subscription.
 *
 * The callback port is fixed in the declaration rather than chosen, because the
 * redirect address has to be one the provider already knows and there is no
 * client id to register one per install. The cost is that the port has to be
 * free; the benefit is that the redirect comes straight back and nothing has to
 * be copied by hand.
 *
 * PKCE is used even though the client id is public: a desktop client cannot keep
 * a secret, and an authorization code intercepted in transit without a verifier
 * is not exchangeable.
 */
async function loginAnthropicSubscription(options: {
  readonly timeoutMs?: number;
  readonly onProgress?: (progress: { readonly authorizeUrl: string }) => void;
}): Promise<ProviderAccountAuthResult> {
  const pkce = createPkcePair();
  const state = createState();
  const server = await startCallbackServer({
    path: ANTHROPIC_SUBSCRIPTION.callbackPath,
    port: ANTHROPIC_SUBSCRIPTION.callbackPort,
    expectedState: state,
    timeoutMs: options.timeoutMs ?? SUBSCRIPTION_LOGIN_TIMEOUT_MS,
    label: "Claude subscription",
  });

  const authorizeUrl =
    `${ANTHROPIC_SUBSCRIPTION.authorizeUrl}` +
    `?client_id=${encodeURIComponent(ANTHROPIC_SUBSCRIPTION.clientId)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(server.redirectUri)}` +
    `&scope=${encodeURIComponent(ANTHROPIC_SUBSCRIPTION.scope)}` +
    `&code_challenge=${encodeURIComponent(pkce.challenge)}` +
    `&code_challenge_method=S256` +
    `&state=${encodeURIComponent(state)}`;
  options.onProgress?.({ authorizeUrl });

  try {
    const { code } = await server.received;
    const credential = await exchangeAnthropicCode({
      code,
      verifier: pkce.verifier,
      redirectUri: server.redirectUri,
    });
    return toAuthResult(credential, authorizeUrl);
  } finally {
    server.close();
  }
}

/** How long a sign-in waits for the person to finish authorizing. */
const SUBSCRIPTION_LOGIN_TIMEOUT_MS = 5 * 60_000;

/** Trade a stored refresh token for a fresh one, for either subscription. */
export async function refreshSubscriptionToken(
  provider: "github-copilot" | "anthropic",
  refreshToken: string,
): Promise<SubscriptionCredential | undefined> {
  if (provider === "anthropic") return refreshAnthropicToken({ refreshToken });
  // GitHub issues a long-lived token, so there is nothing to trade; the token is
  // returned unchanged and the caller re-exchanges it for a Copilot session.
  return undefined;
}
