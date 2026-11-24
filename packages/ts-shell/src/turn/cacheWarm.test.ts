import { describe, expect, it, vi } from "vitest";
import { createCacheWarmingRunner } from "./cacheWarm.js";
import { ModelAdmissionError } from '../core/agent/request/model.js';
import { InputLimitError } from '../provider/request/input.js';
import type { SentRequest } from '../provider/request/sentRequest.js';

/**
 * What actually happens to a prompt between requests.
 *
 * The decision module is tested on its own; this is the part that has to deal
 * with time — a window that lapses, a run that ends first, a person who walks
 * away. The clock is injected so none of it has to be waited out.
 */

/** A request as it went out, which is what a refresh has to replay. */
const sent: SentRequest = {
  url: "https://api.test/v1/chat/completions",
  headers: { authorization: "Bearer k" },
  body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "hi" }] }),
  cache: { retention: 'short', ttlMs: 300_000 },
};

/** A model whose prices make a refresh clearly worth sending. */
const priced = {
  cost: { promptPerMTok: 3, completionPerMTok: 15, cacheReadPerMTok: 0.3, cacheWritePerMTok: 3.75 },
};

describe("the cache warming runner", () => {
  it('retires a captured prefix that no longer passes input limits without another refresh', async () => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => { throw new InputLimitError('The request exceeds the selected model byte limit.'); });
      const onDecision = vi.fn();
      const runner = createCacheWarmingRunner({ mode: 'idle', ...priced, refresh, onDecision });
      runner.noteRequest(500_000, sent); await vi.advanceTimersByTimeAsync(270_000);
      expect(refresh).toHaveBeenCalledOnce(); expect(runner.status().stopReason).toContain('byte limit');
      expect(runner.status().nextRefreshAt).toBeUndefined();
      expect(onDecision).toHaveBeenLastCalledWith(expect.anything(), expect.stringContaining('byte limit'));
      await vi.advanceTimersByTimeAsync(600_000); expect(refresh).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it('stops and exposes admission refusal without rescheduling', async () => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => { throw new ModelAdmissionError('exhausted'); });
      const onDecision = vi.fn(); const runner = createCacheWarmingRunner({ mode: 'idle', ...priced, refresh, onDecision });
      runner.noteRequest(500_000, sent); await vi.advanceTimersByTimeAsync(270_000);
      expect(refresh).toHaveBeenCalledOnce(); expect(runner.status()).toMatchObject({ stopReason: expect.stringContaining('exhausted') });
      expect(runner.status().nextRefreshAt).toBeUndefined();
      expect(onDecision).toHaveBeenLastCalledWith(expect.anything(), expect.stringContaining('exhausted'));
      runner.noteSettled(); runner.noteRequest(500_000, sent); await vi.advanceTimersByTimeAsync(600_000);
      expect(refresh).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it.each([0, Number.NaN, Number.POSITIVE_INFINITY])("invalidates a prefix with %s input tokens without permanently stopping", async tokens => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => {});
      const runner = createCacheWarmingRunner({ mode: "idle", ...priced, refresh });
      runner.noteRequest(500000, sent);
      expect(runner.status().nextRefreshAt).toBeDefined();
      runner.noteRequest(tokens, sent);
      runner.noteSettled();
      expect(runner.status().nextRefreshAt).toBeUndefined();
      await vi.advanceTimersByTimeAsync(300000);
      expect(refresh).not.toHaveBeenCalled();
      runner.noteRequest(500000, sent);
      expect(runner.status().nextRefreshAt).toBeDefined();
      runner.stop();
    } finally {
      vi.useRealTimers();
    }
  });

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

    runner.noteRequest(200_000, { ...sent, cache: undefined });

    expect(refresh).not.toHaveBeenCalled();
    expect(runner.status().nextRefreshAt).toBeUndefined();
  });

  it("sends nothing when the model publishes no prices", async () => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => {});
      const onDecision = vi.fn();
      const runner = createCacheWarmingRunner({ mode: "streaming", refresh, onDecision });
      runner.noteRequest(200_000, sent);
      await vi.advanceTimersByTimeAsync(270_000);
      expect(refresh).not.toHaveBeenCalled();
      expect(onDecision).toHaveBeenCalledWith(expect.objectContaining({ action: 'stop' }), expect.stringContaining('no prices'));
      expect(runner.status().stopReason).toContain('no prices');
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies the Responses refresh output cap when deciding whether to send', async () => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => {});
      const runner = createCacheWarmingRunner({ mode: 'streaming', refresh,
        cost: { promptPerMTok: 1, completionPerMTok: 50, cacheReadPerMTok: 0.2 } });
      runner.noteRequest(84_000, { ...sent, endpoint: 'openai-responses' });
      await vi.advanceTimersByTimeAsync(270_000);
      expect(refresh).not.toHaveBeenCalled();
      expect(runner.status().stopReason).toContain('below the threshold');
    } finally {
      vi.useRealTimers();
    }
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

  it("waits for a new foreground request after a refresh that failed", async () => {
    // Failure does not prove that the provider refreshed its prefix. A later
    // foreground request can establish a new window without inventing one here.
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => {
        throw new Error("network");
      });
      const runner = createCacheWarmingRunner({ mode: "streaming", ...priced, refresh });

      runner.noteRequest(200_000, sent);
      await vi.advanceTimersByTimeAsync(270_000);
      expect(refresh).toHaveBeenCalledTimes(1);

      expect(runner.status().nextRefreshAt).toBeUndefined();
      await vi.advanceTimersByTimeAsync(270_000);
      expect(refresh).toHaveBeenCalledTimes(1);
      runner.noteRequest(200_000, sent);
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


describe("cache warming lifecycle", () => {
  it('reports reset uncertainty when a refresh ignores cancellation, and discards its late usage', async () => {
    vi.useFakeTimers();
    try {
      let finish!: (value: { prompt_tokens: number }) => void;
      let signal!: AbortSignal;
      const onUsage = vi.fn();
      const refresh = vi.fn(async (_sent, received) => { signal = received; return new Promise<{ prompt_tokens: number }>(resolve => { finish = resolve; }); });
      const runner = createCacheWarmingRunner({ mode: 'idle', ...priced, refresh, onUsage });
      runner.noteRequest(500000, sent);
      await vi.advanceTimersByTimeAsync(270000);
      const reset = runner.reset();
      expect(signal.aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(3000);
      expect(await reset).toBe('unknown');
      finish({ prompt_tokens: 500000 });
      await vi.advanceTimersByTimeAsync(0);
      expect(onUsage).not.toHaveBeenCalled();
      expect(runner.status().nextRefreshAt).toBeUndefined();
      runner.noteRequest(500000, sent);
      await vi.advanceTimersByTimeAsync(600000);
      expect(refresh).toHaveBeenCalledOnce();
      expect(await runner.reset()).toBe('unchanged');
    } finally { vi.useRealTimers(); }
  });

  it('retires the captured prefix without sending and reports stateless reset as unchanged', async () => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => {});
      const runner = createCacheWarmingRunner({ mode: 'idle', ...priced, refresh });
      runner.noteRequest(500000, sent);
      expect(await runner.reset()).toBe('reset');
      expect(await runner.reset()).toBe('unchanged');
      await vi.advanceTimersByTimeAsync(600000);
      expect(refresh).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it.each(["stop", "settle"])("does not rearm after %s during a refresh", async (action) => {
    vi.useFakeTimers();
    try {
      let finish!: () => void;
      let signal!: AbortSignal;
      const refresh = vi.fn(async (_sent, currentSignal) => {
        signal = currentSignal;
        await new Promise<void>((resolve) => { finish = resolve; });
      });
      const runner = createCacheWarmingRunner({ mode: "streaming", ...priced, refresh });
      runner.noteRequest(200_000, sent);
      await vi.advanceTimersByTimeAsync(270_000);
      if (action === "stop") runner.stop(); else runner.noteSettled();
      expect(signal.aborted).toBe(true);
      finish();
      await vi.advanceTimersByTimeAsync(0);
      expect(runner.status().nextRefreshAt).toBeUndefined();
      await vi.advanceTimersByTimeAsync(600_000);
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it.each(["resolve", "reject"])("keeps the newer request schedule when old refreshes %s", async (outcome) => {
    vi.useFakeTimers();
    try {
      let finish!: () => void;
      let signal!: AbortSignal;
      const refresh = vi.fn(async (_sent, currentSignal) => {
        if (refresh.mock.calls.length > 1) return;
        signal = currentSignal;
        await new Promise<void>((resolve, reject) => { finish = outcome === "resolve" ? resolve : () => reject(new Error("late")); });
      });
      const runner = createCacheWarmingRunner({ mode: "streaming", ...priced, refresh });
      runner.noteRequest(200_000, sent);
      await vi.advanceTimersByTimeAsync(270_000);
      const newer = { ...sent, body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "new prompt" }] }) };
      runner.noteRequest(200_000, newer);
      const due = runner.status().nextRefreshAt;
      expect(signal.aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(1_000);
      finish();
      await vi.advanceTimersByTimeAsync(0);
      expect(runner.status().nextRefreshAt).toBe(due);
      await vi.advanceTimersByTimeAsync(269_000);
      expect(refresh).toHaveBeenCalledTimes(2);
      expect(refresh.mock.calls[1][0]).toEqual(newer);
      expect(refresh.mock.calls[1][0]).not.toBe(newer);
      runner.stop();
    } finally { vi.useRealTimers(); }
  });

  it("cannot restart a stopped runner with a late request notification", async () => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => {});
      const runner = createCacheWarmingRunner({ mode: "idle", ...priced, refresh });
      runner.noteRequest(500_000, sent);
      runner.stop();
      runner.noteRequest(500_000, sent);
      runner.noteSettled();
      await vi.advanceTimersByTimeAsync(600_000);
      expect(refresh).not.toHaveBeenCalled();
      expect(runner.status().nextRefreshAt).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });

  it("keeps an interrupted streaming refresh disarmed after its late completion", async () => {
    vi.useFakeTimers();
    try {
      let finish!: () => void;
      let signal!: AbortSignal;
      const refresh = vi.fn(async (_sent, currentSignal) => {
        if (refresh.mock.calls.length > 1) return;
        signal = currentSignal;
        await new Promise<void>((resolve) => { finish = resolve; });
      });
      const runner = createCacheWarmingRunner({ mode: "idle", ...priced, refresh });
      runner.noteRequest(500_000, sent);
      await vi.advanceTimersByTimeAsync(270_000);
      await vi.advanceTimersByTimeAsync(10_000);
      runner.noteSettled();
      expect(runner.status().nextRefreshAt).toBeUndefined();
      expect(signal.aborted).toBe(true);
      finish();
      await vi.advanceTimersByTimeAsync(0);
      expect(runner.status().nextRefreshAt).toBeUndefined();
      await vi.advanceTimersByTimeAsync(600_000);
      expect(refresh).toHaveBeenCalledOnce();
      runner.noteRequest(500_000, sent);
      expect(runner.status().nextRefreshAt).toBeDefined();
      runner.stop();
    } finally { vi.useRealTimers(); }
  });

  it("rechecks ownership after reporting a warming decision", async () => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => {});
      const runner = createCacheWarmingRunner({
        mode: "streaming", ...priced, refresh,
        onDecision: () => runner.stop(),
      });
      runner.noteRequest(200_000, sent);
      await vi.advanceTimersByTimeAsync(270_000);
      expect(refresh).not.toHaveBeenCalled();
      expect(runner.status().nextRefreshAt).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });

  it("declines a timer that fires after its refresh margin", async () => {
    vi.useFakeTimers();
    try {
      let clock = 0;
      const refresh = vi.fn(async () => {});
      const runner = createCacheWarmingRunner({ mode: "streaming", ...priced, refresh, now: () => clock });
      runner.noteRequest(200_000, sent);
      // The timer was due at 270s; half the 30s expiry margin has been missed.
      clock = 286_000;
      await vi.advanceTimersByTimeAsync(270_000);
      expect(refresh).not.toHaveBeenCalled();
      expect(runner.status().nextRefreshAt).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });
});


it.each([false, true])("records refresh usage only while its request remains current (stopped=%s)", async (stopped) => {
  vi.useFakeTimers();
  try {
    let finish!: (usage: { prompt_tokens: number }) => void;
    const onUsage = vi.fn();
    const runner = createCacheWarmingRunner({ mode: "idle", ...priced, onUsage,
      refresh: async () => new Promise<{ prompt_tokens: number }>(resolve => { finish = resolve; }),
    });
    runner.noteRequest(500000, sent);
    await vi.advanceTimersByTimeAsync(270000);
    if (stopped) runner.stop();
    finish({ prompt_tokens: 500000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(onUsage.mock.calls).toEqual(stopped ? [] : [[{ prompt_tokens: 500000 }]]);
    runner.stop();
  } finally { vi.useRealTimers(); }
});

it("does not arm a request whose prefix cannot be refreshed", () => {
  const runner = createCacheWarmingRunner({ mode: "idle", ...priced, canRefresh: () => false, refresh: async () => {} });
  runner.noteRequest(500000, sent);
  runner.noteSettled();
  expect(runner.status().nextRefreshAt).toBeUndefined();
  runner.stop();
});


it("discards refresh usage after a branch or model change", async () => {
  vi.useFakeTimers();
  try {
    let current = true;
    let finish!: (usage: { prompt_tokens: number }) => void;
    const onUsage = vi.fn();
    const runner = createCacheWarmingRunner({ mode: "idle", ...priced, onUsage, isCurrent: () => current,
      refresh: async () => new Promise<{ prompt_tokens: number }>(resolve => { finish = resolve; }),
    });
    runner.noteRequest(500000, sent);
    await vi.advanceTimersByTimeAsync(270000);
    current = false;
    finish({ prompt_tokens: 500000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(onUsage).not.toHaveBeenCalled();
    expect(runner.status().nextRefreshAt).toBeUndefined();
  } finally { vi.useRealTimers(); }
});

describe('captured cache windows', () => {
  it('uses the sent long window instead of the model short window', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const refresh = vi.fn(async () => ({ prompt_tokens: 500_000 }));
      const runner = createCacheWarmingRunner({ mode: 'streaming', ...priced, refresh });
      runner.noteRequest(500_000, { ...sent, cache: { retention: 'long', ttlMs: 1_800_000 } } as SentRequest);
      expect(runner.status().nextRefreshAt).toBe(1_620_000);
      await vi.advanceTimersByTimeAsync(300_000);
      expect(refresh).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1_320_000);
      expect(refresh).toHaveBeenCalledOnce();
      runner.stop();
    } finally { vi.useRealTimers(); }
  });

  it('does not replace a long window beyond the phase budget with a short timer', async () => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => ({ prompt_tokens: 500_000 }));
      const runner = createCacheWarmingRunner({ mode: 'idle', ...priced, refresh });
      runner.noteRequest(500_000, { ...sent, cache: { retention: 'long', ttlMs: 86_400_000 } } as SentRequest);
      runner.noteSettled();
      expect(runner.status().nextRefreshAt).toBeUndefined();
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(refresh).not.toHaveBeenCalled();
      runner.stop();
    } finally { vi.useRealTimers(); }
  });

  it('continues confirmed refreshes within the original streaming age budget', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const refresh = vi.fn(async () => ({ prompt_tokens: 500_000 }));
      const runner = createCacheWarmingRunner({ mode: 'streaming', ...priced, refresh });
      runner.noteRequest(500_000, sent);
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(refresh).toHaveBeenCalledTimes(13);
      expect(runner.status().nextRefreshAt).toBeUndefined();
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(refresh).toHaveBeenCalledTimes(13);
      runner.stop();
    } finally { vi.useRealTimers(); }
  });

  it.each([
    undefined,
    { retention: 'none', ttlMs: 300_000 },
    { retention: 'long' },
    { retention: 'short', ttlMs: 0 },
    { retention: 'short', ttlMs: Number.NaN },
    { retention: 'short', ttlMs: Number.POSITIVE_INFINITY },
    { retention: 'short', ttlMs: 10_000 },
    { retention: 'short', ttlMs: Number.MAX_SAFE_INTEGER },
  ])('leaves an unrefreshable captured window disarmed (%j)', async cache => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => ({ prompt_tokens: 500_000 }));
      const runner = createCacheWarmingRunner({ mode: 'idle', ...priced, refresh });
      runner.noteRequest(500_000, { ...sent, cache } as SentRequest);
      runner.noteSettled();
      expect(runner.status().nextRefreshAt).toBeUndefined();
      await vi.advanceTimersByTimeAsync(600_000);
      expect(refresh).not.toHaveBeenCalled();
      runner.stop();
    } finally { vi.useRealTimers(); }
  });

  it('keeps the original expiry when streaming becomes idle', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const refresh = vi.fn(async () => ({ prompt_tokens: 500_000 }));
      const runner = createCacheWarmingRunner({ mode: 'idle', ...priced, refresh });
      runner.noteRequest(500_000, { ...sent, cache: { retention: 'short', ttlMs: 300_000 } } as SentRequest);
      await vi.advanceTimersByTimeAsync(260_000);
      runner.noteSettled();
      expect(runner.status().nextRefreshAt).toBe(270_000);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(refresh).toHaveBeenCalledOnce();
      runner.stop();
    } finally { vi.useRealTimers(); }
  });

  it('retains the actual dispatch timestamp when notification arrives late', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(260_000);
      const refresh = vi.fn(async () => ({ prompt_tokens: 500_000 }));
      const runner = createCacheWarmingRunner({ mode: 'streaming', ...priced, refresh });
      runner.noteRequest(500_000, { ...sent, sentAt: 0, cache: { retention: 'short', ttlMs: 300_000 } } as SentRequest);
      expect(runner.status().nextRefreshAt).toBe(270_000);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(refresh).toHaveBeenCalledOnce();
      runner.stop();
    } finally { vi.useRealTimers(); }
  });

  it('rejects a notification whose original cache window already expired', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(310_000);
      const refresh = vi.fn(async () => ({ prompt_tokens: 500_000 }));
      const runner = createCacheWarmingRunner({ mode: 'idle', ...priced, refresh });
      runner.noteRequest(500_000, { ...sent, sentAt: 0, cache: { retention: 'short', ttlMs: 300_000 } } as SentRequest);
      runner.noteSettled();
      expect(runner.status().nextRefreshAt).toBeUndefined();
      await vi.advanceTimersByTimeAsync(600_000);
      expect(refresh).not.toHaveBeenCalled();
      runner.stop();
    } finally { vi.useRealTimers(); }
  });

  it('does not buy another request after settling beyond the safe expiry margin', async () => {
    vi.useFakeTimers();
    try {
      let clock = 0;
      const refresh = vi.fn(async () => ({ prompt_tokens: 500_000 }));
      const runner = createCacheWarmingRunner({ mode: 'idle', ...priced, refresh, now: () => clock });
      runner.noteRequest(500_000, { ...sent, cache: { retention: 'short', ttlMs: 300_000 } } as SentRequest);
      clock = 286_000;
      runner.noteSettled();
      expect(runner.status().nextRefreshAt).toBeUndefined();
      await vi.advanceTimersByTimeAsync(600_000);
      expect(refresh).not.toHaveBeenCalled();
      runner.stop();
    } finally { vi.useRealTimers(); }
  });

  it.each(['void', 'failed'])('does not invent a new window from a %s refresh', async outcome => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn(async () => {
        if (outcome === 'failed') throw new Error('network');
      });
      const runner = createCacheWarmingRunner({ mode: 'idle', ...priced, refresh });
      const captured = { ...sent, cache: { retention: 'short', ttlMs: 300_000 } } as SentRequest;
      runner.noteRequest(500_000, captured);
      await vi.advanceTimersByTimeAsync(270_000);
      expect(refresh).toHaveBeenCalledOnce();
      expect(runner.status().nextRefreshAt).toBeUndefined();
      runner.noteSettled();
      await vi.advanceTimersByTimeAsync(600_000);
      expect(refresh).toHaveBeenCalledOnce();
      runner.noteRequest(500_000, captured);
      expect(runner.status().nextRefreshAt).toBeDefined();
      runner.stop();
    } finally { vi.useRealTimers(); }
  });

  it('anchors a confirmed refresh at dispatch instead of its late completion', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      let finish!: (usage: { prompt_tokens: number }) => void;
      const runner = createCacheWarmingRunner({ mode: 'idle', ...priced,
        refresh: async () => new Promise<{ prompt_tokens: number }>(resolve => { finish = resolve; }),
      });
      runner.noteRequest(500_000, { ...sent, cache: { retention: 'short', ttlMs: 300_000 } } as SentRequest);
      await vi.advanceTimersByTimeAsync(270_000);
      await vi.advanceTimersByTimeAsync(40_000);
      finish({ prompt_tokens: 500_000 });
      await vi.advanceTimersByTimeAsync(0);
      expect(runner.status().nextRefreshAt).toBe(540_000);
      runner.stop();
    } finally { vi.useRealTimers(); }
  });

  it('captures replay bytes and nested headers independently of caller mutation', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const captured = { ...sent, headers: { authorization: 'Bearer first' }, requestHeaders: { 'x-affinity': 'first' },
        cache: { retention: 'short' as const, ttlMs: 300_000 }, inputLimits: { maxRequestBytes: 100_000 },
      };
      const expected = structuredClone(captured);
      const refresh = vi.fn(async () => ({ prompt_tokens: 500_000 }));
      const runner = createCacheWarmingRunner({ mode: 'idle', ...priced, refresh });
      runner.noteRequest(500_000, captured);
      captured.headers.authorization = 'Bearer later';
      captured.requestHeaders['x-affinity'] = 'later';
      captured.cache.ttlMs = 60_000;
      captured.inputLimits.maxRequestBytes = 1;
      captured.body = JSON.stringify({ model: 'other', messages: [] });
      await vi.advanceTimersByTimeAsync(270_000);
      expect(refresh).toHaveBeenCalledOnce();
      expect(refresh.mock.calls[0][0]).toEqual(expected);
      expect(Object.isFrozen(refresh.mock.calls[0][0].headers)).toBe(true);
      expect(Object.isFrozen(refresh.mock.calls[0][0].cache)).toBe(true);
      runner.stop();
    } finally { vi.useRealTimers(); }
  });
});

describe('cache callback ownership', () => {
  it('carries the streaming age cap through delayed transport admission', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const refresh = vi.fn(async (_sent: SentRequest, _signal: AbortSignal, _deadline?: number) => ({ prompt_tokens: 500_000 }));
      const runner = createCacheWarmingRunner({ mode: 'streaming', ...priced, refresh });
      runner.noteRequest(500_000, sent);
      // A foreground request near the age cap keeps the same active run's age.
      vi.setSystemTime(3_330_000);
      runner.noteRequest(500_000, { ...sent, sentAt: 3_330_000 });
      await vi.advanceTimersByTimeAsync(270_000);
      expect(refresh).toHaveBeenCalledOnce();
      expect(refresh.mock.calls[0]![2]).toBe(3_600_000);
      runner.stop();
    } finally { vi.useRealTimers(); }
  });
  it('preserves a successor when the retiring owner callback returns false', async () => {
    vi.useFakeTimers();
    try {
      let retireOnRead = false;
      const newer = { ...sent, body: JSON.stringify({ model: 'newer', messages: [] }) };
      const refresh = vi.fn(async () => ({ prompt_tokens: 500_000 }));
      const runner = createCacheWarmingRunner({ mode: 'idle', ...priced, refresh, isCurrent: () => {
        if (retireOnRead) {
          retireOnRead = false;
          runner.noteRequest(500_000, newer);
          return false;
        }
        return true;
      } });
      runner.noteRequest(500_000, sent);
      retireOnRead = true;
      await vi.advanceTimersByTimeAsync(270_000);
      expect(refresh).not.toHaveBeenCalled();
      expect(runner.status().nextRefreshAt).toBeDefined();
      await vi.advanceTimersByTimeAsync(270_000);
      expect(refresh).toHaveBeenCalledOnce();
      expect(refresh.mock.calls[0][0].body).toBe(newer.body);
      runner.stop();
    } finally { vi.useRealTimers(); }
  });

  it('keeps an uncertain in-flight refresh disarmed when the phase changes', async () => {
    vi.useFakeTimers();
    try {
      let finish!: (usage: { prompt_tokens: number }) => void;
      let signal!: AbortSignal;
      const onUsage = vi.fn();
      const refresh = vi.fn(async (_sent, currentSignal) => {
        signal = currentSignal;
        return new Promise<{ prompt_tokens: number }>(resolve => { finish = resolve; });
      });
      const runner = createCacheWarmingRunner({ mode: 'idle', ...priced, refresh, onUsage });
      runner.noteRequest(500_000, sent);
      await vi.advanceTimersByTimeAsync(270_000);
      runner.noteSettled();
      expect(signal.aborted).toBe(true);
      expect(runner.status().nextRefreshAt).toBeUndefined();
      finish({ prompt_tokens: 500_000 });
      await vi.advanceTimersByTimeAsync(600_000);
      expect(refresh).toHaveBeenCalledOnce();
      expect(onUsage).not.toHaveBeenCalled();
      runner.noteRequest(500_000, sent);
      expect(runner.status().nextRefreshAt).toBeDefined();
      runner.stop();
    } finally { vi.useRealTimers(); }
  });

  it('does not restart the idle age budget on repeated settlement notifications', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const refresh = vi.fn(async () => ({ prompt_tokens: 500_000 }));
      const runner = createCacheWarmingRunner({ mode: 'idle', ...priced, refresh });
      runner.noteRequest(500_000, sent);
      runner.noteSettled();
      await vi.advanceTimersByTimeAsync(1_700_000);
      expect(refresh).toHaveBeenCalledTimes(6);
      runner.noteSettled();
      expect(runner.status().nextRefreshAt).toBeUndefined();
      await vi.advanceTimersByTimeAsync(600_000);
      expect(refresh).toHaveBeenCalledTimes(6);
      runner.stop();
    } finally { vi.useRealTimers(); }
  });

  it('keeps a successor request admitted from the current-owner callback', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      let reenter = true;
      const newer = { ...sent, body: JSON.stringify({ model: 'newer', messages: [] }) };
      const refresh = vi.fn(async () => ({ prompt_tokens: 500_000 }));
      const runner = createCacheWarmingRunner({ mode: 'idle', ...priced, refresh, isCurrent: () => {
        if (reenter) { reenter = false; runner.noteRequest(500_000, newer); }
        return true;
      } });
      runner.noteRequest(500_000, sent);
      await vi.advanceTimersByTimeAsync(270_000);
      expect(refresh).toHaveBeenCalledOnce();
      expect(refresh.mock.calls[0][0].body).toBe(newer.body);
      runner.stop();
    } finally { vi.useRealTimers(); }
  });

  it('does not attribute old usage after owner callback replaces the request', async () => {
    vi.useFakeTimers();
    try {
      let finish!: (usage: { prompt_tokens: number }) => void;
      let replaceOnRead = false;
      const onUsage = vi.fn();
      const newer = { ...sent, body: JSON.stringify({ model: 'newer', messages: [] }) };
      const runner = createCacheWarmingRunner({ mode: 'idle', ...priced, onUsage,
        refresh: async () => new Promise<{ prompt_tokens: number }>(resolve => { finish = resolve; }),
        isCurrent: () => {
          if (replaceOnRead) { replaceOnRead = false; runner.noteRequest(500_000, newer); }
          return true;
        },
      });
      runner.noteRequest(500_000, sent);
      await vi.advanceTimersByTimeAsync(270_000);
      replaceOnRead = true;
      finish({ prompt_tokens: 500_000 });
      await vi.advanceTimersByTimeAsync(0);
      expect(onUsage).not.toHaveBeenCalled();
      runner.stop();
    } finally { vi.useRealTimers(); }
  });

  it('does not send after a decision callback exceeds the original deadline', async () => {
    vi.useFakeTimers();
    try {
      let clock = 0;
      const refresh = vi.fn(async () => ({ prompt_tokens: 500_000 }));
      const runner = createCacheWarmingRunner({ mode: 'idle', ...priced, refresh, now: () => clock,
        onDecision: () => { clock = 286_000; },
      });
      runner.noteRequest(500_000, sent);
      clock = 270_000;
      await vi.advanceTimersByTimeAsync(270_000);
      expect(refresh).not.toHaveBeenCalled();
      expect(runner.status().nextRefreshAt).toBeUndefined();
      runner.stop();
    } finally { vi.useRealTimers(); }
  });

  it('does not let a stale admission rejection stop a successor request', async () => {
    vi.useFakeTimers();
    try {
      let reject!: (error: Error) => void;
      const refresh = vi.fn(async () => new Promise<{ prompt_tokens: number }>((_resolve, refuse) => { reject = refuse; }));
      const runner = createCacheWarmingRunner({ mode: 'idle', ...priced, refresh });
      runner.noteRequest(500_000, sent);
      await vi.advanceTimersByTimeAsync(270_000);
      runner.noteRequest(500_000, { ...sent, body: JSON.stringify({ model: 'newer', messages: [] }) });
      const due = runner.status().nextRefreshAt;
      reject(new ModelAdmissionError('old refusal'));
      await vi.advanceTimersByTimeAsync(0);
      expect(runner.status().nextRefreshAt).toBe(due);
      expect(runner.status().stopReason).toBeUndefined();
      runner.stop();
    } finally { vi.useRealTimers(); }
  });
});
