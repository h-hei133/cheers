import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore, resetMemoryStore } from "./memoryStore.js";
import { FactArbiter } from "./factArbiter.js";
import {
  executeMemoryRetain,
  executeMemoryRecall,
  executeMemoryEdit,
  executeMemoryInspect,
} from "./memoryTools.js";
import { runMemoryCommand } from "../commands/memoryCommandRuntime.js";
import { routeSlashCommand } from "../commands/slashRouter.js";

describe("Native QuadMemory Architecture Test Suite", () => {
  let store: MemoryStore;
  let arbiter: FactArbiter;

  beforeEach(() => {
    store = resetMemoryStore();
    arbiter = new FactArbiter(store);
  });

  describe("MemoryStore & FTS Hybrid Query", () => {
    it("initializes with seeded baseline architectural facts", () => {
      const all = store.getAll();
      expect(all.length).toBeGreaterThanOrEqual(2);
      expect(all.some((f) => f.statement.includes("NormProof"))).toBe(true);
    });

    it("queries memory facts with token matching and entity boosting", () => {
      const results = store.query({ query: "NormProof rules" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].fact.statement).toContain("NormProof");
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].matchReasons.some((r) => r.includes("NormProof") || r.includes("tokens"))).toBe(true);
    });

    it("supports soft invalidation without hard deleting historical records", () => {
      const fact = store.getAll()[0];
      const success = store.invalidate(fact.id, "Deprecated rule");
      expect(success).toBe(true);

      const reloaded = store.get(fact.id);
      expect(reloaded?.status).toBe("invalidated");
      expect(reloaded?.invalidationReason).toBe("Deprecated rule");

      // Default query filters out invalidated facts
      const results = store.query({ query: fact.statement, includeInvalidated: false });
      expect(results.some((r) => r.fact.id === fact.id)).toBe(false);

      // Including invalidated returns it
      const withInvalid = store.query({ query: fact.statement, includeInvalidated: true });
      expect(withInvalid.some((r) => r.fact.id === fact.id)).toBe(true);
    });
  });

  describe("FactArbiter (Additive Conflict Arbitration)", () => {
    it("arbitrates exact duplicate as NOOP", () => {
      const existing = store.getAll()[0];
      const decision = arbiter.arbitrate({ statement: existing.statement });
      expect(decision.kind).toBe("NOOP");
      expect(decision.targetFactId).toBe(existing.id);
    });

    it("arbitrates completely new fact as ADD", () => {
      const decision = arbiter.arbitrate({
        statement: "All API route handlers must return unified ApiResponse JSON envelopes",
        category: "architecture",
      });
      expect(decision.kind).toBe("ADD");

      const applied = arbiter.applyDecision(decision);
      expect(applied).not.toBeNull();
      expect(store.get(applied!.id)?.statement).toContain("ApiResponse");
    });

    it("arbitrates contradiction as INVALIDATE and links new version", () => {
      // 1. Add initial
      const d1 = arbiter.arbitrate({
        statement: "Project uses Mocha for test execution across packages",
        category: "convention",
      });
      const initial = arbiter.applyDecision(d1);
      expect(initial).not.toBeNull();

      // 2. Contradict
      const d2 = arbiter.arbitrate({
        statement: "Project no longer uses Mocha for test execution across packages, replaced by Vitest",
        category: "convention",
      });
      expect(d2.kind).toBe("INVALIDATE");
      expect(d2.targetFactId).toBe(initial!.id);

      const replacement = arbiter.applyDecision(d2);
      expect(replacement).not.toBeNull();

      // Verify old fact is superseded and points to replacement
      const oldFact = store.get(initial!.id);
      expect(oldFact?.status).toBe("superseded");
      expect(oldFact?.supersededBy).toBe(replacement!.id);
    });
  });

  describe("Native Memory Tools Execution", () => {
    it("executes memory_retain and memory_recall tools seamlessly", async () => {
      // Retain
      const retainOut = await executeMemoryRetain({
        items: [
          {
            statement: "Database migration requires running prisma migrate deploy in CI",
            category: "constraint",
          },
        ],
      });
      expect(retainOut).toContain("[ADD]");

      // Recall
      const recallOut = await executeMemoryRecall({
        query: "prisma migrate deploy",
      });
      expect(recallOut).toContain("prisma migrate deploy");
      expect(recallOut).toContain("CONSTRAINT");
    });

    it("executes memory_edit and memory_inspect tools", async () => {
      const inspectOut = await executeMemoryInspect();
      expect(inspectOut).toContain("QuadMemory Bank Inspection");
      expect(inspectOut).toContain("Architecture:");

      const fact = store.getAll()[0];
      const editOut = await executeMemoryEdit({
        id: fact.id,
        op: "invalidate",
        reason: "Testing edit tool",
      });
      expect(editOut).toContain("INVALIDATED");
    });
  });

  describe("/memory Slash Command Integration", () => {
    it("handles /memory stats and add subcommands", async () => {
      const statsRes = await runMemoryCommand(["stats"], { cwd: process.cwd() });
      expect(statsRes.kind).toBe("local");
      expect(statsRes.output).toContain("QuadMemory Bank Inspection");

      const addRes = await runMemoryCommand(
        ["add", "Redis cache TTL is strictly 300 seconds"],
        { cwd: process.cwd() },
      );
      expect(addRes.output).toContain("[ADD]");
    });

    it("routes /memory slash command through slash router", async () => {
      const routed = await routeSlashCommand("/memory stats", { cwd: process.cwd() });
      expect(routed?.kind).toBe("local");
      if (routed?.kind === "local") {
        expect(routed.output).toContain("QuadMemory Bank Inspection");
      }
    });
  });
});
