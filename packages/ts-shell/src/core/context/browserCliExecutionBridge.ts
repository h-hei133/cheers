import {
  createBrowserLocalExecutionAuthority,
} from "./browserLocalExecutionAuthority.js";
import {
  decideBrowserExternalRunnerPolicy,
  type BrowserExternalRunnerDecision,
} from "../../browser/runtime/external/policy.js";
import { BrowserExternalRunnerExecutor } from "../../browser/runtime/external/executor.js";
import {
  createBrowserNetworkAllowlist,
} from "./browserNetworkAllowlist.js";
import {
  browserRuntimeDependencySummary,
} from "../../browser/runtime/core/availabilitySurface.js";
import {
  classifyBrowserSkillRunnerReadiness,
  type BrowserSkillRunnerReadiness,
} from "./browser/skill/runner/readiness.js";
import type { BrowserSkillRunnerMetadata } from "./browser/skill/runner/metadata.js";
import type { BrowserSkillRunnerBinding } from "./browser/skill/runner/binding.js";
import { BrowserSkillExecutionExecutor } from "./browser/skill/execution/executor.js";
import {
  decideBrowserRuntimeDependencyPolicy,
} from "../../browser/runtime/core/dependencyPolicy.js";
import {
  BrowserPlaywrightCliLocalFixtureExecutor,
} from "./browserPlaywrightCliExecutor.js";
import {
  BrowserPlaywrightLocalExecutor,
} from "./browserPlaywrightLocalExecutor.js";
import type {
  BrowserPlaywrightAvailabilityChecker,
} from "./browserPlaywrightAvailability.js";
import type {
  BrowserPlaywrightLocalRunner,
} from "./browserPlaywrightLifecycle.js";
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
  readonly executionMode: "disabled" | "local-fixture" | "playwright-local" | "external-local" | "skill-managed" | "test-local";
  readonly playwrightAvailabilityStatus?: "available" | "unavailable" | "disabled" | "blocked-by-policy" | "not-checked";
  readonly dependencyDecision: string;
  readonly externalRunnerStatus: BrowserExternalRunnerDecision["status"];
  readonly skillRunnerMetadata?: BrowserSkillRunnerMetadata;
  readonly skillRunnerBinding?: BrowserSkillRunnerBinding;
  readonly skillRunnerReadiness?: BrowserSkillRunnerReadiness;
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
  options: {
    readonly playwrightAvailabilityChecker?: BrowserPlaywrightAvailabilityChecker;
    readonly playwrightLocalRunner?: BrowserPlaywrightLocalRunner;
  } = {},
): BrowserCliExecutionBridgeContext {
  if (
    injection.status !== "valid" ||
    !injection.fixture ||
    (!injection.manifest && !injection.externalRunnerManifest)
  ) {
    const missingRunner = decideBrowserExternalRunnerPolicy();
    return {
      browserCliExecutionBridgeSummary: {
        executorSource: injection.source,
        manifestStatus: injection.manifestStatus,
        executionMode: "disabled",
        dependencyDecision: browserRuntimeDependencySummary(),
        externalRunnerStatus: missingRunner.status,
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
  if (injection.externalRunnerManifest) {
    const manifest = injection.externalRunnerManifest;
    const externalRunnerDecision = decideBrowserExternalRunnerPolicy({
      source: manifest.source === "skill-managed" ? "skill-managed" : "cli-harness-manifest",
      runnerId: manifest.runnerId,
      executorMode: "local-fixture",
      fixtureScope: "local-fixture-only",
      sandboxAuthority: "local-fixture",
      allowlist: "none",
      evidenceRedactionMode: "safe-summary-only",
    });
    if (!externalRunnerDecision.allowed && manifest.runnerMode !== "skill-managed") {
      return {
        browserCliExecutionBridgeSummary: {
          executorSource: injection.source,
          manifestStatus: "valid",
          executionMode: "disabled",
          dependencyDecision: browserRuntimeDependencySummary(),
          externalRunnerStatus: externalRunnerDecision.status,
          reason: externalRunnerDecision.reason,
          evidence: [
            ...injection.evidence,
            ...externalRunnerDecision.evidence,
            "browser-cli-execution-bridge:external-runner-blocked",
          ],
          warnings: [...injection.warnings, ...externalRunnerDecision.warnings],
          redactions: injection.redactions,
        },
      };
    }
    if (manifest.runnerMode === "skill-managed") {
      const skillRunnerReadiness = classifyBrowserSkillRunnerReadiness({
        metadata: manifest.skillRunnerMetadata,
        futureExecutionRequired: !!manifest.skillRunnerMetadata && !manifest.skillRunnerBinding,
      });
      const skillExecutor = manifest.skillRunnerMetadata && manifest.skillRunnerBinding
        ? new BrowserSkillExecutionExecutor({
            metadata: manifest.skillRunnerMetadata,
            binding: manifest.skillRunnerBinding,
            fixture: injection.fixture,
            authority,
          })
        : undefined;
      return {
        browserExecutor: skillExecutor,
        browserSandboxAuthority: createBrowserSandboxAuthority({
          mode: "local-fixture",
        }),
        browserNetworkAllowlist: createBrowserNetworkAllowlist({
          allowedOrigins: [],
          allowPrivateNetworkInTest: false,
          evidence: [
            "browser-cli-execution-bridge:skill-runner-local-fixture-only",
            "browser-cli-execution-bridge:no-external-network",
          ],
        }),
        browserExecutionConfirmations: [{ kind: "sandbox", status: "confirmed" }],
        browserCliExecutionBridgeSummary: {
          executorSource: injection.source,
          manifestStatus: "valid",
          executionMode: "skill-managed",
          dependencyDecision: browserRuntimeDependencySummary(decideBrowserRuntimeDependencyPolicy()),
          externalRunnerStatus: manifest.skillRunnerBinding
            ? "allowed"
            : manifest.skillRunnerMetadata
              ? "future-execution-required"
            : "future-skill-required",
          skillRunnerMetadata: manifest.skillRunnerMetadata,
          skillRunnerBinding: manifest.skillRunnerBinding,
          skillRunnerReadiness,
          reason: manifest.skillRunnerBinding
            ? "Skill-managed runner metadata and explicit local/test binding are valid."
            : manifest.skillRunnerMetadata
            ? "Skill-managed runner metadata is valid; execution waits for an explicit future bridge."
            : "Skill-managed runner manifest is policy-only until explicit metadata is provided.",
          evidence: [
            ...injection.evidence,
            ...externalRunnerDecision.evidence,
            ...skillRunnerReadiness.evidence,
            manifest.skillRunnerBinding
              ? "browser-cli-execution-bridge:skill-runner-created"
              : "browser-cli-execution-bridge:skill-runner-metadata-only",
            ...(manifest.skillRunnerBinding ? [] : ["browser-cli-execution-bridge:no-skill-execution"]),
            "browser-cli-execution-bridge:no-playwright-dependency",
            "browser-cli-execution-bridge:no-mcp-launch",
          ],
          warnings: [...injection.warnings, ...skillRunnerReadiness.warnings],
          redactions: injection.redactions,
        },
      };
    }
    const browserExecutor: BrowserExecutor = new BrowserExternalRunnerExecutor({
      manifest,
      fixture: injection.fixture,
      authority,
    });
    return {
      browserExecutor,
      browserSandboxAuthority: createBrowserSandboxAuthority({
        mode: "local-fixture",
      }),
      browserNetworkAllowlist: createBrowserNetworkAllowlist({
        allowedOrigins: [],
        allowPrivateNetworkInTest: false,
        evidence: [
          "browser-cli-execution-bridge:external-runner-local-fixture-only",
          "browser-cli-execution-bridge:no-external-network",
        ],
      }),
      browserExecutionConfirmations: [{ kind: "sandbox", status: "confirmed" }],
      browserCliExecutionBridgeSummary: {
        executorSource: injection.source,
        manifestStatus: "valid",
        executionMode: manifest.runnerMode,
        dependencyDecision: browserRuntimeDependencySummary(decideBrowserRuntimeDependencyPolicy()),
        externalRunnerStatus: externalRunnerDecision.status,
        reason: "CLI harness supplied an explicit external browser runner manifest.",
        evidence: [
          ...injection.evidence,
          ...externalRunnerDecision.evidence,
          "browser-cli-execution-bridge:external-runner-created",
          "browser-cli-execution-bridge:no-playwright-dependency",
          "browser-cli-execution-bridge:no-mcp-launch",
        ],
        warnings: injection.warnings,
        redactions: injection.redactions,
      },
    };
  }
  const executionMode = injection.manifest.executorMode;
  const externalRunnerDecision = decideBrowserExternalRunnerPolicy({
    source: "cli-harness-manifest",
    runnerId: `${injection.manifest.source}:${executionMode}`,
    executorMode: executionMode,
    fixtureScope: "local-fixture-only",
    sandboxAuthority: "local-fixture",
    allowlist: "none",
    evidenceRedactionMode: "safe-summary-only",
  });
  if (!externalRunnerDecision.allowed) {
    return {
      browserCliExecutionBridgeSummary: {
        executorSource: injection.source,
        manifestStatus: "valid",
        executionMode: "disabled",
        playwrightAvailabilityStatus: executionMode === "playwright-local" ? "unavailable" : undefined,
        dependencyDecision: browserRuntimeDependencySummary(),
        externalRunnerStatus: externalRunnerDecision.status,
        reason: externalRunnerDecision.reason,
        evidence: [
          ...injection.evidence,
          ...externalRunnerDecision.evidence,
          "browser-cli-execution-bridge:external-runner-blocked",
        ],
        warnings: [...injection.warnings, ...externalRunnerDecision.warnings],
        redactions: injection.redactions,
      },
    };
  }
  const browserExecutor: BrowserExecutor = executionMode === "playwright-local"
    ? new BrowserPlaywrightLocalExecutor({
        fixture: injection.fixture,
        authority,
        availabilityChecker: options.playwrightAvailabilityChecker,
        runner: options.playwrightLocalRunner,
      })
    : new BrowserPlaywrightCliLocalFixtureExecutor({
        fixture: injection.fixture,
        authority,
      });
  return {
    browserExecutor,
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
      executionMode,
      playwrightAvailabilityStatus: executionMode === "playwright-local" ? "not-checked" : undefined,
      dependencyDecision: browserRuntimeDependencySummary(decideBrowserRuntimeDependencyPolicy()),
      externalRunnerStatus: externalRunnerDecision.status,
      reason: executionMode === "playwright-local"
        ? "CLI harness supplied an explicit Playwright local fixture executor request."
        : "CLI harness supplied an explicit local fixture executor.",
      evidence: [
        ...injection.evidence,
        "browser-cli-execution-bridge:executor-created",
        ...externalRunnerDecision.evidence,
        executionMode === "playwright-local"
          ? "browser-cli-execution-bridge:playwright-local-requested"
          : "browser-cli-execution-bridge:no-playwright-process",
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
    dependencyDecision: browserRuntimeDependencySummary(),
    externalRunnerStatus: "blocked-missing-config" as const,
    evidence: [],
    warnings: [],
    redactions: [],
  };
  return [
    "Browser executor injection",
    `- Execution mode: ${value.executionMode}`,
    `- Dependency decision: ${value.dependencyDecision}`,
    `- External runner policy: ${value.externalRunnerStatus}`,
    `- Skill metadata status: ${value.skillRunnerReadiness?.status ?? (value.skillRunnerMetadata ? "metadata-ready" : "unavailable")}`,
    `- Skill binding mode: ${value.skillRunnerBinding?.mode ?? "none"}`,
    `- Playwright availability: ${value.playwrightAvailabilityStatus ?? "not-requested"}`,
    `- Executor source: ${value.executorSource}`,
    `- Manifest status: ${value.manifestStatus}`,
    `- Reason: ${value.reason}`,
    `- Evidence summary: ${value.evidence.slice(0, 4).join("; ") || "none"}`,
    `- Redactions: ${value.redactions.length === 0 ? "none" : value.redactions.join(", ")}`,
    `- Next action: ${
      value.executionMode === "local-fixture" || value.executionMode === "playwright-local"
      || value.executionMode === "test-local" || value.executionMode === "external-local"
        ? "Run only local-fixture observe/extract/navigation scenarios."
        : value.executionMode === "skill-managed"
          ? "Keep skill-managed execution blocked until an explicit future execution bridge exists."
        : "Keep browser execution blocked unless an explicit valid local fixture manifest is provided."
    }`,
  ].join("\n");
}
