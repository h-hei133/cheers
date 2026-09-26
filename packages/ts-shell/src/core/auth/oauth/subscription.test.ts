import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_SUBSCRIPTION,
  completeGitHubDeviceFlow,
  copilotBaseUrl,
  exchangeAnthropicCode,
  gitHubEndpoints,
  parseAuthorizationInput,
  refreshAnthropicToken,
  startGitHubDeviceFlow,
  SubscriptionError,
} from "./subscription.js";
import type { DeviceCodeGrant } from "./deviceCode.js";

/**
 * Signing in with a subscription.
 *
 * Both providers are checked at the wire: what is asked for, and what is read
 * back. The token exchange is where these differ from an API key — one returns a
 * credential directly, the other needs a second request — and both are the part a
 * mistake would make look like a wrong password.
 */

/** A fetch that answers each call in turn and records the requests. */
function scripted(...responses: Array<{ body?: unknown; status?: number; text?: string }>) {
  const calls: Array<{ url: string; method: string; body: string; headers: Record<string, string> }> = [];
  let index = 0;
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: String(init?.body ?? ""),
      headers: (init?.headers as Record<string, string>) ?? {},
    });
    const response = responses[Math.min(index++, responses.length - 1)]!;
    return new Response(response.text ?? JSON.stringify(response.body ?? {}), { status: response.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("where a GitHub sign-in runs", () => {
  it("puts every endpoint under the account's domain", () => {
    // Taking the domain rather than the URLs means a caller cannot supply one
    // that disagrees with another.
    const endpoints = gitHubEndpoints("github.example");

    expect(endpoints.deviceCode).toBe("https://github.example/login/device/code");
    expect(endpoints.accessToken).toBe("https://github.example/login/oauth/access_token");
    expect(endpoints.apiBase).toBe("https://api.github.example");
  });
});

describe("starting a GitHub sign-in", () => {
  it("asks for a code and returns what to show", async () => {
    const { fetchImpl, calls } = scripted({
      body: {
        device_code: "DEVICE",
        user_code: "ABCD-1234",
        verification_uri: "https://github.com/login/device",
        interval: 5,
        expires_in: 900,
      },
    });

    const grant = await startGitHubDeviceFlow({ fetchImpl });

    expect(grant.userCode).toBe("ABCD-1234");
    expect(grant.verificationUri).toBe("https://github.com/login/device");
    expect(grant.intervalSeconds).toBe(5);
    expect(calls[0]!.body).toContain("client_id=");
  });

  it("refuses an answer with nothing to show", async () => {
    const { fetchImpl } = scripted({ body: { device_code: "D" } });

    await expect(startGitHubDeviceFlow({ fetchImpl })).rejects.toThrow(/no code to show/);
  });

  it("reports a refusal rather than a missing code", async () => {
    const { fetchImpl } = scripted({ status: 403, text: "forbidden" });

    await expect(startGitHubDeviceFlow({ fetchImpl })).rejects.toThrow(SubscriptionError);
  });
});

describe("finishing a GitHub sign-in", () => {
  const grant: DeviceCodeGrant = {
    deviceCode: "DEVICE",
    userCode: "ABCD",
    verificationUri: "https://github.com/login/device",
    intervalSeconds: 1,
    expiresInSeconds: 60,
  };

  it("keeps polling until the code has been entered", async () => {
    const { fetchImpl, calls } = scripted(
      { body: { error: "authorization_pending" } },
      { body: { access_token: "GHO_TOKEN" } },
    );

    const credential = await completeGitHubDeviceFlow({ grant, fetchImpl });

    expect(credential.accessToken).toBe("GHO_TOKEN");
    expect(calls).toHaveLength(2);
    expect(calls[1]!.body).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code");
  });

  it("stores the token as its own renewal, because nothing else is needed", async () => {
    // GitHub's own tokens are long-lived and stay usable, so a renewal is a
    // re-login rather than an exchange and there is no second value to keep.
    const { fetchImpl } = scripted({ body: { access_token: "GHO_TOKEN" } });

    const credential = await completeGitHubDeviceFlow({ grant, fetchImpl });

    expect(credential.refreshToken).toBe("GHO_TOKEN");
    expect(credential.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("stops when the person refuses", async () => {
    const { fetchImpl } = scripted({ body: { error: "access_denied" } });

    await expect(completeGitHubDeviceFlow({ grant, fetchImpl })).rejects.toThrow(/refused/);
  });
});

describe("where a Copilot credential is used", () => {
  it("takes the host out of the token when it names one", () => {
    // The token says which endpoint the subscription may reach, and an account
    // routed elsewhere would otherwise be sent somewhere it is not allowed.
    expect(copilotBaseUrl("tid=x;exp=1;proxy-ep=proxy.individual.githubcopilot.com;x=y", "https://fallback")).toBe(
      "https://api.individual.githubcopilot.com",
    );
  });

  it("keeps the fallback when the token says nothing", () => {
    expect(copilotBaseUrl("tid=x;exp=1", "https://fallback")).toBe("https://fallback");
  });
});

describe("the Anthropic subscription", () => {
  it("asks for the code with the fixed address the consent screen is registered to", () => {
    // A different port is a redirect the server refuses, so this is not a
    // preference.
    expect(ANTHROPIC_SUBSCRIPTION.callbackPort).toBe(53692);
    expect(ANTHROPIC_SUBSCRIPTION.tokenUrl).toBe("https://platform.claude.com/v1/oauth/token");
  });

  it("exchanges a code with a JSON body, which is what this endpoint takes", async () => {
    const { fetchImpl, calls } = scripted({ body: { access_token: "AT", refresh_token: "RT", expires_in: 3600 } });

    const credential = await exchangeAnthropicCode({
      code: "CODE",
      verifier: "VERIFIER",
      redirectUri: "http://localhost:53692/callback",
      fetchImpl,
    });

    expect(credential.accessToken).toBe("AT");
    expect(credential.refreshToken).toBe("RT");
    expect(calls[0]!.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(calls[0]!.body)).toMatchObject({
      grant_type: "authorization_code",
      code: "CODE",
      code_verifier: "VERIFIER",
    });
  });

  it("renews a minute before the token lapses", async () => {
    // So a request does not go out with a token that expires in flight, which
    // would read as a wrong credential.
    const before = Date.now();
    const { fetchImpl } = scripted({ body: { access_token: "AT", expires_in: 3600 } });

    const credential = await refreshAnthropicToken({ refreshToken: "RT", fetchImpl });

    // An hour, less the minute held back.
    expect(credential.expiresAt).toBeGreaterThanOrEqual(before + 3_539_000);
    expect(credential.expiresAt).toBeLessThanOrEqual(before + 3_540_000);
  });

  it("carries what the endpoint said when it refuses", async () => {
    const { fetchImpl } = scripted({ status: 400, text: "invalid_grant" });

    await expect(refreshAnthropicToken({ refreshToken: "bad", fetchImpl })).rejects.toThrow(/invalid_grant/);
  });
});

describe("what a person pasted", () => {
  it("takes a bare code", () => {
    expect(parseAuthorizationInput("abc123")).toEqual({ code: "abc123" });
  });

  it("takes a whole redirect address", () => {
    // The consent screen sends the browser somewhere that may not be reachable,
    // so the value in the address bar is accepted as it is.
    expect(parseAuthorizationInput("http://localhost:53692/callback?code=abc&state=s1")).toEqual({
      code: "abc",
      state: "s1",
    });
  });

  it("takes a query string on its own", () => {
    expect(parseAuthorizationInput("code=abc")).toEqual({ code: "abc" });
  });

  it("ignores a fragment after the query", () => {
    expect(parseAuthorizationInput("http://x.test/cb?code=abc#frag")).toEqual({ code: "abc" });
  });

  it("answers nothing for input with no code in it", () => {
    expect(parseAuthorizationInput("")).toBeUndefined();
    expect(parseAuthorizationInput("http://x.test/cb?error=denied")).toBeUndefined();
  });
});
