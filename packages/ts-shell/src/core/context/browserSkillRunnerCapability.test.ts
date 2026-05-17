import { describe, expect, it } from "vitest";
import {
  browserSkillRunnerAllowedActions,
  browserSkillRunnerBlockedActions,
  normalizeBrowserSkillRunnerCapabilities,
} from "./browserSkillRunnerCapability.js";

describe("browser skill runner capability", () => {
  it("normalizes safe read-only and local actions deterministically", () => {
    const capabilities = normalizeBrowserSkillRunnerCapabilities([
      "snapshot",
      "extract",
      "navigate",
      "observe",
    ]);

    expect(capabilities.map((item) => item.actionKind)).toEqual([
      "observe",
      "extract",
      "navigate-local",
    ]);
    expect(browserSkillRunnerAllowedActions(capabilities)).toEqual([
      "observe",
      "extract",
      "navigate-local",
    ]);
  });

  it("classifies unsafe capabilities as blocked metadata-only claims", () => {
    const capabilities = normalizeBrowserSkillRunnerCapabilities([
      "auth",
      "payment",
      "evaluate",
      "download",
    ]);

    expect(capabilities.every((item) => item.execution === "metadata-only")).toBe(true);
    expect(browserSkillRunnerBlockedActions(capabilities)).toEqual([
      "auth",
      "payment",
      "arbitrary-js",
      "download",
    ]);
  });
});
