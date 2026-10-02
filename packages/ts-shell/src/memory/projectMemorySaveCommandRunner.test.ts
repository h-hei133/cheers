import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProjectMemoryCandidate } from "./projectMemoryCandidate.js";
import { createProjectMemoryLocalStore } from "./projectMemoryLocalStore.js";
import {
  normalizeProjectMemorySaveCommandRequest,
  parseProjectMemorySaveCommandArgs,
  ProjectMemorySaveCommandContractError,
} from "./projectMemorySaveCommandContract.js";
import { runProjectMemorySaveCommand } from "./projectMemorySaveCommandRunner.js";
import {
  createProjectMemoryReviewStateStore,
  type ProjectMemoryReviewStateStore,
} from "./projectMemoryReviewState.js";

describe("project memory save command runner", () => {
  let storeRoot = "";
  let reviewStore: ProjectMemoryReviewStateStore;

  beforeEach(() => {
    storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-store-"));
    reviewStore = createProjectMemoryReviewStateStore({
      now: () => "2026-05-16T00:00:00.000Z",
    });
  });

  afterEach(() => {
    fs.rmSync(storeRoot, { recursive: true, force: true });
  });

  it("saves an approved safe candidate to an explicit local JSONL store", async () => {
    const safe = safeCandidate();
    reviewStore.updateCandidates({
      reviewSessionId: "session:save-one",
      candidates: [safe],
      sourceCommand: "/memory",
    });
    reviewStore.approve({
      reviewSessionId: "session:save-one",
      candidateId: safe.candidateId,
      sourceCommand: "/memory",
      decidedAt: "2026-05-16T00:00:00.000Z",
    });

    const result = await runProjectMemorySaveCommand({
      request: normalizeProjectMemorySaveCommandRequest({
        mode: "save-one",
        candidateId: safe.candidateId,
      }),
      reviewSessionId: "session:save-one",
      candidates: [safe],
      reviewStore,
      memoryStore: createProjectMemoryLocalStore({
        ref: { mode: "test-only", root: storeRoot },
      }),
      now: () => "2026-05-16T00:00:01.000Z",
    });

    expect(result.outcome).toBe("saved");
    expect(result.savedRecords).toHaveLength(1);
    expect(result.savedRecords[0]).toEqual(
      expect.objectContaining({
        candidateId: safe.candidateId,
        memoryText: safe.summary,
        approvedBySourceCommand: "/memory",
        source: safe.source,
        safety: "safe",
      }),
    );
    expect(result.savedRecords[0]?.evidence).toContain("route82:test");
    expect(result.output).toContain("- Memory written: yes");
    expect(result.output).toContain("- Auto-load: no");
    expect(result.output).toContain("- Retrieval / wake-up / recall: available on explicit request");
    expect(fs.readFileSync(path.join(storeRoot, "project-memory.jsonl"), "utf8")).toContain(
      safe.summary,
    );
  });

  it("blocks pending, rejected, unsafe, and needs-review candidates", async () => {
    const safe = safeCandidate();
    const userPreference = createProjectMemoryCandidate({
      candidateKind: "user-preference-candidate",
      retentionClass: "user-memory-candidate",
      confidence: "high",
      source: "user-stated-preference",
      safety: "needs-review",
      summary: "User prefers concise route reports.",
      reason: "Explicit user preference still needs approval before save.",
      evidence: ["route82:user-preference"],
    });
    const unsafe = unsafeCandidate("Unsafe candidate was rejected before memory save.");
    reviewStore.updateCandidates({
      reviewSessionId: "session:blocked",
      candidates: [safe, userPreference, unsafe],
      sourceCommand: "/memory",
    });
    reviewStore.reject({
      reviewSessionId: "session:blocked",
      candidateId: safe.candidateId,
      sourceCommand: "/memory",
    });
    const memoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });

    for (const candidate of [safe, userPreference, unsafe]) {
      const result = await runProjectMemorySaveCommand({
        request: normalizeProjectMemorySaveCommandRequest({
          mode: "save-one",
          candidateId: candidate.candidateId,
        }),
        reviewSessionId: "session:blocked",
        candidates: [safe, userPreference, unsafe],
        reviewStore,
        memoryStore,
      });

      expect(result.outcome).toBe("blocked");
      expect(result.output).toContain("- Memory written: no");
    }
    expect(fs.existsSync(path.join(storeRoot, "project-memory.jsonl"))).toBe(false);
  });

  it("requires an explicit store root and rejects invalid save command forms", async () => {
    expect(() => parseProjectMemorySaveCommandArgs(["save"])).toThrow(
      ProjectMemorySaveCommandContractError,
    );
    const safe = safeCandidate();
    reviewStore.updateCandidates({
      reviewSessionId: "session:no-store",
      candidates: [safe],
      sourceCommand: "/memory",
    });
    reviewStore.approve({
      reviewSessionId: "session:no-store",
      candidateId: safe.candidateId,
      sourceCommand: "/memory",
    });

    const result = await runProjectMemorySaveCommand({
      request: parseProjectMemorySaveCommandArgs(["save", safe.candidateId]),
      reviewSessionId: "session:no-store",
      candidates: [safe],
      reviewStore,
    });

    expect(result.outcome).toBe("blocked");
    expect(result.output).toContain("Explicit local memory store root is required.");
    expect(result.output).toContain("- Store mode: disabled");
  });

  it("blocks raw content and secret-looking candidates even if review state is approved", async () => {
    const raw = createProjectMemoryCandidate({
      candidateKind: "project-fact",
      retentionClass: "project-scoped-candidate",
      confidence: "high",
      source: "system-derived",
      safety: "safe",
      summary: "RAW_FILE_CONTENT must not be saved.",
      reason: "Raw content marker should be blocked by store validation.",
      evidence: ["route82:raw"],
    });
    const secret = createProjectMemoryCandidate({
      candidateKind: "project-fact",
      retentionClass: "project-scoped-candidate",
      confidence: "high",
      source: "system-derived",
      safety: "safe",
      summary: "Provider credential should never be saved.",
      reason: "Secret-looking text should be blocked by store validation.",
      evidence: ["route82:secret"],
    });
    reviewStore.updateCandidates({
      reviewSessionId: "session:forbidden",
      candidates: [raw, secret],
      sourceCommand: "/memory",
    });
    for (const candidate of [raw, secret]) {
      reviewStore.approve({
        reviewSessionId: "session:forbidden",
        candidateId: candidate.candidateId,
        sourceCommand: "/memory",
      });
    }

    const result = await runProjectMemorySaveCommand({
      request: normalizeProjectMemorySaveCommandRequest({ mode: "save-approved" }),
      reviewSessionId: "session:forbidden",
      candidates: [raw, secret],
      reviewStore,
      memoryStore: createProjectMemoryLocalStore({
        ref: { mode: "test-only", root: storeRoot },
      }),
    });

    expect(result.outcome).toBe("blocked");
    expect(result.writeResults.every((write) => write.written === false)).toBe(true);
    expect(result.output).toContain("Memory record contains raw content");
    expect(fs.existsSync(path.join(storeRoot, "project-memory.jsonl"))).toBe(false);
  });

  it("/memory save approved saves only approved safe candidates and list records works", async () => {
    const first = safeCandidate("Project uses RTK for shell validation.", "route82:first");
    const second = safeCandidate("Route docs should stay delta-shaped.", "route82:second");
    const pending = safeCandidate("Pending candidates are not saved.", "route82:pending");
    reviewStore.updateCandidates({
      reviewSessionId: "session:save-approved",
      candidates: [first, second, pending],
      sourceCommand: "/memory",
    });
    for (const candidate of [first, second]) {
      reviewStore.approve({
        reviewSessionId: "session:save-approved",
        candidateId: candidate.candidateId,
        sourceCommand: "/memory",
      });
    }
    const memoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });

    const result = await runProjectMemorySaveCommand({
      request: parseProjectMemorySaveCommandArgs(["save", "approved"]),
      reviewSessionId: "session:save-approved",
      candidates: [first, second, pending],
      reviewStore,
      memoryStore,
    });

    expect(result.outcome).toBe("saved");
    expect(result.savedRecords).toHaveLength(2);
    expect(result.skipped).toContain(`${pending.candidateId}:pending`);
    const listed = await memoryStore.list();
    expect(listed.records.map((record) => record.candidateId)).toEqual([
      first.candidateId,
      second.candidateId,
    ]);
  });
});

function safeCandidate(
  summary = "Route 82 adds an explicit local project memory store prototype.",
  evidence = "route82:test",
) {
  return createProjectMemoryCandidate({
    candidateKind: "project-fact",
    retentionClass: "project-scoped-candidate",
    confidence: "high",
    source: "system-derived",
    safety: "safe",
    summary,
    reason: "Stable project fact with evidence.",
    evidence: [evidence],
  });
}

function unsafeCandidate(summary: string) {
  return createProjectMemoryCandidate({
    candidateKind: "rejected",
    retentionClass: "never-remember",
    confidence: "high",
    source: "system-derived",
    safety: "unsafe",
    summary,
    reason: "Unsafe material must remain blocked.",
    evidence: ["route82:unsafe"],
  });
}
