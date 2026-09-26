import { describe, expect, it, vi } from "vitest";
import { classifyDeviceTokenResponse, DeviceFlowError, pollDeviceFlow, type PollOutcome } from "./deviceCode.js";

/**
 * The polling rules, against a scripted provider.
 *
 * These are arithmetic and timing, so the interesting cases are the transitions:
 * how long between attempts, what a slow-down does to that, and which way out is
 * taken when time runs out. Scripting the provider makes each one expressible
 * without waiting for a real one.
 */

/**
 * The delays the loop asked for, recorded rather than waited out.
 *
 * The real timer is captured before it is replaced, so the stub can still let the
 * loop advance — waiting the interval it asked for is the one thing a test of the
 * intervals cannot afford to do.
 */
function recordingSleep(): { delays: number[]; restore: () => void } {
  const delays: number[] = [];
  const realSetTimeout = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void, ms?: number) => {
    delays.push(ms ?? 0);
    return realSetTimeout(callback, 0);
  }) as unknown as typeof setTimeout);
  return {
    delays,
    restore: () => {
      vi.restoreAllMocks();
    },
  };
}

/** A provider that answers with each outcome in turn. */
function scripted<T>(...outcomes: Array<PollOutcome<T>>): () => PollOutcome<T> {
  let index = 0;
  return () => outcomes[Math.min(index++, outcomes.length - 1)]!;
}

describe("reading what the provider answered", () => {
  it("sees a token as completion", () => {
    expect(classifyDeviceTokenResponse({ access_token: "T" })).toMatchObject({ status: "complete" });
  });

  it("knows the three states the protocol names", () => {
    // Matched by name because these are the protocol's vocabulary rather than
    // prose: a client reading the wording would treat a rephrased answer as a
    // refusal.
    expect(classifyDeviceTokenResponse({ error: "authorization_pending" }).status).toBe("pending");
    expect(classifyDeviceTokenResponse({ error: "slow_down" }).status).toBe("slow_down");
    expect(classifyDeviceTokenResponse({ error: "expired_token" }).status).toBe("failed");
    expect(classifyDeviceTokenResponse({ error: "access_denied" }).status).toBe("failed");
  });

  it("carries the provider's own words for a failure it did not name", () => {
    expect(classifyDeviceTokenResponse({ error: "invalid_client", error_description: "bad client" })).toEqual({
      status: "failed",
      message: "bad client",
    });
  });

  it("does not treat an unrelated body as a token", () => {
    expect(classifyDeviceTokenResponse({}).status).toBe("failed");
  });
});

describe("the polling loop", () => {
  it("returns the value when the flow completes", async () => {
    const value = await pollDeviceFlow({ poll: scripted({ status: "complete", value: "TOKEN" }) });

    expect(value).toBe("TOKEN");
  });

  it("keeps polling while the provider says the person has not finished", async () => {
    const sleep = recordingSleep();
    try {
      const value = await pollDeviceFlow({
        poll: scripted<string>(
          { status: "pending" },
          { status: "pending" },
          { status: "complete", value: "TOKEN" },
        ),
        intervalSeconds: 1,
      });
      expect(value).toBe("TOKEN");
    } finally {
      sleep.restore();
    }
  });

  it("waits longer after being told to slow down", async () => {
    // The provider says the client is polling too fast. One fixed step fixes it,
    // and the specification asks for exactly that rather than a doubling, which
    // would make the person wait through a much longer flow.
    const sleep = recordingSleep();
    try {
      await pollDeviceFlow({
        poll: scripted<string>(
          { status: "slow_down" },
          { status: "complete", value: "TOKEN" },
        ),
        intervalSeconds: 5,
      });
      // Five seconds as asked for, plus the one step the specification names.
      expect(sleep.delays[0]).toBe(10_000);
    } finally {
      sleep.restore();
    }
  });

  it("takes the provider's interval over the default", async () => {
    const sleep = recordingSleep();
    try {
      await pollDeviceFlow({
        poll: scripted<string>({ status: "pending" }, { status: "complete", value: "T" }),
        intervalSeconds: 9,
      });
      expect(sleep.delays[0]).toBe(9_000);
    } finally {
      sleep.restore();
    }
  });

  it("never polls faster than the floor, whatever the provider says", async () => {
    // A provider reporting no interval, or a nonsense one, gets a sane cadence
    // rather than a busy loop against its token endpoint.
    const sleep = recordingSleep();
    try {
      await pollDeviceFlow({
        poll: scripted<string>({ status: "pending" }, { status: "complete", value: "T" }),
        intervalSeconds: -4,
      });
      expect(sleep.delays[0]).toBe(1_000);
    } finally {
      sleep.restore();
    }
  });

  it("uses the specification's default when the provider states none", async () => {
    const sleep = recordingSleep();
    try {
      await pollDeviceFlow({
        poll: scripted<string>({ status: "pending" }, { status: "complete", value: "T" }),
      });
      expect(sleep.delays[0]).toBe(5_000);
    } finally {
      sleep.restore();
    }
  });

  it("stops with the provider's reason when it refuses", async () => {
    await expect(
      pollDeviceFlow({ poll: scripted({ status: "failed", message: "The request was refused." }) }),
    ).rejects.toThrow(/refused/);
  });

  it("tells a plain timeout apart from one that followed a slow-down", async () => {
    // They point at different things: one means nobody finished, the other often
    // means the clock is wrong — a client whose clock runs fast is told to slow
    // down and runs out of time while obeying.
    const sleep = recordingSleep();
    try {
      await expect(
        pollDeviceFlow({ poll: scripted({ status: "pending" }), intervalSeconds: 1, expiresInSeconds: 0 }),
      ).rejects.toThrow(/timed out before it was completed/);
      // A slow-down has to actually happen for the flow to know the clock is
      // suspect, so the code is given enough time to be polled once and then
      // expire.
      await expect(
        pollDeviceFlow({
          poll: scripted({ status: "slow_down" }),
          intervalSeconds: 30,
          expiresInSeconds: 1,
        }),
      ).rejects.toThrow(/clock is wrong/);
    } finally {
      sleep.restore();
    }
  });

  it("stops as soon as the caller cancels", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      pollDeviceFlow({ poll: scripted<string>({ status: "pending" }), signal: controller.signal }),
    ).rejects.toThrow(DeviceFlowError);
  });

  it("does not poll after the code has expired", async () => {
    let polls = 0;
    await expect(
      pollDeviceFlow({
        poll: () => {
          polls += 1;
          return { status: "pending" as const };
        },
        expiresInSeconds: 0,
      }),
    ).rejects.toThrow(/timed out/);
    expect(polls).toBe(0);
  });
});
