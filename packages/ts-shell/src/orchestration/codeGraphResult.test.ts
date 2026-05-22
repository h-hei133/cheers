import { describe, expect, it } from "vitest";

import { buildCodeGraphImpact } from "./codeGraphImpact.js";
import { normalizeCodeGraphFacts } from "./codeGraphFacts.js";
import { buildCodeGraphResult } from "./codeGraphResult.js";
import { buildCodeGraphTrace } from "./codeGraphTrace.js";
import { buildContextGraph } from "./contextGraph.js";

describe("buildCodeGraphResult", () => {
  it("renders replay-safe result surface evidence for impact queries", () => {
    const graph = buildContextGraph({
      rootTarget: "src/app.ts",
      nodes: [
        node("root-target", "src/app.ts", 0),
        node("nearby-test", "src/app.test.ts", 1),
      ],
      edges: [
        { fromPathLabel: "src/app.ts", toPathLabel: "src/app.test.ts", kind: "tests", reason: "tests" },
      ],
    });
    const trace = buildCodeGraphTrace({ graph, facts: normalizeCodeGraphFacts({ graph }) });
    const impact = buildCodeGraphImpact({ trace });

    const result = buildCodeGraphResult({ trace, impact });

    expect(result.outcome).toBe("test-impact-candidates-available");
    expect(result.output).toContain("Mutation authority: not-granted");
    expect(result.output).not.toContain("RAW_SECRET");
    expect(result.evidence).toContain("code-graph-result:raw-content-excluded");
  });
});

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
