import type { ContextLayerId } from "./contextLayerModel.js";

export type ContextContinuitySection =
  | "mustSurviveCompact"
  | "shouldSurviveCompact"
  | "mustNotSurviveCompact"
  | "memoryCandidateOnly"
  | "sidebarOnly"
  | "startupWarmCandidate";

export interface ContextContinuityManifestEntry {
  readonly id: string;
  readonly layer: ContextLayerId;
  readonly description: string;
  readonly section: ContextContinuitySection;
  readonly evidence: readonly string[];
  readonly rationale: string;
}

export interface ContextContinuityManifest {
  readonly route: "74";
  readonly status: "baseline-candidate";
  readonly generatedFor: "context-engineering-baseline";
  readonly editCloseoutSource: "Route 73 editCapabilityCloseoutManifest";
  readonly compactSurvivorFactsAreMachineCheckable: true;
  readonly rawOriginalContentSurvivesCompact: false;
  readonly secretsSurviveCompact: false;
  readonly automaticRecoveryImplied: false;
  readonly atomicRollbackImplied: false;
  readonly mustSurviveCompact: readonly ContextContinuityManifestEntry[];
  readonly shouldSurviveCompact: readonly ContextContinuityManifestEntry[];
  readonly mustNotSurviveCompact: readonly ContextContinuityManifestEntry[];
  readonly memoryCandidateOnly: readonly ContextContinuityManifestEntry[];
  readonly sidebarOnly: readonly ContextContinuityManifestEntry[];
  readonly startupWarmCandidate: readonly ContextContinuityManifestEntry[];
}

export const CONTEXT_CONTINUITY_MANIFEST: ContextContinuityManifest = {
  route: "74",
  status: "baseline-candidate",
  generatedFor: "context-engineering-baseline",
  editCloseoutSource: "Route 73 editCapabilityCloseoutManifest",
  compactSurvivorFactsAreMachineCheckable: true,
  rawOriginalContentSurvivesCompact: false,
  secretsSurviveCompact: false,
  automaticRecoveryImplied: false,
  atomicRollbackImplied: false,
  mustSurviveCompact: [
    must("current-task-goal", "task-goal", "Current user goal or route objective.", [
      "route74:objective",
      "session-resume:task-goal",
    ]),
    must("active-constraints", "task-goal", "Active constraints, forbidden files, and explicit non-goals.", [
      "AGENTS.md:repository-boundaries",
      "route74:forbidden-scope",
    ]),
    must("safe-project-root", "project", "Current project root when safe to summarize.", [
      "session:project-binding",
    ]),
    must("edit-closeout-status", "edit-capability", "Route 73 closeout-candidate status.", [
      "editCapabilityCloseoutManifest:status",
    ]),
    must("supported-edit-envelope", "edit-capability", "Supported bounded edit capability envelope.", [
      "editCapabilityReadiness:default-ready-candidate",
    ]),
    must("blocked-edit-capabilities", "edit-capability", "Blocked-by-design edit capabilities.", [
      "editCapabilityReadiness:blocked-by-design",
    ]),
    must("last-mutation-files", "mutation-evidence", "Last planned, changed, and failed files.", [
      "mutationContinuityState",
      "mutationVerificationProjection",
    ]),
    must("recovery-availability-summary", "recovery-restore", "Recovery and restore availability summary.", [
      "recoverySurfaceProjection",
    ]),
    must("restore-authority-reference", "recovery-restore", "Restore authority ids or references, not raw original content.", [
      "recoveryAuthorityStore:manifest-metadata-only",
    ]),
    must("validation-status-summary", "mutation-evidence", "Validation status summary and focused verifier results.", [
      "route74:validation-evidence",
    ]),
    must("explicit-user-decisions", "task-goal", "Explicit user decisions and approvals already supported by the session contract.", [
      "approvalMemoryCodec",
      "compactContinuitySummary",
    ]),
    must("unresolved-blockers-next-action", "task-goal", "Unresolved blockers and next action.", [
      "sessionStateSurface",
    ]),
  ],
  shouldSurviveCompact: [
    should("tool-availability-summary", "tool-availability", "Caller-supplied tool, MCP, or skill availability summary."),
    should("compact-natural-summary", "compact-summary", "Compact-safe natural language summary."),
    should("route-history-summary", "route-history", "Route/history summary without full logs."),
  ],
  mustNotSurviveCompact: [
    mustNot("raw-original-content", "recovery-restore", "Raw original content blobs."),
    mustNot("raw-secrets", "task-goal", "Raw secrets and provider credentials."),
    mustNot("raw-recovery-content", "recovery-restore", "Raw recovery authority content."),
    mustNot("ephemeral-temp-paths", "mutation-evidence", "Ephemeral temp paths unless user-provided as an explicit ledger root."),
    mustNot("full-command-output", "mutation-evidence", "Full command output without summarization."),
    mustNot("hidden-chain-of-thought", "compact-summary", "Hidden chain-of-thought."),
    mustNot("broad-raw-file-dumps", "project", "Broad raw file dumps."),
  ],
  memoryCandidateOnly: [
    memory("project-conventions", "project", "Stable project conventions."),
    memory("blocked-by-design-decisions", "edit-capability", "Durable blocked-by-design edit decisions."),
    memory("route-closeout-facts", "route-history", "Route closeout facts that are useful beyond this session."),
  ],
  sidebarOnly: [
    sidebar("changed-failed-restorable-files", "sidebar-state", "Changed, failed, restorable, and blocked file facts."),
    sidebar("blocked-next-action", "sidebar-state", "Blocked next action and explicit restore availability."),
    sidebar("tool-placeholders", "sidebar-state", "Tool/MCP/skill placeholders supplied by input without discovery."),
  ],
  startupWarmCandidate: [
    startup("project-root-and-route-status", "startup-warm", "Safe project root and current route status."),
    startup("edit-closeout-envelope", "startup-warm", "Route 73 edit closeout envelope summary."),
  ],
};

export function listContextContinuityManifestEntries(
  section?: ContextContinuitySection,
): readonly ContextContinuityManifestEntry[] {
  if (!section) {
    return [
      ...CONTEXT_CONTINUITY_MANIFEST.mustSurviveCompact,
      ...CONTEXT_CONTINUITY_MANIFEST.shouldSurviveCompact,
      ...CONTEXT_CONTINUITY_MANIFEST.mustNotSurviveCompact,
      ...CONTEXT_CONTINUITY_MANIFEST.memoryCandidateOnly,
      ...CONTEXT_CONTINUITY_MANIFEST.sidebarOnly,
      ...CONTEXT_CONTINUITY_MANIFEST.startupWarmCandidate,
    ];
  }
  return CONTEXT_CONTINUITY_MANIFEST[section];
}

function must(
  id: string,
  layer: ContextLayerId,
  description: string,
  evidence: readonly string[],
): ContextContinuityManifestEntry {
  return entry(id, layer, description, "mustSurviveCompact", evidence, "Required for safe compact/session continuation.");
}

function should(
  id: string,
  layer: ContextLayerId,
  description: string,
): ContextContinuityManifestEntry {
  return entry(id, layer, description, "shouldSurviveCompact", ["route74:continuity-baseline"], "Useful for continuity but not always available.");
}

function mustNot(
  id: string,
  layer: ContextLayerId,
  description: string,
): ContextContinuityManifestEntry {
  return entry(id, layer, description, "mustNotSurviveCompact", ["route74:redaction-boundary"], "Unsafe to persist through compact.");
}

function memory(
  id: string,
  layer: ContextLayerId,
  description: string,
): ContextContinuityManifestEntry {
  return entry(id, layer, description, "memoryCandidateOnly", ["route74:memory-boundary"], "Candidate only; Route 74 does not implement memory.");
}

function sidebar(
  id: string,
  layer: ContextLayerId,
  description: string,
): ContextContinuityManifestEntry {
  return entry(id, layer, description, "sidebarOnly", ["route74:sidebar-boundary"], "Projection only; Route 74 does not implement sidebar UI.");
}

function startup(
  id: string,
  layer: ContextLayerId,
  description: string,
): ContextContinuityManifestEntry {
  return entry(id, layer, description, "startupWarmCandidate", ["route74:startup-boundary"], "Candidate only; Route 74 does not implement a startup cache.");
}

function entry(
  id: string,
  layer: ContextLayerId,
  description: string,
  section: ContextContinuitySection,
  evidence: readonly string[],
  rationale: string,
): ContextContinuityManifestEntry {
  return {
    id,
    layer,
    description,
    section,
    evidence,
    rationale,
  };
}
