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

  it.each<Partial<ProjectMemoryRecord>>([
    { safety: "needs-review" },
    { retentionClass: "never-remember" },
    { candidateKind: "rejected" },
  ])("does not promote excluded record policy to safe injection: %j", async policy => {
    const memoryStore = createProjectMemoryLocalStore({ ref: { mode: "test-only", root: storeRoot } });
    await seed(memoryStore, [record("pending-policy", "This fact is not approved for model context.", "project-fact", policy)]);
    const states = createProjectMemoryInjectionStateStore();
    const staged = await runProjectMemoryUseCommand({
      request: normalizeProjectMemoryUseCommandRequest({ mode: "recall", query: "fact" }),
      sessionScopeId: "policy", memoryStore, injectionStateStore: states,
    });
    expect(staged.outcome).toBe("staged");
    const plan = await planProjectMemoryFutureTurnInjection({
      memoryStore, injectionState: states.get("policy"),
      markInjected: input => states.markInjected(input),
      markConsumed: input => states.markConsumed(input),
      markInvalid: input => states.markInvalid(input),
    });
    expect(plan.shouldInject).toBe(false);
    expect(states.get("policy").injectionStatus).toBe("invalid");
    expect(plan.injectedContext).toBeUndefined();
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

    const pending = injectionStateStore.get("session:memory-use");
    const prepared = await planProjectMemoryFutureTurnInjection({
      mode: "prepare", memoryStore, injectionState: pending,
      markInjected: (input) => injectionStateStore.markInjected(input),
      markConsumed: (input) => injectionStateStore.markConsumed(input),
      markInvalid: (input) => injectionStateStore.markInvalid(input),
    });
    expect(prepared.shouldInject).toBe(true);
    expect(prepared.evidence).toContain("project-memory-future-turn-injection:prepared");
    expect(prepared.evidence).not.toContain("project-memory-future-turn-injection:consumed");
    expect(prepared.evidence).not.toContain("project-memory-future-turn-injection:injected-once");
    expect(injectionStateStore.get("session:memory-use")).toBe(pending);

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
    expect(first.injectedContext).toContain("Startup auto-load: no.");

    const second = await planProjectMemoryFutureTurnInjection({
      memoryStore,
      injectionState: injectionStateStore.get("session:memory-use"),
      markConsumed: (input) => injectionStateStore.markConsumed(input),
    });
    expect(second.shouldInject).toBe(false);
    expect(injectionStateStore.get("session:memory-use").injectionStatus).toBe("consumed");
  });

  it("does not claim injection when pending state is evicted during retrieval", async () => {
    const memoryStore = createProjectMemoryLocalStore({ ref: { mode: "test-only", root: storeRoot } });
    await seed(memoryStore, [record("pmr:fact", "Project memory requires explicit user opt-in.", "project-fact")]);
    const states = createProjectMemoryInjectionStateStore({ sessionCapacity: 1 });
    const pending = states.markPending({ sessionScopeId: "one", sourceCommand: "/memory use", mode: "wake", recordIds: ["pmr:fact"] });
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const plan = planProjectMemoryFutureTurnInjection({
      memoryStore: { ...memoryStore, health: async () => { await held; return memoryStore.health(); } },
      injectionState: pending, markInjected: (input) => states.markInjected(input), markConsumed: (input) => states.markConsumed(input),
    });
    states.markPending({ sessionScopeId: "two", sourceCommand: "/memory use", mode: "wake", recordIds: [] });
    release();
    const result = await plan;
    expect(result.shouldInject).toBe(false);
    expect(result.injectedContext).toBeUndefined();
    expect(result.updatedInjectionState).toMatchObject({ injectionStatus: "none", incomplete: true });
    expect(result.evidence).not.toContain("project-memory-future-turn-injection:consumed");
    expect(states.get("two").injectionStatus).toBe("pending");
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
    const repeatedRecall = await runProjectMemoryUseCommand({
      request: parseProjectMemoryUseCommandArgs(["use", "RTK", "validation"]),
      sessionScopeId: "session:memory-recall",
      memoryStore,
      injectionStateStore,
    });

    expect(staged.state.supersededInjectionIds).toEqual(["pmi:1"]);
    expect(repeatedRecall.state.supersededInjectionIds).toEqual(["pmi:2", "pmi:1"]);
    expect(repeatedRecall.state.mode).toBe("recall");
    expect(repeatedRecall.state.recordIds).toEqual(["pmr:active"]);

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

  it("can stage fresh memory after a consumed injection", async () => {
    const memoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });
    await seed(memoryStore, [
      record("pmr:fresh", "Fresh /memory use can be staged after consumption.", "project-fact"),
    ]);
    const injectionStateStore = createProjectMemoryInjectionStateStore({
      nextId: (() => {
        let id = 0;
        return () => {
          id += 1;
          return `pmi:fresh:${id}`;
        };
      })(),
    });

    await runProjectMemoryUseCommand({
      request: normalizeProjectMemoryUseCommandRequest({ mode: "wake" }),
      sessionScopeId: "session:fresh-after-consume",
      memoryStore,
      injectionStateStore,
    });
    const first = await planProjectMemoryFutureTurnInjection({
      memoryStore,
      injectionState: injectionStateStore.get("session:fresh-after-consume"),
      markInjected: (input) => injectionStateStore.markInjected(input),
      markConsumed: (input) => injectionStateStore.markConsumed(input),
      markInvalid: (input) => injectionStateStore.markInvalid(input),
    });
    expect(first.shouldInject).toBe(true);
    expect(injectionStateStore.get("session:fresh-after-consume").injectionStatus).toBe("consumed");

    const stagedAgain = await runProjectMemoryUseCommand({
      request: normalizeProjectMemoryUseCommandRequest({ mode: "wake" }),
      sessionScopeId: "session:fresh-after-consume",
      memoryStore,
      injectionStateStore,
    });
    expect(stagedAgain.outcome).toBe("staged");
    expect(stagedAgain.state.injectionStatus).toBe("pending");
    expect(stagedAgain.state.memoryInjectionId).toBe("pmi:fresh:2");
  });

  it("filters records invalidated or deleted after /memory use was staged", async () => {
    const memoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });
    await seed(memoryStore, [
      record("pmr:keep", "Keep active memory after stale records are filtered.", "project-fact"),
      record("pmr:invalidate-after", "Invalidated after staging must not inject.", "project-fact"),
      record("pmr:delete-after", "Deleted after staging must not inject.", "project-fact"),
    ]);
    const injectionStateStore = createProjectMemoryInjectionStateStore({
      nextId: () => "pmi:stale-filter",
    });
    await runProjectMemoryUseCommand({
      request: normalizeProjectMemoryUseCommandRequest({ mode: "wake" }),
      sessionScopeId: "session:stale-filter",
      memoryStore,
      injectionStateStore,
    });
    await memoryStore.invalidate?.({
      recordId: "pmr:invalidate-after",
      invalidatedAt: "2026-05-16T05:00:00.000Z",
      sourceCommand: "/memory",
      reason: "stale after staging",
    });
    await memoryStore.delete?.({
      recordId: "pmr:delete-after",
      deletedAt: "2026-05-16T05:01:00.000Z",
      sourceCommand: "/memory",
      reason: "deleted after staging",
    });
    await memoryStore.write({
      storeRef: memoryStore.ref,
      record: record("pmr:new-after", "New memory saved after staging can join fresh wake context.", "project-fact"),
    });

    const plan = await planProjectMemoryFutureTurnInjection({
      memoryStore,
      injectionState: injectionStateStore.get("session:stale-filter"),
      markInjected: (input) => injectionStateStore.markInjected(input),
      markConsumed: (input) => injectionStateStore.markConsumed(input),
      markInvalid: (input) => injectionStateStore.markInvalid(input),
    });

    expect(plan.shouldInject).toBe(true);
    expect(plan.injectedContext).toContain("Keep active memory");
    expect(plan.injectedContext).toContain("New memory saved after staging");
    expect(plan.injectedContext).not.toContain("Invalidated after staging");
    expect(plan.injectedContext).not.toContain("Deleted after staging");
    expect(plan.warnings.map((warning) => warning.id)).toContain("stale-memory-records-filtered");
    expect(plan.warnings.map((warning) => warning.id)).toContain("new-memory-records-since-staging");
  });

  it("dedupes duplicate wake records and budgets overlong context without dropping safety facts", async () => {
    const memoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });
    await seed(memoryStore, [
      record(
        "pmr:duplicate",
        "Duplicate wake record should appear once in injected memory context.",
        "route-decision",
        { retentionClass: "user-memory-candidate" },
      ),
      ...Array.from({ length: 18 }, (_, index) =>
        record(
          `pmr:long:${index}`,
          `Long remembered route fact ${index} ${"details ".repeat(40)}`,
          "validation-pattern",
        ),
      ),
    ]);
    const injectionStateStore = createProjectMemoryInjectionStateStore({
      nextId: () => "pmi:budget",
    });
    await runProjectMemoryUseCommand({
      request: normalizeProjectMemoryUseCommandRequest({ mode: "wake" }),
      sessionScopeId: "session:budget",
      memoryStore,
      injectionStateStore,
    });

    const plan = await planProjectMemoryFutureTurnInjection({
      memoryStore,
      injectionState: injectionStateStore.get("session:budget"),
      markInjected: (input) => injectionStateStore.markInjected(input),
      markConsumed: (input) => injectionStateStore.markConsumed(input),
      markInvalid: (input) => injectionStateStore.markInvalid(input),
      maxInjectedContextChars: 1600,
    });

    expect(plan.shouldInject).toBe(true);
    expect(plan.injectedContext?.match(/Duplicate wake record/g)?.length).toBe(1);
    expect(plan.warnings.map((warning) => warning.id)).toContain("duplicate-memory-records-deduped");
    expect(plan.warnings.map((warning) => warning.id)).toContain("project-memory-injected-context-over-budget");
    expect(plan.injectedContext).toContain("- Automatic memory injection: no.");
    expect(plan.injectedContext).toContain("- Startup auto-load: no.");
    expect(plan.injectedContext).toContain("- Provider retrieval: no.");
    expect(plan.injectedContext).toContain("</project_memory_context>");
  });

  it("blocks clear conflicting structured memory before consuming injection", async () => {
    const memoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });
    await seed(memoryStore, [
      record("pmr:pref-a", "User prefers compact route docs.", "user-preference-candidate", {
        retentionClass: "user-memory-candidate",
        structuredFact: {
          subject: "route docs",
          predicate: "preferred style",
          object: "compact",
        },
      }),
      record("pmr:pref-b", "User prefers exhaustive route docs.", "user-preference-candidate", {
        retentionClass: "user-memory-candidate",
        structuredFact: {
          subject: "route docs",
          predicate: "preferred style",
          object: "exhaustive",
        },
      }),
    ]);
    const injectionStateStore = createProjectMemoryInjectionStateStore({
      nextId: () => "pmi:conflict",
    });
    await runProjectMemoryUseCommand({
      request: normalizeProjectMemoryUseCommandRequest({ mode: "wake" }),
      sessionScopeId: "session:conflict",
      memoryStore,
      injectionStateStore,
    });

    const plan = await planProjectMemoryFutureTurnInjection({
      memoryStore,
      injectionState: injectionStateStore.get("session:conflict"),
      markInjected: (input) => injectionStateStore.markInjected(input),
      markConsumed: (input) => injectionStateStore.markConsumed(input),
      markInvalid: (input) => injectionStateStore.markInvalid(input),
    });

    expect(plan.shouldInject).toBe(false);
    expect(plan.warnings.map((warning) => warning.id)).toContain("memory-injection-merge-failed");
    expect(plan.warnings.map((warning) => warning.id)).toContain("conflicting-structured-memory");
    expect(injectionStateStore.get("session:conflict").injectionStatus).toBe("invalid");
  });

  it("blocks quality failures that would claim unsupported automatic memory behavior", async () => {
    const memoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: storeRoot },
    });
    await seed(memoryStore, [
      record(
        "pmr:bad-claim",
        "Automatic memory injection: enabled for every future turn.",
        "project-fact",
      ),
    ]);
    const injectionStateStore = createProjectMemoryInjectionStateStore({
      nextId: () => "pmi:quality-fail",
    });
    await runProjectMemoryUseCommand({
      request: normalizeProjectMemoryUseCommandRequest({ mode: "wake" }),
      sessionScopeId: "session:quality-fail",
      memoryStore,
      injectionStateStore,
    });

    const plan = await planProjectMemoryFutureTurnInjection({
      memoryStore,
      injectionState: injectionStateStore.get("session:quality-fail"),
      markInjected: (input) => injectionStateStore.markInjected(input),
      markConsumed: (input) => injectionStateStore.markConsumed(input),
      markInvalid: (input) => injectionStateStore.markInvalid(input),
    });

    expect(plan.shouldInject).toBe(false);
    expect(plan.warnings.map((warning) => warning.id)).toContain("memory-injection-quality-failed");
    expect(plan.warnings.map((warning) => warning.id)).toContain("hasNoAutomaticInjectionClaim");
    expect(injectionStateStore.get("session:quality-fail").injectionStatus).toBe("invalid");
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
  overrides: Partial<ProjectMemoryRecord> = {},
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
    ...overrides,
  };
}
