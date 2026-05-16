import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProjectMemoryInjectionStateStore } from "./projectMemoryInjectionState.js";
import { createProjectMemoryLocalStore } from "./projectMemoryLocalStore.js";
import { planProjectMemoryFutureTurnInjection } from "./projectMemoryFutureTurnInjection.js";
import {
  parseProjectMemoryUseCommandArgs,
  normalizeProjectMemoryUseCommandRequest,
} from "./projectMemoryUseCommandContract.js";
import { runProjectMemoryUseCommand } from "./projectMemoryUseCommandRunner.js";
import type { ProjectMemoryRecord } from "./projectMemoryStoreContract.js";

describe("project memory future-turn injection", () => {
  let storeRoot = "";

  beforeEach(() => {
    storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-use-"));
  });

  afterEach(() => {
    fs.rmSync(storeRoot, { recursive: true, force: true });
  });

  it("stages wake-up memory and injects it once", async () => {
    const memoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });
    await seed(memoryStore, [
      record("pmr:fact", "Project memory use requires explicit user opt-in.", "project-fact"),
      record("pmr:route", "Route 85 keeps startup auto-load disabled.", "route-decision"),
    ]);
    const injectionStateStore = createProjectMemoryInjectionStateStore({
      now: () => "2026-05-16T03:00:00.000Z",
      nextId: () => "pmi:wake",
    });

    const staged = await runProjectMemoryUseCommand({
      request: parseProjectMemoryUseCommandArgs(["use"]),
      sessionScopeId: "session:memory-use",
      memoryStore,
      injectionStateStore,
    });
    expect(staged.outcome).toBe("staged");
    expect(staged.output).toContain("Future-turn injection: explicit staged use only");

    const first = await planProjectMemoryFutureTurnInjection({
      memoryStore,
      injectionState: injectionStateStore.get("session:memory-use"),
      markInjected: (input) => injectionStateStore.markInjected(input),
      markConsumed: (input) => injectionStateStore.markConsumed(input),
      markInvalid: (input) => injectionStateStore.markInvalid(input),
    });
    expect(first.shouldInject).toBe(true);
    expect(first.injectedContext).toContain("<project_memory_context>");
    expect(first.injectedContext).toContain("Mode: wake");
    expect(first.injectedContext).toContain("Project memory use requires explicit user opt-in.");
    expect(first.injectedContext).toContain("Startup auto-load is not enabled");

    const second = await planProjectMemoryFutureTurnInjection({
      memoryStore,
      injectionState: injectionStateStore.get("session:memory-use"),
      markConsumed: (input) => injectionStateStore.markConsumed(input),
    });
    expect(second.shouldInject).toBe(false);
    expect(injectionStateStore.get("session:memory-use").injectionStatus).toBe("consumed");
  });

  it("stages recall memory, supersedes pending use, and filters invalidated/deleted records", async () => {
    const memoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });
    await seed(memoryStore, [
      record("pmr:active", "RTK validation should be remembered for route work.", "validation-pattern"),
      record("pmr:stale", "RTK stale validation should not be injected.", "validation-pattern"),
      record("pmr:deleted", "RTK deleted validation should not be injected.", "validation-pattern"),
    ]);
    await memoryStore.invalidate?.({
      recordId: "pmr:stale",
      invalidatedAt: "2026-05-16T03:01:00.000Z",
      sourceCommand: "/memory",
      reason: "stale",
    });
    await memoryStore.delete?.({
      recordId: "pmr:deleted",
      deletedAt: "2026-05-16T03:02:00.000Z",
      sourceCommand: "/memory",
      reason: "deleted",
    });
    const injectionStateStore = createProjectMemoryInjectionStateStore({
      nextId: (() => {
        let id = 0;
        return () => {
          id += 1;
          return `pmi:${id}`;
        };
      })(),
    });

    await runProjectMemoryUseCommand({
      request: normalizeProjectMemoryUseCommandRequest({ mode: "wake" }),
      sessionScopeId: "session:memory-recall",
      memoryStore,
      injectionStateStore,
    });
    const staged = await runProjectMemoryUseCommand({
      request: parseProjectMemoryUseCommandArgs(["use", "RTK", "validation"]),
      sessionScopeId: "session:memory-recall",
      memoryStore,
      injectionStateStore,
    });

    expect(staged.state.supersededInjectionIds).toEqual(["pmi:1"]);
    expect(staged.state.mode).toBe("recall");
    expect(staged.state.recordIds).toEqual(["pmr:active"]);

    const plan = await planProjectMemoryFutureTurnInjection({
      memoryStore,
      injectionState: injectionStateStore.get("session:memory-recall"),
      markInjected: (input) => injectionStateStore.markInjected(input),
      markConsumed: (input) => injectionStateStore.markConsumed(input),
      markInvalid: (input) => injectionStateStore.markInvalid(input),
    });

    expect(plan.shouldInject).toBe(true);
    expect(plan.injectedContext).toContain("RTK validation should be remembered");
    expect(plan.injectedContext).not.toContain("stale validation");
    expect(plan.injectedContext).not.toContain("deleted validation");
  });

  it("blocks missing or empty store without staging injection", async () => {
    const injectionStateStore = createProjectMemoryInjectionStateStore();
    const missing = await runProjectMemoryUseCommand({
      request: normalizeProjectMemoryUseCommandRequest({ mode: "wake" }),
      sessionScopeId: "session:missing-store",
      injectionStateStore,
    });
    expect(missing.outcome).toBe("blocked");
    expect(missing.output).toContain("Explicit local memory store root is required");
    expect(injectionStateStore.get("session:missing-store").injectionStatus).toBe("none");

    const emptyStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });
    const empty = await runProjectMemoryUseCommand({
      request: normalizeProjectMemoryUseCommandRequest({ mode: "wake" }),
      sessionScopeId: "session:empty-store",
      memoryStore: emptyStore,
      injectionStateStore,
    });
    expect(empty.outcome).toBe("blocked");
    expect(empty.output).toContain("No saved project memory records matched");
  });

  it("redacts malformed raw and secret-looking memory before injection", async () => {
    fs.writeFileSync(
      path.join(storeRoot, "project-memory.jsonl"),
      `${JSON.stringify({
        ...record(
          "pmr:redact",
          "RAW_FILE_CONTENT sk-1234567890abcdef hidden reasoning should not leak.",
          "project-fact",
        ),
        evidence: ["route85:redaction"],
      })}\n`,
      "utf8",
    );
    const memoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });
    const injectionStateStore = createProjectMemoryInjectionStateStore({
      nextId: () => "pmi:redact",
    });
    await runProjectMemoryUseCommand({
      request: normalizeProjectMemoryUseCommandRequest({ mode: "recall", query: "leak" }),
      sessionScopeId: "session:redact",
      memoryStore,
      injectionStateStore,
    });

    const plan = await planProjectMemoryFutureTurnInjection({
      memoryStore,
      injectionState: injectionStateStore.get("session:redact"),
      markInjected: (input) => injectionStateStore.markInjected(input),
      markConsumed: (input) => injectionStateStore.markConsumed(input),
    });

    expect(plan.shouldInject).toBe(true);
    expect(plan.injectedContext).not.toContain("RAW_FILE_CONTENT");
    expect(plan.injectedContext).not.toContain("sk-1234567890abcdef");
    expect(plan.injectedContext).not.toContain("hidden reasoning should not leak");
    expect(plan.injectedContext).toContain("[REDACTED_RAW]");
    expect(plan.injectedContext).toContain("[REDACTED]");
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
    evidence: ["route85:test"],
    source: "system-derived",
    sourcePacket: "route85-test",
    routeReferences: ["route85"],
    safety: "safe",
    redactions: [],
  };
}
