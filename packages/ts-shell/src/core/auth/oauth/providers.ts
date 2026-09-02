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

/** Every provider that can be signed into, for a surface that lists them. */
export function oauthProviderIds(): readonly string[] {
  return ["openai", "google"];
}
