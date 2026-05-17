import { describe, expect, it } from "vitest";
import { decideBrowserRuntimeDependencyPolicy } from "./browserRuntimeDependencyPolicy.js";

describe("browser runtime dependency policy", () => {
  it("recommends external runner only without mutating package state", () => {
    const policy = decideBrowserRuntimeDependencyPolicy();

    expect(policy.decision.mode).toBe("external-runner-only");
    expect(policy.decision.recommended).toBe(true);
    expect(policy.packageMutation).toBe("none");
    expect(policy.browserBinaryInstall).toBe("none");
    expect(policy.defaultBrowserExecution).toBe("disabled");
    expect(policy.decision.evidence).toContain("browser-runtime-dependency-policy:no-package-mutation");
  });

  it("documents why package dependency modes are deferred", () => {
    const policy = decideBrowserRuntimeDependencyPolicy();

    expect(policy.alternatives.map((item) => item.mode)).toEqual([
      "dev-dependency",
      "package-dependency",
      "optional-peer",
    ]);
    expect(policy.alternatives.find((item) => item.mode === "package-dependency")?.risks).toContain(
      "browser-binary-footprint",
    );
  });

  it("can express the future skill-managed preference without enabling execution", () => {
    const policy = decideBrowserRuntimeDependencyPolicy({ preferSkillManaged: true });

    expect(policy.decision.mode).toBe("skill-managed");
    expect(policy.defaultBrowserExecution).toBe("disabled");
    expect(policy.networkAccess).toBe("none");
  });
});
