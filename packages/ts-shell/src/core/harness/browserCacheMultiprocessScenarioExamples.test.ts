import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { safeReceipt } from "../context/browserActionCacheEntry.test.js";
import {
  createBrowserPersistentReceiptCacheRecord,
} from "../context/browserPersistentReceiptCache.js";
import { createBrowserCacheMultiprocessFixture, type BrowserCacheMultiprocessFixture } from "./browserCacheMultiprocessFixtures.js";
import {
  assertBrowserCacheStressSafe,
  runBrowserCacheMultiprocessScenario,
} from "./browserCacheMultiprocessRunner.js";
import { renderBrowserCacheMultiprocessReport } from "./browserCacheMultiprocessReport.js";

describe("browser cache multiprocess scenario examples", () => {
  const fixtures: BrowserCacheMultiprocessFixture[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      fixture.cleanup();
    }
  });

  it("runs concurrent real CLI execute writes against one explicit cache root", async () => {
    const fixture = track(createBrowserCacheMultiprocessFixture());
    const result = await runBrowserCacheMultiprocessScenario({
      scenario: {
        id: "route110-concurrent-execute-writes",
        name: "concurrent execute writes",
        cacheRoot: fixture.cacheRoot,
        steps: [0, 1, 2].map((index) =>
          fixture.cliStep({
            id: `writer-${index}`,
            role: "writer",
            groupId: "writers",
            prompt: "/browser execute observe local-fixture://route110-demo",
          }),
        ),
      },
      now: () => "2026-05-17T02:00:00.000Z",
    });

    expect(result.status).toBe("passed");
    expect(result.assertions.processCount).toBe(3);
    expect(result.integrity.status).not.toBe("corrupted");
    expect(result.integrity.status).not.toBe("unsafe");
    expect(result.integrity.replayableCount).toBeGreaterThanOrEqual(1);
    expect(assertBrowserCacheStressSafe(result)).toEqual([]);
    expect(renderBrowserCacheMultiprocessReport(result)).toContain("Persistence: explicit only");
    expect(cacheText(fixture)).not.toContain("RAW_");
  });

  it("runs status and replay while a real lock-holder process simulates an in-flight write", async () => {
    const fixture = track(createBrowserCacheMultiprocessFixture({ runnerDelayMs: 80 }));
    const seed = await runBrowserCacheMultiprocessScenario({
      scenario: {
        id: "route110-seed-replay-record",
        name: "seed replay record",
        cacheRoot: fixture.cacheRoot,
        steps: [
          fixture.cliStep({
            id: "seed-writer",
            role: "writer",
            prompt: "/browser execute observe local-fixture://route110-demo",
          }),
        ],
      },
    });
    expect(seed.status).toBe("passed");
    const receiptId = receiptIdFrom(seed.processes[0]?.process.output.combined ?? "");

    const result = await runBrowserCacheMultiprocessScenario({
      scenario: {
        id: "route110-status-replay-while-writing",
        name: "status and replay while writing",
        cacheRoot: fixture.cacheRoot,
        steps: [
          fixture.lockHolderStep({ id: "lock-holder", groupId: "read-during-write", holdMs: 500 }),
          fixture.cliStep({
            id: "status",
            role: "status-reader",
            groupId: "read-during-write",
            prompt: "/browser replay cache status",
          }),
          fixture.cliStep({
            id: "replay",
            role: "replayer",
            groupId: "read-during-write",
            prompt: `/browser replay ${receiptId}`,
          }),
        ],
      },
    });

    expect(result.status).toBe("passed");
    expect(result.processes.some((process) => process.role === "status-reader")).toBe(true);
    expect(result.processes.some((process) => process.role === "replayer")).toBe(true);
    expect(result.integrity.status).not.toBe("unsafe");
    expect(result.integrity.status).not.toBe("corrupted");
    expect(assertBrowserCacheStressSafe(result)).toEqual([]);
  });

  it("blocks compact under busy lock, recovers stale locks, and repairs corrupt unsafe lines", async () => {
    const fixture = track(createBrowserCacheMultiprocessFixture());
    const record = createBrowserPersistentReceiptCacheRecord({
      receipt: safeReceipt(),
      source: "test-only",
      now: () => "2026-05-17T02:00:00.000Z",
    });
    expect(record.ok).toBe(true);
    if (!record.ok) {
      throw new Error("record failed");
    }
    fs.writeFileSync(
      path.join(fixture.cacheRoot, "browser-receipt-cache.jsonl"),
      `${JSON.stringify(record.record)}\nnot-json\n{"version":"browser-persistent-receipt-cache/v1","receiptId":"unsafe","status":"active","evidenceSummary":"RAW_SECRET"}\n`,
      "utf8",
    );

    const busy = await runBrowserCacheMultiprocessScenario({
      scenario: {
        id: "route110-compact-busy-lock",
        name: "compact busy lock",
        cacheRoot: fixture.cacheRoot,
        steps: [
          fixture.lockHolderStep({ id: "lock-holder", groupId: "busy-compact", holdMs: 2000 }),
          fixture.cliStep({
            id: "compact",
            role: "compactor",
            groupId: "busy-compact",
            prompt: "/browser replay cache compact",
            expectedBlocked: true,
          }),
        ],
      },
    });
    expect(busy.processes.find((process) => process.role === "compactor")?.process.output.combined).toContain("busy");

    fixture.writeStaleLock("repair");
    const repair = await runBrowserCacheMultiprocessScenario({
      scenario: {
        id: "route110-stale-lock-repair",
        name: "stale lock repair",
        cacheRoot: fixture.cacheRoot,
        steps: [
          fixture.cliStep({
            id: "repair",
            role: "repairer",
            prompt: "/browser replay cache repair",
          }),
          fixture.cliStep({
            id: "status",
            role: "status-reader",
            prompt: "/browser replay cache status",
          }),
        ],
      },
    });

    expect(repair.status).toBe("passed");
    expect(repair.integrity.status).not.toBe("unsafe");
    expect(repair.integrity.status).not.toBe("corrupted");
    expect(repair.integrity.skippedCount).toBe(0);
    expect(cacheText(fixture)).not.toContain("RAW_SECRET");
    expect(assertBrowserCacheStressSafe(repair)).toEqual([]);
  });

  it("renders a concise report without raw child-process output", async () => {
    const fixture = track(createBrowserCacheMultiprocessFixture());
    const result = await runBrowserCacheMultiprocessScenario({
      scenario: {
        id: "route110-report",
        name: "report",
        cacheRoot: fixture.cacheRoot,
        steps: [
          fixture.cliStep({
            id: "status",
            role: "status-reader",
            prompt: "/browser replay cache status",
          }),
        ],
      },
    });

    const report = renderBrowserCacheMultiprocessReport(result);

    expect(report).toContain("Browser cache multiprocess stress report");
    expect(report).toContain("Integrity:");
    expect(report).not.toContain("Route 110 safe local fixture summary");
    expect(report).not.toContain("RAW_");
  });

  function track<T extends BrowserCacheMultiprocessFixture>(fixture: T): T {
    fixtures.push(fixture);
    return fixture;
  }

  function cacheText(fixture: BrowserCacheMultiprocessFixture): string {
    const cacheFile = path.join(fixture.cacheRoot, "browser-receipt-cache.jsonl");
    return fs.existsSync(cacheFile) ? fs.readFileSync(cacheFile, "utf8") : "";
  }

  function receiptIdFrom(output: string): string {
    const receiptId = output.match(/^- Receipt id:\s*(.+)$/im)?.[1]?.trim();
    if (!receiptId) {
      throw new Error(`missing receipt id in output:\n${output}`);
    }
    return receiptId;
  }
});
