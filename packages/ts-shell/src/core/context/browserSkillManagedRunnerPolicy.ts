import type { BrowserExternalRunnerAction } from "./browserExternalRunnerProtocol.js";
import {
  classifyBrowserSkillRunnerReadiness,
  type BrowserSkillRunnerReadiness,
} from "./browserSkillRunnerReadiness.js";
import type { BrowserSkillRunnerMetadata as Route105BrowserSkillRunnerMetadata } from "./browserSkillRunnerMetadata.js";

export interface BrowserSkillManagedRunnerMetadata {
  readonly skillId: string;
  readonly runnerCapability: "browser-external-runner";
  readonly fixtureScope: "local-fixture-only";
  readonly allowedActions: readonly BrowserExternalRunnerAction[];
  readonly evidenceContract: "safe-summary-only";
  readonly sandboxContract: "local-fixture-no-network";
}

export interface BrowserSkillManagedRunnerPolicy {
  readonly dynamicDiscovery: "disabled";
  readonly mcpLaunch: "none";
  readonly execution: "metadata-only";
}

export type BrowserSkillManagedRunnerDecisionStatus =
  | "allowed"
  | "blocked-no-skill"
  | "blocked-dynamic-discovery"
  | "blocked-unsafe-scope"
  | "future-skill-required"
  | "future-execution-required"
  | "metadata-ready";

export interface BrowserSkillManagedRunnerDecision {
  readonly status: BrowserSkillManagedRunnerDecisionStatus;
  readonly allowed: boolean;
  readonly reason: string;
  readonly nextAction: string;
  readonly skillRunnerReadiness?: BrowserSkillRunnerReadiness;
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
}

export function decideBrowserSkillManagedRunnerPolicy(input: {
  readonly metadata?: BrowserSkillManagedRunnerMetadata | Route105BrowserSkillRunnerMetadata;
  readonly dynamicDiscoveryRequested?: boolean;
} = {}): BrowserSkillManagedRunnerDecision {
  if (input.dynamicDiscoveryRequested) {
    return decision("blocked-dynamic-discovery", {
      reason: "Skill-managed browser runner does not allow dynamic skill or MCP discovery.",
      nextAction: "Provide explicit skill metadata in a route-scoped manifest.",
      warnings: ["browser-skill-managed-runner-policy:dynamic-discovery-blocked"],
    });
  }
  if (!input.metadata) {
    return decision("future-skill-required", {
      reason: "Skill-managed browser runner requires explicit future skill metadata.",
      nextAction: "Provide explicit Route 105 skill runner metadata; no skill execution is enabled by default.",
    });
  }
  if ("metadataVersion" in input.metadata) {
    const readiness = classifyBrowserSkillRunnerReadiness({
      metadata: input.metadata,
      futureExecutionRequired: true,
    });
    return decision(readiness.status === "future-execution-required" ? "future-execution-required" : "metadata-ready", {
      reason: "Explicit skill runner metadata is valid, but skill-managed execution is not implemented.",
      nextAction: readiness.nextAction,
      skillRunnerReadiness: readiness,
    });
  }
  if (
    input.metadata.runnerCapability !== "browser-external-runner" ||
    input.metadata.fixtureScope !== "local-fixture-only" ||
    input.metadata.evidenceContract !== "safe-summary-only" ||
    input.metadata.sandboxContract !== "local-fixture-no-network"
  ) {
    return decision("blocked-unsafe-scope", {
      reason: "Skill metadata must be local-fixture scoped with safe-summary evidence and no network.",
      nextAction: "Use explicit local-fixture metadata before allowing skill-managed execution.",
      warnings: ["browser-skill-managed-runner-policy:unsafe-scope"],
    });
  }
  if (input.metadata.allowedActions.length === 0) {
    return decision("blocked-no-skill", {
      reason: "Skill metadata does not expose any safe browser runner actions.",
      nextAction: "Declare observe/extract/navigate-local capability in explicit metadata.",
    });
  }
  return decision("allowed", {
    reason: "Explicit skill metadata satisfies the future skill-managed browser runner contract.",
    nextAction: "Run only through a manifest-scoped local fixture runner.",
  });
}

function decision(
  status: BrowserSkillManagedRunnerDecisionStatus,
  input: {
    readonly reason: string;
    readonly nextAction: string;
    readonly skillRunnerReadiness?: BrowserSkillRunnerReadiness;
    readonly warnings?: readonly string[];
  },
): BrowserSkillManagedRunnerDecision {
  return {
    status,
    allowed: status === "allowed",
    reason: input.reason,
    nextAction: input.nextAction,
    skillRunnerReadiness: input.skillRunnerReadiness,
    evidence: [
      `browser-skill-managed-runner-policy:decision:${status}`,
      "browser-skill-managed-runner-policy:no-dynamic-discovery",
      "browser-skill-managed-runner-policy:no-mcp-launch",
      "browser-skill-managed-runner-policy:metadata-only",
    ],
    warnings: input.warnings ?? [],
  };
}
