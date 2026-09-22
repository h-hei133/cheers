import type { BrowserExecutionRequest } from "../../executionContract.js";
import {
  createBrowserSkillExecutionRequest,
  browserSkillExecutionActionForRequest,
  browserSkillExecutionModeForBinding,
  type BrowserSkillExecutionRequest,
} from "./protocol.js";
import type { BrowserLocalFixture } from "../../localFixture.js";
import {
  classifyBrowserSkillRunnerReadiness,
  type BrowserSkillRunnerReadiness,
} from "../runner/readiness.js";
import type { BrowserSkillRunnerBinding } from "../runner/binding.js";
import type { BrowserSkillRunnerMetadata } from "../runner/metadata.js";

export type BrowserSkillExecutionBridgeStatus =
  | "ready"
  | "future-execution-required"
  | "blocked-unsafe-capability"
  | "blocked-missing-metadata"
  | "blocked-missing-binding"
  | "blocked-binding-mismatch"
  | "blocked-unsupported-action";

export interface BrowserSkillExecutionBridgeDecision {
  readonly status: BrowserSkillExecutionBridgeStatus;
  readonly allowed: boolean;
  readonly request?: BrowserSkillExecutionRequest;
  readonly readiness: BrowserSkillRunnerReadiness;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
}

export function prepareBrowserSkillExecutionBridge(input: {
  readonly request: BrowserExecutionRequest;
  readonly metadata?: BrowserSkillRunnerMetadata;
  readonly binding?: BrowserSkillRunnerBinding;
  readonly fixture?: BrowserLocalFixture;
  readonly sandboxDecision?: string;
  readonly allowlistDecision?: string;
  readonly confirmationDecision?: string;
}): BrowserSkillExecutionBridgeDecision {
  if (!input.metadata) {
    return decision("blocked-missing-metadata", {
      readiness: classifyBrowserSkillRunnerReadiness(),
      reason: "Skill-managed execution requires explicit skill runner metadata.",
      nextAction: "Provide explicit skill runner metadata and binding before retrying.",
    });
  }
  const metadataReadiness = classifyBrowserSkillRunnerReadiness({
    metadata: input.metadata,
    futureExecutionRequired: !input.binding,
  });
  if (metadataReadiness.status === "blocked-unsafe-capability") {
    return decision("blocked-unsafe-capability", {
      readiness: metadataReadiness,
      reason: "Skill runner metadata contains blocked unsafe capabilities.",
      nextAction: metadataReadiness.nextAction,
      warnings: metadataReadiness.warnings,
    });
  }
  if (!input.binding) {
    return decision("future-execution-required", {
      readiness: metadataReadiness,
      reason: "Skill runner metadata is valid but no explicit runner binding was provided.",
      nextAction: "Provide a local/test skill runner binding before executing browser actions.",
    });
  }
  if (input.binding.skillRunnerId !== input.metadata.runnerId) {
    return decision("blocked-binding-mismatch", {
      readiness: metadataReadiness,
      reason: "Skill runner binding does not match metadata id.",
      nextAction: "Use a binding whose skillRunnerId matches the explicit metadata runner id.",
      warnings: ["browser-skill-execution-bridge:binding-mismatch"],
    });
  }
  const action = browserSkillExecutionActionForRequest(input.request);
  if (!input.binding.allowedActions.includes(action) || !input.metadata.supportedActions.includes(action)) {
    return decision("blocked-unsupported-action", {
      readiness: metadataReadiness,
      reason: `Skill runner binding does not allow ${action}.`,
      nextAction: "Use observe, extract, or navigate-local only with matching metadata and binding.",
    });
  }
  if (!input.fixture) {
    return decision("blocked-missing-binding", {
      readiness: metadataReadiness,
      reason: "Skill-managed execution requires a local fixture.",
      nextAction: "Inject a validated local-fixture manifest before executing.",
    });
  }
  const skillRequest = createBrowserSkillExecutionRequest({
    request: input.request,
    metadata: input.metadata,
    mode: browserSkillExecutionModeForBinding(input.binding.mode),
    fixtureId: input.fixture.fixtureId,
    safeUrl: input.fixture.safeUrl,
    outputBudgetBytes: input.binding.outputBudgetBytes,
    sandboxDecision: input.sandboxDecision ?? "local-fixture:allowed",
    allowlistDecision: input.allowlistDecision ?? "network:none",
    confirmationDecision: input.confirmationDecision ?? "sandbox:confirmed",
  });
  return decision("ready", {
    readiness: metadataReadiness,
    request: skillRequest,
    reason: "Explicit skill runner metadata and local/test binding allow skill-managed execution.",
    nextAction: "Execute only through the explicit local/test skill runner binding.",
  });
}

function decision(
  status: BrowserSkillExecutionBridgeStatus,
  input: {
    readonly readiness: BrowserSkillRunnerReadiness;
    readonly request?: BrowserSkillExecutionRequest;
    readonly reason: string;
    readonly nextAction: string;
    readonly warnings?: readonly string[];
    readonly redactions?: readonly string[];
  },
): BrowserSkillExecutionBridgeDecision {
  return {
    status,
    allowed: status === "ready",
    request: input.request,
    readiness: input.readiness,
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...input.readiness.evidence,
      `browser-skill-execution-bridge:${status}`,
      "browser-skill-execution-bridge:no-dynamic-discovery",
      "browser-skill-execution-bridge:no-mcp-launch",
      "browser-skill-execution-bridge:no-provider-or-model-call",
      "browser-skill-execution-bridge:no-external-network",
    ],
    warnings: input.warnings ?? [],
    redactions: input.redactions ?? [],
  };
}
