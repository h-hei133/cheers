import { afterEach, describe, expect, it } from "vitest";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { alreadySeen, forgetRead, forgetSessionReads, readCacheRetention, READ_CACHE_LIMITS, rememberRead } from "./readCache.js";

const ids: string[] = [];
afterEach(() => { for (const id of ids.splice(0)) forgetSessionReads(id); });

describe("read cache retention", () => {
  it("falls back to a fresh read when a file or session is evicted", async () => {
    const file = fileURLToPath(new URL("./readCache.ts", import.meta.url));
    const seen = { offset: 1, limit: 0, modifiedMs: (await stat(file)).mtimeMs };
    const session = "bounded-read";
    ids.push(session);
    rememberRead(session, file, seen);
    expect(await alreadySeen(session, file, seen)).toBe(true);
    for (let i = 0; i < READ_CACHE_LIMITS.filesPerSession; i++) rememberRead(session, `other-${i}`, seen);
    expect(await alreadySeen(session, file, seen)).toBe(false);
    expect(readCacheRetention(session).files).toMatchObject({ size: READ_CACHE_LIMITS.filesPerSession, dropped: 1, incomplete: true });
    rememberRead(session, file, seen);
    for (let i = 0; i < READ_CACHE_LIMITS.sessions; i++) {
      const id = `read-session-${i}`;
      ids.push(id);
      rememberRead(id, file, seen);
    }
    expect(await alreadySeen(session, file, seen)).toBe(false);
    expect(readCacheRetention(session).sessions).toMatchObject({ size: READ_CACHE_LIMITS.sessions, incomplete: true });
  });

  it("does not allocate session state on a cache miss or invalidation", async () => {
    const before = readCacheRetention("unknown").sessions.size;
    expect(await alreadySeen("unknown", "missing", { offset: 1, limit: 0 })).toBe(false);
    forgetRead("unknown", "missing");
    expect(readCacheRetention("unknown").sessions.size).toBe(before);
  });
});
