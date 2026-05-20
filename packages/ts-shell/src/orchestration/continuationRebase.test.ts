import { describe, expect, it } from "vitest";
import { resolveContinuationRebase } from "./continuationRebase.js";

describe("continuationRebase", () => {
  it("adds continuation-safe target summaries without changing rebase status", () => {
    const resolution = resolveContinuationRebase({
      priorPath: "/legacy/src/old.ts",
      workspaceRoot: "/workspace",
      candidates: ["src/new.ts"],
    });

    expect(resolution).toMatchObject({
      status: "rebased",
      targetPath: "src/new.ts",
      reason: "single deterministic candidate selected",
      targetSummary: {
        status: "relocated",
        targetLabel: "src/new.ts",
      },
    });
  });

  it("keeps ambiguous rebase stopped with candidate labels", () => {
    const resolution = resolveContinuationRebase({
      priorPath: "/legacy/src/old.ts",
      workspaceRoot: "/workspace",
      candidates: ["src/a.ts", "src/b.ts"],
    });

    expect(resolution.status).toBe("ambiguous");
    expect(resolution.targetSummary.transcriptSummary).toContain("src/a.ts");
    expect(resolution.targetSummary.transcriptSummary).toContain("src/b.ts");
  });
});
