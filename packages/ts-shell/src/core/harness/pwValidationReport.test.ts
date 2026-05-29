import { describe, expect, it } from "vitest";
import { runBrowserActionLoopExecutor } from "../context/browserActionLoopExecutor.js";
import { PwAdapter } from "../context/pwAdapter.js";
import {
  createPwValidationReport,
  failureCodeFromEvidence,
  renderPwValidationReport,
} from "../context/pwReport.js";
import type { PwRuntimeStatus } from "../context/pwRuntime.js";
import { runPwEval } from "./pwEval.js";
import {
  createInjectedPwClient,
  createPwManifestLoad,
  PW_SECRET_FIXTURE,
  PW_TIMEOUT_FIXTURE,
  pwFixtures,
  pwRequest,
} from "./pwFixtures.js";

describe("Direct Playwright validation report", () => {
  it("reports injected eval pass/fail/skip shape through the existing browser eval harness", async () => {
    const report = await runPwEval({
      runtimeStatus: readyStatus(),
      mode: "injected",
      adapter: injectedAdapter(),
    });
    const rendered = renderPwValidationReport(report);

    expect(report.status).toBe("passed");
    expect(report.passed).toBe(report.total);
    expect(report.entries.map((entry) => entry.mode)).toEqual(expect.arrayContaining(["injected"]));
    expect(report.entries.every((entry) => entry.cleanupStatus === "closed")).toBe(true);
    expect(report.entries.every((entry) => entry.redactionStatus === "safe-summary")).toBe(true);
    expect(rendered).toContain("tool-server backend: optional-not-default");
    expect(rendered).toContain("Provider/model call: none");
    expect(rendered).not.toContain("<main>");
  });

  it("reports binary-missing as stable skipped eval entries", async () => {
    const report = await runPwEval({
      runtimeStatus: binaryMissingStatus(),
      mode: "skipped",
    });

    expect(report.status).toBe("skipped");
    expect(report.skipped).toBe(report.total);
    expect(report.entries.every((entry) => entry.reasonCode === "runtime-binary-missing")).toBe(true);
    expect(report.entries.every((entry) => entry.durationBudget === "not-run")).toBe(true);
  });

  it("classifies timeout and cleanup evidence with runtime failure taxonomy", async () => {
    const result = await runBrowserActionLoopExecutor({
      request: pwRequest("observe", "timeout", undefined, PW_TIMEOUT_FIXTURE),
      manifestLoad: createPwManifestLoad(),
      executor: injectedAdapter(),
    });

    expect(result.executorResult?.evidence).toContain("pw-evidence:failure:navigation-timeout");
    expect(failureCodeFromEvidence(result.executorResult?.evidence ?? [])).toBe("navigation-timeout");
    expect(result.executorResult?.evidence).toContain("pw-evidence:cleanup:closed");
  });

  it("keeps raw DOM, hidden values, typed values, and browser storage out of reports", async () => {
    const secret = await runBrowserActionLoopExecutor({
      request: pwRequest("observe", "redaction", undefined, PW_SECRET_FIXTURE),
      manifestLoad: createPwManifestLoad(),
      executor: injectedAdapter(),
    });
    const typed = await runBrowserActionLoopExecutor({
      request: pwRequest("type", "Safe note", "secret typed value"),
      manifestLoad: createPwManifestLoad(),
      executor: injectedAdapter(),
    });
    const report = createPwValidationReport({
      runtimeStatus: readyStatus(),
      entries: [],
      toolServerBackend: "optional-not-default",
    });
    const serialized = JSON.stringify(secret.receipt) +
      JSON.stringify(secret.observation) +
      JSON.stringify(typed.receipt) +
      JSON.stringify(typed.observation) +
      JSON.stringify(report);

    expect(secret.receipt.redactions).toEqual(expect.arrayContaining([
      "browser-storage-redacted",
      "hidden-input-redacted",
      "secret-looking-field",
    ]));
    expect(typed.receipt.redactions).toContain("typed-value-redacted");
    expect(serialized).not.toContain("<main>");
    expect(serialized).not.toContain("sk-route126SECRET");
    expect(serialized).not.toContain("secret typed value");
    expect(serialized).not.toContain("session-cookie");
    expect(serialized).not.toContain("stored-secret");
  });
});

function injectedAdapter(): PwAdapter {
  return new PwAdapter({
    status: readyStatus(),
    fixtures: pwFixtures,
    injectedClient: createInjectedPwClient(),
    timeoutMs: 25,
  });
}

function readyStatus(): PwRuntimeStatus {
  return {
    status: "ready",
    reasonCode: "ready",
    dependency: "playwright-core",
    packageName: "playwright-core",
    browserName: "chromium",
    executableSource: "env",
    realBrowserValidationAvailable: true,
    passiveStatusCheck: true,
    browserLaunched: false,
    providerCall: "none",
    modelCall: "none",
    mcpLaunched: false,
    reason: "Injected Direct Playwright validation runtime is available.",
    nextAction: "Run validation eval.",
    warnings: [],
    evidence: ["pw-runtime:status:ready"],
  };
}

function binaryMissingStatus(): PwRuntimeStatus {
  return {
    status: "binary-missing",
    reasonCode: "runtime-binary-missing",
    dependency: "playwright-core",
    packageName: "playwright-core",
    browserName: "chromium",
    executableSource: "playwright-cache",
    realBrowserValidationAvailable: false,
    passiveStatusCheck: true,
    browserLaunched: false,
    providerCall: "none",
    modelCall: "none",
    mcpLaunched: false,
    reason: "No Playwright-managed or common local Chromium executable is present on this machine.",
    skipReason: "playwright-browser-binary-missing",
    nextAction: "Run `npx playwright install chromium` or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.",
    warnings: ["pw-runtime:binary-missing"],
    evidence: ["pw-runtime:status:binary-missing"],
  };
}
