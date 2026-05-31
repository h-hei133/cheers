import {
  collectContinuationTransformsFromEvidence,
  inferReplaceDirectiveFromContinuationEvidence,
  parseContinuationTransformEvidence,
} from "./continuation.js";

describe("continuationTransformEvidence", () => {
  const rebindTarget = (candidatePath: string): string | undefined =>
    candidatePath.replace(/^\/workspace\//, "");

  it("parses executable transform evidence formats", () => {
    expect(parseContinuationTransformEvidence("transform:src/a.ts:old=>new")).toEqual({
      path: "src/a.ts",
      from: "old",
      to: "new",
    });
    expect(
      parseContinuationTransformEvidence("replan-transform:src/a.ts:old=>new"),
    ).toEqual({
      path: "src/a.ts",
      from: "old",
      to: "new",
    });
    expect(
      parseContinuationTransformEvidence(
        "rebind-transform:src/a.ts:wrong=>bad->old=>new",
      ),
    ).toEqual({
      path: "src/a.ts",
      from: "old",
      to: "new",
    });
  });

  it("does not consume stale blocker evidence as executable transform proof", () => {
    expect(
      parseContinuationTransformEvidence(
        "rebind-blocker:src/a.ts:stale-transform-already-applied:old=>new",
      ),
    ).toBeUndefined();
  });

  it("infers the newest matching transform for a target", () => {
    expect(
      inferReplaceDirectiveFromContinuationEvidence({
        evidence: [
          "transform:src/a.ts:a=>b",
          "transform:src/b.ts:b=>c",
          "replan-transform:src/a.ts:c=>d",
        ],
        preferredTarget: "src/a.ts",
        workspaceRoot: "/workspace",
        rebindTarget,
      }),
    ).toEqual({ from: "c", to: "d" });
  });

  it("collects matching transforms with rebound paths", () => {
    expect(
      collectContinuationTransformsFromEvidence({
        evidence: [
          "transform:/workspace/src/a.ts:a=>b",
          "transform:src/b.ts:b=>c",
        ],
        preferredTarget: "src/a.ts",
        workspaceRoot: "/workspace",
        rebindTarget,
      }),
    ).toEqual([{ path: "src/a.ts", from: "a", to: "b" }]);
  });
});
