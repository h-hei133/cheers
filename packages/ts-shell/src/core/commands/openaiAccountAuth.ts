import { createServer, type Server } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { URL } from "node:url";
import type { ProviderAuthContract } from "../auth/providerAuthContract.js";

const OPENAI_AUTH_ISSUER = "https://auth.openai.com";
const OPENAI_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_OAUTH_PORT = 1455;
const OPENAI_OAUTH_CALLBACK_PATH = "/auth/callback";
const OPENAI_OAUTH_SCOPE = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "api.connectors.read",
  "api.connectors.invoke",
].join(" ");

interface OAuthTokenResponse {
  id_token?: string;
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}

interface JwtClaims {
  chatgpt_account_id?: string;
  organizations?: Array<{ id: string }>;
  "https://api.openai.com/auth"?: {
    chatgpt_account_id?: string;
  };
}

export interface OpenAIAccountAuthResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly accountId?: string;
  readonly authorizeUrl: string;
  readonly callbackUrl: string;
}

interface OAuthServerCallbackResult {
  readonly code: string;
  readonly state: string;
}

interface OAuthCallbackServerSession {
  readonly callbackPromise: Promise<OAuthServerCallbackResult>;
  readonly ready: Promise<void>;
  close(): void;
}

export async function loginOpenAIAccountViaAuthorizationCodeFlow(options?: {
  readonly timeoutMs?: number;
  readonly openBrowser?: (url: string) => Promise<void> | void;
  readonly onAuthorizeUrl?: (url: string) => void;
}): Promise<OpenAIAccountAuthResult> {
  const timeoutMs = Math.max(30_000, options?.timeoutMs ?? 5 * 60_000);
  const redirectUri = `http://localhost:${OPENAI_OAUTH_PORT}${OPENAI_OAUTH_CALLBACK_PATH}`;
  const state = generateRandomString(32);
  const pkce = buildPkceCodes();

  const authorizeUrl = buildAuthorizeUrl({
    redirectUri,
    state,
    challenge: pkce.challenge,
  });
  options?.onAuthorizeUrl?.(authorizeUrl);

  const callbackServer = createOAuthCallbackServer({
    expectedState: state,
    redirectUri,
    timeoutMs,
  });
  try {
    await callbackServer.ready;
  } catch (error) {
    void callbackServer.callbackPromise.catch(() => {});
    callbackServer.close();
    throw error;
  }

  process.stdout.write(
    [
      "",
      "OpenAI account login required (OAuth Authorization Code + PKCE).",
      `Authorize URL: ${authorizeUrl}`,
      `Callback URL: ${redirectUri}`,
      "",
    ].join("\n"),
  );

  if (options?.openBrowser) {
    try {
      await options.openBrowser(authorizeUrl);
    } catch (error) {
      process.stdout.write(
        "Browser open failed. Open the authorize URL manually in your browser.\n",
      );
      process.stdout.write(`${authorizeUrl}\n`);
      if (error instanceof Error && error.message) {
        process.stdout.write(`Browser launch detail: ${error.message}\n`);
      }
    }
  } else {
    process.stdout.write(
      "Open the authorize URL manually in your browser to continue login.\n",
    );
  }

  const callback = await callbackServer.callbackPromise;
  process.stdout.write(
    `OAuth callback payload: code=present, state=${callback.state ? "present" : "missing"}\n`,
  );
  if (callback.state !== state) {
    throw new Error(
      "OpenAI OAuth callback failed at state validation: callback state mismatch.",
    );
  }

  process.stdout.write(
    [
      "OAuth token exchange request:",
      `- endpoint: ${OPENAI_AUTH_ISSUER}/oauth/token`,
      "- fields: grant_type, code, redirect_uri, client_id, code_verifier",
    ].join("\n") + "\n",
  );

  const tokenRes = await fetchWithStep(
    "oauth.token.exchange",
    `${OPENAI_AUTH_ISSUER}/oauth/token`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: callback.code,
        redirect_uri: redirectUri,
        client_id: OPENAI_OAUTH_CLIENT_ID,
        code_verifier: pkce.verifier,
      }).toString(),
    },
  );
  if (!tokenRes.ok) {
    let responseSummary = "";
    try {
      const raw = await tokenRes.text();
      responseSummary = raw.slice(0, 300);
    } catch {
      responseSummary = "<unreadable>";
    }
    throw new Error(
      `OpenAI OAuth callback succeeded but token exchange failed (HTTP ${tokenRes.status}, body=${responseSummary || "<empty>"}).`,
    );
  }

  const tokens = (await tokenRes.json()) as OAuthTokenResponse;
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error(
      "OpenAI token exchange failed: missing access_token or refresh_token in response.",
    );
  }

  const accountId = extractAccountId(tokens);
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    ...(accountId ? { accountId } : {}),
    authorizeUrl,
    callbackUrl: redirectUri,
  };
}

export const openAIProviderAuthContract: ProviderAuthContract = {
  provider: "openai",
  methods: [
    {
      kind: "account-auth",
      label: "Sign in with ChatGPT (OAuth Authorization Code + PKCE)",
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
    loginOpenAIAccountViaAuthorizationCodeFlow(options),
};

function buildAuthorizeUrl(input: {
  readonly redirectUri: string;
  readonly state: string;
  readonly challenge: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: OPENAI_OAUTH_CLIENT_ID,
    redirect_uri: input.redirectUri,
    scope: OPENAI_OAUTH_SCOPE,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state: input.state,
    originator: "codex_cli_rs",
  });
  return `${OPENAI_AUTH_ISSUER}/oauth/authorize?${params.toString()}`;
}

function buildPkceCodes(): { verifier: string; challenge: string } {
  // Match codex/opencode behavior: PKCE verifier with RFC7636 unreserved chars.
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
  readonly redirectUri: string;
  readonly timeoutMs: number;
}): OAuthCallbackServerSession {
  let server: Server | undefined;
  let settled = false;
  let timeoutId: NodeJS.Timeout | undefined;
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
              "OpenAI OAuth authorize URL opened but callback was not received before timeout.",
            ),
          ),
        );
      }, input.timeoutMs);

      server = createServer((req, res) => {
        const requestUrl = new URL(req.url ?? "/", input.redirectUri);
        if (requestUrl.pathname !== OPENAI_OAUTH_CALLBACK_PATH) {
          res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          res.end("Not found");
          return;
        }

        const error = requestUrl.searchParams.get("error");
        const errorDescription =
          requestUrl.searchParams.get("error_description");
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
                `OpenAI OAuth callback returned error: ${errorDescription ?? error}`,
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
                "OpenAI OAuth callback missing code/state (authorize succeeded but callback payload invalid).",
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
                "OpenAI OAuth callback failed at state validation: callback state mismatch.",
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
          ? `OpenAI OAuth callback server failed to start on localhost:${OPENAI_OAUTH_PORT} (EADDRINUSE). Port ${OPENAI_OAUTH_PORT} is occupied; close the process using this port and retry.`
          : `OpenAI OAuth callback server failed to start on localhost:${OPENAI_OAUTH_PORT}: ${message}`;
        rejectReady(new Error(enriched));
        finalize(() => reject(new Error(enriched)));
      });

      // Bind on localhost to support both IPv4/IPv6 resolution paths.
      server.listen(OPENAI_OAUTH_PORT, "localhost", () => {
        resolveReady();
      });
    },
  );

  return {
    callbackPromise,
    ready,
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
  options?: {
    readonly timeoutMs?: number;
    readonly retries?: number;
  },
): Promise<Response> {
  const timeoutMs = Math.max(5_000, options?.timeoutMs ?? 20_000);
  const retries = Math.max(0, options?.retries ?? 1);
  let lastError: unknown;
  let transientFailures = 0;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });
      if (transientFailures > 0) {
        process.stdout.write(
          `OAuth network recovered at ${step} after ${transientFailures} transient failure(s).\n`,
        );
      }
      return response;
    } catch (error) {
      lastError = error;
      const cause =
        error instanceof Error && "cause" in error
          ? (error as Error & { cause?: unknown }).cause
          : undefined;
      const causeCode =
        typeof cause === "object" && cause && "code" in cause
          ? String((cause as { code?: unknown }).code)
          : undefined;
      const causeMessage =
        typeof cause === "object" && cause && "message" in cause
          ? String((cause as { message?: unknown }).message)
          : undefined;
      transientFailures += 1;
      if (attempt < retries) {
        process.stdout.write(
          `OAuth transient network issue at ${step} attempt ${attempt + 1}/${retries + 1}; retrying: ${
            error instanceof Error ? error.message : String(error)
          }${causeCode ? ` (cause=${causeCode})` : ""}${causeMessage ? ` ${causeMessage}` : ""}\n`,
        );
      }
      if (attempt < retries) {
        await delayMs(500 * (attempt + 1));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const cause =
    lastError instanceof Error && "cause" in lastError
      ? (lastError as Error & { cause?: unknown }).cause
      : undefined;
  const causeCode =
    typeof cause === "object" && cause && "code" in cause
      ? String((cause as { code?: unknown }).code)
      : undefined;
  const causeMessage =
    typeof cause === "object" && cause && "message" in cause
      ? String((cause as { message?: unknown }).message)
      : undefined;
  throw new Error(
    `OpenAI account auth failed at ${step}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }${causeCode ? ` (cause=${causeCode})` : ""}${causeMessage ? ` ${causeMessage}` : ""}`,
  );
}

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openSystemBrowser(url: string): void {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return;
  }

  if (process.platform === "darwin") {
    spawn("open", [url], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }

  spawn("xdg-open", [url], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

function extractAccountId(tokens: OAuthTokenResponse): string | undefined {
  if (tokens.id_token) {
    const claims = parseJwtClaims(tokens.id_token);
    const accountId = claims && accountIdFromClaims(claims);
    if (accountId) {
      return accountId;
    }
  }

  if (tokens.access_token) {
    const claims = parseJwtClaims(tokens.access_token);
    return claims ? accountIdFromClaims(claims) : undefined;
  }

  return undefined;
}

function parseJwtClaims(token: string): JwtClaims | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return undefined;
  }

  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

function accountIdFromClaims(claims: JwtClaims): string | undefined {
  return (
    claims.chatgpt_account_id ||
    claims["https://api.openai.com/auth"]?.chatgpt_account_id ||
    claims.organizations?.[0]?.id
  );
}
