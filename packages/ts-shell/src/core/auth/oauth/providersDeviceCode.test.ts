import { describe, expect, it, vi } from "vitest";
import { pollOpenAIDeviceAuth, startOpenAIDeviceAuth } from "./providers.js";

describe("OpenAI device-code flow helpers", () => {
  it("starts device authorization and extracts user code and interval", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        device_auth_id: "dev_123",
        user_code: "ABCD-EFGH",
        interval: "1",
      }),
    );
    const start = await startOpenAIDeviceAuth(fetchMock as unknown as typeof fetch);
    expect(start).toEqual({
      deviceAuthId: "dev_123",
      userCode: "ABCD-EFGH",
      verificationUri: "https://auth.openai.com/codex/device",
      intervalSeconds: 1,
    });
  });

  it("polls through pending (403/404) and slow_down (429) until complete", async () => {
    vi.useFakeTimers();
    try {
      let attempt = 0;
      const fetchMock = vi.fn(async () => {
        attempt++;
        if (attempt === 1) return new Response("", { status: 404 });
        if (attempt === 2) return new Response("", { status: 429 });
        return Response.json({
          authorization_code: "auth_code_1",
          code_verifier: "verifier_1",
        });
      });

      const promise = pollOpenAIDeviceAuth(
        {
          deviceAuthId: "dev_123",
          userCode: "ABCD-EFGH",
          verificationUri: "https://auth.openai.com/codex/device",
          intervalSeconds: 0.01,
        },
        { fetchImpl: fetchMock as unknown as typeof fetch },
      );

      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result).toEqual({
        authorizationCode: "auth_code_1",
        codeVerifier: "verifier_1",
      });
      expect(attempt).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
  it("clamps non-finite intervals and recovers from transient 5xx before failing on access_denied", async () => {
    const start = await startOpenAIDeviceAuth(
      vi.fn(async () =>
        Response.json({
          device_auth_id: "dev_999",
          user_code: "ZXCV-BNML",
          interval: "Infinity",
        }),
      ) as unknown as typeof fetch,
    );
    expect(start.intervalSeconds).toBe(5);

    vi.useFakeTimers();
    try {
      let calls = 0;
      const pollPromise = pollOpenAIDeviceAuth(
        { ...start, intervalSeconds: 0.01 },
        {
          fetchImpl: vi.fn(async () => {
            calls++;
            if (calls === 1) return new Response("bad gateway", { status: 502 });
            return Response.json({ error: "access_denied" }, { status: 400 });
          }) as unknown as typeof fetch,
        },
      );
      const assertion = expect(pollPromise).rejects.toThrow(/access_denied/);
      await vi.runAllTimersAsync();
      await assertion;
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
