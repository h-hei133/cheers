import { describe, expect, it } from "vitest";

import { normalizeCodeGraphFacts } from "./codeGraphFacts.js";
import { queryCodeGraphTrace } from "./codeGraphQuery.js";
import { buildCodeGraphTrace } from "./codeGraphTrace.js";
import { buildContextGraph } from "./contextGraph.js";

describe("queryCodeGraphTrace", () => {
  it("answers bounded test docs call-site and import queries from trace facts only", () => {
    const trace = buildTrace();

    expect(queryCodeGraphTrace({ trace, type: "tests-for-target", target: "src/app.ts" }).candidates)
      .toEqual([expect.objectContaining({ safeLabel: "src/app.test.ts" })]);
    expect(queryCodeGraphTrace({ trace, type: "docs-for-target", target: "src/app.ts" }).candidates)
      .toEqual([expect.objectContaining({ safeLabel: "README.md" })]);
    expect(queryCodeGraphTrace({ trace, type: "call-sites-for-symbol", target: "src/app.ts" }).candidates)
      .toEqual([expect.objectContaining({ safeLabel: "src/main.ts" })]);
    expect(queryCodeGraphTrace({ trace, type: "imports-for-target", target: "src/app.ts" }).candidates)
      .toEqual([expect.objectContaining({ safeLabel: "src/lib.ts" })]);
  });
});

function buildTrace() {
  const graph = buildContextGraph({
    rootTarget: "src/app.ts",
    nodes: [
      node("root-target", "src/app.ts", 0),
      node("direct-import", "src/lib.ts", 1),
      node("nearby-test", "src/app.test.ts", 1),
      node("docs-readme", "README.md", 1),
      node("reverse-call-site", "src/main.ts", 1),
    ],
    edges: [
      { fromPathLabel: "src/app.ts", toPathLabel: "src/lib.ts", kind: "imports", reason: "imports" },
      { fromPathLabel: "src/app.ts", toPathLabel: "src/app.test.ts", kind: "tests", reason: "tests" },
      { fromPathLabel: "src/app.ts", toPathLabel: "README.md", kind: "documents", reason: "docs" },
      { fromPathLabel: "src/app.ts", toPathLabel: "src/main.ts", kind: "calls-or-references", reason: "uses" },
    ],
  });
  return buildCodeGraphTrace({ graph, facts: normalizeCodeGraphFacts({ graph }) });
}

function node(
  kind: Parameters<typeof buildContextGraph>[0]["nodes"][number]["kind"],
  pathLabel: string,
  depth: 0 | 1 | 2,
): Parameters<typeof buildContextGraph>[0]["nodes"][number] {
  return {
    kind,
    pathLabel,
    relation: kind,
    sourceKind: "target-packet",
    depth,
    reason: kind,
    budgetStatus: "included",
    confidence: "high",
    redactionStatus: "redacted-and-budgeted",
  };
}
