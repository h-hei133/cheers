import { describe, expect, it } from "vitest";
import type { CompactInjectionState } from "../../context/compact/injection/compactInjectionState.js";
import type { CompactLiveCheckpoint } from "../../context/compact/checkpoint/compactLiveCheckpoint.js";
import type { ProjectMemoryInjectionState } from "../../core/context/memory/projectMemoryInjectionState.js";
import type { ProjectMemoryRecord, ProjectMemoryStoreHealth } from "../../core/context/memory/projectMemoryStoreContract.js";
import type { ProjectMemoryReviewState } from "../../core/context/memory/projectMemoryReviewState.js";
import type { StartupWarmContextCache } from "../../context/startup/startupWarmContextCache.js";
import type { StartupWarmContextCacheHealth } from "../../context/startup/startupWarmContextHealth.js";
import { projectSidebarState } from "./sidebarStateProjection.js";

describe("sidebar state projection", () => {
  it("projects visible route state without raw content, secrets, or automatic injection claims", () => {
    const snapshot = projectSidebarState({
      generatedAt: "2026-05-16T00:00:00.000Z",
      task: {
        routeId: "Route 88",
        title: "sidebar model",
        objective: "Create visible state projection.",
        changed: ["sidebarStateProjection.ts"],
      },
      editCloseout: {
        status: "default-ready",
        readiness: "read-only projection ready",
        restorable: "explicit restore only",
        warnings: ["Edit behavior was not changed."],
      },
      mutationEvidence: {
        changedFiles: ["sidebarStateProjection.ts"],
        failedFiles: [{ path: "blocked.ts", reason: "not in route scope" }],
        restorableFiles: ["sidebarStateProjection.ts"],
        rawOriginalContent: "RAW_SECRET raw file content hidden reasoning sk-123456789",
      },
      compactCheckpoint: compactCheckpoint(),
      compactInjectionState: compactInjection("pending"),
      projectMemoryReviewState: memoryReviewState(),
      projectMemoryInjectionState: memoryInjection("injected"),
      projectMemoryRecords: [memoryRecord("pmr:active"), { ...memoryRecord("pmr:invalid"), invalidatedAt: "2026-05-16T01:00:00.000Z" }],
      projectMemoryStoreHealth: memoryHealth(),
      startupWarmHealth: warmHealth("fresh", true),
      startupWarmCache: warmCache("fresh"),
      validation: {
        testsRun: ["sidebarStateProjection.test.ts"],
        verifierResults: [{ command: "rtk npm run verify:result-contract", status: "passed" }],
        buildStatus: "passed",
        resultContractStatus: "passed",
        fullCommandOutput: "raw command output with token sk-123456789",
      },
      toolAvailability: {
        mcpServers: [{ id: "playwright", status: "unknown" }],
        skills: [{ id: "route-skill", status: "deferred" }],
      },
      warnings: [{ id: "route-warning", message: "Keep sidebar UI deferred." }],
      blockers: [{ id: "route-blocker", message: "Dynamic discovery is out of scope." }],
      nextAction: "Route 89 should bridge event history only if this model remains stable.",
    });

    const encoded = JSON.stringify(snapshot);
    expect(snapshot.safety.readOnly).toBe(true);
    expect(snapshot.safety.actualSidebarUi).toBe(false);
    expect(snapshot.safety.dynamicDiscovery).toBe(false);
    expect(snapshot.safety.providerCall).toBe("none");
    expect(snapshot.safety.modelCall).toBe("none");
    expect(snapshot.safety.automaticMemoryInjection).toBe(false);
    expect(snapshot.safety.startupAutoLoad).toBe(false);
    expect(snapshot.facts.some((fact) => fact.section === "edit" && fact.summary.includes("default-ready"))).toBe(true);
    expect(snapshot.facts.some((fact) => fact.section === "compact" && fact.summary.includes("pending"))).toBe(true);
    expect(snapshot.facts.some((fact) => fact.section === "memory" && fact.summary.includes("Active records: 1"))).toBe(true);
    expect(snapshot.facts.some((fact) => fact.section === "warmup" && fact.summary.includes("staleness: fresh"))).toBe(true);
    expect(snapshot.facts.some((fact) => fact.section === "validation" && fact.summary.includes("result contract: passed"))).toBe(true);
    expect(snapshot.facts.some((fact) => fact.section === "tools" && fact.summary.includes("MCP servers: unknown"))).toBe(true);
    expect(snapshot.notices.some((notice) => notice.severity === "blocked")).toBe(true);
    expect(snapshot.nextActions[0]?.summary).toContain("Route 89");
    expect(snapshot.redactions).toContain("raw-original-content-excluded");
    expect(snapshot.redactions).toContain("validation-full-command-output-excluded");
    expect(encoded).not.toContain("RAW_SECRET");
    expect(encoded).not.toContain("sk-123456789");
    expect(encoded).not.toContain("hidden reasoning");
    expect(encoded).not.toContain("raw file content");
  });

  it("handles missing inputs as user-visible unknown state", () => {
    const snapshot = projectSidebarState();

    expect(snapshot.facts.some((fact) => fact.section === "task-route" && fact.summary.includes("No current route"))).toBe(true);
    expect(snapshot.facts.some((fact) => fact.section === "tools" && fact.summary.includes("Not discovered"))).toBe(true);
    expect(snapshot.nextActions).toHaveLength(1);
  });

  it("surfaces compact pending, injected, and consumed states", () => {
    for (const status of ["pending", "injected", "consumed"] as const) {
      const snapshot = projectSidebarState({
        compactInjectionState: compactInjection(status),
      });
      expect(
        snapshot.facts.some((fact) =>
          fact.section === "compact" &&
          fact.label === "Compact injection" &&
          fact.summary.includes(`status: ${status}`),
        ),
      ).toBe(true);
    }
  });

  it("surfaces warmup fresh, stale, and missing states", () => {
    const fresh = projectSidebarState({ startupWarmHealth: warmHealth("fresh", true) });
    const stale = projectSidebarState({ startupWarmHealth: warmHealth("stale", true) });
    const missing = projectSidebarState({ startupWarmHealth: warmHealth("unknown", false) });

    expect(fresh.facts.some((fact) => fact.section === "warmup" && fact.summary.includes("staleness: fresh"))).toBe(true);
    expect(stale.facts.some((fact) => fact.section === "warmup" && fact.summary.includes("staleness: stale"))).toBe(true);
    expect(missing.facts.some((fact) => fact.section === "warmup" && fact.summary.includes("found: no"))).toBe(true);
  });

  it("surfaces explicit memory recall/use mode without claiming auto injection", () => {
    const snapshot = projectSidebarState({
      projectMemoryInjectionState: memoryInjection("pending"),
    });

    expect(snapshot.facts.some((fact) =>
      fact.section === "memory" &&
      fact.summary.includes("mode: recall") &&
      fact.summary.includes("auto-injected: no"),
    )).toBe(true);
  });
});

function compactCheckpoint(): CompactLiveCheckpoint {
  return {
    checkpointId: "checkpoint-sidebar",
    status: "created",
    packetSummary: { nextAction: "Inject on future turn only when explicit." },
    warnings: [{ id: "compact-warning", message: "Checkpoint is pending." }],
    evidence: ["compact-live-checkpoint:test"],
  } as unknown as CompactLiveCheckpoint;
}

function compactInjection(status: CompactInjectionState["injectionStatus"]): CompactInjectionState {
  return {
    sessionScopeId: "session:test",
    injectionStatus: status,
    checkpointId: "checkpoint-sidebar",
    injectionCount: status === "injected" ? 1 : 0,
    supersededCheckpointIds: [],
    warnings: [],
    persistence: "none",
    providerCall: "none",
    evidence: ["compact-injection-state:test"],
  };
}

function memoryReviewState(): ProjectMemoryReviewState {
  return {
    reviewSessionId: "session:test",
    latestCandidates: [],
    approvedCandidates: [],
    rejectedCandidates: [],
    unsafeCandidates: [],
    supersededCandidates: [],
    decisions: [],
    persistence: "none",
    providerCall: "none",
    evidence: ["project-memory-review-state:test"],
  };
}

function memoryInjection(status: ProjectMemoryInjectionState["injectionStatus"]): ProjectMemoryInjectionState {
  return {
    sessionScopeId: "session:test",
    injectionStatus: status,
    memoryInjectionId: "pmi:test",
    sourceCommand: "/memory use",
    mode: "recall",
    query: "sidebar",
    recordIds: ["pmr:active"],
    supersededInjectionIds: [],
    warnings: [{ id: "memory-warning", message: "Explicit staged use only." }],
    redactions: [],
    persistence: "none",
    providerCall: "none",
    evidence: ["project-memory-injection-state:test"],
  };
}

function memoryRecord(id: string): ProjectMemoryRecord {
  return {
    id,
    version: 1,
    createdAt: "2026-05-16T00:00:00.000Z",
    candidateId: `pmc:${id}`,
    candidateKind: "project-fact",
    retentionClass: "project-scoped-candidate",
    approvedAt: "2026-05-16T00:00:00.000Z",
    approvedBySourceCommand: "/memory",
    memoryText: "This raw memory text must not appear in the sidebar projection.",
    evidence: ["project-memory-record:test"],
    source: "system-derived",
    routeReferences: ["route88"],
    safety: "safe",
    redactions: [],
  };
}

function memoryHealth(): ProjectMemoryStoreHealth {
  return {
    mode: "test-only",
    ok: true,
    writable: true,
    recordCount: 2,
    detail: "Project memory store is available.",
    evidence: ["project-memory-health:test"],
  };
}

function warmHealth(
  staleness: StartupWarmContextCacheHealth["staleness"],
  found: boolean,
): StartupWarmContextCacheHealth {
  return {
    mode: "test-only",
    ok: true,
    writable: true,
    found,
    staleness,
    detail: "Warm cache checked.",
    evidence: ["startup-warm-health:test"],
  };
}

function warmCache(staleness: StartupWarmContextCache["staleness"]): StartupWarmContextCache {
  return {
    staleness,
    sourceSummary: { generatedFrom: ["route88:test"] },
  } as unknown as StartupWarmContextCache;
}
