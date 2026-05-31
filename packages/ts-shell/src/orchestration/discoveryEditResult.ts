import { mapTerminalToOrchestrationResult } from "../core/query/mapping/mapper.js";
import type { QueryRuntimeState } from "../core/query/runtime/state.js";
import type { QueryTerminal } from "../core/query/runtime/transitions.js";
import { createEmptyLifecycleIndex } from "../core/tools/toolResultLifecycle.js";
import type {
  CodingPatchFailureCode,
  CodingResultSummary,
  OrchestrationResult,
} from "./types.js";
import type { DiscoveryEditPlan } from "./discoveryEditPlanner.js";

export function buildDiscoveryEditPlanResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly plan: Exclude<
    DiscoveryEditPlan,
    { status: "ready-for-handoff" } | { status: "ready-for-target-set" }
  >;
}): OrchestrationResult {
  const codingResult = buildCodingResult(input.plan);
  return mapTerminalToOrchestrationResult(
    buildRuntimeState({
      sessionId: input.sessionId,
      prompt: input.prompt,
      plan: input.plan,
      codingResult,
    }),
    buildTerminalInput(input.plan),
  );
}

function buildCodingResult(
  plan: Exclude<
    DiscoveryEditPlan,
    { status: "ready-for-handoff" } | { status: "ready-for-target-set" }
  >,
): CodingResultSummary {
  const target = plan.manifest.candidates
    .map((candidate) => candidate.pathLabel)
    .join(", ") || "(discovery candidates)";
  const reason = plan.reason;
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [{ path: target, reason }],
    patches: [
      {
        path: target,
        operation: "replace",
        status: "failed",
        failureCode: patchFailureCode(plan.blocker),
        reason,
      },
    ],
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: ["discovery edit manifest is no-write; no repair was attempted."],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: [
        plan.manifest.transcriptSummary,
        ...plan.manifest.evidence,
        ...plan.confirmation.evidence,
        "discovery-edit-result:continuation-safe",
        "discovery-edit-result:mutation:not-run",
        "discovery-edit-result:raw-content-excluded",
        "actionable-blocker-kind:unsupported-future-edit",
      ],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [],
      changedFiles: [],
      unchangedAttemptedFiles: plan.manifest.candidates.map(
        (candidate) => candidate.path,
      ),
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: [reason],
      requiredEvidence: [
        "bounded discovery candidate manifest",
        "mutationAuthority:not-granted",
        "explicit single-target confirmation",
        "exact old/new fenced mapping",
        "workspace authority before write",
        "final stale-read before write",
        "pre-write snapshot receipt before write",
        "post-write verification after write",
      ],
      observedEvidence: [...plan.evidence],
    },
    verifiedFiles: [],
    unverifiedFiles: [{ path: target, reason }],
    verification: {
      status: "blocked",
      reason,
      blockerKind: "unknown",
      nextAction: plan.nextAction,
    },
    evidence: [
      ...plan.evidence,
      "discovery-edit-result:manifest-produced",
      `discovery-edit-result:blocker:${plan.blocker}`,
      "discovery-edit-result:mutation-authority:not-granted",
      "discovery-edit-result:mutation:not-run",
      "discovery-edit-result:raw-content-excluded",
      "actionable-blocker-kind:unsupported-future-edit",
    ],
    lastActionResultSeed: {
      actionKind: "edit-file",
      changedFiles: [],
      verifiedFiles: [],
      verification: {
        status: "blocked",
        reason,
        blockerKind: "unknown",
      },
      reason,
      blockerKind: "unknown",
    },
    failureBoundary: `discovery-edit-${plan.blocker}`,
  };
}

function buildRuntimeState(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly plan: Exclude<
    DiscoveryEditPlan,
    { status: "ready-for-handoff" } | { status: "ready-for-target-set" }
  >;
  readonly codingResult: CodingResultSummary;
}): QueryRuntimeState {
  return {
    config: {
      sessionId: input.sessionId,
      initialPrompt: input.prompt,
      maxTurns: 1,
      startingRole: "coder",
    },
    currentRole: "coder",
    turn: 1,
    pendingLifecycle: createEmptyLifecycleIndex(),
    sharedContext: {
      sessionId: input.sessionId,
      initialPrompt: input.prompt,
      notes: [
        "discovery edit result consumed Edit/Patch owned manifest output.",
        `discovery edit manifest=${input.plan.manifest.manifestId}`,
        `discovery edit status=${input.plan.status}`,
      ],
      handoffs: [],
    },
    transcript: [
      {
        role: "coder",
        content: buildOutput(input.plan),
        codingResult: input.codingResult,
      },
    ],
    visitedTransitions: new Set<string>(),
  };
}

function buildTerminalInput(
  plan: Exclude<
    DiscoveryEditPlan,
    { status: "ready-for-handoff" } | { status: "ready-for-target-set" }
  >,
): QueryTerminal {
  return {
    action: "terminal",
    terminalReason: "stopped_error",
    terminalClassification: "stopped",
    stopReason: plan.nextAction,
  };
}

function buildOutput(
  plan: Exclude<
    DiscoveryEditPlan,
    { status: "ready-for-handoff" } | { status: "ready-for-target-set" }
  >,
): string {
  const candidateLines = plan.manifest.candidates.length
    ? plan.manifest.candidates.map(
        (candidate) =>
          `- ${candidate.pathLabel}: ${candidate.evidenceSummary}; confidence=${candidate.confidence}; operation=${candidate.plannedOperationKind}`,
      )
    : ["- (none)"];
  return [
    "discovery edit manifest produced; mutation did not run.",
    `Manifest: ${plan.manifest.manifestId}`,
    `Mutation authority: ${plan.manifest.mutationAuthority}`,
    `Confirmation: ${plan.confirmation.state}`,
    "Candidates:",
    ...candidateLines,
    `Reason: ${plan.reason}`,
    `Next: ${plan.nextAction}`,
  ].join("\n");
}

function patchFailureCode(blocker: string): CodingPatchFailureCode {
  switch (blocker) {
    case "no-candidates":
      return "target-not-found";
    case "too-many-candidates":
    case "ambiguous-candidates":
    case "invalid-confirmation":
    case "multi-target-mutation-unsupported":
      return "patch-ambiguous";
    case "missing-mapping":
    case "unsupported-fuzzy-discovery":
    case "unsupported-generated-discovery":
    case "unsupported-broad-refactor":
    case "confirmation-required":
      return "patch-generation-failed";
    default:
      return "patch-generation-failed";
  }
}
