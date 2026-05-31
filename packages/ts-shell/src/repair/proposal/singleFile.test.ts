import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  extractSingleFileEditFailureReason,
  resolveSingleFileEditFailureRepairContext,
  resolveSingleFileEditFailureRepairContextAbandonment,
  resolveSingleFileEditRepairPayloadKind,
} from "./singleFile.js";

describe("singleFileRepairPlanning", () => {
  const workspaceRoot = path.resolve("/tmp/workflow-repair");

  it("extracts stable single-file edit failure reasons from evidence", () => {
    expect(
      extractSingleFileEditFailureReason({
        lastFailure: "patch-from-not-found: source missing",
      }),
    ).toBe("patch-from-not-found");
  });

  it("recovers one repair target without treating repair plan as success", () => {
    const context = resolveSingleFileEditFailureRepairContext(
      {
        lastTaskKind: "edit-file",
        lastFailure: "patch-ambiguous",
        recentFailedFiles: [{ path: "src/app.ts", reason: "patch-ambiguous" }],
      },
      workspaceRoot,
    );

    expect(context).toEqual({
      failureReason: "patch-ambiguous",
      targetPath: "src/app.ts",
    });
  });

  it("records multiple failed target abandonment", () => {
    const abandonment = resolveSingleFileEditFailureRepairContextAbandonment(
      {
        lastTaskKind: "edit-file",
        lastFailure: "patch-ambiguous",
        recentFailedFiles: [
          { path: "src/a.ts", reason: "patch-ambiguous" },
          { path: "src/b.ts", reason: "patch-ambiguous" },
        ],
      },
      workspaceRoot,
    );

    expect(abandonment).toEqual({
      reason: "multiple-failed-targets",
      failureReason: "patch-ambiguous",
      failedTargetCandidates: ["src/a.ts", "src/b.ts"],
    });
  });

  it("classifies repair payloads without claiming repair success", () => {
    expect(
      resolveSingleFileEditRepairPayloadKind({
        failureReason: "patch-from-not-found",
        prompt: "replace old with new",
        hasEditIntent: true,
        replaceDirective: { from: "old", to: "new" },
      }),
    ).toBe("replace-directive");

    expect(
      resolveSingleFileEditRepairPayloadKind({
        failureReason: "edit-target-missing",
        prompt: "edit src/app.ts replace old with new",
        hasEditIntent: true,
        replaceDirective: { from: "old", to: "new" },
      }),
    ).toBe("target-path-with-transform");
  });
});
