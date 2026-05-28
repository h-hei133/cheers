import { describe, expect, it } from "vitest";
import { projectSessionRequestScopeContinuity } from "./sessionRequestScopeMemory.js";

describe("projectSessionRequestScopeContinuity", () => {
  it("prefers same-project memory over stale evidence project roots", () => {
    expect(
      projectSessionRequestScopeContinuity({
        evidence: [
          "current-permission-request-cache-key:/old|bash:spawn:process:npm",
          "current-permission-request-project-root:/old",
          "current-permission-request-source:verification-command",
        ],
        workingMemory: {
          continuity: {
            lastPermissionRequestCacheKey: "/repo|bash:spawn:process:npm",
            lastPermissionRequestProjectRoot: "/repo",
            lastPermissionRequestSource: "approval-request",
            lastRequestScopeCacheKey: "/repo|bash:spawn:process:npm",
            lastRequestScopeProjectRoot: "/repo",
            lastRequestScopeSource: "approval-request",
          },
        },
        sessionProjectRoot: "/repo",
      }),
    ).toMatchObject({
      lastPermissionRequestCacheKey: "/repo|bash:spawn:process:npm",
      lastPermissionRequestProjectRoot: "/repo",
      lastPermissionRequestSource: "approval-request",
      lastRequestScopeCacheKey: "/repo|bash:spawn:process:npm",
      lastRequestScopeProjectRoot: "/repo",
      lastRequestScopeSource: "approval-request",
    });
  });
});
