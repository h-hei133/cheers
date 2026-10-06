import { afterEach, describe, expect, it } from "vitest";
import { getSessionUsage, markContextUnknown, persistSessionUsage, recordSessionUsage, resetSessionUsage, restoreSessionUsage, totalTokens } from "../usageTelemetry.js";
import type { SessionUsageSnapshot } from "./model.js";
import { decodeUsageSnapshot } from "./snapshot.js";

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
    expect(resumed.recentRequests).toEqual([]);
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
});
