import { describe, expect, it } from "vitest";

import {
  assessHostDistributionReadiness,
  classifyDistributionReadiness,
} from "./model.js";

describe("host distribution readiness", () => {
  it("checks package smoke, host command, json shape, default-off provider, and redaction", async () => {
    const readiness = await assessHostDistributionReadiness({
      packageMetadata: {
        main: "./dist/packages/ts-shell/src/index.js",
        bin: { agents: "./dist/packages/ts-shell/src/entrypoints/cli.js" },
      },
      cliEntrypointAvailable: true,
    });

    expect(readiness.schemaVersion).toBe("host-distribution-readiness.v1");
    expect(readiness.smoke).toMatchObject({
      importable: "passed",
      cliEntrypoint: "passed",
      hostCommand: "passed",
      jsonOutput: "passed",
      defaultProviderOff: "passed",
      redaction: "passed",
    });
    expect(readiness.status).toBe("not-proven");
    expect(readiness.checks.map((check) => check.id)).toEqual([
      "package-import",
      "cli-entrypoint",
      "host-command",
      "json-output",
      "default-provider-off",
      "redaction",
      "truth-boundary",
    ]);
    expect(readiness.hostResponse.schemaVersion).toBe("host-json-response.v1");
    expect(readiness.hostResponse.terminalSuccessClaim).toBe(false);
    expect(JSON.stringify(readiness)).not.toMatch(
      /private-agents-real|RAW_OLD_TEXT_SHOULD_NOT_LEAK|RAW_NEW_TEXT_SHOULD_NOT_LEAK|oldText:RAW|newText:RAW|hidden reasoning/i,
    );
  });

  it("classifies failed, blocked, skipped, unsupported, not-proven, and passed readiness", () => {
    const item = (status: Parameters<typeof classifyDistributionReadiness>[0][number]["status"]) => ({
      id: status,
      status,
      detail: status,
      terminalSuccessClaim: false as const,
      notProvenClaims: ["terminal-success"],
    });

    expect(classifyDistributionReadiness([item("passed")])).toBe("passed");
    expect(classifyDistributionReadiness([item("skipped")])).toBe("skipped");
    expect(classifyDistributionReadiness([item("not-proven")])).toBe("not-proven");
    expect(classifyDistributionReadiness([item("unsupported")])).toBe("unsupported");
    expect(classifyDistributionReadiness([item("blocked")])).toBe("blocked");
    expect(classifyDistributionReadiness([item("failed")])).toBe("failed");
  });
});
