import {
  buildClaimLedgerProjection,
  type ClaimLedgerEvidenceSource,
  type ClaimLedgerMutationScope,
  type ClaimLedgerPerFileClaim,
  type ClaimLedgerProjection,
} from "./claimLedgerProjection.js";
import type { FencedEditMapping } from "./fencedEditPlanner.js";
import type {
  PlanningMutationHandoffVerificationIntent,
} from "../planning/handoff/mutation.js";
import type { PlanningMutationProofHandoff } from "./planningMutationProofHandoff.js";
import type { PlanningMutationProposalBridge } from "../planning/handoff/bridge.js";
import {
  classifyRealTaskLoopApplyStatus,
  classifyRealTaskLoopRecoveryStatus,
  classifyRealTaskLoopSnapshotStatus,
} from "./realTaskLoopResult.js";

export type PlanningMutationProofVerificationState =
  | "confirmation-required"
  | "not-run"
  | "verified"
  | "repair-ready"
  | "stopped"
  | "unsupported";

export interface PlanningMutationProofVerification {
  readonly verificationId: string;
  readonly sourceProofHandoffId: string;
  readonly sourceBridgeId: string;
  readonly state: PlanningMutationProofVerificationState;
  readonly applyState: PlanningMutationProofHandoff["applyState"];
  readonly verificationState: "not-run" | "succeeded" | "failed";
  readonly verificationIntent: PlanningMutationHandoffVerificationIntent;
  readonly changedFiles: readonly string[];
  readonly unexpectedChangedFiles: readonly string[];
  readonly verifiedFiles: readonly string[];
  readonly unverifiedFiles: readonly string[];
  readonly failedFiles: readonly string[];
  readonly repairState: ClaimLedgerProjection["repair"]["status"];
  readonly terminalState: ClaimLedgerProjection["terminal"]["status"];
  readonly terminalResult: ClaimLedgerProjection["terminal"]["resultStatus"];
  readonly liveSuccess: boolean;
  readonly providerCallDuringApply: false;
  readonly mutationScope: ClaimLedgerMutationScope;
  readonly perFileClaims: readonly ClaimLedgerPerFileClaim[];
  readonly claimLedger: ClaimLedgerProjection;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
  readonly transcriptSummary: string;
}

export function verifyPlanningMutationProofHandoff(input: {
  readonly bridge: PlanningMutationProposalBridge;
  readonly proofHandoff: PlanningMutationProofHandoff;
  readonly verificationIntent?: PlanningMutationHandoffVerificationIntent;
  readonly readVerifiedFile?: (relativePath: string) => string | undefined;
  readonly expectedContentByTargetPath?: ReadonlyMap<string, string>;
  readonly evidenceSource?: ClaimLedgerEvidenceSource;
  readonly providerKind?: string;
  readonly providerCalled?: boolean;
  readonly liveOptIn?: boolean;
}): PlanningMutationProofVerification {
  const verificationIntent = input.verificationIntent ?? {
    available: false,
    summary: "No planning verification intent was provided for proof handoff verification.",
    evidenceIds: [],
  };
  const targetMappings = buildTargetMappings(input.bridge);
  const requiredTargetPaths = Array.from(targetMappings.keys());
  const routeFileResults = routeFileResultsFor(input.proofHandoff);
  const unexpectedChangedFiles = input.proofHandoff.changedFiles
    .filter((targetPath) => !requiredTargetPaths.includes(targetPath));
  const perFileClaims = buildPerFileClaims({
    proofHandoff: input.proofHandoff,
    targetMappings,
    routeFileResults,
    unexpectedChangedFiles,
    readVerifiedFile: input.readVerifiedFile,
    expectedContentByTargetPath: input.expectedContentByTargetPath,
  });
  const applyStatus = classifyRealTaskLoopApplyStatus(input.proofHandoff.applyResult);
  const verificationStatus = classifyVerificationStatus({
    applyStatus,
    perFileClaims,
    unexpectedChangedFiles,
    readbackRequested: Boolean(input.readVerifiedFile),
  });
  const claimLedger = buildClaimLedgerProjection({
    taskLoopId: `route209_${input.proofHandoff.proofHandoffId}`,
    fixtureId: input.proofHandoff.sourceBridgeId,
    evidenceSource: input.evidenceSource ?? "focused-tests",
    providerKind: input.providerKind ?? "openai-compatible",
    liveOptIn: input.liveOptIn ?? false,
    providerCalled: input.providerCalled ?? false,
    outputValidationStatus: outputValidationStatus(input.bridge),
    anchorQuality: input.bridge.anchoredProposal?.anchorQualityLevel ?? input.bridge.anchorState,
    handoffReadiness: input.bridge.anchoredProposal?.handoffReadiness,
    confirmationStatus: claimLedgerConfirmationStatus(input.proofHandoff),
    applyStatus,
    verificationStatus,
    snapshotStatus: classifyRealTaskLoopSnapshotStatus(input.proofHandoff.applyResult),
    recoveryStatus: classifyRealTaskLoopRecoveryStatus(input.proofHandoff.applyResult),
    mutationScope: mutationScopeFor(input.proofHandoff),
    providerCallDuringApply: input.proofHandoff.providerCallDuringApply,
    scorecardStatus: scorecardStatus({ applyStatus, verificationStatus }),
    perFileClaims,
    requiredTargetPaths,
  });
  const state = verificationState({ proofHandoff: input.proofHandoff, verificationStatus, claimLedger });
  const verifiedFiles = perFileClaims
    .filter((claim) => claim.verificationStatus === "succeeded")
    .map((claim) => claim.targetPath);
  const failedFiles = perFileClaims
    .filter((claim) => claim.fileStatus === "failed")
    .map((claim) => claim.targetPath);
  const unverifiedFiles = perFileClaims
    .filter((claim) => claim.verificationStatus !== "succeeded")
    .map((claim) => claim.targetPath);
  const evidence = unique([
    `planning-mutation-proof-verification:id:${verificationId(input.proofHandoff)}`,
    `planning-mutation-proof-verification:proof-handoff:${input.proofHandoff.proofHandoffId}`,
    `planning-mutation-proof-verification:bridge:${input.bridge.bridgeId}`,
    `planning-mutation-proof-verification:state:${state}`,
    `planning-mutation-proof-verification:apply:${input.proofHandoff.applyState}`,
    `planning-mutation-proof-verification:verification:${verificationStatus}`,
    `planning-mutation-proof-verification:intent:${verificationIntent.available ? "available" : "missing"}`,
    `planning-mutation-proof-verification:changed-count:${input.proofHandoff.changedFiles.length}`,
    `planning-mutation-proof-verification:unexpected-changed-count:${unexpectedChangedFiles.length}`,
    `planning-mutation-proof-verification:verified-count:${verifiedFiles.length}`,
    `planning-mutation-proof-verification:unverified-count:${unverifiedFiles.length}`,
    `planning-mutation-proof-verification:terminal:${claimLedger.terminal.status}`,
    `planning-mutation-proof-verification:terminal-result:${claimLedger.terminal.resultStatus}`,
    `planning-mutation-proof-verification:repair:${claimLedger.repair.status}`,
    "planning-mutation-proof-verification:provider-call-during-apply:false",
    "planning-mutation-proof-verification:raw-content-excluded",
    ...unexpectedChangedFiles.map((targetPath) =>
      `planning-mutation-proof-verification:unexpected-changed-file:${targetPath}`,
    ),
    ...verificationIntent.evidenceIds.map((id) => `planning-mutation-proof-verification:intent-evidence:${id}`),
    ...input.proofHandoff.evidence,
    ...perFileClaims.flatMap((claim) => claim.evidence),
    ...claimLedger.evidence,
  ]);
  return {
    verificationId: verificationId(input.proofHandoff),
    sourceProofHandoffId: input.proofHandoff.proofHandoffId,
    sourceBridgeId: input.bridge.bridgeId,
    state,
    applyState: input.proofHandoff.applyState,
    verificationState: verificationStatus,
    verificationIntent,
    changedFiles: input.proofHandoff.changedFiles,
    verifiedFiles,
    unverifiedFiles,
    failedFiles,
    repairState: claimLedger.repair.status,
    terminalState: claimLedger.terminal.status,
    terminalResult: claimLedger.terminal.resultStatus,
    liveSuccess: claimLedger.terminal.liveSuccess,
    providerCallDuringApply: false,
    mutationScope: mutationScopeFor(input.proofHandoff),
    unexpectedChangedFiles,
    perFileClaims,
    claimLedger,
    reason: claimLedger.terminal.reason,
    nextAction: nextAction({ state, claimLedger }),
    evidence,
    transcriptSummary: [
      `planning-mutation-proof-verification proof=${input.proofHandoff.proofHandoffId}`,
      `state=${state}`,
      `apply=${input.proofHandoff.applyState}`,
      `verification=${verificationStatus}`,
      `terminal=${claimLedger.terminal.status}`,
      `repair=${claimLedger.repair.status}`,
      "providerCallDuringApply=false",
      "raw-content-excluded",
    ].join("; "),
  };
}

function mutationScopeFor(
  proofHandoff: PlanningMutationProofHandoff,
): ClaimLedgerMutationScope {
  if (proofHandoff.changedFiles.length === 0) {
    return "none";
  }
  if (proofHandoff.workspaceScope === "selected-workspace") {
    return "selected-workspace";
  }
  return "controlled-temp-workspace";
}

function buildTargetMappings(
  bridge: PlanningMutationProposalBridge,
): ReadonlyMap<string, readonly FencedEditMapping[]> {
  const targetMappings = new Map<string, FencedEditMapping[]>();
  for (const hunk of bridge.anchoredProposal?.hunks ?? []) {
    if (!hunk.exactMappingReady) continue;
    const mapping = bridge.anchoredMappingByHunkId?.get(hunk.hunkId);
    if (!mapping) continue;
    const mappings = targetMappings.get(hunk.targetLabel) ?? [];
    mappings.push(mapping);
    targetMappings.set(hunk.targetLabel, mappings);
  }
  return targetMappings;
}

function buildPerFileClaims(input: {
  readonly proofHandoff: PlanningMutationProofHandoff;
  readonly targetMappings: ReadonlyMap<string, readonly FencedEditMapping[]>;
  readonly routeFileResults: readonly RouteFileResult[];
  readonly unexpectedChangedFiles: readonly string[];
  readonly readVerifiedFile?: (relativePath: string) => string | undefined;
  readonly expectedContentByTargetPath?: ReadonlyMap<string, string>;
}): readonly ClaimLedgerPerFileClaim[] {
  const expectedClaims: ClaimLedgerPerFileClaim[] = Array.from(input.targetMappings.entries()).map(([targetPath, mappings]) => {
    const fileResult = input.routeFileResults.find((result) => result.targetPath === targetPath);
    const fileStatus = fileStatusFor(fileResult, input.proofHandoff.changedFiles.includes(targetPath));
    const readback = input.readVerifiedFile && fileStatus === "changed"
      ? verifyReadback({
          targetPath,
          mappings,
          readVerifiedFile: input.readVerifiedFile,
          expectedContent: input.expectedContentByTargetPath?.get(targetPath),
        })
      : {
          status: "not-run" as const,
          evidence: [
            `planning-mutation-proof-verification:file:${targetPath}:readback:not-run`,
            "planning-mutation-proof-verification:file:raw-content-excluded",
          ],
        };
    const verificationStatus =
      readback.status === "passed" ? "succeeded" : readback.status === "failed" ? "failed" : "not-run";
    const applyStatus =
      fileStatus === "changed" ? "succeeded" : fileStatus === "failed" ? "failed" : "not-run";
    return {
      targetPath,
      proposalStatus: mappings.length > 0 ? "proven" : "not-proven",
      anchorQuality: mappings.length > 0 ? "exact-ready" : "missing",
      authorityStatus: input.proofHandoff.confirmationState === "trusted-confirmed" ? "proven" : "blocked",
      applyStatus,
      applyRuntimeDerived: Boolean(fileResult) || fileStatus === "changed",
      verificationStatus,
      readbackRuntimeDerived: readback.status !== "not-run",
      verificationEvidenceCount: readback.status === "not-run" ? 0 : readback.evidence.length,
      fileStatus,
      snapshotStatus: fileStatus === "changed" ? "created" : fileStatus === "failed" ? "blocked" : "not-run",
      recoveryStatus: fileStatus === "changed" ? "available" : fileStatus === "failed" ? "blocked" : "not-run",
      evidence: [
        `planning-mutation-proof-verification:file:${targetPath}:status:${fileStatus}`,
        `planning-mutation-proof-verification:file:${targetPath}:apply:${applyStatus}`,
        `planning-mutation-proof-verification:file:${targetPath}:verification:${verificationStatus}`,
        `planning-mutation-proof-verification:file:${targetPath}:mappings:${mappings.length}`,
        ...readback.evidence,
      ],
    };
  });
  const unexpectedClaims: ClaimLedgerPerFileClaim[] = input.unexpectedChangedFiles.map((targetPath) =>
    unexpectedChangedFileClaim(targetPath),
  );
  return [...expectedClaims, ...unexpectedClaims];
}

function unexpectedChangedFileClaim(targetPath: string): ClaimLedgerPerFileClaim {
  return {
    targetPath,
    proposalStatus: "not-proven",
    anchorQuality: "missing",
    authorityStatus: "invalid",
    applyStatus: "failed",
    applyRuntimeDerived: true,
    verificationStatus: "failed",
    readbackRuntimeDerived: false,
    verificationEvidenceCount: 0,
    fileStatus: "failed",
    snapshotStatus: "blocked",
    recoveryStatus: "blocked",
    evidence: [
      `planning-mutation-proof-verification:file:${targetPath}:status:unexpected-changed`,
      `planning-mutation-proof-verification:file:${targetPath}:apply:failed`,
      `planning-mutation-proof-verification:file:${targetPath}:verification:failed`,
      `planning-mutation-proof-verification:unexpected-changed-file:${targetPath}`,
      "planning-mutation-proof-verification:file:raw-content-excluded",
    ],
  };
}

function verifyReadback(input: {
  readonly targetPath: string;
  readonly mappings: readonly FencedEditMapping[];
  readonly readVerifiedFile: (relativePath: string) => string | undefined;
  readonly expectedContent?: string;
}): { readonly status: "passed" | "failed" | "not-run"; readonly evidence: readonly string[] } {
  const content = input.readVerifiedFile(input.targetPath);
  if (content === undefined) {
    return {
      status: "failed",
      evidence: [
        `planning-mutation-proof-verification:file:${input.targetPath}:readback:failed`,
        `planning-mutation-proof-verification:file:${input.targetPath}:readback-readable:false`,
        "planning-mutation-proof-verification:file:raw-content-excluded",
      ],
    };
  }
  if (input.expectedContent === undefined) {
    return {
      status: "not-run",
      evidence: [
        `planning-mutation-proof-verification:file:${input.targetPath}:readback:not-run`,
        `planning-mutation-proof-verification:file:${input.targetPath}:expected-content:missing`,
        "planning-mutation-proof-verification:file:raw-content-excluded",
      ],
    };
  }
  if (content === input.expectedContent) {
    return {
      status: "passed",
      evidence: [
        `planning-mutation-proof-verification:file:${input.targetPath}:readback:passed`,
        `planning-mutation-proof-verification:file:${input.targetPath}:expected-content:matched`,
        "planning-mutation-proof-verification:file:readback-runtime-derived",
        "planning-mutation-proof-verification:file:raw-content-excluded",
      ],
    };
  }
  const missingNew = input.mappings.some((mapping) => !content.includes(mapping.newText));
  const staleOld = input.mappings.some((mapping) => content.includes(mapping.oldText));
  return {
    status: "failed",
    evidence: [
      `planning-mutation-proof-verification:file:${input.targetPath}:readback:failed`,
      `planning-mutation-proof-verification:file:${input.targetPath}:expected-content:mismatch`,
      `planning-mutation-proof-verification:file:${input.targetPath}:expected-new-present:${missingNew ? "false" : "true"}`,
      `planning-mutation-proof-verification:file:${input.targetPath}:old-text-absent:${staleOld ? "false" : "true"}`,
      "planning-mutation-proof-verification:file:readback-runtime-derived",
      "planning-mutation-proof-verification:file:raw-content-excluded",
    ],
  };
}

interface RouteFileResult {
  readonly targetPath: string;
  readonly status: "written" | "stopped" | "failed" | "not-run";
}

function routeFileResultsFor(
  proofHandoff: PlanningMutationProofHandoff,
): readonly RouteFileResult[] {
  const applyResult = proofHandoff.applyResult;
  if (!applyResult || !("route" in applyResult)) return [];
  if ("fileResults" in applyResult.route) {
    return applyResult.route.fileResults.map((result) => ({
      targetPath: result.targetPath,
      status: result.status,
    }));
  }
  if ("targetPath" in applyResult.route) {
    return [{
      targetPath: applyResult.route.targetPath,
      status: applyResult.route.status === "written" ? "written" : "stopped",
    }];
  }
  return [];
}

function fileStatusFor(
  fileResult: RouteFileResult | undefined,
  changed: boolean,
): ClaimLedgerPerFileClaim["fileStatus"] {
  if (changed || fileResult?.status === "written") return "changed";
  if (fileResult?.status === "failed" || fileResult?.status === "stopped") return "failed";
  return "unattempted";
}

function classifyVerificationStatus(input: {
  readonly applyStatus: "not-run" | "succeeded" | "stopped" | "failed";
  readonly perFileClaims: readonly ClaimLedgerPerFileClaim[];
  readonly unexpectedChangedFiles: readonly string[];
  readonly readbackRequested: boolean;
}): "not-run" | "succeeded" | "failed" {
  if (input.unexpectedChangedFiles.length > 0) return "failed";
  if (input.applyStatus !== "succeeded") return "not-run";
  if (!input.readbackRequested || input.perFileClaims.length === 0) return "not-run";
  if (input.perFileClaims.every((claim) => claim.verificationStatus === "succeeded")) {
    return "succeeded";
  }
  return "failed";
}

function verificationState(input: {
  readonly proofHandoff: PlanningMutationProofHandoff;
  readonly verificationStatus: "not-run" | "succeeded" | "failed";
  readonly claimLedger: ClaimLedgerProjection;
}): PlanningMutationProofVerificationState {
  if (input.proofHandoff.state === "confirmation-required") return "confirmation-required";
  if (input.proofHandoff.state === "unsupported") return "unsupported";
  if (input.verificationStatus === "succeeded") return "verified";
  if (input.verificationStatus === "failed") return "repair-ready";
  if (input.proofHandoff.state === "applied") return "not-run";
  return "stopped";
}

function claimLedgerConfirmationStatus(proofHandoff: PlanningMutationProofHandoff): string {
  if (proofHandoff.confirmationState === "trusted-confirmed") return "trusted-confirmed";
  if (proofHandoff.state === "confirmation-required") return "required";
  if (proofHandoff.confirmationState === "unsupported") return "invalid";
  return "not-requested";
}

function outputValidationStatus(bridge: PlanningMutationProposalBridge): string {
  if (bridge.anchoredProposal?.handoffReadiness === "exact-single-target") {
    return "valid-exact-single-target";
  }
  if (bridge.anchoredProposal?.handoffReadiness === "exact-hunk-set") {
    return "valid-exact-hunk-set";
  }
  return "none";
}

function scorecardStatus(input: {
  readonly applyStatus: "not-run" | "succeeded" | "stopped" | "failed";
  readonly verificationStatus: "not-run" | "succeeded" | "failed";
}): "pass" | "warn" | "fail" | "skip" {
  if (input.applyStatus === "not-run") return "skip";
  if (input.applyStatus !== "succeeded") return "fail";
  if (input.verificationStatus === "succeeded") return "pass";
  if (input.verificationStatus === "failed") return "warn";
  return "skip";
}

function nextAction(input: {
  readonly state: PlanningMutationProofVerificationState;
  readonly claimLedger: ClaimLedgerProjection;
}): string {
  if (input.state === "verified") {
    return "Use the Claim Ledger verdict as the terminal result; do not relabel focused evidence as live success.";
  }
  if (input.state === "repair-ready") {
    return "Open a separate review-gated repair handoff from the failed readback evidence.";
  }
  if (input.state === "not-run") {
    return "Run readback verification before claiming task success.";
  }
  return input.claimLedger.terminal.reason;
}

function verificationId(proofHandoff: PlanningMutationProofHandoff): string {
  return `planning-proof-verification-${proofHandoff.proofHandoffId.replace(/^planning-proof-handoff-/, "")}`;
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
