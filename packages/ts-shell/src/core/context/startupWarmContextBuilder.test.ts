import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createProjectMemoryLocalStore } from "./projectMemoryLocalStore.js";
import type { ProjectMemoryRecord } from "./projectMemoryStoreContract.js";
import { buildStartupWarmContext } from "./startupWarmContextBuilder.js";
import { startupWarmCacheHasForbiddenContent } from "./startupWarmContextCache.js";

describe("startup warm context builder", () => {
  it("includes edit capability and active memory wake-up summaries", async () => {
    const result = await buildStartupWarmContext({
      projectRoot: "/workspace/app",
      createdAt: "2026-05-16T00:00:00.000Z",
      memoryRecords: [
        record("pmr:active", "Project uses RTK for validation commands."),
      ],
      compactSummary: "Compact v2 is safe-summary-only.",
      validationEvidence: ["rtk npm run build -w packages/ts-shell passed"],
      routePhase: {
        summary: "Route 87 prototypes startup warm context cache.",
        nextAction: "Keep startup injection deferred.",
      },
    });

    expect(result.cache.editCapabilitySummary.summary).toContain(
      "Edit closeout status",
    );
    expect(result.cache.memoryWakeupSummary.summary).toContain(
      "Project uses RTK",
    );
    expect(result.cache.safety.injectedIntoModel).toBe(false);
    expect(result.cache.safety.startupAutoLoad).toBe(false);
    expect(result.evidence).toContain(
      "startup-warm-context-builder:no-provider-call",
    );
  });

  it("excludes invalidated records and redacts raw content, secrets, and hidden reasoning", async () => {
    const result = await buildStartupWarmContext({
      projectRoot: "/workspace/app",
      createdAt: "2026-05-16T00:00:00.000Z",
      memoryRecords: [
        record("pmr:invalid", "Invalidated memory should not appear.", {
          invalidatedAt: "2026-05-16T00:01:00.000Z",
        }),
        record(
          "pmr:redacted",
          "Use sk-secretvalue12345 with RAW_FILE_CONTENT and hidden reasoning.",
        ),
      ],
      routePhase: {
        summary: "Route state mentions provider config token and raw recovery content.",
      },
    });

    const encoded = JSON.stringify(result.cache);
    expect(encoded).not.toContain("Invalidated memory should not appear");
    expect(encoded).not.toContain("sk-secretvalue12345");
    expect(encoded).not.toContain("RAW_FILE_CONTENT");
    expect(encoded).not.toContain("hidden reasoning");
    expect(result.cache.redactions).toEqual(
      expect.arrayContaining([
        "hidden-reasoning-label",
        "raw-marker",
        "secret-label",
        "secret-looking-token",
      ]),
    );
    expect(startupWarmCacheHasForbiddenContent(result.cache)).toBe(false);
  });

  it("excludes invalidated and deleted records when building from the memory store", async () => {
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "startup-warm-memory-"));
    const memoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });
    try {
      const active = record("pmr:active-store", "Active memory survives warm cache.");
      const invalidated = record("pmr:invalid-store", "Invalidated store memory must be absent.");
      const deleted = record("pmr:deleted-store", "Deleted store memory must be absent.");
      for (const item of [active, invalidated, deleted]) {
        await memoryStore.write({ storeRef: memoryStore.ref, record: item });
      }
      await memoryStore.invalidate?.({
        recordId: invalidated.id,
        invalidatedAt: "2026-05-16T00:01:00.000Z",
        sourceCommand: "/memory",
      });
      await memoryStore.delete?.({
        recordId: deleted.id,
        deletedAt: "2026-05-16T00:02:00.000Z",
        sourceCommand: "/memory",
      });

      const result = await buildStartupWarmContext({
        projectRoot: "/workspace/app",
        createdAt: "2026-05-16T00:03:00.000Z",
        memoryStore,
      });

      const encoded = JSON.stringify(result.cache);
      expect(encoded).toContain("Active memory survives warm cache");
      expect(encoded).not.toContain("Invalidated store memory must be absent");
      expect(encoded).not.toContain("Deleted store memory must be absent");
    } finally {
      fs.rmSync(storeRoot, { recursive: true, force: true });
    }
  });
});

function record(
  id: string,
  memoryText: string,
  overrides: Partial<ProjectMemoryRecord> = {},
): ProjectMemoryRecord {
  return {
    id,
    version: 1,
    createdAt: "2026-05-16T00:00:00.000Z",
    candidateId: `pmc:${id}`,
    candidateKind: "project-fact",
    retentionClass: "project-memory-candidate",
    approvedAt: "2026-05-16T00:00:00.000Z",
    approvedBySourceCommand: "/memory",
    memoryText,
    evidence: ["test:memory"],
    source: "compact-handoff",
    routeReferences: [],
    safety: "safe",
    redactions: [],
    ...overrides,
  };
}
