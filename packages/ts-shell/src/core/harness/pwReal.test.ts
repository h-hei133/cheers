import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { runBrowserActionLoopExecutor } from "../context/browserActionLoopExecutor.js";
import { PwAdapter } from "../context/pwAdapter.js";
import { getPwRuntimeStatus, importPwRuntime, type PwRuntimeModule, type PwRuntimeStatus } from "../context/pwRuntime.js";
import {
  createPwManifestLoad,
  PW_JS_FIXTURE,
  PW_STATIC_FIXTURE,
  PW_TIMEOUT_FIXTURE,
  pwFixtures,
  pwRequest,
} from "./pwFixtures.js";

const REAL_BROWSER_SKIP_REASON = detectRealBrowserSkipReason();
const realBrowserIt = REAL_BROWSER_SKIP_REASON
  ? it.skipIf(true)
  : it;

describe("Route 126 real Direct Playwright runtime", () => {
  it("reports explicit real-browser availability or skip reason", async () => {
    const runtime = await realRuntime();
    if (!runtime.ready) {
      expect(runtime.status.skipReason).toBe(REAL_BROWSER_SKIP_REASON);
      return;
    }
    expect(REAL_BROWSER_SKIP_REASON).toBeUndefined();
    expect(runtime.status.status).toBe("ready");
  });

  realBrowserIt(`real observe on local fixture${REAL_BROWSER_SKIP_REASON ? ` skipped: ${REAL_BROWSER_SKIP_REASON}` : ""}`, async () => {
    const runtime = await readyRuntime();
    const result = await runReal(runtime, pwRequest("observe", "static", undefined, PW_STATIC_FIXTURE));

    expect(result.receipt.executed).toBe(true);
    expect(result.receipt.browserLaunched).toBe(true);
    expect(result.observation?.textSummary).toContain("Static fixture ready");
  });

  realBrowserIt(`real JS-rendered text${REAL_BROWSER_SKIP_REASON ? ` skipped: ${REAL_BROWSER_SKIP_REASON}` : ""}`, async () => {
    const runtime = await readyRuntime();
    const result = await runReal(runtime, pwRequest("extract", "js rendered", undefined, PW_JS_FIXTURE));

    expect(result.receipt.executed).toBe(true);
    expect(result.observation?.textSummary).toContain("JS rendered Playwright route ready");
  });

  realBrowserIt(`real click result${REAL_BROWSER_SKIP_REASON ? ` skipped: ${REAL_BROWSER_SKIP_REASON}` : ""}`, async () => {
    const runtime = await readyRuntime();
    const result = await runReal(runtime, pwRequest("click", "Save draft"));

    expect(result.receipt.executed).toBe(true);
    expect(result.observation?.textSummary).toContain("Clicked Save draft");
  });

  realBrowserIt(`real type result redacts value${REAL_BROWSER_SKIP_REASON ? ` skipped: ${REAL_BROWSER_SKIP_REASON}` : ""}`, async () => {
    const runtime = await readyRuntime();
    const result = await runReal(runtime, pwRequest("type", "Safe note", "secret typed value"));
    const serialized = JSON.stringify(result.receipt) + JSON.stringify(result.observation);

    expect(result.receipt.executed).toBe(true);
    expect(result.observation?.textSummary).toContain("Updated Safe note");
    expect(result.receipt.redactions).toContain("typed-value-redacted");
    expect(serialized).not.toContain("secret typed value");
  });

  realBrowserIt(`real timeout still cleans up${REAL_BROWSER_SKIP_REASON ? ` skipped: ${REAL_BROWSER_SKIP_REASON}` : ""}`, async () => {
    const runtime = await readyRuntime();
    const result = await runReal(runtime, pwRequest("observe", "timeout", undefined, PW_TIMEOUT_FIXTURE), 50);

    expect(result.receipt.executed).toBe(true);
    expect(result.executorResult?.status).toBe("failed");
    expect(result.executorResult?.evidence).toContain("pw-evidence:cleanup:closed");
  });
});

async function realRuntime(): Promise<
  | { readonly ready: true; readonly status: PwRuntimeStatus; readonly runtimeModule: PwRuntimeModule }
  | { readonly ready: false; readonly status: PwRuntimeStatus }
> {
  const status = await getPwRuntimeStatus();
  if (status.status !== "ready") {
    return { ready: false, status };
  }
  const imported = await importPwRuntime();
  if (!imported.ok) {
    return { ready: false, status: { ...status, status: "package-missing", skipReason: "playwright-package-missing" } };
  }
  return { ready: true, status, runtimeModule: imported.module };
}

async function readyRuntime(): Promise<Extract<Awaited<ReturnType<typeof realRuntime>>, { readonly ready: true }>> {
  const runtime = await realRuntime();
  if (!runtime.ready) {
    throw new Error(runtime.status.skipReason ?? runtime.status.reason);
  }
  return runtime;
}

function detectRealBrowserSkipReason(): "playwright-package-missing" | "playwright-browser-binary-missing" | undefined {
  const require = createRequire(import.meta.url);
  try {
    const runtime = require("playwright-core") as PwRuntimeModule;
    const executablePath = runtime.chromium?.executablePath();
    return executablePath && existsSync(executablePath) ? undefined : "playwright-browser-binary-missing";
  } catch {
    return "playwright-package-missing";
  }
}

async function runReal(
  runtime: Extract<Awaited<ReturnType<typeof realRuntime>>, { readonly ready: true }>,
  request: ReturnType<typeof pwRequest>,
  timeoutMs = 1_500,
) {
  return runBrowserActionLoopExecutor({
    request,
    manifestLoad: createPwManifestLoad(),
    executor: new PwAdapter({
      status: runtime.status,
      runtimeModule: runtime.runtimeModule,
      fixtures: pwFixtures,
      timeoutMs,
    }),
  });
}
