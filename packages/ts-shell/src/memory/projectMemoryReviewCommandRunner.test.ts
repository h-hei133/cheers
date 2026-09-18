import { describe, expect, it } from "vitest";
import { runCompactCommand } from "../context/compact/command/compactCommandRunner.js";
import { extractProjectMemoryCandidates } from "./projectMemoryCandidateExtractor.js";
import { createProjectMemoryCandidate } from "./projectMemoryCandidate.js";
import {
  normalizeProjectMemoryReviewCommandRequest,
  parseProjectMemoryReviewCommandArgs,
  ProjectMemoryReviewCommandContractError,
} from "./projectMemoryReviewCommandContract.js";
import { runProjectMemoryReviewCommand } from "./projectMemoryReviewCommandRunner.js";
import { createProjectMemoryReviewStateStore } from "./projectMemoryReviewState.js";

describe("project memory review command runner", () => {
  it("lists candidates by default without persistence", () => {
    const candidates = compactCandidates();
    const store = createProjectMemoryReviewStateStore({
      now: () => "2026-05-16T00:00:00.000Z",
    });
    const result = runProjectMemoryReviewCommand({
      request: parseProjectMemoryReviewCommandArgs([]),
      reviewSessionId: "session:sess_memory",
      candidates,
      store,
    });

    expect(result.outcome).toBe("listed");
    expect(result.state.latestCandidates.length).toBeGreaterThan(0);
    expect(result.output).toContain("Project memory review");
    expect(result.output).toContain("- Memory written: no");
    expect(result.output).toContain("- Persistence: not enabled");
    expect(result.output).toContain("- Retrieval / wake-up / recall: not enabled");
    expect(result.persistence).toBe("none");
    expect(result.providerCall).toBe("none");
  });

  it("approves and rejects candidates in session-scoped review state only", () => {
    const candidates = compactCandidates();
    const store = createProjectMemoryReviewStateStore({
      now: () => "2026-05-16T00:00:00.000Z",
    });
    const listed = runProjectMemoryReviewCommand({
      request: normalizeProjectMemoryReviewCommandRequest({ mode: "list" }),
      reviewSessionId: "session:sess_decisions",
      candidates,
      store,
    });
    const pending = listed.state.decisions.find(
      (entry) => entry.decision === "pending",
    );
    expect(pending).toBeTruthy();

    const approved = runProjectMemoryReviewCommand({
      request: normalizeProjectMemoryReviewCommandRequest({
        mode: "approve",
        candidateId: pending?.candidateId,
      }),
      reviewSessionId: "session:sess_decisions",
      candidates,
      store,
    });
    expect(approved.outcome).toBe("approved");
    expect(approved.state.approvedCandidates).toContainEqual(
      expect.objectContaining({
        candidateId: pending?.candidateId,
        decision: "approved",
      }),
    );
    expect(approved.output).toContain("Approved session-scoped candidates: 1");
    expect(approved.output).toContain("Memory written: no");

    const rejectTarget = approved.state.decisions.find(
      (entry) => entry.decision === "pending",
    );
    const rejected = runProjectMemoryReviewCommand({
      request: normalizeProjectMemoryReviewCommandRequest({
        mode: "reject",
        candidateId: rejectTarget?.candidateId,
      }),
      reviewSessionId: "session:sess_decisions",
      candidates,
      store,
    });
    expect(rejected.outcome).toBe("rejected");
    expect(rejected.state.rejectedCandidates).toContainEqual(
      expect.objectContaining({
        candidateId: rejectTarget?.candidateId,
        decision: "rejected",
      }),
    );
    expect(rejected.output).toContain("Rejected session-scoped candidates: 1");
    expect(JSON.stringify(rejected.state)).toContain("no-persistence");
  });

  it("blocks invalid ids and unsafe candidate approval by default", () => {
    const unsafe = createProjectMemoryCandidate({
      candidateKind: "rejected",
      retentionClass: "never-remember",
      confidence: "high",
      source: "system-derived",
      safety: "unsafe",
      summary: "Unsafe candidate was rejected: file-content marker.",
      reason: "Raw content must not enter review state.",
      evidence: ["test:unsafe"],
      redactions: ["unsafeFact.summary"],
    });
    const store = createProjectMemoryReviewStateStore();

    const invalid = runProjectMemoryReviewCommand({
      request: normalizeProjectMemoryReviewCommandRequest({
        mode: "approve",
        candidateId: "missing-candidate",
      }),
      reviewSessionId: "session:sess_invalid",
      candidates: [unsafe],
      store,
    });
    expect(invalid.outcome).toBe("blocked");
    expect(invalid.output).toContain("Unknown memory candidate id");

    const blocked = runProjectMemoryReviewCommand({
      request: normalizeProjectMemoryReviewCommandRequest({
        mode: "approve",
        candidateId: unsafe.candidateId,
      }),
      reviewSessionId: "session:sess_invalid",
      candidates: [unsafe],
      store,
    });
    expect(blocked.outcome).toBe("blocked");
    expect(blocked.output).toContain("Unsafe memory candidates cannot be approved.");
  });

  it("requires explicit review for user preferences and keeps ambiguous preferences unapproved", () => {
    const explicit = createProjectMemoryCandidate({
      candidateKind: "user-preference-candidate",
      retentionClass: "user-memory-candidate",
      confidence: "high",
      source: "user-stated-preference",
      safety: "needs-review",
      summary: "User explicitly prefers docs-only cleanup to avoid runtime edits.",
      reason: "Explicit user preference candidate.",
      evidence: ["user:explicit-preference"],
    });
    const ambiguous = createProjectMemoryCandidate({
      candidateKind: "rejected",
      retentionClass: "never-remember",
      confidence: "high",
      source: "user-stated-preference",
      safety: "unsafe",
      summary: "Ambiguous user behavior was not treated as a user preference.",
      reason: "User preference memory requires an explicit signal.",
      evidence: ["user:ambiguous"],
    });

    const result = runProjectMemoryReviewCommand({
      request: normalizeProjectMemoryReviewCommandRequest({ mode: "review" }),
      reviewSessionId: "session:sess_preference",
      candidates: [explicit, ambiguous],
      store: createProjectMemoryReviewStateStore(),
    });

    expect(result.state.decisions).toContainEqual(
      expect.objectContaining({
        candidateId: explicit.candidateId,
        decision: "needs-review",
      }),
    );
    expect(result.state.decisions).toContainEqual(
      expect.objectContaining({
        candidateId: ambiguous.candidateId,
        decision: "unsafe",
      }),
    );
    expect(result.state.approvedCandidates).toEqual([]);
    expect(result.output).toContain("User-preference candidates needing review: 1");
  });

  it("rejects mutating forms without a target and keeps raw content or secrets out of output", () => {
    expect(() => parseProjectMemoryReviewCommandArgs(["approve"])).toThrow(
      ProjectMemoryReviewCommandContractError,
    );
    const unsafe = createProjectMemoryCandidate({
      candidateKind: "rejected",
      retentionClass: "never-remember",
      confidence: "high",
      source: "system-derived",
      safety: "unsafe",
      summary: "Unsafe candidate was rejected: file-content marker.",
      reason: "Secret material was rejected.",
      evidence: ["test:secret"],
      redactions: ["secretValues"],
    });
    const result = runProjectMemoryReviewCommand({
      request: normalizeProjectMemoryReviewCommandRequest({ mode: "list" }),
      reviewSessionId: "session:sess_safe_output",
      candidates: [unsafe],
      store: createProjectMemoryReviewStateStore(),
    });

    expect(result.output).not.toContain("RAW_FILE_CONTENT");
    expect(result.output).not.toContain("sk-1234567890abcdef");
    expect(result.output).toContain("Redactions: 1");
  });
});

function compactCandidates() {
  return extractProjectMemoryCandidates({
    compactPacket: runCompactCommand({
      mode: "render",
      source: "route",
      generatedAt: "2026-05-16T00:00:00.000Z",
      routeInfo: {
        routeId: "81",
        name: "Memory candidate review",
        currentPhase: "implementation",
        nextAction: "Run memory review tests.",
      },
      projectInfo: {
        repositoryHints: ["Project uses RTK command discipline."],
      },
      validationEvidence: {
        testsRun: ["projectMemoryReviewCommandRunner.test.ts"],
      },
    }).packet,
  });
}
