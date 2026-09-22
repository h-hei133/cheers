import { describe, expect, it } from "vitest";
import {
  createBrowserSkillRunnerMetadata,
  validateBrowserSkillRunnerMetadata,
} from "./metadata.js";

describe("browser skill runner metadata", () => {
  it("validates explicit metadata without granting execution", () => {
    const result = validateBrowserSkillRunnerMetadata(createBrowserSkillRunnerMetadata());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metadata.execution).toBe("metadata-only");
      expect(result.metadata.dynamicDiscovery).toBe("disabled");
      expect(result.metadata.mcpLaunch).toBe("none");
      expect(result.metadata.supportedActions).toEqual(["observe", "extract", "navigate-local"]);
      expect(result.evidence).toContain("browser-skill-runner-metadata:no-raw-content");
    }
  });

  it("rejects missing contracts, dynamic discovery, and unsafe capabilities", () => {
    const metadata = createBrowserSkillRunnerMetadata({ actions: ["observe", "auth"] });
    const unsafe = validateBrowserSkillRunnerMetadata(metadata);
    const discovery = validateBrowserSkillRunnerMetadata({
      ...createBrowserSkillRunnerMetadata(),
      dynamicDiscovery: "enabled",
    });
    const rawSecret = validateBrowserSkillRunnerMetadata({
      ...createBrowserSkillRunnerMetadata(),
      skillName: "token secret browser runner",
    });

    expect(unsafe.ok).toBe(false);
    expect(unsafe.ok ? [] : unsafe.evidence).toContain(
      "browser-skill-runner-metadata:blocked-unsafe-capability",
    );
    expect(discovery.ok).toBe(false);
    expect(rawSecret.ok).toBe(false);
  });
});
