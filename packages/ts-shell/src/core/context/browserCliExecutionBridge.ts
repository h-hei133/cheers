import {
  createBrowserLocalExecutionAuthority,
} from "./browserLocalExecutionAuthority.js";
import {
  createBrowserNetworkAllowlist,
} from "./browserNetworkAllowlist.js";
import {
  BrowserPlaywrightCliLocalFixtureExecutor,
} from "./browserPlaywrightCliExecutor.js";
import {
  createBrowserSandboxAuthority,
} from "./browserSandboxAuthority.js";
import type { BrowserExecutionConfirmationRecord } from "./browserExecutionConfirmation.js";
import type { BrowserExecutor } from "./browserExecutor.js";
import type {
  BrowserCliExecutorInjection,
} from "./browserCliExecutorInjection.js";

export interface BrowserCliExecutionBridgeSummary {
  readonly executorSource: "none" | "cli-harness" | "test-only";
  readonly manifestStatus: "missing" | "valid" | "invalid";
  readonly executionMode: "disabled" | "local-fixture";
  readonly reason: string;
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
}

export interface BrowserCliExecutionBridgeContext {
  readonly browserExecutor?: BrowserExecutor;
  readonly browserSandboxAuthority?: ReturnType<typeof createBrowserSandboxAuthority>;
  readonly browserNetworkAllowlist?: ReturnType<typeof createBrowserNetworkAllowlist>;
  readonly browserExecutionConfirmations?: readonly BrowserExecutionConfirmationRecord[];
  readonly browserCliExecutionBridgeSummary: BrowserCliExecutionBridgeSummary;
}

export function createBrowserCliExecutionBridge(
  injection: BrowserCliExecutorInjection,
): BrowserCliExecutionBridgeContext {
  if (injection.status !== "valid" || !injection.fixture || !injection.manifest) {
    return {
      browserCliExecutionBridgeSummary: {
        executorSource: injection.source,
        manifestStatus: injection.manifestStatus,
        executionMode: "disabled",
        reason: injection.reason,
        evidence: injection.evidence,
        warnings: injection.warnings,
        redactions: injection.redactions,
      },
    };
  }
  const authority = createBrowserLocalExecutionAuthority({
    mode: "local-fixture",
    allowedFixtureIds: [injection.fixture.fixtureId],
  });
  return {
    browserExecutor: new BrowserPlaywrightCliLocalFixtureExecutor({
      fixture: injection.fixture,
      authority,
    }),
    browserSandboxAuthority: createBrowserSandboxAuthority({
      mode: "local-fixture",
    }),
    browserNetworkAllowlist: createBrowserNetworkAllowlist({
      allowedOrigins: [],
      allowPrivateNetworkInTest: false,
      evidence: [
        "browser-cli-execution-bridge:local-fixture-only",
        "browser-cli-execution-bridge:no-external-network",
      ],
    }),
    browserExecutionConfirmations: injection.manifest.confirmations,
    browserCliExecutionBridgeSummary: {
      executorSource: injection.source,
      manifestStatus: "valid",
      executionMode: "local-fixture",
      reason: "CLI harness supplied an explicit local fixture executor.",
      evidence: [
        ...injection.evidence,
        "browser-cli-execution-bridge:executor-created",
        "browser-cli-execution-bridge:no-playwright-process",
        "browser-cli-execution-bridge:no-mcp-launch",
      ],
      warnings: injection.warnings,
      redactions: injection.redactions,
    },
  };
}

export function renderBrowserCliExecutionBridgeSummary(
  summary: BrowserCliExecutionBridgeSummary | undefined,
): string {
  const value = summary ?? {
    executorSource: "none",
    manifestStatus: "missing",
    executionMode: "disabled",
    reason: "No CLI browser executor injection was provided.",
    evidence: [],
    warnings: [],
    redactions: [],
  };
  return [
    "Browser executor injection",
    `- Execution mode: ${value.executionMode}`,
    `- Executor source: ${value.executorSource}`,
    `- Manifest status: ${value.manifestStatus}`,
    `- Reason: ${value.reason}`,
    `- Evidence summary: ${value.evidence.slice(0, 4).join("; ") || "none"}`,
    `- Redactions: ${value.redactions.length === 0 ? "none" : value.redactions.join(", ")}`,
    `- Next action: ${
      value.executionMode === "local-fixture"
        ? "Run only local-fixture observe/extract/navigation scenarios."
        : "Keep browser execution blocked unless an explicit valid local fixture manifest is provided."
    }`,
  ].join("\n");
}
