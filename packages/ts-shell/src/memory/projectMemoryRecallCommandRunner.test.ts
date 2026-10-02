import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProjectMemoryLocalStore } from "./projectMemoryLocalStore.js";
import {
  normalizeProjectMemoryRecallCommandRequest,
  parseProjectMemoryRecallCommandArgs,
  ProjectMemoryRecallCommandContractError,
} from "./projectMemoryRecallCommandContract.js";
import { runProjectMemoryRecallCommand } from "./projectMemoryRecallCommandRunner.js";
import { retrieveProjectMemoryRecords } from "./projectMemoryRetrieval.js";
import { buildProjectMemoryWakeupPreview } from "./projectMemoryWakeup.js";
import type { ProjectMemoryRecord } from "./projectMemoryStoreContract.js";

describe("project memory recall command runner", () => {
  let storeRoot = "";

  beforeEach(() => {
    storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-recall-"));
  });

  afterEach(() => {
    fs.rmSync(storeRoot, { recursive: true, force: true });
  });

  it("recalls a saved approved project fact with deterministic local ranking", async () => {
    const memoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });
    await seed(memoryStore, [
      record("pmr:1", "Project uses RTK command discipline for shell validation.", "project-fact", "2026-05-16T00:00:00.000Z"),
      record("pmr:2", "Route docs should stay concise and delta-shaped.", "route-decision", "2026-05-15T00:00:00.000Z"),
      record("pmr:3", "RTK validation commands must stay explicit.", "validation-pattern", "2026-05-14T00:00:00.000Z"),
    ]);

    const first = await retrieveProjectMemoryRecords(memoryStore, {
      query: "RTK validation",
      maxResults: 2,
    });
    const second = await retrieveProjectMemoryRecords(memoryStore, {
      query: "RTK validation",
      maxResults: 2,
    });

    expect(first.matches.map((match) => match.record.id)).toEqual(
      second.matches.map((match) => match.record.id),
    );
    expect(first.matches).toHaveLength(2);
    expect(first.matches[0]?.record.id).toBe("pmr:3");
    expect(first.providerCall).toBe("none");
    expect(first.autoInjected).toBe(false);
  });

  it("builds wake-up preview with explicit preferences in L0 and capability decisions in L1", async () => {
    const memoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });
    await seed(memoryStore, [
      record("pmr:user", "User explicitly prefers docs-only cleanup for route discipline.", "user-preference-candidate", "2026-05-16T00:00:00.000Z", "user-memory-candidate"),
      record("pmr:cap", "Current edit capability remains bounded and route-gated.", "capability-state", "2026-05-16T00:01:00.000Z"),
      record("pmr:block", "Broad automatic recovery is blocked by design.", "blocked-by-design-decision", "2026-05-16T00:02:00.000Z"),
    ]);

    const wakeup = await buildProjectMemoryWakeupPreview(memoryStore);
    expect(wakeup.l0.records.map((entry) => entry.id)).toContain("pmr:user");
    expect(wakeup.l1.records.map((entry) => entry.id)).toEqual(["pmr:cap", "pmr:block"]);
    expect(wakeup.autoInjected).toBe(false);
    expect(wakeup.startupCache).toBe("not-enabled");

    const result = await runProjectMemoryRecallCommand({
      request: normalizeProjectMemoryRecallCommandRequest({ mode: "wake" }),
      memoryStore,
    });
    expect(result.output).toContain("Project memory wake-up preview");
    expect(result.output).toContain("Auto-injected: no");
    expect(result.output).toContain("Startup cache changed: no");
    expect(result.output).toContain("Current edit capability remains bounded");
  });

  it("blocks missing store and empty recall query clearly", async () => {
    expect(() => parseProjectMemoryRecallCommandArgs(["recall"])).toThrow(
      ProjectMemoryRecallCommandContractError,
    );
    const result = await runProjectMemoryRecallCommand({
      request: normalizeProjectMemoryRecallCommandRequest({
        mode: "recall",
        query: "route",
      }),
    });
    expect(result.outcome).toBe("blocked");
    expect(result.output).toContain("Explicit local memory store root is required");
    expect(result.output).toContain("Auto-injected: no");
  });

  it("does not surface rejected unsafe or defensive raw/secret content", async () => {
    const recordsFile = path.join(storeRoot, "project-memory.jsonl");
    fs.mkdirSync(storeRoot, { recursive: true });
    fs.writeFileSync(
      recordsFile,
      [
        JSON.stringify(record("pmr:safe", "Safe route memory can be recalled.", "project-fact", "2026-05-16T00:00:00.000Z")),
        JSON.stringify({
          ...record("pmr:unsafe", "RAW_FILE_CONTENT sk-1234567890abcdef hidden reasoning", "project-fact", "2026-05-16T00:01:00.000Z"),
          safety: "unsafe",
        }),
      ].join("\n"),
      "utf8",
    );
    const memoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });

    const result = await runProjectMemoryRecallCommand({
      request: normalizeProjectMemoryRecallCommandRequest({
        mode: "recall",
        query: "RAW_FILE_CONTENT sk-1234567890abcdef",
      }),
      memoryStore,
    });

    expect(result.output).not.toContain("sk-1234567890abcdef");
    expect(result.output).not.toContain("RAW_FILE_CONTENT");
    expect(result.output).not.toContain("hidden reasoning");
    expect(result.output).toContain("Result count: 0");
  });

  it("search aliases recall and enforces max results", async () => {
    const memoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });
    await seed(memoryStore, [
      record("pmr:a", "Route memory alpha validation.", "project-fact", "2026-05-16T00:00:00.000Z"),
      record("pmr:b", "Route memory beta validation.", "project-fact", "2026-05-16T00:01:00.000Z"),
    ]);

    const result = await runProjectMemoryRecallCommand({
      request: parseProjectMemoryRecallCommandArgs(["search", "route", "validation", "limit:1"]),
      memoryStore,
    });

    expect(result.outcome).toBe("recalled");
    expect(result.output).toContain("Result count: 1");
    expect(result.output).toContain("Provider/model call: none");
    expect(result.output).toContain("Future-turn injection: explicit staged use only (/memory use)");
  });
});

async function seed(
  store: ReturnType<typeof createProjectMemoryLocalStore>,
  records: readonly ProjectMemoryRecord[],
): Promise<void> {
  for (const item of records) {
    const result = await store.write({ record: item, storeRef: store.ref });
    expect(result.written).toBe(true);
  }
}

function record(
  id: string,
  memoryText: string,
  candidateKind: ProjectMemoryRecord["candidateKind"],
  createdAt: string,
  retentionClass: ProjectMemoryRecord["retentionClass"] = "project-scoped-candidate",
): ProjectMemoryRecord {
  return {
    id,
    version: 1,
    createdAt,
    candidateId: `candidate:${id}`,
    candidateKind,
    retentionClass,
    approvedAt: createdAt,
    approvedBySourceCommand: "/memory",
    memoryText,
    evidence: ["route83:test"],
    source: candidateKind === "user-preference-candidate" ? "user-stated-preference" : "system-derived",
    sourcePacket: "route83-test",
    routeReferences: ["route83"],
    safety: "safe",
    redactions: [],
  };
}
