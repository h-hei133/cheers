import { mapTerminalToOrchestrationResult } from "../core/query/resultMapper.js";
import type { QueryRuntimeState } from "../core/query/runtimeState.js";
import type { QueryTerminal } from "../core/query/transitions.js";
import { createEmptyLifecycleIndex } from "../core/tools/toolResultLifecycle.js";
import type {
  CodingPatchFailureCode,
  CodingResultSummary,
  OrchestrationResult,
} from "./types.js";
import type { RealProviderProposalDryRunResult } from "./realProviderProposalDryRun.js";

export function buildProviderDryRunResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly dryRun: RealProviderProposalDryRunResult;
}): OrchestrationResult {
  const codingResult = buildCodingResult(input.dryRun);
  return mapTerminalToOrchestrationResult(
    buildRuntimeState({
      sessionId: input.sessionId,
      prompt: input.prompt,
      dryRun: input.dryRun,
      codingResult,
    }),
    buildTerminalInput(input.dryRun),
  );
}

function buildCodingResult(dryRun: RealProviderProposalDryRunResult): CodingResultSummary {
  const manifest = "manifest" in dryRun ? dryRun.manifest : undefined;
  const target =
    manifest?.targets.map((entry) => entry.pathLabel).join(", ") ??
    "(real-provider proposal dry-run)";
  const summary = [
    `real-provider-proposal-dry-run id=${dryRun.dryRunId}`,
    `status=${dryRun.status}`,
    `provider=${dryRun.providerSafeLabel ?? "(none)"}`,
    `providerCalled=${dryRun.providerCalled}`,
    `gate=${dryRun.gate.decision}`,
    dryRun.promptAudit ? `promptAudit=${dryRun.promptAudit.status}` : undefined,
    dryRun.outputValidation ? `outputValidation=${dryRun.outputValidation.status}` : undefined,
    dryRun.anchorQuality ? `anchorQuality=${dryRun.anchorQuality.level}` : undefined,
    dryRun.anchoredProposal ? `anchoredProposal=${dryRun.anchoredProposal.anchoredProposalId}` : undefined,
    dryRun.anchoringResult ? `anchoring=${dryRun.anchoringResult.status}` : undefined,
    manifest ? `proposal=${manifest.proposalId}` : undefined,
    `reviewRequired=${manifest?.reviewRequired ?? false}`,
    `handoffReadiness=${manifest?.handoffReadiness ?? "none"}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].filter(Boolean).join("; ");
  const evidence = [
    ...(manifest ? manifest.evidence : []),
    ...(dryRun.anchoredProposal ? dryRun.anchoredProposal.evidence : []),
    ...(dryRun.anchoringResult ? dryRun.anchoringResult.evidence : []),
    ...dryRun.evidence,
    summary,
    `real-provider-proposal-dry-run-result:status:${dryRun.status}`,
    "real-provider-proposal-dry-run-result:mutation-authority:not-granted",
    "real-provider-proposal-dry-run-result:mutation:not-run",
    "real-provider-proposal-dry-run-result:raw-content-excluded",
    "actionable-blocker-kind:unsupported-future-edit",
  ];

  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [{ path: target, reason: dryRun.reason }],
    patches: [
      {
        path: target,
        operation: "replace",
        status: "failed",
        failureCode: patchFailureCode(dryRun.status),
        reason: dryRun.reason,
      },
    ],
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [
        "real-provider proposal dry-run is no-write; existing edit lanes own mutation.",
      ],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence,
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [],
      changedFiles: [],
      unchangedAttemptedFiles: manifest?.targets.map((entry) => entry.pathLabel) ?? [],
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: [dryRun.reason],
      requiredEvidence: [
        "explicit provider dry-run opt-in",
        "prompt audit pass",
        "provider output validation",
        "anchor quality classification",
        "provider proposal anchoring result",
        "anchored proposal review and explicit confirmation before apply",
        "proposal review and explicit confirmation before apply",
      ],
      observedEvidence: evidence,
    },
    verifiedFiles: [],
    unverifiedFiles: [{ path: target, reason: dryRun.reason }],
    verification: {
      status: "blocked",
      reason: dryRun.reason,
      blockerKind: "unknown",
      nextAction: dryRun.nextAction,
    },
    evidence,
    lastActionResultSeed: {
      actionKind: "edit-file",
      changedFiles: [],
      verifiedFiles: [],
      verification: {
        status: "blocked",
        reason: dryRun.reason,
        blockerKind: "unknown",
      },
      reason: dryRun.reason,
      blockerKind: "unknown",
    },
    failureBoundary: `real-provider-proposal-dry-run-${dryRun.status}`,
  };
}

function buildRuntimeState(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly dryRun: RealProviderProposalDryRunResult;
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
        "real-provider proposal dry-run evaluated no-write.",
        `real-provider proposal dry-run status=${input.dryRun.status}`,
      ],
      handoffs: [],
    },
    transcript: [
      {
        role: "coder",
        content: buildOutput(input.dryRun),
        codingResult: input.codingResult,
      },
    ],
    visitedTransitions: new Set<string>(),
  };
}

function buildTerminalInput(dryRun: RealProviderProposalDryRunResult): QueryTerminal {
  return {
    action: "terminal",
    terminalReason: "stopped_error",
    terminalClassification: "stopped",
    stopReason: dryRun.nextAction,
  };
}

function buildOutput(dryRun: RealProviderProposalDryRunResult): string {
  const manifest = "manifest" in dryRun ? dryRun.manifest : undefined;
  return [
    "real-provider proposal dry-run evaluated; mutation did not run.",
    `Dry-run: ${dryRun.dryRunId}`,
    `Status: ${dryRun.status}`,
    `Provider called: ${dryRun.providerCalled ? "yes" : "no"}`,
    `Gate: ${dryRun.gate.decision}`,
    `Prompt audit: ${dryRun.promptAudit?.status ?? "none"}`,
    `Output validation: ${dryRun.outputValidation?.status ?? "none"}`,
    `Anchor quality: ${dryRun.anchorQuality?.level ?? "none"}`,
    `Anchored proposal: ${dryRun.anchoredProposal?.anchoredProposalId ?? "(none)"}`,
    `Anchoring result: ${dryRun.anchoringResult?.status ?? "none"}`,
    `Proposal: ${manifest?.proposalId ?? "(none)"}`,
    `Next: ${dryRun.nextAction}`,
    "Mutation authority: not granted",
    "Raw content: excluded",
  ].join("\n");
}

function patchFailureCode(status: RealProviderProposalDryRunResult["status"]): CodingPatchFailureCode {
  switch (status) {
    case "dry-run-provider-invalid-output":
    case "dry-run-anchor-quality-low":
    case "dry-run-prompt-audit-failed":
      return "patch-generation-failed";
    default:
      return "patch-ambiguous";
  }
}
