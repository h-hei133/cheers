import path from "node:path";
import { applySingleFileUpdateIntent } from "../patchApplication/singleFileUpdateApply.js";
import { buildNoPartialPatchApplicationContract } from "../patchApplication/noPartialApply.js";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import type { PatchFailure } from "../patchParsing/types.js";
import { verifyParsedPatch } from "../patchVerification/verify.js";
import type { GuardedWriteGate } from "./guardedWriteGate.js";
import { buildSingleFileApplyPatchFinalStaleReadContract } from "./singleFileApplyPatchFinalStaleRead.js";
import type { SingleFileApplyPatchPermissionUxContract } from "./singleFileApplyPatchPermissionUxContract.js";

export type ProductionWriteLaneStatus = "written" | "blocked";

export type ProductionWriteLaneBlocker =
  | "guarded-gate"
  | "patch-parse"
  | "patch-verification"
  | "target-mismatch"
  | "final-stale-read"
  | "workspace-isolation"
  | "write-application";

export interface ProductionWriteLaneOptions {
  readonly workspaceRoot: string;
  readonly rawPatchText: string;
  readonly permissionUx: SingleFileApplyPatchPermissionUxContract;
  readonly guardedGate: GuardedWriteGate;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly writeFile: (relativePath: string, content: string) => void | Promise<void>;
  readonly isolatedWorkspace: true;
}

export type ProductionWriteLane =
  | {
      readonly source: "single-file-apply-patch-production-write-lane";
      readonly status: "written";
      readonly isolatedWorkspace: true;
      readonly productionWriterInvoked: true;
      readonly productionWriterTarget: "isolated-workspace";
      readonly realRepositoryWrite: false;
      readonly targetPath: string;
      readonly changedFiles: readonly [string];
      readonly writeIntents: readonly [string];
      readonly appliedPatchRecord: false;
      readonly terminalClassification: "success";
      readonly mutationSuccessClaimAllowed: true;
      readonly terminalSuccessAllowed: true;
      readonly finalStaleRead: ReturnType<
        typeof buildSingleFileApplyPatchFinalStaleReadContract
      >;
      readonly verificationStatus: "passed";
      readonly nextAction: string;
      readonly doNext: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly source: "single-file-apply-patch-production-write-lane";
      readonly status: "blocked";
      readonly isolatedWorkspace: true;
      readonly blocker: ProductionWriteLaneBlocker;
      readonly failures: readonly PatchFailure[];
      readonly productionWriterInvoked: false;
      readonly productionWriterTarget: "none";
      readonly realRepositoryWrite: false;
      readonly changedFiles: readonly [];
      readonly writeIntents: readonly [];
      readonly appliedPatchRecord: false;
      readonly terminalClassification: "stopped";
      readonly mutationSuccessClaimAllowed: false;
      readonly terminalSuccessAllowed: false;
      readonly finalStaleRead?: ReturnType<
        typeof buildSingleFileApplyPatchFinalStaleReadContract
      >;
      readonly verificationStatus: "blocked";
      readonly nextAction: string;
      readonly doNext: string;
      readonly evidence: readonly string[];
    };

export async function runProductionWriteLane(
  options: ProductionWriteLaneOptions,
): Promise<ProductionWriteLane> {
  if (options.guardedGate.status !== "ready") {
    return blocked({
      blocker: "guarded-gate",
      failures: [],
      nextAction: options.guardedGate.nextAction,
      evidence: ["apply-patch-production-write-lane:guarded-gate-blocked"],
    });
  }

  const parsed = parseApplyPatchText(options.rawPatchText);
  if (parsed.ok === false) {
    return blocked({
      blocker: "patch-parse",
      failures: [parsed.failure],
      nextAction: parsed.failure.nextAction,
      evidence: ["apply-patch-production-write-lane:parse-blocked"],
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
      nextAction:
        verification.failures[0]?.nextAction ??
        "Regenerate the single-file Update File patch against current content.",
      evidence: ["apply-patch-production-write-lane:verification-blocked"],
    });
  }

  const writeIntent = buildNoPartialPatchApplicationContract(verification);
  if (writeIntent.ok === false) {
    return blocked({
      blocker: "patch-verification",
      failures: writeIntent.failures,
      nextAction:
        writeIntent.failures[0]?.nextAction ??
        "Regenerate the single-file Update File patch.",
      evidence: ["apply-patch-production-write-lane:no-partial-blocked"],
    });
  }

  if (
    writeIntent.writeIntents.length !== 1 ||
    writeIntent.writeIntents[0]?.kind !== "update" ||
    writeIntent.writeIntents[0]?.path !== options.guardedGate.targetPath
  ) {
    return blocked({
      blocker: "target-mismatch",
      failures: [],
      nextAction:
        "Only one approval-bound Update File target may enter the guarded production write lane.",
      evidence: ["apply-patch-production-write-lane:target-mismatch"],
    });
  }

  const intent = writeIntent.writeIntents[0];
  if (!intent || !pathStaysInsideWorkspace(options.workspaceRoot, intent.path)) {
    return blocked({
      blocker: "workspace-isolation",
      failures: [],
      nextAction:
        "Refuse to write outside the isolated guarded write workspace.",
      evidence: ["apply-patch-production-write-lane:workspace-isolation-blocked"],
    });
  }

  const finalStaleRead = buildSingleFileApplyPatchFinalStaleReadContract({
    permissionUx: options.permissionUx,
    currentContent: options.readFile(path.resolve(options.workspaceRoot, intent.path)),
    phase: "final-write-preflight",
    writerCandidatePresent: true,
  });
  if (finalStaleRead.finalRevalidation !== "passed") {
    return blocked({
      blocker: "final-stale-read",
      failures: [],
      finalStaleRead,
      nextAction: finalStaleRead.nextAction,
      evidence: ["apply-patch-production-write-lane:final-stale-read-blocked"],
    });
  }

  if (intent.path !== finalStaleRead.targetPath) {
    return blocked({
      blocker: "target-mismatch",
      failures: [],
      finalStaleRead,
      nextAction:
        "Only the final stale-read approval-bound target may be written.",
      evidence: ["apply-patch-production-write-lane:approval-target-mismatch"],
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
        "Retry after checking isolated workspace write permissions.",
      evidence: ["apply-patch-production-write-lane:write-application-blocked"],
    });
  }

  const targetPath = applied.changedFiles[0];
  if (!targetPath || applied.changedFiles.length !== 1) {
    return blocked({
      blocker: "write-application",
      failures: [],
      finalStaleRead,
      nextAction:
        "Stop: guarded production write lane did not report exactly one changed file.",
      evidence: ["apply-patch-production-write-lane:changed-files-invalid"],
    });
  }

  const nextAction =
    "Record guarded write evidence; default production apply_patch remains rejected outside this explicit lane.";
  return {
    source: "single-file-apply-patch-production-write-lane",
    status: "written",
    isolatedWorkspace: options.isolatedWorkspace,
    productionWriterInvoked: true,
    productionWriterTarget: "isolated-workspace",
    realRepositoryWrite: false,
    targetPath,
    changedFiles: [targetPath],
    writeIntents: [targetPath],
    appliedPatchRecord: false,
    terminalClassification: "success",
    mutationSuccessClaimAllowed: true,
    terminalSuccessAllowed: true,
    finalStaleRead,
    verificationStatus: "passed",
    nextAction,
    doNext: nextAction,
    evidence: [
      "apply-patch-production-write-lane:explicit-opt-in",
      "apply-patch-production-write-lane:approved-for-write",
      "apply-patch-production-write-lane:single-file-update-only",
      "apply-patch-production-write-lane:final-stale-read-immediately-before-writer",
      "apply-patch-production-write-lane:production-writer-isolated-workspace",
      "apply-patch-production-write-lane:real-repository-write-false",
      "apply-patch-production-write-lane:default-production-rejection-unchanged",
      "apply-patch-production-write-lane:success-after-verified-write",
    ],
  };
}

function pathStaysInsideWorkspace(
  workspaceRoot: string,
  relativePath: string,
): boolean {
  const resolved = path.resolve(workspaceRoot, relativePath);
  const relative = path.relative(workspaceRoot, resolved);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function blocked(input: {
  readonly blocker: ProductionWriteLaneBlocker;
  readonly failures: readonly PatchFailure[];
  readonly finalStaleRead?: ReturnType<
    typeof buildSingleFileApplyPatchFinalStaleReadContract
  >;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): ProductionWriteLane {
  return {
    source: "single-file-apply-patch-production-write-lane",
    status: "blocked",
    isolatedWorkspace: true,
    blocker: input.blocker,
    failures: input.failures,
    productionWriterInvoked: false,
    productionWriterTarget: "none",
    realRepositoryWrite: false,
    changedFiles: [],
    writeIntents: [],
    appliedPatchRecord: false,
    terminalClassification: "stopped",
    mutationSuccessClaimAllowed: false,
    terminalSuccessAllowed: false,
    ...(input.finalStaleRead ? { finalStaleRead: input.finalStaleRead } : {}),
    verificationStatus: "blocked",
    nextAction: input.nextAction,
    doNext: input.nextAction,
    evidence: [
      ...input.evidence,
      `apply-patch-production-write-lane:blocker:${input.blocker}`,
      "apply-patch-production-write-lane:changed-files-empty",
      "apply-patch-production-write-lane:write-intents-empty",
      "apply-patch-production-write-lane:production-writer-invoked-false",
      "apply-patch-production-write-lane:real-repository-write-false",
      "apply-patch-production-write-lane:no-success-claim",
    ],
  };
}
