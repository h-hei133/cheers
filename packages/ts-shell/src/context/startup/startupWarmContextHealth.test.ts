import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildStartupWarmContext } from "./startupWarmContextBuilder.js";
import { createStartupWarmContextCacheStore } from "./startupWarmContextHealth.js";

describe("startup warm context cache health", () => {
  let cacheRoot = "";

  beforeEach(() => {
    cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "startup-warm-cache-"));
  });

  afterEach(() => {
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
    expect(read.staleness).toBe("fresh");
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
});
