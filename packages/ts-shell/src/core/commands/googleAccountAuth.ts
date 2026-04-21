import { createServer, type Server } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { URL } from "node:url";
import type { ProviderAuthContract } from "../auth/providerAuthContract.js";

const GOOGLE_AUTH_ISSUER = "https://accounts.google.com";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_CALLBACK_PATH = "/auth/callback";
const GOOGLE_OAUTH_SCOPE = [
  "openid",
  "profile",
  "email",
  "https://www.googleapis.com/auth/generative-language",
].join(" ");

interface GoogleOAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  token_type?: string;
}

interface OAuthServerCallbackResult {
  readonly code: string;
  readonly state: string;
}

interface OAuthCallbackServerSession {
  readonly callbackPromise: Promise<OAuthServerCallbackResult>;
  readonly ready: Promise<void>;
  readonly callbackUrl: () => string;
  close(): void;
}

export interface GoogleAccountAuthResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly accountEmail?: string;
  readonly clientId: string;
  readonly authorizeUrl: string;
  readonly callbackUrl: string;
}

export async function loginGoogleAccountViaAuthorizationCodeFlow(options?: {
  readonly timeoutMs?: number;
  readonly onAuthorizeUrl?: (url: string) => void;
  readonly clientId?: string;
}): Promise<GoogleAccountAuthResult> {
  const timeoutMs = Math.max(30_000, options?.timeoutMs ?? 5 * 60_000);
  const state = generateRandomString(32);
  const pkce = buildPkceCodes();
  const clientId = resolveGoogleOAuthClientId(options?.clientId);

  const callbackServer = createOAuthCallbackServer({
    expectedState: state,
    timeoutMs,
  });
  try {
    await callbackServer.ready;
  } catch (error) {
    void callbackServer.callbackPromise.catch(() => {});
    callbackServer.close();
    throw error;
  }
  const redirectUri = callbackServer.callbackUrl();
  const authorizeUrl = buildAuthorizeUrl({
    redirectUri,
    state,
    challenge: pkce.challenge,
    clientId,
  });
  options?.onAuthorizeUrl?.(authorizeUrl);

  process.stdout.write(
    [
      "",
      "Google account login required (OAuth Authorization Code + PKCE).",
      `Authorize URL: ${authorizeUrl}`,
      `Callback URL: ${redirectUri}`,
      "",
      "Open the authorize URL manually in your browser to continue login.",
    ].join("\n") + "\n",
  );

  const callback = await callbackServer.callbackPromise;
  process.stdout.write(
    `OAuth callback payload: code=present, state=${callback.state ? "present" : "missing"}\n`,
  );
  if (callback.state !== state) {
    throw new Error(
      "Google OAuth callback failed at state validation: callback state mismatch.",
    );
  }

  process.stdout.write(
    [
      "OAuth token exchange request:",
      `- endpoint: ${GOOGLE_TOKEN_ENDPOINT}`,
      "- fields: grant_type, code, redirect_uri, client_id, code_verifier",
    ].join("\n") + "\n",
  );

  const tokenRes = await fetchWithStep("oauth.token.exchange", GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: callback.code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: pkce.verifier,
    }).toString(),
  });

  if (!tokenRes.ok) {
    let responseSummary = "";
    try {
      responseSummary = (await tokenRes.text()).slice(0, 300);
    } catch {
      responseSummary = "<unreadable>";
    }
    throw new Error(
      `Google OAuth callback succeeded but token exchange failed (HTTP ${tokenRes.status}, body=${responseSummary || "<empty>"}).`,
    );
  }

  const tokens = (await tokenRes.json()) as GoogleOAuthTokenResponse;
  const accessToken = tokens.access_token?.trim();
  const refreshToken = tokens.refresh_token?.trim();
  if (!accessToken || !refreshToken) {
    throw new Error(
      "Google token exchange failed: missing access_token or refresh_token in response. Ensure consent is granted and offline access is enabled.",
    );
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    ...(extractEmailFromIdToken(tokens.id_token) ? { accountEmail: extractEmailFromIdToken(tokens.id_token) } : {}),
    clientId,
    authorizeUrl,
    callbackUrl: redirectUri,
  };
}

export const googleProviderAuthContract: ProviderAuthContract = {
  provider: "google",
  methods: [
    {
      kind: "account-auth",
      label: "Sign in with Google (OAuth Authorization Code + PKCE)",
    },
    {
      kind: "api-key",
      label: "Use API key",
    },
    {
      kind: "browser-assisted-capture",
      label: "Browser-assisted local credential capture",
    },
  ],
  loginAccountAuth: async (options) =>
    loginGoogleAccountViaAuthorizationCodeFlow(options),
};

function resolveGoogleOAuthClientId(input?: string): string {
  const explicit = input?.trim();
  if (explicit) {
    return explicit;
  }
  const fromEnv = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  throw new Error(
    "Google account-auth requires GOOGLE_OAUTH_CLIENT_ID (Desktop OAuth client). Set env GOOGLE_OAUTH_CLIENT_ID and retry.",
  );
}

function buildAuthorizeUrl(input: {
  readonly redirectUri: string;
  readonly state: string;
  readonly challenge: string;
  readonly clientId: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: GOOGLE_OAUTH_SCOPE,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    state: input.state,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${GOOGLE_AUTH_ISSUER}/o/oauth2/v2/auth?${params.toString()}`;
}

function buildPkceCodes(): { verifier: string; challenge: string } {
  const verifier = generatePkceVerifier(43);
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

function generateRandomString(byteLength: number): string {
  return randomBytes(byteLength).toString("base64url");
}

function generatePkceVerifier(length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = randomBytes(length);
  let value = "";
  for (let index = 0; index < bytes.length; index += 1) {
    value += chars[bytes[index] % chars.length];
  }
  return value;
}

function createOAuthCallbackServer(input: {
  readonly expectedState: string;
  readonly timeoutMs: number;
}): OAuthCallbackServerSession {
  let server: Server | undefined;
  let settled = false;
  let timeoutId: NodeJS.Timeout | undefined;
  let callbackUrl = "";
  let resolveReady!: () => void;
  let rejectReady!: (error: unknown) => void;

  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const callbackPromise = new Promise<OAuthServerCallbackResult>(
    (resolve, reject) => {
      const finalize = (fn: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (server) {
          server.close(() => {
            fn();
          });
          return;
        }
        fn();
      };

      timeoutId = setTimeout(() => {
        finalize(() =>
          reject(
            new Error(
              "Google OAuth authorize URL opened but callback was not received before timeout.",
            ),
          ),
        );
      }, input.timeoutMs);

      server = createServer((req, res) => {
        const requestUrl = new URL(
          req.url ?? "/",
          callbackUrl || `http://localhost${GOOGLE_OAUTH_CALLBACK_PATH}`,
        );
        if (requestUrl.pathname !== GOOGLE_OAUTH_CALLBACK_PATH) {
          res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          res.end("Not found");
          return;
        }

        const error = requestUrl.searchParams.get("error");
        const code = requestUrl.searchParams.get("code");
        const state = requestUrl.searchParams.get("state");
        process.stdout.write(
          [
            "OAuth callback received:",
            `- path: ${requestUrl.pathname}`,
            `- code: ${code ? "present" : "missing"}`,
            `- state: ${state ? "present" : "missing"}`,
            `- error: ${error ? "present" : "missing"}`,
          ].join("\n") + "\n",
        );

        if (error) {
          res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
          res.end("OAuth callback failed.");
          finalize(() =>
            reject(
              new Error(
                `Google OAuth callback returned error: ${error}`,
              ),
            ),
          );
          return;
        }

        if (!code || !state) {
          res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
          res.end("Missing code/state in callback.");
          finalize(() =>
            reject(
              new Error(
                "Google OAuth callback missing code/state (authorize succeeded but callback payload invalid).",
              ),
            ),
          );
          return;
        }

        if (state !== input.expectedState) {
          res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
          res.end("State mismatch.");
          finalize(() =>
            reject(
              new Error(
                "Google OAuth callback failed at state validation: callback state mismatch.",
              ),
            ),
          );
          return;
        }

        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(
          "<html><body><h2>Login completed</h2><p>You can close this tab and return to terminal.</p></body></html>",
        );
        finalize(() => resolve({ code, state }));
      });

      server.on("error", (error) => {
        const message = error instanceof Error ? error.message : String(error);
        const enriched = /EADDRINUSE/i.test(message)
          ? "Google OAuth callback server failed to start on a localhost callback port (EADDRINUSE). Close the process occupying loopback ports and retry."
          : `Google OAuth callback server failed to start on localhost callback port: ${message}`;
        rejectReady(new Error(enriched));
        finalize(() => reject(new Error(enriched)));
      });

      server.listen(0, "localhost", () => {
        const address = server?.address();
        if (!address || typeof address === "string") {
          rejectReady(
            new Error(
              "Google OAuth callback server started but failed to resolve dynamic loopback port.",
            ),
          );
          finalize(() =>
            reject(
              new Error(
                "Google OAuth callback server started but failed to resolve dynamic loopback port.",
              ),
            ),
          );
          return;
        }
        callbackUrl = `http://localhost:${address.port}${GOOGLE_OAUTH_CALLBACK_PATH}`;
        resolveReady();
      });
    },
  );

  return {
    callbackPromise,
    ready,
    callbackUrl() {
      return callbackUrl;
    },
    close() {
      if (server && !settled) {
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        server.close();
      }
    },
  };
}

async function fetchWithStep(
  step: string,
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    throw new Error(
      `Google account auth failed at ${step}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function extractEmailFromIdToken(idToken?: string): string | undefined {
  if (!idToken) {
    return undefined;
  }
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    return undefined;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { email?: unknown };
    return typeof payload.email === "string" ? payload.email : undefined;
  } catch {
    return undefined;
  }
}
