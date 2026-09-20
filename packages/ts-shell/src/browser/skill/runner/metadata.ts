import { isRecord } from "../../../core/values/record.js";
import { sanitizeBrowserText } from "../../capabilityModel.js";
import {
  browserSkillRunnerAllowedActions,
  browserSkillRunnerBlockedActions,
  normalizeBrowserSkillRunnerCapabilities,
  type BrowserSkillRunnerCapability,
} from "./capability.js";

export type BrowserSkillRunnerId = string;
export type BrowserSkillRunnerVersion = "browser-skill-runner-metadata/v1";
export type BrowserSkillRunnerSource =
  | "explicit-manifest"
  | "skill-managed"
  | "test-only"
  | "disabled";
export type BrowserSkillRunnerStatus =
  | "available-metadata-only"
  | "unavailable"
  | "blocked"
  | "future-execution-required";

export interface BrowserSkillRunnerMetadata {
  readonly metadataVersion: BrowserSkillRunnerVersion;
  readonly runnerId: BrowserSkillRunnerId;
  readonly runnerVersion: string;
  readonly source: BrowserSkillRunnerSource;
  readonly status: BrowserSkillRunnerStatus;
  readonly skillId: string;
  readonly skillName: string;
  readonly runnerCapabilityId: "browser-external-runner";
  readonly capabilities: readonly BrowserSkillRunnerCapability[];
  readonly supportedActions: readonly string[];
  readonly blockedActions: readonly string[];
  readonly evidenceContract: "safe-summary-only";
  readonly sandboxContract: "local-fixture-no-network";
  readonly allowlistContract: "none";
  readonly confirmationContract: "explicit-local-fixture";
  readonly replayContract: "receipt-reference-only";
  readonly dynamicDiscovery: "disabled";
  readonly mcpLaunch: "none";
  readonly execution: "metadata-only";
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
}

export type BrowserSkillRunnerMetadataValidationResult =
  | {
      readonly ok: true;
      readonly metadata: BrowserSkillRunnerMetadata;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
    };

export function createBrowserSkillRunnerMetadata(input: {
  readonly runnerId?: string;
  readonly runnerVersion?: string;
  readonly source?: BrowserSkillRunnerSource;
  readonly skillId?: string;
  readonly skillName?: string;
  readonly actions?: readonly string[];
  readonly warnings?: readonly string[];
} = {}): BrowserSkillRunnerMetadata {
  const capabilities = normalizeBrowserSkillRunnerCapabilities(input.actions ?? ["observe", "extract", "navigate-local"]);
  return {
    metadataVersion: "browser-skill-runner-metadata/v1",
    runnerId: sanitizeId(input.runnerId ?? "skill:browser-runner"),
    runnerVersion: sanitizeBrowserText(input.runnerVersion ?? "0.0.0-route105", 80),
    source: input.source ?? "explicit-manifest",
    status: "available-metadata-only",
    skillId: sanitizeId(input.skillId ?? "skill:browser-runner"),
    skillName: sanitizeBrowserText(input.skillName ?? "Browser runner skill", 80),
    runnerCapabilityId: "browser-external-runner",
    capabilities,
    supportedActions: browserSkillRunnerAllowedActions(capabilities),
    blockedActions: browserSkillRunnerBlockedActions(capabilities),
    evidenceContract: "safe-summary-only",
    sandboxContract: "local-fixture-no-network",
    allowlistContract: "none",
    confirmationContract: "explicit-local-fixture",
    replayContract: "receipt-reference-only",
    dynamicDiscovery: "disabled",
    mcpLaunch: "none",
    execution: "metadata-only",
    redactions: [],
    warnings: input.warnings ?? [],
  };
}

export function validateBrowserSkillRunnerMetadata(
  value: unknown,
): BrowserSkillRunnerMetadataValidationResult {
  if (!isRecord(value)) {
    return invalid("Skill runner metadata must be a JSON object.");
  }
  if (value.metadataVersion !== "browser-skill-runner-metadata/v1") {
    return invalid("Skill runner metadata version is unsupported.");
  }
  const runnerId = stringValue(value.runnerId);
  const runnerVersion = stringValue(value.runnerVersion);
  const skillId = stringValue(value.skillId);
  const skillName = stringValue(value.skillName);
  if (!runnerId || !runnerVersion || !skillId || !skillName) {
    return invalid("Skill runner metadata is missing required identity fields.");
  }
  if (!isSource(value.source)) {
    return invalid("Skill runner metadata source is unsupported.");
  }
  if (value.dynamicDiscovery !== "disabled") {
    return invalid("Skill runner metadata cannot claim dynamic discovery.");
  }
  if (value.mcpLaunch !== "none") {
    return invalid("Skill runner metadata cannot launch MCP servers.");
  }
  if (value.execution !== "metadata-only") {
    return invalid("Skill runner metadata cannot grant execution authority.");
  }
  if (
    value.runnerCapabilityId !== "browser-external-runner" ||
    value.evidenceContract !== "safe-summary-only" ||
    value.sandboxContract !== "local-fixture-no-network" ||
    value.allowlistContract !== "none" ||
    value.confirmationContract !== "explicit-local-fixture" ||
    value.replayContract !== "receipt-reference-only"
  ) {
    return invalid("Skill runner metadata requires local safe-summary contracts.");
  }
  const declaredCapabilityActions = Array.isArray(value.capabilities)
    ? value.capabilities
        .map((item) => isRecord(item) && typeof item.actionKind === "string" ? item.actionKind : undefined)
        .filter((item): item is string => typeof item === "string")
    : [];
  const actionValues = Array.isArray(value.supportedActions)
    ? value.supportedActions.filter((item): item is string => typeof item === "string")
    : [];
  const normalizedActionValues = [...actionValues, ...declaredCapabilityActions];
  if (normalizedActionValues.length === 0) {
    return invalid("Skill runner metadata must declare supported actions.");
  }
  const capabilities = normalizeBrowserSkillRunnerCapabilities(normalizedActionValues);
  if (capabilities.length === 0) {
    return invalid("Skill runner metadata has no recognized capabilities.");
  }
  const blockedActions = browserSkillRunnerBlockedActions(capabilities);
  if (blockedActions.length > 0) {
    return invalid("Skill runner metadata contains blocked unsafe capabilities.", [
      "browser-skill-runner-metadata:blocked-unsafe-capability",
    ]);
  }
  if ([runnerId, runnerVersion, skillId, skillName, ...normalizedActionValues].some(hasForbiddenContent)) {
    return invalid("Skill runner metadata contains raw content or secret-looking data.");
  }
  const metadata: BrowserSkillRunnerMetadata = {
    metadataVersion: "browser-skill-runner-metadata/v1",
    runnerId: sanitizeId(runnerId),
    runnerVersion: sanitizeBrowserText(runnerVersion, 80),
    source: value.source,
    status: value.status === "future-execution-required" ? "future-execution-required" : "available-metadata-only",
    skillId: sanitizeId(skillId),
    skillName: sanitizeBrowserText(skillName, 80),
    runnerCapabilityId: "browser-external-runner",
    capabilities,
    supportedActions: browserSkillRunnerAllowedActions(capabilities),
    blockedActions,
    evidenceContract: "safe-summary-only",
    sandboxContract: "local-fixture-no-network",
    allowlistContract: "none",
    confirmationContract: "explicit-local-fixture",
    replayContract: "receipt-reference-only",
    dynamicDiscovery: "disabled",
    mcpLaunch: "none",
    execution: "metadata-only",
    redactions: stringArray(value.redactions),
    warnings: stringArray(value.warnings),
  };
  return {
    ok: true,
    metadata,
    evidence: [
      "browser-skill-runner-metadata:validated",
      "browser-skill-runner-metadata:metadata-only",
      "browser-skill-runner-metadata:no-dynamic-discovery",
      "browser-skill-runner-metadata:no-mcp-launch",
      "browser-skill-runner-metadata:no-raw-content",
    ],
    warnings: metadata.warnings,
  };
}

function invalid(
  reason: string,
  evidence: readonly string[] = [],
): Extract<BrowserSkillRunnerMetadataValidationResult, { ok: false }> {
  return {
    ok: false,
    reason,
    evidence: ["browser-skill-runner-metadata:invalid", ...evidence],
    warnings: ["browser-skill-runner-metadata:blocked"],
  };
}

function isSource(value: unknown): value is BrowserSkillRunnerSource {
  return value === "explicit-manifest" || value === "skill-managed" || value === "test-only" || value === "disabled";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => sanitizeBrowserText(item, 120))
    : [];
}

function sanitizeId(value: string): string {
  return sanitizeBrowserText(value, 120).replace(/[^A-Za-z0-9:_./-]+/g, "-");
}

function hasForbiddenContent(value: string): boolean {
  return /(api[_-]?key|token|secret|password|bearer\s+|BEGIN [A-Z ]+PRIVATE KEY|https?:\/\/)/i.test(value);
}
