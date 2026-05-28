import { describe, expect, it } from "vitest";

import { buildCliApplyPatchRuntimeRouteOptions } from "./cliRuntimeInvocationBridge.js";

describe("CLI runtime invocation bridge", () => {
  it("does not create apply_patch runtime route options without explicit opt-in", () => {
    expect(
      buildCliApplyPatchRuntimeRouteOptions({
        options: {
          applyPatchRuntimeRoute: false,
          applyPatchWorkspaceWrite: false,
          nonInteractiveApproval: undefined,
        },
      }),
    ).toBeUndefined();
  });

  it("preserves runtime opt-in separately from workspace write opt-in", () => {
    expect(
      buildCliApplyPatchRuntimeRouteOptions({
        options: {
          applyPatchRuntimeRoute: true,
          applyPatchWorkspaceWrite: false,
          nonInteractiveApproval: "allow-once",
        },
      }),
    ).toEqual({
      explicitRuntimeOptIn: true,
      requestedUserDecision: "approved",
      runtimeSource: "production-adjacent",
    });

    expect(
      buildCliApplyPatchRuntimeRouteOptions({
        options: {
          applyPatchRuntimeRoute: false,
          applyPatchWorkspaceWrite: true,
          nonInteractiveApproval: "deny",
        },
      }),
    ).toEqual({
      explicitRuntimeOptIn: true,
      requestedUserDecision: "denied",
      runtimeSource: "production-adjacent",
      workspaceWrite: {
        explicitWorkspaceWriteOptIn: true,
      },
    });
  });
});
