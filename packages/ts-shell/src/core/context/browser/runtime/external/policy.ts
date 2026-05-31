import type { BrowserLocalFixtureManifestExecutorMode } from "../../../browserLocalFixtureManifest.js";

export type BrowserExternalRunnerSource =
  | "cli-harness-manifest"
  | "explicit-local-config"
  | "skill-managed"
  | "disabled";

export type BrowserExternalRunnerDecisionStatus =
  | "allowed"
  | "blocked-missing-config"
  | "blocked-unsafe-source"
  | "blocked-unsupported-mode"
  | "future-skill-required"
  | "future-execution-required";

export interface BrowserExternalRunnerConfig {
  readonly source: BrowserExternalRunnerSource;
  readonly runnerId?: string;
  readonly executorMode?: BrowserLocalFixtureManifestExecutorMode;
  readonly fixtureScope?: "local-fixture-only" | "external" | "unknown";
  readonly sandboxAuthority?: "local-fixture" | "none" | "external";
  readonly allowlist?: "none" | "local-fixture-only" | "external";
  readonly evidenceRedactionMode?: "safe-summary-only" | "raw" | "unknown";
}

export interface BrowserExternalRunnerDecision {
  readonly status: BrowserExternalRunnerDecisionStatus;
  readonly allowed: boolean;
  readonly reason: string;
  readonly nextAction: string;
  readonly runnerId: string;
  readonly executorMode: BrowserLocalFixtureManifestExecutorMode | "none";
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
}

export function decideBrowserExternalRunnerPolicy(
  config?: BrowserExternalRunnerConfig,
): BrowserExternalRunnerDecision {
  if (!config || config.source === "disabled") {
    return decision("blocked-missing-config", {
      reason: "No explicit browser external runner configuration was provided.",
      nextAction: "Keep browser execution disabled unless a local/test runner is explicitly injected.",
      runnerId: "none",
      executorMode: "none",
    });
  }
  if (!["cli-harness-manifest", "explicit-local-config", "skill-managed"].includes(config.source)) {
    return decision("blocked-unsafe-source", {
      reason: "Browser external runner source is not allowed.",
      nextAction: "Use only a CLI harness manifest, explicit local config, or future skill-managed runner.",
      runnerId: "redacted",
      executorMode: config.executorMode ?? "none",
      warnings: ["browser-external-runner-policy:unsafe-source"],
    });
  }
  if (config.source === "skill-managed") {
    return decision("future-skill-required", {
      reason: "Skill-managed Playwright runner is the preferred future path but is not implemented yet.",
      nextAction: "Route 103 should define the skill-managed runner bridge.",
      runnerId: sanitizeRunnerId(config.runnerId),
      executorMode: config.executorMode ?? "playwright-local",
    });
  }
  if (config.executorMode !== "local-fixture" && config.executorMode !== "playwright-local") {
    return decision("blocked-unsupported-mode", {
      reason: "External runner executor mode must be local-fixture or playwright-local.",
      nextAction: "Use a manifest-scoped local fixture executor mode.",
      runnerId: sanitizeRunnerId(config.runnerId),
      executorMode: config.executorMode ?? "none",
    });
  }
  if (
    config.fixtureScope !== "local-fixture-only" ||
    config.sandboxAuthority !== "local-fixture" ||
    config.allowlist !== "none" ||
    config.evidenceRedactionMode !== "safe-summary-only"
  ) {
    return decision("blocked-unsafe-source", {
      reason: "External runner config must be local-fixture-only with no external allowlist and safe-summary evidence.",
      nextAction: "Remove external scope, external allowlist, or raw evidence before retrying.",
      runnerId: sanitizeRunnerId(config.runnerId),
      executorMode: config.executorMode,
      warnings: ["browser-external-runner-policy:unsafe-config"],
    });
  }
  return decision("allowed", {
    reason: "Explicit local/test browser runner policy allows this local fixture mode.",
    nextAction: "Run only local-fixture observe/extract/navigation with sanitized evidence.",
    runnerId: sanitizeRunnerId(config.runnerId),
    executorMode: config.executorMode,
  });
}

function decision(
  status: BrowserExternalRunnerDecisionStatus,
  input: {
    readonly reason: string;
    readonly nextAction: string;
    readonly runnerId: string;
    readonly executorMode: BrowserExternalRunnerDecision["executorMode"];
    readonly warnings?: readonly string[];
  },
): BrowserExternalRunnerDecision {
  return {
    status,
    allowed: status === "allowed",
    reason: input.reason,
    nextAction: input.nextAction,
    runnerId: input.runnerId,
    executorMode: input.executorMode,
    evidence: [
      `browser-external-runner-policy:decision:${status}`,
      "browser-external-runner-policy:disabled-by-default",
      "browser-external-runner-policy:no-default-process-spawn",
      "browser-external-runner-policy:no-external-network",
      "browser-external-runner-policy:no-raw-config",
    ],
    warnings: input.warnings ?? [],
  };
}

function sanitizeRunnerId(value: string | undefined): string {
  if (!value) {
    return "none";
  }
  return value
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED_SECRET]")
    .replace(/[^a-zA-Z0-9:_./-]+/g, "-")
    .slice(0, 80);
}
