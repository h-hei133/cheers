import { expect, it, vi } from "vitest";
import { createProjectMemoryReviewStateStore } from "./projectMemoryReviewState.js";
import { createProjectMemoryCandidate } from "./projectMemoryCandidate.js";

it("notifies review decisions and the session whose approval was evicted", async () => {
  const store = createProjectMemoryReviewStateStore({ sessionCapacity: 1 });
  const changed = vi.fn(); const stop = store.subscribe!("one", changed);
  const candidate = createProjectMemoryCandidate({ candidateKind: "project-fact", retentionClass: "project-scoped-candidate", confidence: "high", source: "system-derived", summary: "Fixture", reason: "Fixture", evidence: [] });
  store.updateCandidates({ reviewSessionId: "one", candidates: [candidate], sourceCommand: "/memory" });
  await Promise.resolve(); expect(changed).toHaveBeenCalledOnce(); changed.mockClear();
  store.approve({ reviewSessionId: "one", candidateId: candidate.candidateId, sourceCommand: "/memory" });
  await Promise.resolve(); expect(changed).toHaveBeenCalledOnce(); changed.mockClear();
  expect(store.get("one").approvedCandidates).toHaveLength(1);
  store.reject({ reviewSessionId: "one", candidateId: candidate.candidateId, sourceCommand: "/memory" });
  await Promise.resolve(); expect(changed).toHaveBeenCalledOnce(); changed.mockClear();
  expect(store.get("one").approvedCandidates).toHaveLength(0);
  store.updateCandidates({ reviewSessionId: "two", candidates: [], sourceCommand: "/memory" });
  await Promise.resolve(); expect(changed).toHaveBeenCalledOnce(); expect(store.get("one").decisions).toHaveLength(0);
  stop(); changed.mockClear(); store.updateCandidates({ reviewSessionId: "one", candidates: [], sourceCommand: "/memory" });
  await Promise.resolve(); expect(changed).not.toHaveBeenCalled();
});
