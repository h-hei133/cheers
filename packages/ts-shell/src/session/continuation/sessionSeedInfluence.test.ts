import { describe, expect, it } from "vitest";
import { extractSeedInfluenceFromQueryResult } from "./sessionSeedInfluence.js";

describe("extractSeedInfluenceFromQueryResult", () => {
  it("reads seed influence from shared notes and coding evidence without changing verdicts", () => {
    expect(
      extractSeedInfluenceFromQueryResult({
        status: "stopped",
        response: "",
        terminalClassification: "stopped",
        terminalReason: "stopped_error",
        sharedContext: {
          notes: ["decision-trace: seed=action-result seedInfluence=ignored-explicit-target"],
        },
      }),
    ).toBe("ignored-explicit-target");
  });
});
