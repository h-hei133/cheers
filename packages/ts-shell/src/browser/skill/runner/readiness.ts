import type { BrowserSkillRunnerMetadata } from "./metadata.js";

export type BrowserSkillRunnerReadinessStatus =
  | "metadata-ready"
  | "metadata-incomplete"
  | "blocked-unsafe-capability"
  | "blocked-missing-evidence-contract"
  | "blocked-missing-sandbox-contract"
  | "blocked-dynamic-discovery"
  | "future-execution-required"
  | "unavailable";

export interface BrowserSkillRunnerReadiness {
  readonly status: BrowserSkillRunnerReadinessStatus;
  readonly execution: "not-enabled";
  readonly blockers: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
}

export function classifyBrowserSkillRunnerReadiness(input: {
  readonly metadata?: BrowserSkillRunnerMetadata;
  readonly metadataValidationReason?: string;
  readonly dynamicDiscoveryRequested?: boolean;
  readonly futureExecutionRequired?: boolean;
} = {}): BrowserSkillRunnerReadiness {
  if (input.dynamicDiscoveryRequested) {
    return readiness("blocked-dynamic-discovery", {
      blockers: ["dynamic-discovery-requested"],
      nextAction: "Provide explicit route-scoped metadata; do not discover skills or MCP tools dynamically.",
      warnings: ["browser-skill-runner-readiness:dynamic-discovery-blocked"],
    });
  }
  if (!input.metadata) {
    return readiness(input.metadataValidationReason ? "metadata-incomplete" : "unavailable", {
      blockers: [input.metadataValidationReason ?? "missing-skill-runner-metadata"],
      nextAction: "Provide an explicit skill runner metadata manifest before planning skill-managed execution.",
    });
  }
  if (input.metadata.blockedActions.length > 0) {
    return readiness("blocked-unsafe-capability", {
      blockers: input.metadata.blockedActions.map((action) => `blocked-action:${action}`),
      nextAction: "Remove auth, payment, destructive, upload/download, screenshot, and arbitrary-JS capabilities.",
      warnings: ["browser-skill-runner-readiness:unsafe-capability"],
    });
  }
  if (input.metadata.evidenceContract !== "safe-summary-only") {
    return readiness("blocked-missing-evidence-contract", {
      blockers: ["missing-safe-summary-evidence-contract"],
      nextAction: "Declare safe-summary-only evidence before using skill runner metadata.",
    });
  }
  if (input.metadata.sandboxContract !== "local-fixture-no-network") {
    return readiness("blocked-missing-sandbox-contract", {
      blockers: ["missing-local-fixture-sandbox-contract"],
      nextAction: "Declare local-fixture-no-network sandbox contract before using skill runner metadata.",
    });
  }
  if (input.metadata.dynamicDiscovery !== "disabled") {
    return readiness("blocked-dynamic-discovery", {
      blockers: ["dynamic-discovery-not-disabled"],
      nextAction: "Disable dynamic discovery in explicit skill runner metadata.",
    });
  }
  return readiness(input.futureExecutionRequired ? "future-execution-required" : "metadata-ready", {
    blockers: input.futureExecutionRequired ? ["skill-runner-execution-bridge-not-implemented"] : [],
    nextAction: input.futureExecutionRequired
      ? "Implement an explicit Route 106 skill runner execution bridge before executing browser actions."
      : "Metadata is ready for a future explicit execution bridge; execution remains disabled in Route 105.",
  });
}

function readiness(
  status: BrowserSkillRunnerReadinessStatus,
  input: {
    readonly blockers: readonly string[];
    readonly nextAction: string;
    readonly warnings?: readonly string[];
  },
): BrowserSkillRunnerReadiness {
  return {
    status,
    execution: "not-enabled",
    blockers: input.blockers,
    nextAction: input.nextAction,
    evidence: [
      `browser-skill-runner-readiness:${status}`,
      "browser-skill-runner-readiness:no-execution",
      "browser-skill-runner-readiness:no-discovery",
      "browser-skill-runner-readiness:no-provider-or-model-call",
    ],
    warnings: input.warnings ?? [],
  };
}
