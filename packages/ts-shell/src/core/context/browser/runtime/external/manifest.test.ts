import { describe, expect, it } from "vitest";
import {
  createBrowserExternalRunnerManifest,
  validateBrowserExternalRunnerManifest,
} from "./manifest.js";
import { createBrowserSkillRunnerMetadata } from "../../skill/runner/metadata.js";
import { createBrowserSkillRunnerBinding } from "../../skill/runner/binding.js";

describe("browser external runner manifest", () => {
  it("validates safe test-local runner manifests", () => {
    const manifest = createBrowserExternalRunnerManifest({
      runnerCommand: {
        command: process.execPath,
        args: ["/tmp/route103-runner.cjs"],
      },
    });

    const result = validateBrowserExternalRunnerManifest(manifest);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.manifest.runnerMode : "invalid").toBe("test-local");
  });

  it("rejects unsafe global/default runner and external network content", () => {
    const manifest = createBrowserExternalRunnerManifest({
      runnerCommand: {
        command: "playwright",
        args: ["mcp", "https://example.com"],
      },
    });

    const result = validateBrowserExternalRunnerManifest(manifest);

    expect(result.ok).toBe(false);
  });

  it("accepts explicit skill-managed metadata and rejects unsafe capability claims", () => {
    const manifest = createBrowserExternalRunnerManifest({
      source: "skill-managed",
      runnerMode: "skill-managed",
      runnerId: "skill:browser-runner",
      runnerRef: "skill:browser-runner",
      skillRunnerMetadata: createBrowserSkillRunnerMetadata(),
    });
    const unsafe = createBrowserExternalRunnerManifest({
      source: "skill-managed",
      runnerMode: "skill-managed",
      runnerId: "skill:browser-runner",
      runnerRef: "skill:browser-runner",
      skillRunnerMetadata: createBrowserSkillRunnerMetadata({
        actions: ["observe", "auth"],
      }),
    });

    expect(validateBrowserExternalRunnerManifest(manifest).ok).toBe(true);
    expect(validateBrowserExternalRunnerManifest(unsafe).ok).toBe(false);
  });

  it("accepts explicit skill runner binding only when it matches metadata", () => {
    const metadata = createBrowserSkillRunnerMetadata({
      runnerId: "skill:browser-runner",
      skillId: "skill:browser-runner",
    });
    const manifest = createBrowserExternalRunnerManifest({
      source: "skill-managed",
      runnerMode: "skill-managed",
      runnerId: "skill:browser-runner",
      runnerRef: "skill:browser-runner",
      skillRunnerMetadata: metadata,
      skillRunnerBinding: createBrowserSkillRunnerBinding({
        metadata,
        runnerCommand: {
          command: process.execPath,
          args: ["/tmp/route106-skill-runner.cjs"],
        },
      }),
    });
    const mismatch = {
      ...manifest,
      skillRunnerBinding: {
        ...manifest.skillRunnerBinding,
        skillRunnerId: "skill:other",
      },
    };

    expect(validateBrowserExternalRunnerManifest(manifest).ok).toBe(true);
    expect(validateBrowserExternalRunnerManifest(mismatch).ok).toBe(false);
  });
});
