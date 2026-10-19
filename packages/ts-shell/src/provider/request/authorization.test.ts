import { accountToken } from '../../test-utils/oauth.js';
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { accountAuthFor, providerAuthorization, renewAccountAuthIfExpiring } from "./authorization.js";
import { createStepFunction } from "../../turn/step.js";
import { resetSessionUsage } from "../../observability/usageTelemetry.js";
import type { GoogleAccountAuthConfig, OpenAIAccountAuthConfig } from "../../config/runtimeConfig.js";

/**
 * What the credential turns into on the wire.
 *
 * The three existing suites around this cover the login, the credential
 * resolution, and the readiness check. None of them covers the seam between the
 * credential and the request, which is where the defect was: an account login
 * resolved correctly, passed readiness, and then sent an empty bearer, because the
 * header was formatted from a field only an API key has. Every segment was tested
 * and the join was not.
 */

const servers: http.Server[] = [];

afterEach(async () => {
  resetSessionUsage();
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

/** A provider that records the headers it was asked with. */
async function startRecorder(): Promise<{ readonly url: string; readonly seen: Array<Record<string, string | undefined>> }> {
  const seen: Array<Record<string, string | undefined>> = [];
  const server = http.createServer((request, response) => {
    seen.push({
      authorization: request.headers.authorization,
      accountId: request.headers["chatgpt-account-id"] as string | undefined,
      contentType: request.headers["content-type"],
    });
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
    response.end("data: [DONE]\n\n");
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

function openAIAuth(overrides: Partial<OpenAIAccountAuthConfig> = {}): OpenAIAccountAuthConfig {
  return {
    type: "openai-chatgpt-account",
    accessToken: "account-token-value",
    refreshToken: "refresh-token-value",
    expiresAt: Date.now() + 3_600_000,
    ...overrides,
  };
}

describe("the credential on the wire", () => {
  it("sends an account token as the bearer, not an empty one", async () => {
    // The defect stated as a test: this credential has no `apiKey`, and the old
    // code read one and formatted the header from it, so the request went out as
    // `Bearer ` with nothing to indicate anything was missing.
    const { url, seen } = await startRecorder();
    const step = createStepFunction({
      provider: {
        headers: providerAuthorization({ accountAuth: openAIAuth() }).headers,
        baseUrl: url,
        model: "m",
        provider: "openai",
      },
      workspaceRoot: process.cwd(),
      sessionId: "sess_seam",
      systemPrompt: "sys",
      tools: [],
    });

    await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    expect(seen).toHaveLength(1);
    expect(seen[0]!.authorization).toBe("Bearer account-token-value");
    // An account-scoped endpoint rejects a token whose account is not named.
    expect(seen[0]!.accountId).toBeUndefined();
  });

  it("names the account when the credential carries one", async () => {
    const { url, seen } = await startRecorder();
    const step = createStepFunction({
      provider: {
        headers: providerAuthorization({ accountAuth: openAIAuth({ accountId: "acct_123" }) }).headers,
        baseUrl: url,
        model: "m",
        provider: "openai",
      },
      workspaceRoot: process.cwd(),
      sessionId: "sess_seam",
      systemPrompt: "sys",
      tools: [],
    });

    await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });
    expect(seen[0]!.accountId).toBe("acct_123");
  });

  it("still sends an API key the way it always did", async () => {
    const { url, seen } = await startRecorder();
    const step = createStepFunction({
      provider: {
        headers: providerAuthorization({ apiKey: "sk-test" }).headers,
        baseUrl: url,
        model: "m",
        provider: "openai",
      },
      workspaceRoot: process.cwd(),
      sessionId: "sess_seam",
      systemPrompt: "sys",
      tools: [],
    });

    await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });
    expect(seen[0]!.authorization).toBe("Bearer sk-test");
  });
});

describe("choosing which credential to authorize with", () => {
  it("keeps native version headers with a subscription bearer token", () => {
    const result = providerAuthorization({
      endpoint: "anthropic-messages",
      accountAuth: { type: "subscription", accessToken: "subscription-token", refreshToken: "refresh", expiresAt: Date.now() + 60_000 },
    });
    const headers = new Headers(result.headers);
    expect(headers.get("authorization")).toBe("Bearer subscription-token");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    expect(headers.has("x-api-key")).toBe(false);
  });

  it("refuses a credential the provider did not issue", () => {
    // The stored `type` says which flow issued the token. Without this check a
    // Google token could be sent to OpenAI simply because the config names both.
    const google: GoogleAccountAuthConfig = {
      type: "google-gemini-account",
      accessToken: "g",
      refreshToken: "r",
      expiresAt: Date.now(),
      clientId: "c",
    };
    expect(accountAuthFor("openai", { accountAuth: google })).toBeUndefined();
    expect(accountAuthFor("google", { accountAuth: google })).toBe(google);
  });

  it("throws rather than sending an anonymous request", () => {
    expect(() => providerAuthorization({})).toThrow(/no credential/i);
    // An empty key is the same as none: it would send `Bearer ` too.
    expect(() => providerAuthorization({ apiKey: "   " })).toThrow(/no credential/i);
  });
});

describe("renewing a token that is about to expire", () => {
  it("exchanges an expired token and returns the replacement", async () => {
    const tokens: string[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      tokens.push(String(init?.body ?? ""));
      return new Response(
        JSON.stringify({ access_token: accountToken('renewed'), refresh_token: "rotated", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const result = await renewAccountAuthIfExpiring({
      provider: "openai",
      credential: { accountAuth: openAIAuth({ accountId: "a", expiresAt: Date.now() - 1 }) },
      fetchImpl,
    });

    expect(result.renewed).toBe(true);
    expect(result.accountAuth?.accessToken).toBe(accountToken('renewed'));
    expect(result.accountAuth?.refreshToken).toBe("rotated");
    expect(tokens[0]).toContain("grant_type=refresh_token");
  });

  it("leaves a valid token alone", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await renewAccountAuthIfExpiring({
      provider: "openai",
      credential: { accountAuth: openAIAuth() },
      fetchImpl,
    });

    expect(called).toBe(false);
    expect(result.renewed).toBe(false);
  });

  it("reports a failed exchange instead of carrying the refused token onward", async () => {
    // A provider that is unreachable, or a refresh token the server has retired.
    // Sending a token the provider has already refused returns its own description
    // of the problem, which reads as a network fault; naming the login is the only
    // version the user can act on.
    const fetchImpl = (async () => new Response("nope", { status: 400 })) as unknown as typeof fetch;
    const credential = { accountAuth: openAIAuth({ accountId: "a", expiresAt: Date.now() - 1 }) };

    const result = await renewAccountAuthIfExpiring({ provider: "openai", credential, fetchImpl });
    expect(result.renewed).toBe(false);
    expect(result.failure).toContain("could not be renewed");
    expect(result.failure).toContain("/connect login openai --account");
    // The credential is still handed back, so a caller that chose to continue has
    // one; deciding not to is the caller's business.
    expect(result.accountAuth?.accessToken).toBe("account-token-value");
  });

  it("names the missing refresh token as the reason a session has to be repeated", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;

    const result = await renewAccountAuthIfExpiring({
      provider: "openai",
      credential: { accountAuth: openAIAuth({ refreshToken: "", expiresAt: Date.now() - 1 }) },
      fetchImpl,
    });
    expect(result.failure).toContain("no refresh token");
  });

  it("exchanges a spent refresh token once when two requests race", async () => {
    // A refresh token is spent by the exchange that uses it. A second exchange
    // started in parallel is rejected with the credential already rotated, which
    // looks to the user like a login that stopped working for no reason.
    let exchanges = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchImpl = (async () => {
      exchanges += 1;
      await gate;
      return new Response(
        JSON.stringify({ access_token: accountToken('renewed'), refresh_token: "rotated", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const credential = { accountAuth: openAIAuth({ accountId: "a", expiresAt: Date.now() - 1 }) };

    const first = renewAccountAuthIfExpiring({ provider: "openai", credential, fetchImpl });
    const second = renewAccountAuthIfExpiring({ provider: "openai", credential, fetchImpl });
    release?.();
    const [a, b] = await Promise.all([first, second]);

    expect(exchanges).toBe(1);
    expect(a.accountAuth?.accessToken).toBe(accountToken('renewed'));
    // The caller that waited reads the token the exchange produced, not its own
    // stale copy.
    expect(b.accountAuth?.accessToken).toBe(accountToken('renewed'));
    // Only the caller that ran the exchange writes it back.
    expect(a.renewed).toBe(true);
    expect(b.renewed).toBe(false);
  });

  it("does not hand one account's renewed token to another account", async () => {
    // The exchange spends the refresh token it was given, so two callers may share
    // one only when they are spending the same token. Keyed by provider alone, a
    // second account's request joined the first account's exchange and came back
    // holding that account's token — the wrong identity, silently, which is worse
    // than the extra exchange the sharing was meant to save.
    const seen: string[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      const token = /refresh_token=([^&]+)/.exec(body)?.[1] ?? "";
      seen.push(token);
      await gate;
      return new Response(
        JSON.stringify({ access_token: accountToken(`renewed-for-${token}`, token), refresh_token: "rotated", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const first = renewAccountAuthIfExpiring({
      provider: "openai",
      credential: { accountAuth: openAIAuth({ accountId: "account-one", expiresAt: Date.now() - 1, refreshToken: "account-one" }) },
      fetchImpl,
    });
    const second = renewAccountAuthIfExpiring({
      provider: "openai",
      credential: { accountAuth: openAIAuth({ accountId: "account-two", expiresAt: Date.now() - 1, refreshToken: "account-two" }) },
      fetchImpl,
    });
    release?.();
    const [a, b] = await Promise.all([first, second]);

    // Two accounts, two exchanges.
    expect(seen.sort()).toEqual(["account-one", "account-two"]);
    // Each caller keeps its own identity.
    expect(a.accountAuth?.accessToken).toBe(accountToken('renewed-for-account-one', 'account-one'));
    expect(b.accountAuth?.accessToken).toBe(accountToken('renewed-for-account-two', 'account-two'));
  });

  it("shares a failed exchange with the caller that waited for it", async () => {
    // The waiting caller would otherwise build a request on its own stale copy,
    // believing the exchange it joined had succeeded. The failure has to travel
    // with the token it did produce.
    let exchanges = 0;
    const fetchImpl = (async () => {
      exchanges += 1;
      return new Response("nope", { status: 400 });
    }) as unknown as typeof fetch;
    const credential = { accountAuth: openAIAuth({ accountId: "a", expiresAt: Date.now() - 1 }) };

    const first = renewAccountAuthIfExpiring({ provider: "openai", credential, fetchImpl });
    const second = renewAccountAuthIfExpiring({ provider: "openai", credential, fetchImpl });
    const [a, b] = await Promise.all([first, second]);

    // One exchange, not two: the second caller joined the first, it did not retry.
    expect(exchanges).toBe(1);
    // Both callers learn the exchange failed, and only the first ran it.
    expect(a.failure).toContain("could not be renewed");
    expect(b.failure).toBe(a.failure);
    expect(a.renewed).toBe(false);
    expect(b.renewed).toBe(false);
  });
});


it('does not share native credentials across different captured lease scopes for the exact same account', async () => {
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  const credential = { accountAuth: openAIAuth({ accountId: "a", expiresAt: Date.now() - 1 }) };
  const fetchImpl = vi.fn(async () => { await held; return new Response(JSON.stringify({ access_token: accountToken('scope-owned-fresh'), refresh_token: 'scope-next', expires_in: 3600 }),
    { headers: { 'content-type': 'application/json' } }); }) as unknown as typeof fetch;
  const leader = renewAccountAuthIfExpiring({ provider: 'openai', credential, fetchImpl,
    renewalLease: { shareKey: 'store-owner-grant-attempt-a', acquire: () => ({ acquired: true }) } });
  const follower = renewAccountAuthIfExpiring({ provider: 'openai', credential, fetchImpl,
    renewalLease: { shareKey: 'store-owner-grant-attempt-b', acquire: () => ({ acquired: false }) } });
  release(); const [completed, isolated] = await Promise.all([leader, follower]);
  expect(isolated).toEqual({ renewed: false, leaseHeld: true }); expect(isolated.accountAuth).toBeUndefined(); expect(isolated.production).toBeUndefined();
  expect(completed.accountAuth?.accessToken).toBe(accountToken('scope-owned-fresh')); expect(fetchImpl).toHaveBeenCalledOnce();
});
