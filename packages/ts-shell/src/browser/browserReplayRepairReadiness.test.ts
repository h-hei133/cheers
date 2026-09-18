import { describe, expect, it } from "vitest";
import { createBrowserActionCacheEntryFromReceipt } from "./browserActionCacheEntry.js";
import { safeReceipt } from "./browserActionCacheEntry.test.js";
import { classifyBrowserReplayFailure } from "./browserReplayFailureClassifier.js";
import { createBrowserReplayRepairPreview } from "./browserReplayRepairPreview.js";
import { decideBrowserReplayRepairReadiness } from "./browserReplayRepairReadiness.js";
import { renderBrowserReplayRepairSurface } from "./browserReplayRepairSurface.js";
import { planBrowserReplay } from "./browserReplayPlanner.js";

describe("browser replay repair readiness", () => {
  it("classifies missing runner as repair-needs-runner", () => {
    const plan = blockedPlan({ runnerAvailable: false });
    const failure = classifyBrowserReplayFailure({ plan });
    const readiness = decideBrowserReplayRepairReadiness({ failure });

    expect(failure.kind).toBe("missing-runner-binding");
    expect(readiness.status).toBe("repair-needs-runner");
    expect(readiness.repairable).toBe(true);
  });

  it("classifies missing skill metadata separately from missing binding", () => {
    const entry = entryFor({
      executionMode: "skill-managed",
      runnerSource: "skill-managed",
      skillRunnerId: undefined,
      skillRunnerStatus: undefined,
      bindingRef: undefined,
    });
    const plan = planBrowserReplay({
      entry,
      runnerAvailable: true,
      skillRunnerBindingAvailable: false,
      skillMetadataAvailable: false,
      sandboxConfirmed: true,
      allowlistConfirmed: true,
      confirmationRecorded: true,
    });
    const failure = classifyBrowserReplayFailure({ plan });
    const readiness = decideBrowserReplayRepairReadiness({ failure });

    expect(failure.kind).toBe("missing-skill-metadata");
    expect(readiness.status).toBe("repair-needs-metadata");
  });

  it("classifies missing confirmation as repair-needs-confirmation", () => {
    const plan = blockedPlan({ confirmationRecorded: false });
    const failure = classifyBrowserReplayFailure({ plan });
    const readiness = decideBrowserReplayRepairReadiness({ failure });

    expect(failure.kind).toBe("sandbox-or-confirmation-missing");
    expect(readiness.status).toBe("repair-needs-confirmation");
  });

  it("classifies unsafe and external replay as blocked", () => {
    const unsafe = planBrowserReplay({
      entry: entryFor({
        replayReadinessSnapshot: {
          ...baseEntry().replayReadinessSnapshot,
          status: "replay-unsafe",
          reasons: ["unsafe"],
        },
      }),
      runnerAvailable: true,
      sandboxConfirmed: true,
      allowlistConfirmed: true,
      confirmationRecorded: true,
    });
    const external = planBrowserReplay({
      entry: entryFor({ safeUrl: "https://example.com", fixtureId: "external:example" }),
      runnerAvailable: true,
      sandboxConfirmed: true,
      allowlistConfirmed: true,
      confirmationRecorded: true,
    });

    expect(decideBrowserReplayRepairReadiness({ failure: classifyBrowserReplayFailure({ plan: unsafe }) }).status).toBe("repair-blocked-unsafe");
    expect(decideBrowserReplayRepairReadiness({ failure: classifyBrowserReplayFailure({ plan: external }) }).status).toBe("repair-blocked-external-network");
  });

  it("renders preview without executing or applying repair", () => {
    const plan = blockedPlan({ runnerAvailable: false });
    const failure = classifyBrowserReplayFailure({ plan });
    const readiness = decideBrowserReplayRepairReadiness({ failure });
    const preview = createBrowserReplayRepairPreview({ plan, failure, readiness });
    const surface = renderBrowserReplayRepairSurface(preview);

    expect(preview.executed).toBe("no");
    expect(preview.repairApplied).toBe("no");
    expect(surface).toContain("Browser replay repair preview");
    expect(surface).toContain("Repair applied: no");
    expect(surface).not.toContain("RAW_");
  });

  function blockedPlan(input: {
    readonly runnerAvailable?: boolean;
    readonly confirmationRecorded?: boolean;
  }) {
    return planBrowserReplay({
      entry: entryFor(),
      runnerAvailable: input.runnerAvailable ?? true,
      sandboxConfirmed: true,
      allowlistConfirmed: true,
      confirmationRecorded: input.confirmationRecorded ?? true,
    });
  }

  function entryFor(overrides: Partial<ReturnType<typeof baseEntry>> = {}) {
    return {
      ...baseEntry(),
      ...overrides,
    };
  }

  function baseEntry() {
    const result = createBrowserActionCacheEntryFromReceipt({ receipt: safeReceipt() });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("entry failed");
    }
    return result.entry;
  }
});
