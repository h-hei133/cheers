import { expect, it } from "vitest";
import { detectProjectMemoryConflicts } from "./projectMemoryConflictDetection.js";
import type { ProjectMemoryRecord } from "./projectMemoryStoreContract.js";

function record(id: string, memoryText: string, structuredFact?: ProjectMemoryRecord["structuredFact"]): ProjectMemoryRecord {
  return {
    id, version: 1, createdAt: "2026-10-04", candidateId: id,
    candidateKind: "capability-state", retentionClass: "project-scoped-candidate",
    approvedAt: "2026-10-04", approvedBySourceCommand: "/memory", memoryText,
    evidence: ["checked"], source: "system-derived", safety: "safe", redactions: [],
    routeReferences: ["route 1"], structuredFact,
  };
}

it.each(["not enabled", "not available", "non-default", "not implemented", "not complete"])(
  "treats %s as a negative status and emits only an advisory", negative => {
    const result = detectProjectMemoryConflicts({ records: [record("one", "Feature enabled."), record("two", `Feature ${negative}.`)] });
    expect(result.conflictStatus).toBe("warn");
    expect(result.warnings).toHaveLength(1);
    expect(result.blockers).toEqual([]);
  },
);

it("does not infer one status from text containing both states", () => {
  const result = detectProjectMemoryConflicts({ records: [record("one", "Feature blocked."), record("two", "Read enabled; write disabled.")] });
  expect(result.conflictStatus).toBe("pass");
});

it("keeps structured subject and predicate boundaries distinct", () => {
  const result = detectProjectMemoryConflicts({ records: [
    record("one", "First fact.", { subject: "app:build", predicate: "mode", object: "one" }),
    record("two", "Second fact.", { subject: "app", predicate: "build:mode", object: "two" }),
  ] });
  expect(result.conflictStatus).toBe("pass");
});

it("blocks different values for the same structured fact", () => {
  const result = detectProjectMemoryConflicts({ records: [
    record("one", "First fact.", { subject: "app", predicate: "mode", object: "one" }),
    record("two", "Second fact.", { subject: " app ", predicate: "mode", object: "two" }),
  ] });
  expect(result.conflictStatus).toBe("fail");
  expect(result.blockers).toHaveLength(1);
});
