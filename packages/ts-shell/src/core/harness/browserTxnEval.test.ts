import { describe, expect, it } from "vitest";
import { runBrowserTxnGoldenEval } from "./browserTxnEval.js";
import { browserTxnGoldenCases } from "./browserTxnGolden.js";
import { disabledBrowserRuntimeStatus } from "./browserAgentFixtures.js";

describe("Route 130 browser transaction golden eval", () => {
  it("reports deterministic skipped cases when the real runtime is unavailable", async () => {
    const result = await runBrowserTxnGoldenEval({
      runtimeStatus: disabledBrowserRuntimeStatus(),
    });

    expect(result.cases).toHaveLength(browserTxnGoldenCases.length);
    expect(result.status).toBe("pass");
    expect(result.evidence).toContain(`browser-txn-eval:case-count:${browserTxnGoldenCases.length}`);
    expect(result.cases.filter((entry) => entry.mode === "skipped").length).toBeGreaterThan(0);
    expect(result.cases.find((entry) => entry.caseId === "observe-extract-rendered-text")?.outcome).toBe("skip");
    expect(JSON.stringify(result)).not.toContain("<main");
  });

  it("executes injected pre-runtime policy cases without provider or public web access", async () => {
    const result = await runBrowserTxnGoldenEval({
      runtimeStatus: disabledBrowserRuntimeStatus(),
      cases: browserTxnGoldenCases.filter((entry) => entry.mode !== "real"),
    });

    expect(result.status).toBe("pass");
    expect(result.cases.map((entry) => entry.caseId)).toEqual([
      "low-confidence-stopped-before-action",
      "policy-blocked-before-adapter",
      "runtime-unavailable-skipped",
    ]);
    expect(result.cases.find((entry) => entry.caseId === "policy-blocked-before-adapter")?.reasonCode)
      .toBe("policy-blocked");
    expect(JSON.stringify(result)).toContain("browser-txn-eval:no-provider-or-model-call");
  });
});
