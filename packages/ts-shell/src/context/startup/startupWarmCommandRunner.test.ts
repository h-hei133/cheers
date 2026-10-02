import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseStartupWarmCommandArgs } from "./startupWarmCommandContract.js";
import { runStartupWarmCommand } from "./startupWarmCommandRunner.js";
import { createStartupWarmContextCacheStore } from "./startupWarmContextHealth.js";

describe("startup warm command runner", () => {
  let cacheRoot = "";

  beforeEach(() => {
    cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "startup-warm-command-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(result.output).toContain("No compact summary was provided");
    expect(result.output).toContain("- Provider/model call: none");
    const saved = await store.read();
    expect(saved.found).toBe(true);
    expect(saved.cache?.compactSummary.status).toBe("missing");
    expect(saved.cache?.validationSummary.status).toBe("missing");
    expect(saved.cache?.routePhaseSummary.status).toBe("missing");
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

  it("reports a corrupt status cache as blocked with a rebuild action", async () => {
    const cacheFile = path.join(cacheRoot, "cache.json");
    fs.writeFileSync(cacheFile, "{broken");
    const result = await runStartupWarmCommand({
      request: parseStartupWarmCommandArgs(["status"]), projectRoot: "/workspace/app",
      cacheStore: createStartupWarmContextCacheStore({ ref: { mode: "test-only", projectRoot: "/workspace/app", cacheFile } }),
    });
    expect(result.outcome).toBe("blocked");
    expect(result.output).toContain("invalid");
    expect(result.output).toContain("rebuild");
    expect(result.output).not.toContain("Continue normally");
  });

  it("uses one cache observation for status and does not read a foreign project's store", async () => {
    const store = createStartupWarmContextCacheStore({ ref: { mode: "test-only", projectRoot: "/workspace/app", cacheRoot } });
    const read = vi.spyOn(store, "read");
    const health = vi.spyOn(store, "health");
    const request = parseStartupWarmCommandArgs(["status"]);
    expect((await runStartupWarmCommand({ request, projectRoot: "/workspace/app", cacheStore: store })).outcome).toBe("status");
    expect(read).toHaveBeenCalledOnce();
    expect(health).not.toHaveBeenCalled();
    expect((await runStartupWarmCommand({ request, projectRoot: "/workspace/other", cacheStore: store })).outcome).toBe("blocked");
    expect(read).toHaveBeenCalledOnce();
  });

  it("keeps a successful write distinct from failed verification", async () => {
    const store = createStartupWarmContextCacheStore({ ref: { mode: "test-only", projectRoot: "/workspace/app", cacheRoot } });
    vi.spyOn(store, "read").mockResolvedValue({ found: false, staleness: "invalid", blocker: "invalid after write", evidence: [] });
    const result = await runStartupWarmCommand({ request: parseStartupWarmCommandArgs(["rebuild"]), projectRoot: "/workspace/app", cacheStore: store });
    expect(result.outcome).toBe("blocked");
    expect(result.output).toContain("invalid after write");
    expect(result.output).toContain("No cache available");
    expect(result.evidence).toContain("startup-warm-context-store:write");
  });
});
