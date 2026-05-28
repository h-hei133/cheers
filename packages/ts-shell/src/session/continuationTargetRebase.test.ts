import { describe, expect, it } from "vitest";

import {
  isUsableContinuationTargetPath,
  rebindContinuationTargetToWorkspace,
} from "./continuationTargetRebase.js";

describe("continuationTargetRebase", () => {
  it("rejects placeholder continuation targets", () => {
    expect(isUsableContinuationTargetPath("(missing-target)")).toBe(false);
    expect(isUsableContinuationTargetPath("(workspace)")).toBe(false);
    expect(isUsableContinuationTargetPath("src/a.ts")).toBe(true);
  });

  it("keeps usable relative continuation targets workspace-relative", () => {
    expect(
      rebindContinuationTargetToWorkspace("./src/a.ts", "/tmp/current-workspace"),
    ).toBe("src/a.ts");
  });
});
