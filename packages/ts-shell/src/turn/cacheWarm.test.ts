import { describe, expect, it, vi } from "vitest";
import { createCacheWarmingRunner } from "./cacheWarm.js";

/**
 * What actually happens to a prompt between requests.
 *
 * The decision module is tested on its own; this is the part that has to deal
 * with time — a window that lapses, a run that ends first, a person who walks
 * away. The clock is injected so none of it has to be waited out.
 */

/** A request as it went out, which is what a refresh has to replay. */
const sent = {
  url: "https://api.test/v1/chat/completions",
  headers: { authorization: "Bearer k" },
  body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "hi" }] }),
};

/** A model whose prices make a refresh clearly worth sending. */
const priced = {
  cost: { promptPerMTok: 3, completionPerMTok: 15, cacheReadPerMTok: 0.3, cacheWritePerMTok: 3.75 },
  promptCache: { short: 300 },
};

describe("the cache warming runner", () => {
  it("sends nothing when it is switched off", async () => {
    const refresh = vi.fn(async () => {});
    const runner = createCacheWarmingRunner({ mode: "off", ...priced, refresh });

    runner.noteRequest(200_000, sent);
    runner.noteSettled();

    expect(refresh).not.toHaveBeenCalled();
    expect(runner.status().nextRefreshAt).toBeUndefined();
  });

  it("sends nothing when the model publishes no window", async () => {
    // Without a window there is no safe moment to refresh: too early wastes a
    // request, too late pays a full-price rewrite.
    const refresh = vi.fn(async () => {});
    const runner = createCacheWarmingRunner({
      mode: "streaming",
      cost: priced.cost,
      refresh,
    });

    runner.noteRequest(200_000, sent);

    expect(refresh).not.toHaveBeenCalled();
    expect(runner.status().nextRefreshAt).toBeUndefined();
  });

  it("sends nothing when the model publishes no prices", async () => {
    // The saving cannot be computed, so the request is not made on a guess.
    const refresh = vi.fn(async () => {});
    const runner = createCacheWarmingRunner({
      mode: "streaming",
      promptCache: priced.promptCache,
      refresh,
    });

    runner.noteRequest(200_000, sent);

    expect(refresh).not.toHaveBeenCalled();
  });

  it("schedules a refresh a little before the window lapses", async () => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => {});
      const runner = createCacheWarmingRunner({ mode: "streaming", ...priced, refresh });

      runner.noteRequest(200_000, sent);
      const scheduled = runner.status().nextRefreshAt;
      expect(scheduled).toBeDefined();

      // Nine tenths of a five-minute window.
      await vi.advanceTimersByTimeAsync(270_000);
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops refreshing once the run settles, in the mode that does not wait", async () => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => {});
      const runner = createCacheWarmingRunner({ mode: "streaming", ...priced, refresh });

      runner.noteRequest(200_000, sent);
      runner.noteSettled();
      await vi.advanceTimersByTimeAsync(600_000);

      // Refreshing for a person who may not come back is a bet the default mode
      // does not make on their behalf.
      expect(refresh).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("declines a size that only a running session could justify", async () => {
    // The phase is the whole difference: the same prefix is worth refreshing
    // while a run is under way and not worth it once the session is waiting,
    // because the saving has to be discounted by the chance anyone returns.
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => {});
      const runner = createCacheWarmingRunner({ mode: "idle", ...priced, refresh });

      runner.noteRequest(200_000, sent);
      runner.noteSettled();
      await vi.advanceTimersByTimeAsync(270_000);

      expect(refresh).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps refreshing while the session waits, in the mode that opted in", async () => {
    // A prefix large enough that the discounted saving still clears the
    // threshold, which is the case the idle mode exists for.
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => {});
      const runner = createCacheWarmingRunner({ mode: "idle", ...priced, refresh });

      runner.noteRequest(500_000, sent);
      runner.noteSettled();
      await vi.advanceTimersByTimeAsync(270_000);

      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up once the session has been waiting too long", async () => {
    // A session left open overnight should not spend the night making requests
    // nobody is waiting for.
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => {});
      const runner = createCacheWarmingRunner({ mode: "idle", ...priced, refresh });

      runner.noteRequest(200_000, sent);
      runner.noteSettled();
      await vi.advanceTimersByTimeAsync(31 * 60_000);

      expect(refresh).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("carries on after a refresh that failed", async () => {
    // A refresh that did not happen is not worth stopping for: nothing the user
    // did caused it and nothing they could do would fix it.
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => {
        throw new Error("network");
      });
      const runner = createCacheWarmingRunner({ mode: "streaming", ...priced, refresh });

      runner.noteRequest(200_000, sent);
      await vi.advanceTimersByTimeAsync(270_000);
      expect(refresh).toHaveBeenCalledTimes(1);

      // Still armed, so the next window is refreshed too.
      await vi.advanceTimersByTimeAsync(270_000);
      expect(refresh).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops sending when told to", async () => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => {});
      const runner = createCacheWarmingRunner({ mode: "streaming", ...priced, refresh });

      runner.noteRequest(200_000, sent);
      runner.stop();
      await vi.advanceTimersByTimeAsync(600_000);

      expect(refresh).not.toHaveBeenCalled();
      expect(runner.status().nextRefreshAt).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("declines on economics without leaving a timer armed", async () => {
    // A prefix too small to be worth refreshing will not become worth it, so
    // there is nothing to stay armed for.
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => {});
      const decisions: string[] = [];
      const runner = createCacheWarmingRunner({
        mode: "streaming",
        cost: { promptPerMTok: 0.1, completionPerMTok: 0.4, cacheReadPerMTok: 0.01 },
        promptCache: { short: 300 },
        refresh,
        onDecision: (decision) => decisions.push(decision.action),
      });

      runner.noteRequest(1_000, sent);
      await vi.advanceTimersByTimeAsync(270_000);

      expect(refresh).not.toHaveBeenCalled();
      expect(decisions).toEqual(["stop"]);
      expect(runner.status().nextRefreshAt).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
