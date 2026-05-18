import type { PwRuntimeStatus } from "../context/pwRuntime.js";

export function disabledBrowserRuntimeStatus(
  reasonCode: PwRuntimeStatus["reasonCode"] = "runtime-disabled",
): PwRuntimeStatus {
  return {
    status: "disabled",
    reasonCode,
    dependency: "none",
    browserName: "chromium",
    executableSource: "none",
    realBrowserValidationAvailable: false,
    passiveStatusCheck: true,
    browserLaunched: false,
    providerCall: "none",
    modelCall: "none",
    mcpLaunched: false,
    reason: "Direct Playwright runtime disabled by test fixture.",
    skipReason: "direct-playwright-disabled",
    nextAction: "Enable controlled Direct Playwright runtime before using browser tools.",
    warnings: ["browser-agent-fixture:disabled"],
    evidence: ["browser-agent-fixture:disabled"],
  };
}

export function readyBrowserRuntimeStatus(): PwRuntimeStatus {
  return {
    status: "ready",
    reasonCode: "ready",
    dependency: "playwright-core",
    packageName: "playwright-core",
    browserName: "chromium",
    executablePath: "/controlled/test/chromium",
    executableSource: "playwright-cache",
    realBrowserValidationAvailable: true,
    passiveStatusCheck: true,
    browserLaunched: false,
    providerCall: "none",
    modelCall: "none",
    mcpLaunched: false,
    reason: "Direct Playwright runtime ready by policy-only test fixture.",
    nextAction: "Run controlled Direct Playwright browser tools.",
    warnings: ["browser-agent-fixture:ready"],
    evidence: ["browser-agent-fixture:ready"],
  };
}
