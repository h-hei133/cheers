import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseBrowserCommandArgs } from "../context/browserCommandContract.js";
import { runBrowserCommandAsync } from "../context/browserCommandRunner.js";
import { safeReceipt } from "../context/browserActionCacheEntry.test.js";
import {
  createBrowserPersistentReceiptCacheRecord,
  createBrowserPersistentReceiptCacheTombstone,
} from "../context/browserPersistentReceiptCache.js";
import { acquireBrowserReceiptCacheLock } from "../context/browserReceiptCacheLock.js";
import {
  createBrowserPersistentReplayScenarioFixture,
  type BrowserPersistentReplayScenarioFixture,
} from "./browserPersistentReplayScenarioFixtures.js";

describe("browser persistent cache hardening scenario examples", () => {
  const fixtures: BrowserPersistentReplayScenarioFixture[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      fixture.cleanup();
    }
  });

  it("reports corrupted cache status without leaking raw lines", async () => {
    const fixture = track(createBrowserPersistentReplayScenarioFixture({ kind: "external-runner" }));
    fs.writeFileSync(cacheFile(fixture), "RAW_SECRET_CORRUPT_LINE\n", "utf8");

    const status = await runCommand("/browser replay cache status", fixture);

    expect(status.output).toContain("Integrity: corrupted");
    expect(status.output).toContain("Corrupted/skipped records: 1");
    expect(status.output).not.toContain("RAW_SECRET_CORRUPT_LINE");
  });

  it("rejects unsafe records and avoids persistent replay from them", async () => {
    const fixture = track(createBrowserPersistentReplayScenarioFixture({ kind: "external-runner" }));
    fs.writeFileSync(
      cacheFile(fixture),
      "{\"version\":\"browser-persistent-receipt-cache/v1\",\"receiptId\":\"unsafe\",\"status\":\"active\",\"evidenceSummary\":\"RAW_SECRET\"}\n",
      "utf8",
    );

    const status = await runCommand("/browser replay cache status", fixture);
    const replay = await runCommand("/browser replay unsafe", fixture);

    expect(status.output).toContain("Integrity: unsafe");
    expect(status.output).toContain("Unsafe/skipped records: 1");
    expect(replay.output).toContain("Outcome: blocked");
    expect(`${status.output}\n${replay.output}`).not.toContain("RAW_SECRET");
  });

  it("compacts duplicates while preserving deleted tombstones", async () => {
    const fixture = track(createBrowserPersistentReplayScenarioFixture({ kind: "external-runner" }));
    const receipt = safeReceipt();
    const record = createBrowserPersistentReceiptCacheRecord({
      receipt,
      source: "test-only",
      now: () => "2026-05-17T00:00:00.000Z",
    });
    expect(record.ok).toBe(true);
    if (!record.ok) {
      throw new Error("record failed");
    }
    const tombstone = createBrowserPersistentReceiptCacheTombstone({
      receiptId: receipt.receiptId,
      status: "deleted",
      source: "test-only",
      reason: "hardening scenario delete",
      now: "2026-05-17T00:00:01.000Z",
    });
    fs.writeFileSync(
      cacheFile(fixture),
      `${JSON.stringify(record.record)}\n${JSON.stringify(record.record)}\n${JSON.stringify(tombstone)}\n`,
      "utf8",
    );

    const compact = await runCommand("/browser replay cache compact", fixture);
    const replay = await runCommand(`/browser replay ${receipt.receiptId}`, fixture);
    const status = await runCommand("/browser replay cache status", fixture);

    expect(compact.output).toContain("Cache action: compact");
    expect(compact.output).toContain("Tombstones kept: 1");
    expect(replay.output).toContain("Outcome: blocked");
    expect(status.output).toContain("Invalidated/deleted records: 1");
    expect(fixture.readCacheFile()).not.toContain("RAW_");
  });

  it("blocks compact while a busy lock is active and recovers stale locks", async () => {
    const fixture = track(createBrowserPersistentReplayScenarioFixture({ kind: "external-runner" }));
    const busy = acquireBrowserReceiptCacheLock({
      cacheRoot: fixture.cacheRoot,
      operation: "write",
      lockId: "busy-scenario",
      now: () => new Date(Date.now() + 60_000).toISOString(),
      leaseMs: 60_000,
    });
    expect(busy.status).toBe("acquired");

    const blocked = await runCommand("/browser replay cache compact", fixture);
    expect(blocked.output).toContain("Outcome: blocked");
    expect(blocked.output).toContain("busy");
    if (busy.status === "acquired") {
      busy.release();
    }

    acquireBrowserReceiptCacheLock({
      cacheRoot: fixture.cacheRoot,
      operation: "write",
      lockId: "stale-scenario",
      now: () => "2026-05-17T00:00:00.000Z",
      leaseMs: 1,
    });
    const recovered = await runCommand("/browser replay cache repair", fixture);
    expect(recovered.output).toContain("Cache action: repair");
    expect(recovered.output).not.toContain("Outcome: blocked");
  });

  it("preserves execute-write and cross-process replay after compaction", async () => {
    const fixture = track(createBrowserPersistentReplayScenarioFixture({ kind: "external-runner" }));
    const execute = await runCommand("/browser execute observe local-fixture://route109-demo", fixture);
    const receiptId = receiptIdFrom(execute.output);
    fixture.actionCache.clear();

    const compact = await runCommand("/browser replay cache compact", fixture);
    const separateProcess = {
      ...fixture,
      receiptCacheStore: fixture.freshReceiptCacheStore(),
    };
    const replay = await runCommand(`/browser replay ${receiptId}`, separateProcess);

    expect(execute.output).toContain("Cache write: yes");
    expect(compact.output).toContain("Cache action: compact");
    expect(replay.output).toContain("Executed: yes");
    expect(replay.output).toContain("Cache source: persistent");
  });

  function track<T extends BrowserPersistentReplayScenarioFixture>(fixture: T): T {
    fixtures.push(fixture);
    return fixture;
  }

  function cacheFile(fixture: BrowserPersistentReplayScenarioFixture): string {
    return path.join(fixture.cacheRoot, "browser-receipt-cache.jsonl");
  }

  async function runCommand(
    command: string,
    fixture: BrowserPersistentReplayScenarioFixture,
  ) {
    const args = command.replace(/^\/browser\s*/, "").split(/\s+/).filter(Boolean);
    const parsed = parseBrowserCommandArgs(args);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || !parsed.contract) {
      throw new Error("parse failed");
    }
    return runBrowserCommandAsync({
      contract: parsed.contract,
      browserExecutor: fixture.bridge.browserExecutor,
      browserSandboxAuthority: fixture.bridge.browserSandboxAuthority,
      browserNetworkAllowlist: fixture.bridge.browserNetworkAllowlist,
      browserExecutionConfirmations: fixture.bridge.browserExecutionConfirmations,
      browserCliExecutionBridgeSummary: fixture.bridge.browserCliExecutionBridgeSummary,
      browserActionCache: fixture.actionCache,
      browserReceiptCacheStore: fixture.receiptCacheStore,
    });
  }

  function receiptIdFrom(output: string): string {
    const receiptId = output.match(/^- Receipt id:\s*(.+)$/im)?.[1]?.trim();
    if (!receiptId) {
      throw new Error(`missing receipt id in output:\n${output}`);
    }
    return receiptId;
  }
});
