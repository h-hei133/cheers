import { describe, expect, it } from "vitest";

import { projectResourceTrustPolicy, type ResourceTrustLevel } from "./resourceTrustPolicy.js";

describe("resource trust policy projection", () => {
  it("represents trust levels without granting load or execution authority", () => {
    const trustLevels: readonly ResourceTrustLevel[] = [
      "trusted",
      "user_approved",
      "project_declared",
      "untrusted",
      "blocked",
      "unknown",
    ];

    const projections = trustLevels.map((trustLevel) =>
      projectResourceTrustPolicy({
        sourceKind: "external",
        sourceLabel: `package ${trustLevel}`,
        scope: "project",
        trustLevel,
      }),
    );

    expect(projections.map((projection) => projection.trustLevel)).toEqual(trustLevels);
    expect(projections.every((projection) => projection.canLoadPackage === false)).toBe(true);
    expect(projections.every((projection) => projection.canExecutePlugin === false)).toBe(true);
    expect(projections.every((projection) => projection.canEnableProvider === false)).toBe(true);
    expect(projections.every((projection) => projection.trustIsSafetyProof === false)).toBe(true);
    expect(projections.flatMap((projection) => projection.notProvenClaims)).toEqual(
      expect.arrayContaining(["trust-verification", "terminal-success"]),
    );
  });

  it("redacts unsafe source labels", () => {
    const projection = projectResourceTrustPolicy({
      sourceKind: "external",
      sourceLabel:
        "provider.env=/home/wang/.private-agents-real/provider.env Authorization: Bearer abc raw provider output: hidden",
      scope: "user",
      trustLevel: "unknown",
    });
    const serialized = JSON.stringify(projection);

    expect(projection.redaction.status).toBe("redacted");
    expect(serialized).not.toMatch(
      /private-agents-real|provider\.env|Bearer abc|raw provider output/i,
    );
    expect(serialized).not.toContain('"success":true');
  });
});
