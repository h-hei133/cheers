import path from "node:path";
import { applySingleFileUpdateIntent } from "../patchApplication/singleFileUpdateApply.js";
import { buildNoPartialPatchApplicationContract } from "../patchApplication/noPartialApply.js";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import type { PatchFailure } from "../patchParsing/types.js";
import { verifyParsedPatch } from "../patchVerification/verify.js";
import { buildSingleFileApplyPatchFinalStaleReadContract } from "../../edit/write/runtime/finalRead.js";
import type { SingleFileApplyPatchPermissionUxContract } from "../../edit/authority/approval/permission.js";
import type { WriteDecisionGate } from "../../edit/authority/approval/decision.js";

export type IsolatedWriteLaneStatus = "written" | "blocked";

export type IsolatedWriteLaneBlocker =
  | "write-decision-not-approved"
  | "final-stale-read"
  | "patch-parse"
  | "patch-verification"
  | "target-mismatch"
  | "write-application";

export interface IsolatedWriteLaneOptions {
  readonly workspaceRoot: string;
  readonly rawPatchText: string;
  readonly permissionUx: SingleFileApplyPatchPermissionUxContract;
  readonly writeDecision: WriteDecisionGate;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly writeFile: (path: string, content: string) => void | Promise<void>;
  readonly isolatedFixture: true;
}

export type IsolatedWriteLane =
  | {
      readonly source: "single-file-apply-patch-isolated-write-lane";
      readonly status: "written";
      readonly isolatedFixture: true;
      readonly targetPath: string;
      readonly changedFiles: readonly [string];
      readonly writeIntents: readonly [string];
      readonly fixtureWriterInvoked: true;
      readonly productionWriterInvoked: false;
      readonly noProductionWrite: true;
      readonly appliedPatchRecord: false;
      readonly terminalClassification: "success";
      readonly mutationSuccessClaimAllowed: true;
      readonly finalStaleRead: ReturnType<
        typeof buildSingleFileApplyPatchFinalStaleReadContract
      >;
      readonly verificationStatus: "passed";
      readonly nextAction: string;
      readonly doNext: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly source: "single-file-apply-patch-isolated-write-lane";
      readonly status: "blocked";
      readonly isolatedFixture: true;
      readonly blocker: IsolatedWriteLaneBlocker;
      readonly failures: readonly PatchFailure[];
      readonly changedFiles: readonly [];
      readonly writeIntents: readonly [];
      readonly fixtureWriterInvoked: false;
      readonly productionWriterInvoked: false;
      readonly noProductionWrite: true;
      readonly appliedPatchRecord: false;
      readonly terminalClassification: "stopped";
      readonly mutationSuccessClaimAllowed: false;
      readonly finalStaleRead?: ReturnType<
        typeof buildSingleFileApplyPatchFinalStaleReadContract
      >;
      readonly verificationStatus: "blocked";
      readonly nextAction: string;
      readonly doNext: string;
      readonly evidence: readonly string[];
    };

export async function runIsolatedWriteLane(
  options: IsolatedWriteLaneOptions,
): Promise<IsolatedWriteLane> {
  if (options.writeDecision.status !== "approved-for-write") {
    return blocked({
      blocker: "write-decision-not-approved",
      failures: [],
      nextAction:
        "Do not write. Isolated fixture writes require explicit approved-for-write decision gate output.",
      evidence: [
        "apply-patch-isolated-write-lane:write-decision-not-approved",
      ],
    });
  }

  const finalStaleRead = buildSingleFileApplyPatchFinalStaleReadContract({
    permissionUx: options.permissionUx,
    currentContent:
      options.writeDecision.baseEvidence?.targetPath === undefined
        ? undefined
        : options.readFile(
            path.resolve(
              options.workspaceRoot,
              options.writeDecision.baseEvidence.targetPath,
            ),
          ),
    phase: "final-write-preflight",
    writerCandidatePresent: true,
  });
  if (finalStaleRead.finalRevalidation !== "passed") {
    return blocked({
      blocker: "final-stale-read",
      failures: [],
      finalStaleRead,
      nextAction: finalStaleRead.nextAction,
      evidence: ["apply-patch-isolated-write-lane:final-stale-read-blocked"],
    });
  }

  const parsed = parseApplyPatchText(options.rawPatchText);
  if (parsed.ok === false) {
    return blocked({
      blocker: "patch-parse",
      failures: [parsed.failure],
      finalStaleRead,
      nextAction: parsed.failure.nextAction,
      evidence: ["apply-patch-isolated-write-lane:parse-blocked"],
    });
  }

  const verification = verifyParsedPatch(parsed.patch, {
    workspaceRoot: options.workspaceRoot,
    readFile: options.readFile,
    supportedOperations: ["update"],
  });
  if (verification.ok === false) {
    return blocked({
      blocker: "patch-verification",
      failures: verification.failures,
      finalStaleRead,
      nextAction:
        verification.failures[0]?.nextAction ??
        "Regenerate the single-file Update File patch against current fixture content.",
      evidence: ["apply-patch-isolated-write-lane:verification-blocked"],
    });
  }

  const writeIntent = buildNoPartialPatchApplicationContract(verification);
  if (writeIntent.ok === false) {
    return blocked({
      blocker: "patch-verification",
      failures: writeIntent.failures,
      finalStaleRead,
      nextAction:
        writeIntent.failures[0]?.nextAction ??
        "Regenerate the single-file Update File patch.",
      evidence: ["apply-patch-isolated-write-lane:no-partial-blocked"],
    });
  }
  if (
    writeIntent.writeIntents.length !== 1 ||
    writeIntent.writeIntents[0]?.kind !== "update" ||
    writeIntent.writeIntents[0]?.path !== finalStaleRead.targetPath
  ) {
    return blocked({
      blocker: "target-mismatch",
      failures: [],
      finalStaleRead,
      nextAction:
        "Only the approval-bound single-file Update File target may be written in the isolated fixture lane.",
      evidence: ["apply-patch-isolated-write-lane:target-mismatch"],
    });
  }

  const applied = await applySingleFileUpdateIntent(writeIntent, {
    writeFile: options.writeFile,
  });
  if (applied.ok === false) {
    return blocked({
      blocker: "write-application",
      failures: applied.failedFiles,
      finalStaleRead,
      nextAction:
        applied.failedFiles[0]?.nextAction ??
        "Retry after checking isolated fixture write permissions.",
      evidence: ["apply-patch-isolated-write-lane:write-application-blocked"],
    });
  }

  const targetPath = applied.changedFiles[0];
  if (!targetPath || applied.changedFiles.length !== 1) {
    return blocked({
      blocker: "write-application",
      failures: [],
      finalStaleRead,
      nextAction:
        "Stop: isolated fixture write did not report exactly one changed file.",
      evidence: ["apply-patch-isolated-write-lane:changed-files-invalid"],
    });
  }

  const nextAction =
    "Record isolated fixture write evidence; production apply_patch remains rejected outside this explicit lane.";
  return {
    source: "single-file-apply-patch-isolated-write-lane",
    status: "written",
    isolatedFixture: options.isolatedFixture,
    targetPath,
    changedFiles: [targetPath],
    writeIntents: [targetPath],
    fixtureWriterInvoked: true,
    productionWriterInvoked: false,
    noProductionWrite: true,
    appliedPatchRecord: false,
    terminalClassification: "success",
    mutationSuccessClaimAllowed: true,
    finalStaleRead,
    verificationStatus: "passed",
    nextAction,
    doNext: nextAction,
    evidence: [
      "apply-patch-isolated-write-lane:explicit-approved-for-write",
      "apply-patch-isolated-write-lane:final-stale-read-passed-after-approval",
      "apply-patch-isolated-write-lane:single-file-update-only",
      "apply-patch-isolated-write-lane:isolated-fixture-write",
      "apply-patch-isolated-write-lane:production-writer-invoked-false",
      "apply-patch-isolated-write-lane:default-production-rejection-unchanged",
      "apply-patch-isolated-write-lane:verification-passed",
    ],
  };
}

function blocked(input: {
  readonly blocker: IsolatedWriteLaneBlocker;
  readonly failures: readonly PatchFailure[];
  readonly finalStaleRead?: ReturnType<
    typeof buildSingleFileApplyPatchFinalStaleReadContract
  >;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): IsolatedWriteLane {
  return {
    source: "single-file-apply-patch-isolated-write-lane",
    status: "blocked",
    isolatedFixture: true,
    blocker: input.blocker,
    failures: input.failures,
    changedFiles: [],
    writeIntents: [],
    fixtureWriterInvoked: false,
    productionWriterInvoked: false,
    noProductionWrite: true,
    appliedPatchRecord: false,
    terminalClassification: "stopped",
    mutationSuccessClaimAllowed: false,
    ...(input.finalStaleRead ? { finalStaleRead: input.finalStaleRead } : {}),
    verificationStatus: "blocked",
    nextAction: input.nextAction,
    doNext: input.nextAction,
    evidence: [
      ...input.evidence,
      `apply-patch-isolated-write-lane:blocker:${input.blocker}`,
      "apply-patch-isolated-write-lane:changed-files-empty",
      "apply-patch-isolated-write-lane:write-intents-empty",
      "apply-patch-isolated-write-lane:fixture-writer-invoked-false",
      "apply-patch-isolated-write-lane:production-writer-invoked-false",
      "apply-patch-isolated-write-lane:no-success-claim",
    ],
  };
}
