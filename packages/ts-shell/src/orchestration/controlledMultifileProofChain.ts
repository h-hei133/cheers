import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { applyEditProposalSelection, type EditProposalApplyResult } from "./editProposalApply.js";
import { selectEditProposalHunks } from "./editProposalSelection.js";
import {
  buildAnchoredProposalMappingByHunkId,
  buildAnchoredProviderProposalReview,
  type ProviderAnchoredProposalManifest,
} from "./providerAnchoredProposal.js";
import { detectProviderAnchorConflicts } from "./providerAnchorConflict.js";
import { classifyProviderAnchorQuality } from "./providerAnchorQuality.js";
import { matchProviderAnchorCandidates } from "./providerAnchorMatcher.js";
import { extractProviderProposalAnchors } from "./providerProposalAnchors.js";
import { validateProviderOutput } from "./providerOutputValidator.js";
import { createWorkspaceWriteAuthority } from "./patchResult/workspaceAuthority.js";
import {
  buildClaimLedgerProjection,
  type ClaimLedgerEvidenceSource,
  type ClaimLedgerPerFileClaim,
  type ClaimLedgerProjection,
  type ClaimLedgerRepairInput,
} from "./claimLedgerProjection.js";
import type { ProviderEditRawProposal } from "./providerEditProposal.js";
import { buildProviderAnchoredProposal } from "./providerAnchoredProposal.js";

export type ControlledMultifileProofScenario =
  | "success"
  | "partial-apply-failure"
  | "mixed-verification"
  | "verification-missing"
  | "unattempted-file"
  | "repair-handoff";

export interface ControlledMultifileProofResult {
  readonly scenario: ControlledMultifileProofScenario;
  readonly workspaceRoot: string;
  readonly cleanup: () => void;
  readonly providerCalled: boolean;
  readonly providerCallDuringApply: boolean;
  readonly applyResult?: EditProposalApplyResult;
  readonly perFileClaims: readonly ClaimLedgerPerFileClaim[];
  readonly claimLedger: ClaimLedgerProjection;
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly string[];
  readonly unattemptedFiles: readonly string[];
  readonly verifiedFiles: readonly string[];
  readonly unverifiedFiles: readonly string[];
  readonly output: string;
  readonly evidence: readonly string[];
}

const targets = ["src/a.ts", "src/b.ts"] as const;

const initialContent = {
  "src/a.ts": "export const a = \"draft\";\n",
  "src/b.ts": "export const b = \"draft\";\n",
} as const;

const expectedContent = {
  "src/a.ts": "export const a = \"ready\";\n",
  "src/b.ts": "export const b = \"ready\";\n",
} as const;

export async function runControlledMultifileProofChain(input: {
  readonly scenario: ControlledMultifileProofScenario;
  readonly requestId?: string;
  readonly evidenceSource?: ClaimLedgerEvidenceSource;
  readonly cleanupFixture?: boolean;
}): Promise<ControlledMultifileProofResult> {
  const requestId = input.requestId ?? `route206-${input.scenario}`;
  const fixture = createFixture(requestId);
  let cleaned = false;
  const cleanup = () => {
    if (!cleaned) {
      fs.rmSync(fixture.workspaceRoot, { recursive: true, force: true });
      cleaned = true;
    }
  };
  try {
    let providerCalls = 0;
    const rawOutput = providerProposal();
    providerCalls += 1;
    const currentContentByTargetLabel = new Map<string, string>(
      targets.map((target) => [target, readFile(fixture.workspaceRoot, target)]),
    );
    const validation = validateProviderOutput({
      requestId,
      rawOutput,
      explicitTargetLabels: targets,
    });
    const extraction = extractProviderProposalAnchors({
      requestId,
      rawOutput,
      validation,
    });
    const matchResult = matchProviderAnchorCandidates({
      requestId,
      candidates: extraction.candidates,
      explicitTargetLabels: targets,
      currentContentByTargetLabel,
      inWorkspaceTargetLabels: targets,
    });
    const conflict = detectProviderAnchorConflicts({
      requestId,
      matchResult,
      currentContentByTargetLabel,
    });
    const anchorQuality = classifyProviderAnchorQuality({
      requestId,
      validation,
      extraction,
      matchResult,
      conflict,
      verificationPlan: rawOutput.verificationPlan,
    });
    const anchoredProposal = buildProviderAnchoredProposal({
      requestId,
      extraction,
      matchResult,
      conflict,
      anchorQuality,
    });
    const review = buildAnchoredProviderProposalReview(anchoredProposal);
    const selection = selectEditProposalHunks({
      review,
      action: "select-all-exact",
      explicitConfirmation: true,
    });
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const callsBeforeApply = providerCalls;
    const applyResult = await applyEditProposalSelection({
      selection,
      mappingByHunkId: buildAnchoredProposalMappingByHunkId({
        manifest: anchoredProposal,
        matchResult,
      }),
      targetPathByLabel: new Map(targets.map((target) => [target, target])),
      fencedOptions: {
        workspaceRoot: fixture.workspaceRoot,
        explicitRuntimeOptIn: true,
        explicitWorkspaceWriteOptIn: true,
        requestedUserDecision: "approved",
        defaultProductionRejectionUnchanged: true,
        readFile: authority.readFile,
        readVerifiedFile: authority.readVerifiedFile,
        validateWriteTarget: authority.validateWriteTarget,
        writeFile: writeFileForScenario({
          workspaceRoot: fixture.workspaceRoot,
          scenario: input.scenario,
          writeFile: authority.writeFile,
        }),
      },
      targetSetOptions: {
        workspaceRoot: fixture.workspaceRoot,
        explicitRuntimeOptIn: true,
        explicitWorkspaceWriteOptIn: true,
        requestedUserDecision: "approved",
        defaultProductionRejectionUnchanged: true,
        readFile: authority.readFile,
        readVerifiedFile: authority.readVerifiedFile,
        validateWriteTarget: authority.validateWriteTarget,
        writeFile: writeFileForScenario({
          workspaceRoot: fixture.workspaceRoot,
          scenario: input.scenario,
          writeFile: authority.writeFile,
        }),
      },
    });
    const providerCallDuringApply = providerCalls > callsBeforeApply;
    const perFileClaims = buildPerFileClaims({
      applyResult,
      scenario: input.scenario,
      workspaceRoot: fixture.workspaceRoot,
      anchoredProposal,
      selectionState: selection.state,
      repairStatus: input.scenario === "repair-handoff" ? "repair-confirmation-required" : undefined,
    });
    const changedFiles = applyResult.changedFiles;
    const failedFiles = perFileClaims
      .filter((claim) => claim.fileStatus === "failed")
      .map((claim) => claim.targetPath);
    const unattemptedFiles = perFileClaims
      .filter((claim) => claim.fileStatus === "unattempted")
      .map((claim) => claim.targetPath);
    const verifiedFiles = perFileClaims
      .filter((claim) => claim.verificationStatus === "succeeded")
      .map((claim) => claim.targetPath);
    const unverifiedFiles = perFileClaims
      .filter((claim) => claim.verificationStatus !== "succeeded")
      .map((claim) => claim.targetPath);
    const applyStatus = classifyApplyStatus(applyResult);
    const verificationStatus = unverifiedFiles.length === 0 && changedFiles.length === targets.length
      ? "succeeded"
      : changedFiles.length > 0 ? "failed" : "not-run";
    const repair = input.scenario === "repair-handoff"
      ? repairInput(input.evidenceSource ?? "focused-tests")
      : undefined;
    const claimLedger = buildClaimLedgerProjection({
      taskLoopId: `route206_${requestId}`,
      fixtureId: fixture.fixtureId,
      evidenceSource: input.evidenceSource ?? "focused-tests",
      providerKind: "openai-compatible",
      liveOptIn: input.evidenceSource === "live-provider",
      providerCalled: true,
      outputValidationStatus: validation.status,
      anchorQuality: anchorQuality.level,
      handoffReadiness: anchoredProposal.handoffReadiness,
      confirmationStatus: "trusted-confirmed",
      applyStatus,
      verificationStatus,
      snapshotStatus: changedFiles.length > 0 ? "created" : "not-run",
      recoveryStatus: changedFiles.length > 0 ? "available" : "not-run",
      mutationScope: changedFiles.length > 0 ? "controlled-temp-workspace" : "none",
      providerCallDuringApply,
      scorecardStatus: claimLedgerScorecardStatus({ applyStatus, verificationStatus }),
      ...(repair ? { repair } : {}),
      perFileClaims,
      requiredTargetPaths: targets,
    });
    const evidence = [
      `route206:scenario:${input.scenario}`,
      "route206:controlled-temp-workspace",
      "route206:no-production-workspace-mutation",
      "route206:no-new-writer",
      "route206:no-fuzzy-apply",
      `route206:provider-called:${providerCalls > 0}`,
      `route206:provider-call-during-apply:${providerCallDuringApply}`,
      ...validation.evidence,
      ...extraction.evidence,
      ...matchResult.evidence,
      ...conflict.evidence,
      ...anchorQuality.evidence,
      ...anchoredProposal.evidence,
      ...selection.evidence,
      ...applyResult.evidence,
      ...perFileClaims.flatMap((claim) => claim.evidence),
      ...claimLedger.evidence,
    ];
    const output = [
      `route206 scenario=${input.scenario}`,
      `changed=${changedFiles.join(",") || "none"}`,
      `failed=${failedFiles.join(",") || "none"}`,
      `unattempted=${unattemptedFiles.join(",") || "none"}`,
      `verified=${verifiedFiles.join(",") || "none"}`,
      `unverified=${unverifiedFiles.join(",") || "none"}`,
      `claim-ledger-terminal=${claimLedger.terminal.status}`,
      `claim-ledger-live-success=${claimLedger.terminal.liveSuccess}`,
      `provider-call-during-apply=${providerCallDuringApply}`,
      "raw-content-excluded",
    ].join("\n");
    return {
      scenario: input.scenario,
      workspaceRoot: fixture.workspaceRoot,
      cleanup,
      providerCalled: providerCalls > 0,
      providerCallDuringApply,
      applyResult,
      perFileClaims,
      claimLedger,
      changedFiles,
      failedFiles,
      unattemptedFiles,
      verifiedFiles,
      unverifiedFiles,
      output,
      evidence,
    };
  } catch (error) {
    cleanup();
    throw error;
  } finally {
    if (input.cleanupFixture !== false) cleanup();
  }
}

function createFixture(requestId: string) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route206-proof-"));
  for (const target of targets) {
    const absolutePath = path.join(workspaceRoot, target);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, initialContent[target], "utf8");
  }
  return {
    fixtureId: `${requestId}-fixture`,
    workspaceRoot,
  };
}

function providerProposal(): ProviderEditRawProposal {
  return {
    operationKind: "exact-fenced-replacement",
    targets: targets.map((target) => ({
      path: target,
      summary: `controlled exact update for ${target}`,
      oldText: initialContent[target].trimEnd(),
      newText: expectedContent[target].trimEnd(),
    })),
    confidence: "high",
    riskSummary: "controlled temp fixture multi-file exact anchored mutation",
    verificationPlan: ["per-file readback verifies each exact target"],
  };
}

function writeFileForScenario(input: {
  readonly workspaceRoot: string;
  readonly scenario: ControlledMultifileProofScenario;
  readonly writeFile: (relativePath: string, content: string) => void | Promise<void>;
}) {
  return (relativePath: string, content: string): void | Promise<void> => {
    if (input.scenario === "partial-apply-failure" && relativePath === "src/b.ts") {
      throw new Error("route206 simulated second-file writer failure");
    }
    if (input.scenario === "unattempted-file" && relativePath === "src/a.ts") {
      throw new Error("route206 simulated first-file writer failure");
    }
    return input.writeFile(relativePath, content);
  };
}

function buildPerFileClaims(input: {
  readonly applyResult: EditProposalApplyResult;
  readonly scenario: ControlledMultifileProofScenario;
  readonly workspaceRoot: string;
  readonly anchoredProposal: ProviderAnchoredProposalManifest;
  readonly selectionState: string;
  readonly repairStatus?: ClaimLedgerPerFileClaim["repairStatus"];
}): readonly ClaimLedgerPerFileClaim[] {
  return targets.map((target) => {
    const anchoredHunk = input.anchoredProposal.hunks.find((hunk) => hunk.targetLabel === target);
    const fileResult = routeFileResults(input.applyResult).find((result) => result.targetPath === target);
    const fileStatus = classifyFileStatus(fileResult?.status);
    const readback = fileStatus === "changed"
      ? verifyFileReadback({
          workspaceRoot: input.workspaceRoot,
          targetPath: target,
          scenario: input.scenario,
        })
      : { status: "not-run" as const, evidence: [`route206:readback:${target}:not-run`] };
    const verificationStatus =
      readback.status === "passed" ? "succeeded" : readback.status === "failed" ? "failed" : "not-run";
    const applyStatus =
      fileStatus === "changed" ? "succeeded" : fileStatus === "failed" ? "failed" : "not-run";
    const proposalStatus = anchoredHunk ? "proven" : "not-proven";
    const anchorQuality = anchoredHunk?.exactMappingReady === true ? "exact-ready" : anchoredHunk ? "not-exact" : "missing";
    const authorityStatus =
      input.selectionState === "confirmed-exact-target-set" || input.selectionState === "confirmed-exact-single-target"
        ? anchoredHunk?.exactMappingReady === true ? "proven" : "invalid"
        : "blocked";
    return {
      targetPath: target,
      proposalStatus,
      anchorQuality,
      authorityStatus,
      applyStatus,
      applyRuntimeDerived: fileResult !== undefined,
      verificationStatus,
      readbackRuntimeDerived: readback.status !== "not-run",
      verificationEvidenceCount: readback.status === "not-run" ? 0 : readback.evidence.length,
      fileStatus,
      snapshotStatus: fileStatus === "changed" || fileStatus === "failed" ? "created" : "not-run",
      recoveryStatus: fileStatus === "changed" || fileStatus === "failed" ? "available" : "not-run",
      ...(target === "src/b.ts" && input.repairStatus ? { repairStatus: input.repairStatus } : {}),
      evidence: [
        `route206:file:${target}:status:${fileStatus}`,
        `route206:file:${target}:proposal:${proposalStatus}`,
        `route206:file:${target}:anchor:${anchorQuality}`,
        `route206:file:${target}:authority:${authorityStatus}`,
        ...(anchoredHunk ? [`route206:file:${target}:hunk:${anchoredHunk.hunkId}`] : []),
        `route206:file:${target}:apply:${applyStatus}`,
        `route206:file:${target}:verification:${verificationStatus}`,
        ...readback.evidence,
        ...(target === "src/b.ts" && input.repairStatus ? [`route206:file:${target}:repair:${input.repairStatus}`] : []),
        "route206:file:runtime-derived",
        "route206:file:raw-content-excluded",
      ],
    };
  });
}

function verifyFileReadback(input: {
  readonly workspaceRoot: string;
  readonly targetPath: typeof targets[number];
  readonly scenario: ControlledMultifileProofScenario;
}): { readonly status: "passed" | "failed" | "not-run"; readonly evidence: readonly string[] } {
  const content = readFile(input.workspaceRoot, input.targetPath);
  const required = expectedContent[input.targetPath];
  const basicPassed = content === required;
  const mixedFailure =
    (input.scenario === "mixed-verification" || input.scenario === "repair-handoff") &&
    input.targetPath === "src/b.ts";
  const missingVerification =
    input.scenario === "verification-missing" &&
    input.targetPath === "src/b.ts";
  if (missingVerification) {
    return {
      status: "not-run",
      evidence: [
        `route206:readback:${input.targetPath}:not-run`,
        `route206:readback:${input.targetPath}:runtime-derived:false`,
        "route206:readback:raw-content-excluded",
      ],
    };
  }
  const status = basicPassed && !mixedFailure ? "passed" : "failed";
  return {
    status,
    evidence: [
      `route206:readback:${input.targetPath}:${status}`,
      `route206:readback:${input.targetPath}:runtime-derived`,
      "route206:readback:raw-content-excluded",
    ],
  };
}

function routeFileResults(applyResult: EditProposalApplyResult): readonly {
  readonly targetPath: string;
  readonly status: "written" | "stopped" | "failed" | "not-run";
}[] {
  if ("route" in applyResult && "fileResults" in applyResult.route) {
    return applyResult.route.fileResults;
  }
  if ("route" in applyResult && "targetPath" in applyResult.route) {
    return [{
      targetPath: applyResult.route.targetPath,
      status: applyResult.route.status === "written" ? "written" : "stopped",
    }];
  }
  return [];
}

function classifyFileStatus(status: "written" | "stopped" | "failed" | "not-run" | undefined): ClaimLedgerPerFileClaim["fileStatus"] {
  if (status === "written") return "changed";
  if (status === "failed" || status === "stopped") return "failed";
  return "unattempted";
}

function classifyApplyStatus(applyResult: EditProposalApplyResult): "not-run" | "succeeded" | "stopped" | "failed" {
  if (applyResult.status === "hunk-set-applied" || applyResult.status === "target-set-applied") return "succeeded";
  if (applyResult.status.includes("partial-failure") || applyResult.status.includes("failed")) return "failed";
  if (applyResult.status.includes("stopped")) return "stopped";
  return "not-run";
}

function repairInput(evidenceSource: ClaimLedgerEvidenceSource): ClaimLedgerRepairInput {
  return {
    originalFailurePreserved: true,
    originalFailureRuntimeDerived: true,
    proposalStatus: "created",
    anchorStatus: "exact-ready",
    confirmationStatus: "required",
    applyStatus: "not-run",
    verificationStatus: "not-run",
    verificationRuntimeDerived: false,
    verificationEvidenceCount: 0,
    mutationScope: "controlled-temp-workspace",
    providerCallDuringApply: false,
    evidenceSource,
  };
}

function claimLedgerScorecardStatus(input: {
  readonly applyStatus: "not-run" | "succeeded" | "stopped" | "failed";
  readonly verificationStatus: "not-run" | "succeeded" | "failed";
}): "pass" | "warn" | "fail" {
  if (input.applyStatus === "succeeded" && input.verificationStatus === "succeeded") return "pass";
  if (input.applyStatus === "succeeded" && input.verificationStatus === "failed") return "warn";
  return "fail";
}

function readFile(workspaceRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}
