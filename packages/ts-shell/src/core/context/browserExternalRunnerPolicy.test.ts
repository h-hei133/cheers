import { describe, expect, it } from "vitest";
import { decideBrowserExternalRunnerPolicy } from "./browserExternalRunnerPolicy.js";

describe("browser external runner policy", () => {
  it("blocks missing config by default", () => {
    const decision = decideBrowserExternalRunnerPolicy();

    expect(decision.status).toBe("blocked-missing-config");
    expect(decision.allowed).toBe(false);
    expect(decision.evidence).toContain("browser-external-runner-policy:no-default-process-spawn");
  });

  it("allows explicit local/test manifest config", () => {
    const decision = decideBrowserExternalRunnerPolicy({
      source: "cli-harness-manifest",
      runnerId: "cli-harness:playwright-local",
      executorMode: "playwright-local",
      fixtureScope: "local-fixture-only",
      sandboxAuthority: "local-fixture",
      allowlist: "none",
      evidenceRedactionMode: "safe-summary-only",
    });

    expect(decision.status).toBe("allowed");
    expect(decision.allowed).toBe(true);
    expect(decision.runnerId).toBe("cli-harness:playwright-local");
  });

  it("blocks unsafe external scope and redacts runner ids", () => {
    const decision = decideBrowserExternalRunnerPolicy({
      source: "explicit-local-config",
      runnerId: "runner sk-testsecret123",
      executorMode: "playwright-local",
      fixtureScope: "external",
      sandboxAuthority: "external",
      allowlist: "external",
      evidenceRedactionMode: "raw",
    });

    expect(decision.status).toBe("blocked-unsafe-source");
    expect(decision.allowed).toBe(false);
    expect(decision.runnerId).not.toContain("sk-testsecret123");
  });

  it("keeps skill-managed as a future explicit bridge", () => {
    const decision = decideBrowserExternalRunnerPolicy({
      source: "skill-managed",
      runnerId: "skill:playwright",
      executorMode: "playwright-local",
      fixtureScope: "local-fixture-only",
      sandboxAuthority: "local-fixture",
      allowlist: "none",
      evidenceRedactionMode: "safe-summary-only",
    });

    expect(decision.status).toBe("future-skill-required");
    expect(decision.allowed).toBe(false);
  });
});
