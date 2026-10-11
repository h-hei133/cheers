import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMemoryCommand } from "../../core/commands/memoryCommandRuntime.js";
import type { CommandContext } from "../../core/commands/types.js";
import { createProjectMemoryLocalStore } from "../projectMemoryLocalStore.js";
import { createProjectMemoryReviewStateStore } from "../projectMemoryReviewState.js";
import { createProjectMemoryInjectionStateStore } from "../projectMemoryInjectionState.js";
import { planProjectMemoryFutureTurnInjection } from "../projectMemoryFutureTurnInjection.js";
import { importKnowledge, KNOWLEDGE_LIMITS, serializeKnowledge } from "../knowledge/model.js";
import type { ProjectMemoryRecord } from "../projectMemoryStoreContract.js";

let root: string;
let context: CommandContext;
beforeEach(() => {
  const parent = path.resolve(".tmp/par-memory-tests");
  fs.mkdirSync(parent, { recursive: true });
  root = fs.mkdtempSync(path.join(parent, "store-"));
  context = { cwd: root, sessionId: "maintenance", projectMemoryStore: createProjectMemoryLocalStore({ ref: { mode: "test-only", root } }),
    projectMemoryReviewStateStore: createProjectMemoryReviewStateStore(), projectMemoryInjectionStateStore: createProjectMemoryInjectionStateStore() };
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("memory maintenance uses the existing review and store owners", () => {
  it("queues a statement, reviews and approves without writing, then separately saves", async () => {
    const queued = await runMemoryCommand(["enqueue", "The project uses Vitest for verification."], context);
    expect(queued.output).toContain("Memory written: no");
    const scope = "session:maintenance";
    const candidate = context.projectMemoryReviewStateStore!.get(scope).latestCandidates[0]!;
    expect((await runMemoryCommand(["sync"], context)).output).toContain(`${candidate.candidateId}: pending`);
    expect((await runMemoryCommand(["approve", candidate.candidateId], context)).output).toContain("Memory written: no");
    expect((await context.projectMemoryStore!.list()).records).toEqual([]);
    const saved = await runMemoryCommand(["save", candidate.candidateId], context);
    expect(saved.output).toContain("Memory written: yes");
    const records = (await context.projectMemoryStore!.list()).records;
    expect(records).toHaveLength(1);
    const wake = await runMemoryCommand(["wake"], context);
    expect(wake.output).toContain("Auto-injected: no");
    expect(context.projectMemoryInjectionStateStore!.get(scope).injectionStatus).toBe("none");
    await runMemoryCommand(["invalidate", records[0]!.id, "outdated"], context);
    expect((await context.projectMemoryStore!.get(records[0]!.id))!.invalidatedAt).toBeDefined();
    await runMemoryCommand(["delete", records[0]!.id, "remove"], context);
    expect(await context.projectMemoryStore!.get(records[0]!.id)).toBeUndefined();
  });

  it("imports historical approvals as pending candidates and exports only through approval port", async () => {
    const original = record("pmr:external", "Imported knowledge needs current local approval.");
    const content = serializeKnowledge([original]);
    const read = vi.fn().mockResolvedValue({ outcome: "read", content });
    const write = vi.fn().mockResolvedValue({ outcome: "denied", reason: "Approval denied." });
    context = { ...context, dataTransfer: { read, write } };
    const imported = await runMemoryCommand(["import", "memory.json"], context);
    expect(read).toHaveBeenCalledWith({ path: "memory.json", maxBytes: KNOWLEDGE_LIMITS.bytes });
    expect(imported.output).toContain("grant no local approval");
    const state = context.projectMemoryReviewStateStore!.get("session:maintenance");
    expect(state.approvedCandidates).toEqual([]);
    expect(state.decisions[0]!.decision).toBe("pending");
    expect((await runMemoryCommand(["save", "approved"], context)).output).toContain("Outcome: blocked");
    expect((await context.projectMemoryStore!.list()).records).toEqual([]);
    await runMemoryCommand(["approve", state.latestCandidates[0]!.candidateId], context);
    await runMemoryCommand(["save", "approved"], context);
    const exported = await runMemoryCommand(["export", "memory-out.json"], context);
    expect(exported.output).toContain("outcome: denied");
    expect(write).toHaveBeenCalledOnce();
    expect(importKnowledge(write.mock.calls[0]![0].content)).toHaveLength(1);
  });

  it("shows admitted payload provenance independently from staged IDs and current knowledge", async () => {
    const store = context.projectMemoryStore!;
    await store.write({ storeRef: store.ref, record: record("pmr:original", "Original local architecture knowledge.") });
    await runMemoryCommand(["use"], context);
    const scope = "session:maintenance";
    const states = context.projectMemoryInjectionStateStore!;
    expect((await runMemoryCommand(["view"], context)).output).toContain("Admitted payload hash: none");
    const plan = await planProjectMemoryFutureTurnInjection({ mode: "prepare", memoryStore: store, injectionState: states.get(scope), markConsumed: states.markConsumed });
    expect(plan.shouldInject).toBe(true);
    states.markConsumed({ sessionScopeId: scope, memoryInjectionId: states.get(scope).memoryInjectionId!, provenance: plan.provenance });
    await store.delete!({ recordId: "pmr:original", deletedAt: "2026-10-11", sourceCommand: "/memory" });
    const view = await runMemoryCommand(["view"], context);
    expect(view.output).toContain("Schema version: 1");
    expect(view.output).toContain("Knowledge records shown: 0/0");
    expect(view.output).toContain(`Admitted payload hash: ${plan.provenance!.contextHash}`);
    expect(view.output).toContain(plan.injectedContext!);
    expect(view.output).toContain("pmr:original: context-projection; approved 2026-10-01");
  });

  it("rejects oversized, mismatched or unsafe imports before queue mutation and reports degraded store", async () => {
    const good = serializeKnowledge([record("pmr:valid", "Review this safe knowledge.")]);
    expect(() => importKnowledge(good.replace('"version": 1', '"version": 2'))).toThrow();
    expect(() => importKnowledge(good.replace("Review this safe knowledge.", "Changed knowledge"))).toThrow();
    expect(() => importKnowledge(" ".repeat(KNOWLEDGE_LIMITS.bytes + 1))).toThrow();
    const read = vi.fn().mockResolvedValue({ outcome: "read", content: good.replace("Review this safe knowledge.", "RAW_SENSITIVE_CONTENT") });
    const result = await runMemoryCommand(["import", "bad.json"], { ...context, dataTransfer: { read, write: vi.fn() } });
    expect(result.output).toContain("Outcome: blocked");
    expect(context.projectMemoryReviewStateStore!.get("session:maintenance").latestCandidates).toEqual([]);
    fs.writeFileSync(context.projectMemoryStore!.ref.recordsFile!, "damaged\n");
    expect((await runMemoryCommand(["diagnose"], context)).output).toContain("Store health: degraded");
    expect((await runMemoryCommand(["export", "out.json"], { ...context, dataTransfer: { read, write: vi.fn() } })).output).toContain("complete document");
  });
});

function record(id: string, memoryText: string): ProjectMemoryRecord {
  return { id, version: 1, candidateId: `candidate:${id}`, candidateKind: "project-fact", retentionClass: "project-scoped-candidate",
    createdAt: "2026-10-01", approvedAt: "2026-10-01", approvedBySourceCommand: "/memory", memoryText,
    source: "context-projection", safety: "safe", evidence: ["context:explicit"], routeReferences: [], redactions: [] };
}
