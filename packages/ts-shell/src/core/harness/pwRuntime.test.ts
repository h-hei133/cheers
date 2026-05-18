import { describe, expect, it } from "vitest";
import { runBrowserActionLoopExecutor } from "../context/browserActionLoopExecutor.js";
import { runBrowserCommandAsync } from "../context/browserCommandRunner.js";
import { parseBrowserCommandArgs } from "../context/browserCommandContract.js";
import { PwAdapter } from "../context/pwAdapter.js";
import { getPwRuntimeStatus, type PwRuntimeModule } from "../context/pwRuntime.js";
import type { BrowserEvalBenchmarkTask } from "./browserEvalBenchmarkModel.js";
import { createBrowserEvalBenchmarkReport } from "./browserEvalBenchmarkReport.js";
import { runBrowserEvalBenchmark } from "./browserEvalBenchmarkRunner.js";
import {
  createInjectedPwClient,
  createPwManifestLoad,
  PW_JS_FIXTURE,
  PW_SECRET_FIXTURE,
  PW_STATIC_FIXTURE,
  PW_TIMEOUT_FIXTURE,
  pwFixtures,
  pwRequest,
} from "./pwFixtures.js";

describe("Route 126 Direct Playwright runtime", () => {
  it("reports package-missing without launching a browser", async () => {
    const status = await getPwRuntimeStatus({
      importer: async () => {
        throw new Error("missing");
      },
    });

    expect(status.status).toBe("package-missing");
    expect(status.reasonCode).toBe("runtime-package-missing");
    expect(status.browserLaunched).toBe(false);
    expect(status.skipReason).toBe("playwright-package-missing");
    expect(status.evidence).toContain("pw-runtime:no-browser-launch-during-status");
  });

  it("reports binary-missing when package import works but Chromium is absent", async () => {
    const status = await getPwRuntimeStatus({
      importer: async () => fakeRuntime("/tmp/missing-route126-chromium"),
      fsExists: () => false,
    });

    expect(status.status).toBe("binary-missing");
    expect(status.dependency).toBe("playwright-core");
    expect(status.reasonCode).toBe("runtime-binary-missing");
    expect(status.executableSource).toBe("playwright-cache");
    expect(status.skipReason).toBe("playwright-browser-binary-missing");
  });

  it("honors PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH before package-managed paths", async () => {
    const status = await getPwRuntimeStatus({
      importer: async () => fakeRuntime("/tmp/missing-route127-cache-chromium"),
      fsExists: (path) => path === "/tmp/route127-env-chromium",
      env: { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: "/tmp/route127-env-chromium" },
    });

    expect(status.status).toBe("ready");
    expect(status.executablePath).toBe("/tmp/route127-env-chromium");
    expect(status.executableSource).toBe("env");
  });

  it("can use a common local Chromium path when Playwright cache is absent", async () => {
    const status = await getPwRuntimeStatus({
      importer: async () => fakeRuntime("/tmp/missing-route127-cache-chromium"),
      fsExists: (path) => path === "/usr/bin/chromium",
      env: {},
      platform: "linux",
    });

    expect(status.status).toBe("ready");
    expect(status.executablePath).toBe("/usr/bin/chromium");
    expect(status.executableSource).toBe("system-path");
  });

  it("integrates compact Direct Playwright status into /browser runtime status", async () => {
    const parsed = parseBrowserCommandArgs(["runtime", "status"]);
    const status = await getPwRuntimeStatus({
      importer: async () => fakeRuntime("/tmp/missing-route126-chromium"),
      fsExists: () => false,
    });
    const result = await runBrowserCommandAsync({
      contract: parsed.contract!,
      browserPwStatus: status,
    });

    expect(result.output).toContain("Browser runtime status");
    expect(result.output).toContain("Direct Playwright");
    expect(result.output).toContain("- Status: binary-missing");
    expect(result.output).toContain("- Reason code: runtime-binary-missing");
    expect(result.output).toContain("- Executable source: playwright-cache");
    expect(result.output).toContain("- MCP backend: optional-not-default");
    expect(result.evidence).toContain("pw-runtime:status:binary-missing");
  });

  it("runs injected observe and extract through existing receipt/provenance layers", async () => {
    const observe = await runInjected(pwRequest("observe", "static", undefined, PW_STATIC_FIXTURE));
    const extract = await runInjected(pwRequest("extract", "js rendered", undefined, PW_JS_FIXTURE));

    expect(observe.receipt.executed).toBe(true);
    expect(observe.receipt.runtimeMode).toBe("direct-playwright-core");
    expect(observe.receipt.domSnapshotId).toContain("dom:");
    expect(observe.receipt.accessibilitySnapshotId).toContain("accessibility:");
    expect(observe.receipt.provenanceId).toContain("browser-provenance:");
    expect(extract.observation?.textSummary).toContain("JS rendered Playwright route ready");
  });

  it("runs injected click and type without exposing typed values", async () => {
    const click = await runInjected(pwRequest("click", "Save draft"));
    const type = await runInjected(pwRequest("type", "Safe note", "secret typed value"));
    const serialized = JSON.stringify(type.receipt) + JSON.stringify(type.observation);

    expect(click.receipt.executed).toBe(true);
    expect(click.observation?.textSummary).toContain("Clicked Save draft");
    expect(type.receipt.executed).toBe(true);
    expect(type.observation?.textSummary).toContain("Updated Safe note");
    expect(type.receipt.redactions).toContain("typed-value-redacted");
    expect(serialized).not.toContain("secret typed value");
  });

  it("handles timeout and records cleanup evidence", async () => {
    const result = await runInjected(pwRequest("observe", "timeout", undefined, PW_TIMEOUT_FIXTURE));

    expect(result.receipt.executed).toBe(true);
    expect(result.executorResult?.status).toBe("failed");
    expect(result.executorResult?.evidence).toContain("pw-evidence:status:timed-out");
    expect(result.executorResult?.evidence).toContain("pw-evidence:cleanup:closed");
  });

  it("redacts raw DOM, hidden data, and secret-looking text from output surfaces", async () => {
    const result = await runInjected(pwRequest("observe", "secret", undefined, PW_SECRET_FIXTURE));
    const serialized = JSON.stringify(result.receipt) + JSON.stringify(result.observation);

    expect(result.receipt.redactions).toEqual(expect.arrayContaining([
      "hidden-input-redacted",
      "hidden-reasoning-label",
      "browser-storage-redacted",
      "secret-looking-field",
    ]));
    expect(serialized).not.toContain("<main>");
    expect(serialized).not.toContain("sk-route126SECRET");
    expect(serialized).not.toContain("hidden reasoning");
  });

  it("reuses the browser eval harness through the Direct Playwright adapter", async () => {
    const tasks: readonly BrowserEvalBenchmarkTask[] = [
      {
        taskId: "route126-observe",
        description: "observe controlled Direct Playwright fixture",
        request: pwRequest("observe", "static", undefined, PW_STATIC_FIXTURE),
        expectations: [{ kind: "contains", text: "Static fixture ready" }, { kind: "executed", value: true }],
      },
      {
        taskId: "route126-click",
        description: "click controlled button",
        request: pwRequest("click", "Save draft"),
        expectations: [{ kind: "contains", text: "Clicked Save draft" }, { kind: "executed", value: true }],
      },
      {
        taskId: "route126-type",
        description: "type controlled value",
        request: pwRequest("type", "Safe note", "secret typed value"),
        expectations: [{ kind: "contains", text: "Updated Safe note" }, { kind: "executed", value: true }],
      },
    ];
    const scores = await runBrowserEvalBenchmark({
      tasks,
      manifestLoad: createPwManifestLoad(),
      executor: createInjectedAdapter(),
    });
    const report = createBrowserEvalBenchmarkReport(scores);

    expect(report.status).toBe("passed");
    expect(JSON.stringify(report)).not.toContain("secret typed value");
  });
});

async function runInjected(request: ReturnType<typeof pwRequest>) {
  return runBrowserActionLoopExecutor({
    request,
    manifestLoad: createPwManifestLoad(),
    executor: createInjectedAdapter(),
  });
}

function createInjectedAdapter(): PwAdapter {
  return new PwAdapter({
    status: {
      status: "ready",
      reasonCode: "ready",
      dependency: "playwright-core",
      packageName: "playwright-core",
      browserName: "chromium",
      executableSource: "unknown",
      realBrowserValidationAvailable: true,
      passiveStatusCheck: true,
      browserLaunched: false,
      providerCall: "none",
      modelCall: "none",
      mcpLaunched: false,
      reason: "Injected deterministic Direct Playwright client is available.",
      nextAction: "Run injected Route 126 scenarios.",
      warnings: [],
      evidence: ["pw-runtime:status:ready"],
    },
    fixtures: pwFixtures,
    injectedClient: createInjectedPwClient(),
    timeoutMs: 25,
  });
}

function fakeRuntime(executablePath: string): PwRuntimeModule {
  return {
    chromium: {
      executablePath: () => executablePath,
      launch: async () => {
        throw new Error("not used");
      },
    },
  };
}
