import { describe, expect, it } from "vitest";

import type { StaticResourceDescriptor } from "./descriptor.js";
import { validateStaticResourceDescriptor } from "./descriptor.js";

describe("static resource projection", () => {
  it("accepts safe static descriptors and adds not-proven resource claims", () => {
    const validation = validateStaticResourceDescriptor(
      descriptor({
        id: "skill.inspect",
        kind: "skill",
        name: "Inspect",
        description: "Read-only inspection guidance.",
        capabilitiesSummary: ["read-only analysis"],
      }),
    );

    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      throw new Error("expected descriptor to validate");
    }
    expect(validation.descriptor.enabledByDefault).toBe(false);
    expect(validation.descriptor.notProvenClaims).toEqual(
      expect.arrayContaining([
        "resource-execution",
        "dynamic-discovery",
        "provider-enabled",
        "terminal-success",
      ]),
    );
  });

});

function descriptor(
  input: Partial<StaticResourceDescriptor> & Pick<StaticResourceDescriptor, "id" | "kind" | "name" | "description">,
): StaticResourceDescriptor {
  return {
    sourceType: "fixture",
    version: "0.0.0",
    ownerDomain: "runtime/resources",
    visibility: "runtime",
    enabledByDefault: false,
    requiresOptIn: false,
    capabilitiesSummary: [],
    riskLevel: "low",
    notProvenClaims: [],
    ...input,
  };
}
