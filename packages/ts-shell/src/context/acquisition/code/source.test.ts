import { expect, it } from "vitest";
import { contextResultSourceFacts, normalizeRuntimeSourceFacts, sourceFactsForTargets } from "./source.js";

it("does not manufacture facts from a successful tool description", () => {
  expect(contextResultSourceFacts({ toolId: "read", paths: ["app.ts"], diagnosticSummary: "Read successfully." })).toEqual([]);
});

it("keeps full path and fact identities when long prefixes coincide", () => {
  const prefix = "directory/".repeat(25);
  const id = "fact:" + "a".repeat(220);
  const facts = normalizeRuntimeSourceFacts([
    { factId: id + "one", path: prefix + "one.ts", summary: "First fact", confidence: "high" },
    { factId: id + "two", path: prefix + "two.ts", summary: "Second fact", confidence: "high" },
  ]);
  expect(facts).toHaveLength(2);
  expect(sourceFactsForTargets({ facts, targetFiles: [prefix + "two.ts"] }).map(fact => fact.factId)).toEqual([id + "two"]);
  expect(sourceFactsForTargets({ facts, targetFiles: [], sourceFactIds: [id + "one"] }).map(fact => fact.path)).toEqual([prefix + "one.ts"]);
});

it("does not confuse distinct filenames with repeated spaces", () => {
  const facts = [{ factId: "one", path: "src/two  words.ts", summary: "Checked", confidence: "high" as const }];
  expect(sourceFactsForTargets({ facts, targetFiles: ["src/two words.ts"] })).toEqual([]);
  expect(sourceFactsForTargets({ facts, targetFiles: ["src/two  words.ts"] })).toHaveLength(1);
});

it("normalizes separators, discards empty evidence and publishes immutable facts", () => {
  const facts = normalizeRuntimeSourceFacts([
    { factId: "one", path: "src\\app.ts", summary: "  checked\n fact  ", confidence: "medium" },
    { factId: "empty", path: "", summary: "Missing path", confidence: "high" },
  ]);
  expect(facts).toEqual([{ factId: "one", path: "src/app.ts", summary: "checked fact", confidence: "medium" }]);
  expect(Object.isFrozen(facts)).toBe(true);
  expect(Object.isFrozen(facts[0])).toBe(true);
});
