import { createBrowserActionCache } from "../../../browser/actionCache.js";
import {
  createBrowserCliExecutionBridge,
} from "../../../browser/cliExecutionBridge.js";
import {
  loadBrowserCliExecutorInjectionFromEnv,
} from "../../../browser/cliExecutorInjection.js";
import type { BrowserExecutionReceipt } from "../../../browser/executionReceipt.js";
import { createBrowserExternalRunnerScenarioFixture } from "../execution/external/fixtures.js";
import { createBrowserSkillExecutionScenarioFixture } from "../skills/fixtures.js";

export type BrowserReplayScenarioFixtureKind = "external-runner" | "skill-managed";

export interface BrowserReplayScenarioFixture {
  readonly kind: BrowserReplayScenarioFixtureKind;
  readonly actionCache: ReturnType<typeof createBrowserActionCache>;
  readonly bridge: ReturnType<typeof createBrowserCliExecutionBridge>;
  readonly env: Readonly<Record<string, string>>;
  seed(receipt: BrowserExecutionReceipt): void;
  cleanup(): void;
}

export function createBrowserReplayScenarioFixture(input: {
  readonly kind?: BrowserReplayScenarioFixtureKind;
} = {}): BrowserReplayScenarioFixture {
  const kind = input.kind ?? "external-runner";
  const fixture = kind === "skill-managed"
    ? createBrowserSkillExecutionScenarioFixture()
    : createBrowserExternalRunnerScenarioFixture();
  const injection = loadBrowserCliExecutorInjectionFromEnv({ env: fixture.env });
  const bridge = createBrowserCliExecutionBridge(injection);
  const actionCache = createBrowserActionCache();
  return {
    kind,
    actionCache,
    bridge,
    env: fixture.env,
    seed(receipt) {
      actionCache.addReceipt(receipt);
    },
    cleanup() {
      fixture.cleanup();
      actionCache.clear();
    },
  };
}
