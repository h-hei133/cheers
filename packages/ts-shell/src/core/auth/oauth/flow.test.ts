import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createPkcePair, createState } from "./pkce.js";
import { startCallbackServer } from "./callback.js";
import { isExpiring, refreshOAuthTokens, runOAuthLogin, type OAuthProviderConfig } from "./flow.js";

const CONFIG: OAuthProviderConfig = {
  id: "test",
  label: "Test sign-in",
  authorizeUrl: "https://auth.example.com/authorize",
  tokenUrl: "https://auth.example.com/token",
  clientId: "client-123",
  scope: "openid email",
  callbackPort: 0,
  callbackPath: "/auth/callback",
  authorizeParams: { vendor_flag: "true" },
};

const opened: string[] = [];
let squatter: Server | undefined;

afterEach(async () => {
  opened.length = 0;
  if (squatter) {
    await new Promise<void>((resolve) => squatter!.close(() => resolve()));
    squatter = undefined;
  }
});

/** A token endpoint that records what it was sent and answers with `payload`. */
function tokenEndpoint(payload: unknown, status = 200): {
  fetchImpl: typeof fetch;
  sent: URLSearchParams[];
} {
  const sent: URLSearchParams[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push(new URLSearchParams(String(init?.body ?? "")));
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, sent };
}

/** Complete the browser half of the flow by fetching the redirect ourselves. */
function browserThatRedirects(query: (state: string) => string): (url: string) => Promise<void> {
  return async (url: string) => {
    opened.push(url);
    const authorize = new URL(url);
    const redirect = new URL(authorize.searchParams.get("redirect_uri")!);
    redirect.search = query(authorize.searchParams.get("state") ?? "");
    await fetch(redirect.toString()).catch(() => undefined);
  };
}

describe("PKCE", () => {
  it("derives the challenge from the verifier the way the spec says", () => {
    const { verifier, challenge } = createPkcePair();

    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("uses only characters an authorization server must accept", () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const { verifier } = createPkcePair();
      expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    }
  });

  it("never repeats a verifier or a state", () => {
    const seen = new Set<string>();
    for (let attempt = 0; attempt < 50; attempt++) {
      seen.add(createPkcePair().verifier);
      seen.add(createState());
    }

    expect(seen.size).toBe(100);
  });
});

describe("the loopback callback", () => {
  it("hands back the code the browser was redirected with", async () => {
    const server = await startCallbackServer({
      path: "/auth/callback",
      port: 0,
      expectedState: "s1",
      timeoutMs: 5_000,
      label: "Test",
    });
    await fetch(`${server.redirectUri}?code=abc&state=s1`);

    await expect(server.received).resolves.toEqual({ code: "abc", state: "s1" });
  });

  it("rejects a redirect whose state belongs to a different request", async () => {
    const server = await startCallbackServer({
      path: "/auth/callback",
      port: 0,
      expectedState: "s1",
      timeoutMs: 5_000,
      label: "Test",
    });
    // The assertion is attached before the redirect arrives: the rejection is
    // immediate now that the socket is dropped rather than pooled.
    const settled = expect(server.received).rejects.toThrow(/state did not match/);
    await fetch(`${server.redirectUri}?code=abc&state=other`);
    await settled;
  });

  it("surfaces the authorization server's own refusal", async () => {
    const server = await startCallbackServer({
      path: "/auth/callback",
      port: 0,
      expectedState: "s1",
      timeoutMs: 5_000,
      label: "Test",
    });
    const settled = expect(server.received).rejects.toThrow(/user said no/);
    await fetch(`${server.redirectUri}?error=access_denied&error_description=user+said+no&state=s1`);
    await settled;
  });

  it("gives up with a message naming where it was listening", async () => {
    const server = await startCallbackServer({
      path: "/auth/callback",
      port: 0,
      expectedState: "s1",
      timeoutMs: 40,
      label: "Test",
    });

    await expect(server.received).rejects.toThrow(/never came back to http:\/\/localhost:\d+/);
  });

  it("falls back to another port rather than failing when the preferred one is taken", async () => {
    squatter = createServer();
    const port = await new Promise<number>((resolve) => {
      squatter!.listen(0, "localhost", () => {
        const address = squatter!.address();
        resolve(typeof address === "object" && address ? address.port : 0);
      });
    });

    const server = await startCallbackServer({
      path: "/auth/callback",
      port,
      expectedState: "s1",
      timeoutMs: 5_000,
      label: "Test",
    });
    // An occupied port used to end the login with EADDRINUSE and a suggestion to
    // go find the process holding it.
    expect(server.redirectUri).not.toContain(`:${port}/`);
    server.close();
  });

  it("ignores a request to some other path on the same port", async () => {
    const server = await startCallbackServer({
      path: "/auth/callback",
      port: 0,
      expectedState: "s1",
      timeoutMs: 5_000,
      label: "Test",
    });
    const stray = await fetch(new URL("/favicon.ico", server.redirectUri).toString());
    expect(stray.status).toBe(404);

    await fetch(`${server.redirectUri}?code=abc&state=s1`);
    await expect(server.received).resolves.toMatchObject({ code: "abc" });
  });
});

describe("the whole flow", () => {
  it("builds the authorize URL from the port it actually bound", async () => {
    const { fetchImpl } = tokenEndpoint({ access_token: "at", refresh_token: "rt", expires_in: 120 });
    const result = await runOAuthLogin(CONFIG, {
      fetchImpl,
      openBrowser: browserThatRedirects((state) => `code=xyz&state=${state}`),
      timeoutMs: 30_000,
    });

    const authorize = new URL(opened[0]!);
    // Building it from the *preferred* port instead is what produces a
    // redirect_uri_mismatch when that port was busy and the server moved.
    expect(authorize.searchParams.get("redirect_uri")).toBe(result.callbackUrl);
    expect(result.callbackUrl).toMatch(/^http:\/\/localhost:\d+\/auth\/callback$/);
  });

  it("carries the provider's own required parameters into the authorize URL", async () => {
    const { fetchImpl } = tokenEndpoint({ access_token: "at", refresh_token: "rt" });
    await runOAuthLogin(CONFIG, {
      fetchImpl,
      openBrowser: browserThatRedirects((state) => `code=xyz&state=${state}`),
    });

    const authorize = new URL(opened[0]!);
    expect(authorize.searchParams.get("vendor_flag")).toBe("true");
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.searchParams.get("client_id")).toBe("client-123");
    expect(authorize.searchParams.get("scope")).toBe("openid email");
  });

  it("redeems the code with the verifier that matches the challenge it sent", async () => {
    const { fetchImpl, sent } = tokenEndpoint({ access_token: "at", refresh_token: "rt" });
    await runOAuthLogin(CONFIG, {
      fetchImpl,
      openBrowser: browserThatRedirects((state) => `code=the-code&state=${state}`),
    });

    const challenge = new URL(opened[0]!).searchParams.get("code_challenge");
    const body = sent[0]!;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(createHash("sha256").update(body.get("code_verifier")!).digest("base64url")).toBe(challenge);
  });

  it("reads the account and email out of the id token", async () => {
    const claims = Buffer.from(
      JSON.stringify({ email: "someone@example.com", "https://api.example.com/auth": { chatgpt_account_id: "acct_9" } }),
    ).toString("base64url");
    const { fetchImpl } = tokenEndpoint({
      access_token: "at",
      refresh_token: "rt",
      id_token: `header.${claims}.signature`,
    });
    const result = await runOAuthLogin(CONFIG, {
      fetchImpl,
      openBrowser: browserThatRedirects((state) => `code=xyz&state=${state}`),
    });

    expect(result.accountEmail).toBe("someone@example.com");
    expect(result.accountId).toBe("acct_9");
  });

  it("survives an id token it cannot read", async () => {
    const { fetchImpl } = tokenEndpoint({ access_token: "at", refresh_token: "rt", id_token: "not-a-jwt" });
    const result = await runOAuthLogin(CONFIG, {
      fetchImpl,
      openBrowser: browserThatRedirects((state) => `code=xyz&state=${state}`),
    });

    expect(result.accessToken).toBe("at");
    expect(result.accountId).toBeUndefined();
  });

  it("reports a refused exchange without echoing the code it sent", async () => {
    const { fetchImpl } = tokenEndpoint({ error: "invalid_grant" }, 400);

    await expect(
      runOAuthLogin(CONFIG, {
        fetchImpl,
        openBrowser: browserThatRedirects((state) => `code=secret-code&state=${state}`),
      }),
    ).rejects.toThrow(/token exchange failed with HTTP 400/);
  });

  it("fails when the token endpoint answers without a token", async () => {
    const { fetchImpl } = tokenEndpoint({ token_type: "bearer" });

    await expect(
      runOAuthLogin(CONFIG, {
        fetchImpl,
        openBrowser: browserThatRedirects((state) => `code=xyz&state=${state}`),
      }),
    ).rejects.toThrow(/returned no access token/);
  });
});

describe("keeping a login alive", () => {
  it("keeps the existing refresh token when the server does not rotate it", async () => {
    const { fetchImpl, sent } = tokenEndpoint({ access_token: "fresh", expires_in: 3600 });
    const tokens = await refreshOAuthTokens(CONFIG, "original-refresh", fetchImpl);

    // Dropping it here is what turns a working login into one that dies at the
    // next refresh, on every provider that does not rotate.
    expect(tokens.refreshToken).toBe("original-refresh");
    expect(tokens.accessToken).toBe("fresh");
    expect(sent[0]!.get("grant_type")).toBe("refresh_token");
  });

  it("takes the rotated refresh token when the server sends one", async () => {
    const { fetchImpl } = tokenEndpoint({ access_token: "fresh", refresh_token: "rotated" });
    const tokens = await refreshOAuthTokens(CONFIG, "original-refresh", fetchImpl);

    expect(tokens.refreshToken).toBe("rotated");
  });

  it("assumes a short lifetime when the server does not say", async () => {
    const { fetchImpl } = tokenEndpoint({ access_token: "fresh" });
    const before = Date.now();
    const tokens = await refreshOAuthTokens(CONFIG, "r", fetchImpl);

    expect(tokens.expiresAt).toBeGreaterThan(before);
    expect(tokens.expiresAt).toBeLessThanOrEqual(before + 3_600_000 + 1_000);
  });

  it("calls a token expiring inside the window, and a fresh one not", () => {
    expect(isExpiring(Date.now() + 10_000)).toBe(true);
    expect(isExpiring(Date.now() + 10 * 60_000)).toBe(false);
  });
});
