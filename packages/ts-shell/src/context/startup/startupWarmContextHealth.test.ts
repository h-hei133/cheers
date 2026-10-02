import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildStartupWarmContext } from "./startupWarmContextBuilder.js";
import { createStartupWarmContextCacheStore } from "./startupWarmContextHealth.js";

describe("startup warm context cache health", () => {
  let cacheRoot = "";

  beforeEach(() => {
    cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "startup-warm-cache-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(cacheRoot, { recursive: true, force: true });
  });

  it("writes and reads a discardable cache only with explicit roots", async () => {
    const store = createStartupWarmContextCacheStore({
      ref: {
        mode: "test-only",
        projectRoot: "/workspace/app",
        cacheRoot,
      },
    });
    const built = await buildStartupWarmContext({
      projectRoot: "/workspace/app",
      createdAt: "2026-05-16T00:00:00.000Z",
    });

    const write = await store.write(built.cache);
    const read = await store.read();

    expect(write.written).toBe(true);
    expect(read.found).toBe(true);
    expect(read.staleness).toBe("unknown");
    expect(read.cache?.safety.discardable).toBe(true);
    expect(write.cacheFile).toContain("startup-warm-context.json");
  });

  it("handles missing and stale cache states clearly", async () => {
    const store = createStartupWarmContextCacheStore({
      ref: {
        mode: "test-only",
        projectRoot: "/workspace/app",
        cacheRoot,
      },
    });

    expect((await store.health()).found).toBe(false);
    expect((await store.health()).staleness).toBe("unknown");

    const built = await buildStartupWarmContext({
      projectRoot: "/workspace/app",
      createdAt: "2026-05-16T00:00:00.000Z",
    });
    await store.write(built.cache);

    const stale = await store.read({ currentSourceSignature: "different" });
    expect(stale.staleness).toBe("stale");
  });

  it("blocks writes without an explicit cache root", async () => {
    const store = createStartupWarmContextCacheStore({
      ref: { mode: "test-only", projectRoot: "/workspace/app" },
    });
    const built = await buildStartupWarmContext({
      projectRoot: "/workspace/app",
      createdAt: "2026-05-16T00:00:00.000Z",
    });

    const write = await store.write(built.cache);

    expect(write.written).toBe(false);
    expect(write.blocker?.toLowerCase()).toContain("explicit");
  });

  it.each(["project", "safety", "date", "version", "section"])("rejects invalid %s without returning summaries", async (field) => {
    const cacheFile = path.join(cacheRoot, "cache.json");
    const store = createStartupWarmContextCacheStore({ ref: { mode: "test-only", projectRoot: "/workspace/app", cacheFile } });
    const built = await buildStartupWarmContext({ projectRoot: "/workspace/app", createdAt: "2026-10-01T00:00:00Z" });
    const value = JSON.parse(JSON.stringify(built.cache));
    if (field === "project") value.projectRef.projectRootHash = "wrong-project";
    if (field === "safety") value.safety.injectedIntoModel = true;
    if (field === "date") value.createdAt = "not-a-date";
    if (field === "version") value.cacheVersion = 99;
    if (field === "section") value.compactSummary.status = "invented";
    fs.writeFileSync(cacheFile, JSON.stringify(value));
    const read = await store.read();
    expect(read.staleness).toBe("invalid");
    expect(read.cache).toBeUndefined();
    expect(read.blocker).toBeTruthy();
  });

  it("does not claim freshness without a current comparison", async () => {
    const store = createStartupWarmContextCacheStore({ ref: { mode: "test-only", projectRoot: "/workspace/app", cacheRoot } });
    const built = await buildStartupWarmContext({ projectRoot: "/workspace/app", createdAt: "2026-10-01T00:00:00Z" });
    await store.write(built.cache);
    expect((await store.read()).staleness).toBe("unknown");
    expect((await store.read({ currentSourceSignature: built.cache.sourceSummary.sourceSignature })).staleness).toBe("fresh");
    expect((await store.read({ nowMs: Date.parse(built.cache.createdAt), ttlMs: 100 })).staleness).toBe("unknown");
    for (const ttlMs of [-1, NaN, Infinity]) expect((await store.read({ ttlMs })).staleness).toBe("invalid");
    expect((await store.read({ nowMs: Date.parse(built.cache.createdAt) + 100, ttlMs: 99 })).staleness).toBe("stale");
    expect((await store.read({ nowMs: Date.parse(built.cache.createdAt) - 1, ttlMs: 100 })).staleness).toBe("invalid");
  });

  it("keeps disabled stores disabled even when paths are configured", async () => {
    const cacheFile = path.join(cacheRoot, "cache.json");
    const store = createStartupWarmContextCacheStore({ ref: { mode: "disabled", projectRoot: "/workspace/app", cacheFile } });
    fs.writeFileSync(cacheFile, "not json");
    const open = vi.spyOn(fs, "openSync");
    expect(await store.read()).toMatchObject({ found: false, staleness: "unknown" });
    expect(await store.health()).toMatchObject({ ok: true, found: false, writable: false, staleness: "unknown" });
    expect(open).not.toHaveBeenCalled();
  });

  it("reports corrupt data as invalid rather than safely missing", async () => {
    const cacheFile = path.join(cacheRoot, "cache.json");
    const store = createStartupWarmContextCacheStore({ ref: { mode: "test-only", projectRoot: "/workspace/app", cacheFile } });
    fs.writeFileSync(cacheFile, "{broken");
    const health = await store.health();
    expect(health.ok).toBe(false);
    expect(health.detail).toContain("invalid");
    expect(health.detail).not.toContain("missing");
  });

  it("reports failed writes without overwriting an existing destination", async () => {
    const cacheFile = path.join(cacheRoot, "directory");
    fs.mkdirSync(cacheFile);
    const store = createStartupWarmContextCacheStore({ ref: { mode: "test-only", projectRoot: "/workspace/app", cacheFile } });
    const built = await buildStartupWarmContext({ projectRoot: "/workspace/app" });
    expect(await store.write(built.cache)).toMatchObject({ written: false, blocker: expect.any(String) });
    expect(fs.statSync(cacheFile).isDirectory()).toBe(true);
  });

  it("drops unknown fields at every persisted object boundary", async () => {
    const cacheFile = path.join(cacheRoot, "cache.json");
    const store = createStartupWarmContextCacheStore({ ref: { mode: "test-only", projectRoot: "/workspace/app", cacheFile } });
    const value = JSON.parse(JSON.stringify((await buildStartupWarmContext({ projectRoot: "/workspace/app" })).cache));
    for (const object of [value, value.projectRef, value.sourceSummary, value.safety, value.compactSummary]) object.extra = "RAW_UNEXPECTED_PAYLOAD";
    fs.writeFileSync(cacheFile, JSON.stringify(value));
    const read = await store.read();
    expect(read.found).toBe(true);
    expect(JSON.stringify(read.cache)).not.toContain("RAW_UNEXPECTED_PAYLOAD");
  });

  it("rejects oversized and non-regular cache files", async () => {
    const cacheFile = path.join(cacheRoot, "cache.json");
    const store = createStartupWarmContextCacheStore({ ref: { mode: "test-only", projectRoot: "/workspace/app", cacheFile } });
    fs.writeFileSync(cacheFile, " ".repeat(256 * 1024 + 1));
    const read = vi.spyOn(fs, "readSync");
    expect(await store.read()).toMatchObject({ found: false, staleness: "invalid" });
    expect(read).not.toHaveBeenCalled();
    fs.unlinkSync(cacheFile);
    fs.mkdirSync(cacheFile);
    expect(await store.read()).toMatchObject({ found: false, staleness: "invalid" });
  });

  it("preserves the old bytes and removes its temporary file if replacement fails", async () => {
    const cacheFile = path.join(cacheRoot, "cache.json");
    const store = createStartupWarmContextCacheStore({ ref: { mode: "test-only", projectRoot: "/workspace/app", cacheFile } });
    const built = await buildStartupWarmContext({ projectRoot: "/workspace/app" });
    await store.write(built.cache);
    const old = fs.readFileSync(cacheFile, "utf8");
    vi.spyOn(fs, "renameSync").mockImplementationOnce(() => { throw new Error("replacement failed"); });
    expect((await store.write({ ...built.cache, compactSummary: { ...built.cache.compactSummary, summary: "new summary" } })).written).toBe(false);
    expect(fs.readFileSync(cacheFile, "utf8")).toBe(old);
    expect(fs.readdirSync(cacheRoot)).toEqual(["cache.json"]);
    expect((await store.write({ ...built.cache, warnings: Array.from({ length: 800 }, (_, i) => `${i} ${"x".repeat(410)}`) })).written).toBe(false);
    expect(fs.readFileSync(cacheFile, "utf8")).toBe(old);
  });
});
