import { describe, expect, it } from "vitest";
import { decideBrowserSkillManagedRunnerPolicy } from "./browserSkillManagedRunnerPolicy.js";

describe("browser skill-managed runner policy", () => {
  it("blocks without explicit metadata", () => {
    const decision = decideBrowserSkillManagedRunnerPolicy();

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("future-skill-required");
  });

  it("blocks dynamic discovery", () => {
    const decision = decideBrowserSkillManagedRunnerPolicy({
      dynamicDiscoveryRequested: true,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("blocked-dynamic-discovery");
  });
});
