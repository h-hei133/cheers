import { describe, expect, it } from "vitest";
import { createProjectMemoryCandidate } from "./projectMemoryCandidate.js";
import { createProjectMemoryReviewStateStore } from "./projectMemoryReviewState.js";
import { runProjectMemoryReviewCommand } from "./projectMemoryReviewCommandRunner.js";
import { normalizeProjectMemoryReviewCommandRequest } from "./projectMemoryReviewCommandContract.js";
import { runProjectMemorySaveCommand } from "./projectMemorySaveCommandRunner.js";
import { parseProjectMemorySaveCommandArgs } from "./projectMemorySaveCommandContract.js";

const candidate = (id: number) => createProjectMemoryCandidate({
  candidateKind: "project-fact", retentionClass: "project-scoped-candidate",
  confidence: "high", source: "system-derived", safety: "safe",
  summary: `Project fact ${id}`, reason: "Durable project fact", evidence: [], redactions: [],
});

describe("memory review retention", () => {
  it("projects incomplete review history through memory status", async () => {
    const result = await runProjectMemorySaveCommand({
      request: parseProjectMemorySaveCommandArgs(["status"]), reviewSessionId: "one", candidates: [candidate(0), candidate(1), candidate(2)],
      reviewStore: createProjectMemoryReviewStateStore({ decisionCapacity: 2 }),
    });
    expect(result.state.incomplete).toBe(true);
    expect(result.output).toContain("Review history: incomplete");
    expect(result.output).toContain("counts cover retained candidates only");
  });

  it("keeps current candidates before history and reports dropped decisions", () => {
    const store = createProjectMemoryReviewStateStore({ decisionCapacity: 2 });
    for (let i = 0; i < 5; i++) store.updateCandidates({ reviewSessionId: "one", candidates: [candidate(i)], sourceCommand: "/compact" });
    const state = store.get("one");
    expect(state.decisions).toHaveLength(2);
    expect(state.latestCandidates).toHaveLength(1);
    expect(state.latestCandidates[0].summary).toBe("Project fact 4");
    expect(state).toMatchObject({ dropped: 3, incomplete: true });
    const result = runProjectMemoryReviewCommand({ request: normalizeProjectMemoryReviewCommandRequest({ mode: "list" }), reviewSessionId: "one", candidates: state.latestCandidates, store });
    expect(result.output).toContain("Review history: incomplete");
    expect(result.state.decisions).toHaveLength(2);
  });

  it("caps an oversized current batch and never retains approval across session eviction", () => {
    const store = createProjectMemoryReviewStateStore({ decisionCapacity: 2, sessionCapacity: 2 });
    const candidates = [candidate(0), candidate(1), candidate(2)];
    const update = (reviewSessionId: string) => store.updateCandidates({ reviewSessionId, candidates, sourceCommand: "/compact" });
    const state = update("one");
    expect(state.latestCandidates).toHaveLength(2);
    expect(state.decisions).toHaveLength(2);
    expect(state.incomplete).toBe(true);
    const input = { reviewSessionId: "one", candidateId: candidates[0].candidateId, sourceCommand: "/memory" as const };
    for (let i = 0; i < 300; i++) store.approve(input);
    expect(store.get("one").approvedCandidates).toHaveLength(1);
    expect(store.get("one").decisions[0].evidence.length).toBeLessThan(20);
    update("two");
    update("three");
    expect(store.retention()).toMatchObject({ size: 2, dropped: 1, incomplete: true });
    expect(store.get("one")).toMatchObject({ approvedCandidates: [], incomplete: true });
    expect(update("one").approvedCandidates).toEqual([]);
  });
});
