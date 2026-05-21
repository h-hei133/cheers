import { describe, expect, it } from "vitest";
import { projectExactHunkResultSummary } from "./exactHunkResult.js";

describe("exactHunkResult", () => {
  it("summarizes changed failed and unattempted hunk counts without content", () => {
    const summary = projectExactHunkResultSummary({
      hunkCount: 5,
      fileResults: [
        { status: "written", hunkCount: 2 },
        { status: "failed", hunkCount: 1 },
        { status: "not-run", hunkCount: 2 },
      ],
      failedFiles: [{ hunkIds: ["h3"] }],
      unattemptedFiles: [{ hunkIds: ["h4", "h5"] }],
    });

    expect(summary).toMatchObject({
      changedHunkCount: 2,
      failedHunkCount: 1,
      unattemptedHunkCount: 2,
      redactionStatus: "raw-content-excluded",
    });
    expect(summary.evidence).toContain("exact-hunk-result:raw-content-excluded");
  });
});
