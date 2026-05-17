import { describe, expect, it } from "vitest";
import {
  createBrowserExternalRunnerManifest,
  validateBrowserExternalRunnerManifest,
} from "./browserExternalRunnerManifest.js";

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
});
