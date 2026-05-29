import { describe, expect, it, beforeAll } from "vitest";
import { executeBrowserTransaction } from "../context/browserTxn.js";
import { planBrowserTransaction } from "../context/browserPlan.js";
import { getPwRuntimeStatus, type PwRuntimeModule, type PwRuntimeStatus } from "../context/pwRuntime.js";
import { readyBrowserRuntimeStatus } from "./browserAgentFixtures.js";

describe("Route 129 browser transactions", () => {
  let readyStatus: PwRuntimeStatus | undefined;

  beforeAll(async () => {
    readyStatus = await getPwRuntimeStatus();
  });

  it("runs observe -> extract on one temporary page when the real runtime is ready", async () => {
    if (readyStatus?.status !== "ready") {
      return;
    }
    const result = await executeBrowserTransaction(requiredPlan(
      "Use the local browser fixture and tell me the rendered text",
    ), { runtimeStatus: readyStatus });

    expect(result.status).toBe("success");
    expect(result.stepSummaries.map((step) => step.kind)).toEqual(["observe", "extract"]);
    expect(result.finalSummary).toContain("JS rendered Playwright fixture ready");
    expect(result.cleanupStatus).toBe("closed");
    expect(result.evidence).toContain("browser-transaction:same-page:true");
  }, 30000);

  it("runs observe -> click -> extract on the same page", async () => {
    if (readyStatus?.status !== "ready") {
      return;
    }
    const result = await executeBrowserTransaction(requiredPlan(
      "Use the local browser fixture, click the status button, and report the new state",
    ), { runtimeStatus: readyStatus });

    expect(result.status).toBe("success");
    expect(result.stepSummaries.map((step) => step.kind)).toEqual(["observe", "click", "extract"]);
    expect(result.finalSummary).toContain("Clicked Save draft");
    expect(result.cleanupStatus).toBe("closed");
  }, 30000);

  it("runs observe -> type -> extract on the same page without emitting typed values", async () => {
    if (readyStatus?.status !== "ready") {
      return;
    }
    const result = await executeBrowserTransaction(requiredPlan(
      "Type this safe note into the local browser fixture and confirm it changed",
    ), { runtimeStatus: readyStatus });
    const serialized = JSON.stringify(result);

    expect(result.status).toBe("success");
    expect(result.stepSummaries.map((step) => step.kind)).toEqual(["observe", "type", "extract"]);
    expect(result.finalSummary).toContain("Updated Safe note");
    expect(serialized).not.toContain("safe local note");
    expect(serialized).toContain("typed-value-redacted");
  }, 30000);

  it("repairs one missing click target from the controlled observation", async () => {
    if (readyStatus?.status !== "ready") {
      return;
    }
    const result = await executeBrowserTransaction(requiredPlan(
      "Use the local browser fixture with selector repair, click the missing target, and report the state",
    ), { runtimeStatus: readyStatus });

    expect(result.status).toBe("success");
    expect(result.repairStatus).toBe("succeeded");
    expect(result.finalSummary).toContain("Clicked Save draft after repair");
    expect(result.evidence).toContain("browser-repair:succeeded");
  }, 30000);

  it("fails missing-target repair cleanly when no safe candidate exists", async () => {
    if (readyStatus?.status !== "ready") {
      return;
    }
    const result = await executeBrowserTransaction(requiredPlan(
      "Use the local browser fixture with repair failure, click the missing target, and report the state",
    ), { runtimeStatus: readyStatus });

    expect(result.status).toBe("stopped");
    expect(result.reasonCode).toBe("repair-failed");
    expect(result.repairStatus).toBe("failed");
    expect(result.cleanupStatus).toBe("closed");
  }, 30000);

  it("can re-observe once before post-action extract", async () => {
    if (readyStatus?.status !== "ready") {
      return;
    }
    const result = await executeBrowserTransaction(requiredPlan(
      "Use local-fixture://txn/stale in the browser, click the status button, re-observe, and report the new state",
    ), { runtimeStatus: readyStatus });

    expect(result.status).toBe("success");
    expect(result.stepSummaries.map((step) => step.kind)).toEqual(["observe", "click", "re-observe", "extract"]);
    expect(result.finalSummary).toContain("Clicked Save draft after re-observe");
  }, 30000);

  it("records timeout and cleanup evidence", async () => {
    if (readyStatus?.status !== "ready") {
      return;
    }
    const result = await executeBrowserTransaction(requiredPlan(
      "Use the local browser timeout fixture and tell me the rendered text",
    ), { runtimeStatus: readyStatus });

    expect(result.status).toBe("failed");
    expect(result.reasonCode).toMatch(/action-timeout|navigation-timeout/);
    expect(result.cleanupStatus).toBe("closed");
  }, 30000);

  it("does not emit raw DOM, hidden values, or secrets", async () => {
    if (readyStatus?.status !== "ready") {
      return;
    }
    const result = await executeBrowserTransaction(requiredPlan(
      "Use the local browser secret redaction fixture and report visible text",
    ), { runtimeStatus: readyStatus });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("<input");
    expect(serialized).not.toContain("sk-route126SECRET");
    expect(serialized).not.toContain("session-cookie");
    expect(serialized).toContain("raw-dom-excluded");
    expect(result.redactionStatus).toBe("redacted");
  }, 30000);

  it("stops before runtime when the controlled runtime is unavailable", async () => {
    const result = await executeBrowserTransaction(requiredPlan(
      "Use the local browser fixture and tell me the rendered text",
    ), {
      runtimeStatus: {
        ...readyBrowserRuntimeStatus(),
        status: "disabled",
        reasonCode: "runtime-disabled",
        reason: "disabled for transaction test",
      },
    });

    expect(result.status).toBe("stopped");
    expect(result.reasonCode).toBe("runtime-disabled");
    expect(result.cleanupStatus).toBe("not-started");
    expect(result.evidence).toContain("browser-transaction:stopped-before-runtime");
  });

  it("surfaces cleanup failure evidence", async () => {
    const result = await executeBrowserTransaction(requiredPlan(
      "Use the local browser fixture and tell me the rendered text",
    ), {
      runtimeStatus: readyBrowserRuntimeStatus(),
      runtimeModule: cleanupFailingRuntime(),
    });

    expect(result.status).toBe("failed");
    expect(result.reasonCode).toBe("cleanup-failed");
    expect(result.cleanupStatus).toBe("close-failed");
  });

  function requiredPlan(prompt: string) {
    const plan = planBrowserTransaction({ prompt });
    expect(plan).toBeDefined();
    return plan!;
  }
});

function cleanupFailingRuntime(): PwRuntimeModule {
  const locator = {
    first() {
      return this;
    },
    async count() {
      return 1;
    },
    async click() {},
    async fill() {},
    async innerText() {
      return "Fake transaction page ready";
    },
    async evaluateAll<T>() {
      return [] as T;
    },
  };
  const page = {
    setDefaultTimeout() {},
    async setContent() {},
    async waitForFunction() {},
    async title() {
      return "Fake transaction page";
    },
    locator() {
      return locator;
    },
    getByRole() {
      return locator;
    },
    getByLabel() {
      return locator;
    },
    async close() {
      throw new Error("close failed");
    },
  };
  return {
    chromium: {
      executablePath() {
        return "/controlled/test/chromium";
      },
      async launch() {
        return {
          async newContext() {
            return {
              async newPage() {
                return page;
              },
              async close() {},
            };
          },
          async close() {},
        };
      },
    },
  };
}
