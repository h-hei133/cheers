import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildNoWriteRuntimeRoute } from "./noWriteRuntimeRoute.js";
import { buildNoWriteRuntimeRouteResult } from "./runtimeRouteResult.js";

const workspaceRoot = path.resolve("D:/workspace/project");
const rawPatchText = [
  "*** Begin Patch",
  "*** Update File: src/app.ts",
  "@@",
  "-old",
  "+new",
  "*** End Patch",
].join("\n");

describe("apply_patch no-write runtime route result", () => {
  it("maps explicit runtime opt-in preview to stopped terminal output", () => {
    const route = buildNoWriteRuntimeRoute({
      workspaceRoot,
      rawPatchText,
      explicitRuntimeOptIn: true,
      requestedUserDecision: "approved",
      runtimeSource: "production-adjacent",
      readFile: () => "old\n",
    });

    const result = buildNoWriteRuntimeRouteResult({
      sessionId: "sess_apply_patch_runtime",
      prompt: rawPatchText,
      route,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.changeSet.changedFiles).toEqual([]);
    expect(result.codingResult?.changeSet.attemptedFiles).toEqual(["src/app.ts"]);
    expect(result.codingResult?.verification.status).toBe("blocked");
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-runtime-entrypoint:no-write-route-result",
        "apply-patch-runtime-entrypoint:changed-files-empty",
        "apply-patch-runtime-entrypoint:no-writer-invoked",
        "apply-patch-runtime-entrypoint:no-write-success",
      ]),
    );
    expect(JSON.stringify(result).toLowerCase()).not.toContain(
      "/home/wang/.private-agents-real",
    );
    expect(JSON.stringify(result)).not.toContain('"changedFiles":["src/app.ts"]');
  });

  it("keeps non-opt-in runtime inputs rejected before write-like display", () => {
    const route = buildNoWriteRuntimeRoute({
      workspaceRoot,
      rawPatchText,
      explicitRuntimeOptIn: false,
      runtimeSource: "production-adjacent",
      readFile: () => {
        throw new Error("readFile must not run without opt-in");
      },
    });

    const result = buildNoWriteRuntimeRouteResult({
      sessionId: "sess_apply_patch_runtime_rejected",
      prompt: rawPatchText,
      route,
    });

    expect(route.status).toBe("rejected");
    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.failedFiles[0]?.path).toBe("(apply_patch)");
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-no-write-runtime-route:explicit-opt-in-missing",
        "apply-patch-runtime-entrypoint:no-write-success",
      ]),
    );
  });
});
