import { describe, expect, it } from "vitest";

import { shouldBuildContextPlanningSurface } from "./contextPlanningIntent.js";

describe("contextPlanningIntent", () => {
  it("detects explicit context packet planning requests", () => {
    expect(
      shouldBuildContextPlanningSurface(
        "Read src/app.ts and prepare a targeted context packet",
      ),
    ).toBe(true);
  });

  it("does not treat ordinary read prompts as context planning requests", () => {
    expect(shouldBuildContextPlanningSurface("Read src/app.ts")).toBe(false);
  });
});
