import { afterEach, describe, expect, it, vi } from "vitest";
import { getSessionUsage, markContextUnknown, persistSessionUsage, recordSessionUsage, resetSessionUsage, restoreSessionUsage, totalTokens } from "../usageTelemetry.js";
import type { SessionUsageSnapshot } from "./model.js";
import { decodeUsageSnapshot, mergeUsageDelta } from "./snapshot.js";

const A = "usage-persist-a";
const B = "usage-persist-b";
afterEach(() => { resetSessionUsage(A); resetSessionUsage(B); });

function record(id: string, tokens: number, provider = "first", model = "org/model"): void {
  recordSessionUsage(id, { provider, model, promptTokens: tokens, cacheReadTokens: 5, toolCallsCount: 1 });
}

describe("durable usage", () => {
  it("round trips opaque provider/model keys without restoring a context measurement", () => {
    record(A, 100);
    record(A, 200, "second");
    let saved: SessionUsageSnapshot | undefined;
    persistSessionUsage(A, undefined, (next) => { saved = next; });
    markContextUnknown(A); // Context changes after the last state write.
    resetSessionUsage(A);
    restoreSessionUsage(A, JSON.parse(JSON.stringify(saved)));
    const resumed = getSessionUsage(A);
    expect(Object.keys(resumed.byModel)).toEqual(["first/org/model", "second/org/model"]);
    expect(totalTokens(resumed)).toBe(310);
    expect(resumed.toolCallsCount).toBe(2);
    expect(resumed.lastPromptTokens).toBeUndefined();
    expect(resumed.lastPromptMessageCount).toBe(0);
    expect(resumed.recentRequests.map(entry => ({ promptTokens: entry.promptTokens, purpose: entry.purpose })))
      .toEqual([{ promptTokens: 105, purpose: "turn" }, { promptTokens: 205, purpose: "turn" }]);
    expect(saved).not.toHaveProperty("lastPromptTokens");
    record(A, 20);
    persistSessionUsage(A, saved, (next) => { saved = next; });
    expect(saved?.byModel["first/org/model"]?.totalTokens).toBe(130);
    expect(saved?.byModel["second/org/model"]?.totalTokens).toBe(205);
  });

  it("keeps disk totals when live telemetry is absent, including after a cost read", () => {
    record(A, 100);
    let disk: SessionUsageSnapshot | undefined;
    persistSessionUsage(A, undefined, (next) => { disk = next; });
    getSessionUsage(B);
    persistSessionUsage(B, disk, (next) => expect(next).toEqual(disk));
  });

  it("merges two restored writers' deltas and shares the flush baseline", () => {
    record(A, 100);
    let disk: SessionUsageSnapshot | undefined;
    const write = (next: SessionUsageSnapshot | undefined) => { disk = next; };
    persistSessionUsage(A, undefined, write);
    restoreSessionUsage(B, disk);
    record(A, 10);
    record(B, 20);
    persistSessionUsage(B, disk, write);
    persistSessionUsage(A, disk, write);
    expect(disk?.byModel["first/org/model"]?.totalTokens).toBe(145);
    persistSessionUsage(A, disk, write);
    persistSessionUsage(B, disk, write);
    expect(disk?.byModel["first/org/model"]?.totalTokens).toBe(145);
    record(A, 5);
    persistSessionUsage(A, disk, write);
    expect(disk?.byModel["first/org/model"]?.totalTokens).toBe(155);
    expect(disk?.turnsCount).toBe(4);
    expect(disk?.toolCallsCount).toBe(4);
  });

  it("acknowledges a delta only after the writer succeeds", () => {
    record(A, 100);
    expect(() => persistSessionUsage(A, undefined, () => { throw new Error("disk full"); })).toThrow("disk full");
    let disk: SessionUsageSnapshot | undefined;
    persistSessionUsage(A, undefined, (next) => { disk = next; });
    persistSessionUsage(A, disk, (next) => { disk = next; });
    expect(disk?.byModel["first/org/model"]?.totalTokens).toBe(105);
  });

  it("does not restore a stale snapshot over unflushed live usage", () => {
    record(A, 100);
    let disk: SessionUsageSnapshot | undefined;
    persistSessionUsage(A, undefined, (next) => { disk = next; });
    record(A, 20);
    restoreSessionUsage(A, disk);
    expect(totalTokens(getSessionUsage(A))).toBe(130);
    expect(getSessionUsage(A).lastPromptTokens).toBe(25);
  });

  it("decodes prototype-like keys as own buckets", () => {
    record(A, 10, "", "__proto__");
    let disk: SessionUsageSnapshot | undefined;
    persistSessionUsage(A, undefined, (next) => { disk = next; });
    restoreSessionUsage(B, JSON.parse(JSON.stringify(disk)));
    record(B, 5, "", "__proto__");
    expect(getSessionUsage(B).byModel["__proto__"]?.totalTokens).toBe(25);
    expect(Object.getPrototypeOf(getSessionUsage(B).byModel)).toBeNull();
    expect(Object.prototype).not.toHaveProperty("totalTokens");
  });

  it("accepts legacy absence and rejects malformed totals instead of inventing zero", () => {
    expect(decodeUsageSnapshot(undefined)).toBeUndefined();
    for (const value of [null, {}, { byModel: [] }, { byModel: {}, lastBucketKey: "", turnsCount: -1, toolCallsCount: 0, lastUpdated: 1 }]) {
      expect(() => decodeUsageSnapshot(value)).toThrow("Invalid persisted session usage");
    }
  });

  it("persists bounded request purpose and completion counts for attribution", () => {
    recordSessionUsage(A, { provider: "first", model: "org/model", promptTokens: 12,
      completionTokens: 3, purpose: "discovery-load" });
    let saved: SessionUsageSnapshot | undefined;
    persistSessionUsage(A, undefined, next => { saved = next; });
    expect(saved?.recentRequests).toEqual([expect.objectContaining({
      promptTokens: 12, completionTokens: 3, purpose: "discovery-load",
    })]);
    resetSessionUsage(A);
    restoreSessionUsage(A, saved);
    expect(getSessionUsage(A).recentRequests[0]).toMatchObject({
      promptTokens: 12, completionTokens: 3, purpose: "discovery-load",
    });
  });

  it("does not duplicate restored history on the next persistence pass", () => {
    record(A, 10);
    record(A, 20);
    let saved: SessionUsageSnapshot | undefined;
    persistSessionUsage(A, undefined, next => { saved = next; });
    expect(saved?.recentRequests).toHaveLength(2);
    record(A, 30);
    persistSessionUsage(A, saved, next => { saved = next; });
    expect(saved?.recentRequests).toHaveLength(3);
  });

  it("retains a new request after the bounded history is full", () => {
    for (let index = 0; index < 64; index += 1) {
      recordSessionUsage(A, { provider: "first", model: "org/model", promptTokens: index + 1 });
    }
    let saved: SessionUsageSnapshot | undefined;
    persistSessionUsage(A, undefined, next => { saved = next; });
    recordSessionUsage(A, { provider: "first", model: "org/model", promptTokens: 65 });
    const merged = mergeUsageDelta(saved, getSessionUsage(A), saved);
    expect(merged.recentRequests).toHaveLength(64);
    expect(merged.recentRequests.at(-1)?.promptTokens).toBe(65);
    expect(merged.recentRequests[0]?.promptTokens).toBe(2);
  });

  it("retains an identical request recorded in the same millisecond after history is full", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T15:00:00.000Z"));
    try {
      for (let index = 0; index < 64; index += 1) {
        recordSessionUsage(A, { provider: "first", model: "org/model", promptTokens: 1, completionTokens: 1 });
      }
      let saved: SessionUsageSnapshot | undefined;
      persistSessionUsage(A, undefined, next => { saved = next; });
      const previousIds = getSessionUsage(A).recentRequests.map(entry => entry.id);
      recordSessionUsage(A, { provider: "first", model: "org/model", promptTokens: 1, completionTokens: 1 });
      const live = getSessionUsage(A);
      const newestId = live.recentRequests.at(-1)?.id;
      const merged = mergeUsageDelta(saved, live, saved);
      expect(newestId).toBeDefined();
      expect(newestId).not.toBe(previousIds.at(-1));
      expect(merged.recentRequests.at(-1)?.id).toBe(newestId);
      expect(merged.recentRequests[0]?.id).toBe(previousIds[1]);
    } finally {
      vi.useRealTimers();
    }
  });
});
