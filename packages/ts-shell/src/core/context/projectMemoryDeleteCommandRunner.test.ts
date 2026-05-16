import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  normalizeProjectMemoryDeleteCommandRequest,
  parseProjectMemoryDeleteCommandArgs,
  ProjectMemoryDeleteCommandContractError,
} from "./projectMemoryDeleteCommandContract.js";
import { runProjectMemoryDeleteCommand } from "./projectMemoryDeleteCommandRunner.js";
import { createProjectMemoryLocalStore } from "./projectMemoryLocalStore.js";
import { retrieveProjectMemoryRecords } from "./projectMemoryRetrieval.js";
import { buildProjectMemoryWakeupPreview } from "./projectMemoryWakeup.js";
import type { ProjectMemoryRecord } from "./projectMemoryStoreContract.js";

describe("project memory delete command runner", () => {
  let storeRoot = "";

  beforeEach(() => {
    storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-delete-"));
  });

  afterEach(() => {
    fs.rmSync(storeRoot, { recursive: true, force: true });
  });

  it("invalidates a saved record and excludes it from normal recall and wake-up", async () => {
    const memoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });
    await seed(memoryStore, [
      record("pmr:active", "Active RTK validation memory.", "project-fact"),
      record("pmr:stale", "Stale RTK validation memory.", "capability-state"),
    ]);

    const before = await retrieveProjectMemoryRecords(memoryStore, {
      query: "RTK validation",
    });
    expect(before.matches.map((match) => match.record.id)).toContain("pmr:stale");

    const result = await runProjectMemoryDeleteCommand({
      request: normalizeProjectMemoryDeleteCommandRequest({
        mode: "invalidate",
        recordId: "pmr:stale",
        reason: "superseded by route84",
      }),
      memoryStore,
      now: () => "2026-05-16T01:00:00.000Z",
    });

    expect(result.outcome).toBe("invalidated");
    expect(result.output).toContain("- Record id: pmr:stale");
    expect(result.output).toContain("- Invalidated at: 2026-05-16T01:00:00.000Z");
    expect(result.output).toContain("Auto-injected: no");

    const normal = await retrieveProjectMemoryRecords(memoryStore, {
      query: "stale",
    });
    expect(normal.matches).toHaveLength(0);
    const explicit = await retrieveProjectMemoryRecords(memoryStore, {
      query: "stale",
      includeInvalidated: true,
    });
    expect(explicit.matches.map((match) => match.record.id)).toEqual(["pmr:stale"]);
    expect(explicit.matches[0]?.record.invalidationReason).toBe("superseded by route84");

    const wakeup = await buildProjectMemoryWakeupPreview(memoryStore);
    expect(wakeup.l1.records.map((entry) => entry.id)).not.toContain("pmr:stale");
    expect(await memoryStore.get("pmr:stale")).toEqual(
      expect.objectContaining({
        invalidatedAt: "2026-05-16T01:00:00.000Z",
        invalidationReason: "superseded by route84",
      }),
    );
  });

  it("deletes a saved record content and keeps only a no-content tombstone", async () => {
    const memoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });
    await seed(memoryStore, [
      record("pmr:delete-me", "Delete-only route memory should disappear.", "project-fact"),
    ]);

    const result = await runProjectMemoryDeleteCommand({
      request: parseProjectMemoryDeleteCommandArgs(["delete", "pmr:delete-me", "user requested removal"]),
      memoryStore,
      now: () => "2026-05-16T02:00:00.000Z",
    });

    expect(result.outcome).toBe("deleted");
    expect(result.output).toContain("- Deleted at: 2026-05-16T02:00:00.000Z");
    expect(await memoryStore.get("pmr:delete-me")).toBeUndefined();
    expect((await memoryStore.list({ includeInvalidated: true })).records).toEqual([]);
    expect(
      (await retrieveProjectMemoryRecords(memoryStore, {
        query: "Delete-only",
        includeInvalidated: true,
      })).matches,
    ).toEqual([]);
    const jsonl = fs.readFileSync(path.join(storeRoot, "project-memory.jsonl"), "utf8");
    expect(jsonl).toContain('"operation":"delete"');
    expect(jsonl).not.toContain("Delete-only route memory should disappear.");

    const replacement = await memoryStore.write({
      storeRef: memoryStore.ref,
      record: record("pmr:delete-me", "Replacement memory can be saved explicitly.", "project-fact"),
    });
    expect(replacement.written).toBe(true);
    expect((await memoryStore.list()).records.map((entry) => entry.id)).toEqual([
      "pmr:delete-me",
    ]);
  });

  it("rejects missing ids and redacts lifecycle output", async () => {
    expect(() => parseProjectMemoryDeleteCommandArgs(["invalidate"])).toThrow(
      ProjectMemoryDeleteCommandContractError,
    );
    const memoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });
    const result = await runProjectMemoryDeleteCommand({
      request: normalizeProjectMemoryDeleteCommandRequest({
        mode: "invalidate",
        recordId: "pmr:missing",
        reason: "RAW_FILE_CONTENT sk-1234567890abcdef hidden reasoning",
      }),
      memoryStore,
    });

    expect(result.outcome).toBe("blocked");
    expect(result.output).toContain("Unknown project memory record id");
    expect(result.output).not.toContain("sk-1234567890abcdef");
    expect(result.output).not.toContain("RAW_FILE_CONTENT");
    expect(result.output).not.toContain("hidden reasoning");
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
): ProjectMemoryRecord {
  return {
    id,
    version: 1,
    createdAt: "2026-05-16T00:00:00.000Z",
    candidateId: `candidate:${id}`,
    candidateKind,
    retentionClass: "project-scoped-candidate",
    approvedAt: "2026-05-16T00:00:00.000Z",
    approvedBySourceCommand: "/memory",
    memoryText,
    evidence: ["route84:test"],
    source: "system-derived",
    sourcePacket: "route84-test",
    routeReferences: ["route84"],
    safety: "safe",
    redactions: [],
  };
}
