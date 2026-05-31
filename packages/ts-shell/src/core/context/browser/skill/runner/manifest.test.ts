import { describe, expect, it } from "vitest";
import {
  createBrowserSkillRunnerManifest,
  serializeBrowserSkillRunnerManifest,
  validateBrowserSkillRunnerManifest,
} from "./manifest.js";
import { createBrowserSkillRunnerMetadata } from "./metadata.js";

describe("browser skill runner manifest", () => {
  it("validates explicit metadata manifests and serializes deterministically", () => {
    const manifest = createBrowserSkillRunnerManifest();
    const result = validateBrowserSkillRunnerManifest(JSON.parse(serializeBrowserSkillRunnerManifest(manifest)));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.readiness.status).toBe("metadata-ready");
      expect(result.manifest.skillRunnerMetadata.execution).toBe("metadata-only");
      expect(result.evidence).toContain("browser-skill-runner-manifest:no-execution-authority");
    }
  });

  it("rejects unsafe metadata and execution authority claims", () => {
    const unsafe = createBrowserSkillRunnerManifest({
      metadata: createBrowserSkillRunnerMetadata({ actions: ["observe", "arbitrary-js"] }),
    });
    const executionClaim = {
      ...createBrowserSkillRunnerManifest(),
      skillRunnerMetadata: {
        ...createBrowserSkillRunnerMetadata(),
        execution: "enabled",
      },
    };

    expect(validateBrowserSkillRunnerManifest(unsafe).ok).toBe(false);
    expect(validateBrowserSkillRunnerManifest(executionClaim).ok).toBe(false);
  });
});
