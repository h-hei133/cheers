import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseStartupWarmCommandArgs } from "./startupWarmCommandContract.js";
import { runStartupWarmCommand } from "./startupWarmCommandRunner.js";
import { createStartupWarmContextCacheStore } from "./startupWarmContextHealth.js";

describe("startup warm command runner", () => {
  let cacheRoot = "";

  beforeEach(() => {
    cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "startup-warm-command-"));
  });

  afterEach(() => {
    fs.rmSync(cacheRoot, { recursive: true, force: true });
  });

  it("reports status without model injection or startup auto-load", async () => {
    const result = await runStartupWarmCommand({
      request: parseStartupWarmCommandArgs(["status"]),
      projectRoot: "/workspace/app",
      cacheStore: createStartupWarmContextCacheStore({
        ref: { mode: "test-only", projectRoot: "/workspace/app", cacheRoot },
      }),
    });

    expect(result.outcome).toBe("status");
    expect(result.output).toContain("- Injected into model: no");
    expect(result.output).toContain("- Startup auto-load: no");
    expect(result.providerCall).toBe("none");
    expect(result.futureTurnInjection).toBe("none");
  });

  it("rebuilds only through an explicit writable cache harness", async () => {
    const store = createStartupWarmContextCacheStore({
      ref: { mode: "test-only", projectRoot: "/workspace/app", cacheRoot },
    });

    const result = await runStartupWarmCommand({
      request: parseStartupWarmCommandArgs(["rebuild"]),
      projectRoot: "/workspace/app",
      cacheStore: store,
      now: () => "2026-05-16T00:00:00.000Z",
    });

    expect(result.outcome).toBe("rebuilt");
    expect(result.output).toContain("Startup warm context cache prototype");
    expect(result.output).toContain("- Provider/model call: none");
    expect((await store.read()).found).toBe(true);
  });

  it("blocks when no cache store is configured", async () => {
    const result = await runStartupWarmCommand({
      request: parseStartupWarmCommandArgs(["rebuild"]),
      projectRoot: "/workspace/app",
    });

    expect(result.outcome).toBe("blocked");
    expect(result.output).toContain("Explicit local startup warm cache store is required");
    expect(result.evidence).toContain(
      "startup-warm-command-runner:no-session-schema-change",
    );
  });

  it("shows disabled status without a configured cache store", async () => {
    const result = await runStartupWarmCommand({
      request: parseStartupWarmCommandArgs(["status"]),
      projectRoot: "/workspace/app",
    });

    expect(result.outcome).toBe("status");
    expect(result.output).toContain("- Cache mode: disabled");
    expect(result.output).toContain("- Injected into model: no");
    expect(result.output).toContain("- Startup auto-load: no");
  });
});
