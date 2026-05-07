import path from "node:path";
import { applySingleFileUpdateIntent } from "../patchApplication/singleFileUpdateApply.js";
import { buildNoPartialPatchApplicationContract } from "../patchApplication/noPartialApply.js";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import type { PatchFailure } from "../patchParsing/types.js";
import { verifyParsedPatch } from "../patchVerification/verify.js";
import { buildGuardedWriteGate, type GuardedWriteGate } from "./guardedWriteGate.js";
import { buildSingleFileApplyPatchFinalStaleReadContract } from "./singleFileApplyPatchFinalStaleRead.js";
import {
  buildSingleFileApplyPatchOptInDryRunRoute,
  type SingleFileApplyPatchOptInDryRunRouteAccepted,
} from "./singleFileApplyPatchOptInDryRunRoute.js";
import type { SingleFileApplyPatchRequestedUserDecision } from "./singleFileApplyPatchPermissionUxContract.js";
import type { WorkspaceWriteTargetAuthority } from "./workspaceAuthority.js";
import {
  buildWorkspaceWriteFailureState,
  type WorkspaceWriteEffect,
  type WorkspaceWriteFailurePhase,
  type WorkspaceWriteFailureState,
} from "./writeFailureState.js";
import { buildWriteDecisionGate, type WriteDecisionGate } from "./writeDecisionGate.js";

export type WorkspaceWriteRouteStatus = "written" | "blocked";

export type WorkspaceWriteRouteBlocker =
  | "runtime-opt-in-missing"
  | "workspace-write-opt-in-missing"
  | "dry-run"
  | "write-decision"
  | "guarded-gate"
  | "patch-parse"
  | "patch-verification"
  | "target-mismatch"
  | "workspace-boundary"
  | "final-stale-read"
  | "aborted-before-write"
  | "no-op"
  | "write-application"
  | "post-write-verification";

export interface WorkspaceWriteRouteOptions {
  readonly workspaceRoot: string;
  readonly rawPatchText: string;
  readonly explicitRuntimeOptIn: boolean;
  readonly explicitWorkspaceWriteOptIn: boolean;
  readonly requestedUserDecision?: SingleFileApplyPatchRequestedUserDecision;
  readonly defaultProductionRejectionUnchanged: true;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly readVerifiedFile: (relativePath: string) => string | undefined;
  readonly validateWriteTarget: (
    relativePath: string,
  ) => WorkspaceWriteTargetAuthority;
  readonly writeFile: (relativePath: string, content: string) => void | Promise<void>;
  readonly abortSignal?: AbortSignal;
}

type FinalStaleRead = ReturnType<typeof buildSingleFileApplyPatchFinalStaleReadContract>;

export type WorkspaceWriteRoute =
  | {
      readonly source: "single-file-apply-patch-workspace-write-route";
      readonly status: "written";
      readonly targetPath: string;
      readonly dryRunRoute: SingleFileApplyPatchOptInDryRunRouteAccepted;
      readonly writeDecision: WriteDecisionGate;
      readonly guardedGate: GuardedWriteGate;
      readonly finalStaleRead: FinalStaleRead;
      readonly workspaceWriterInvoked: true;
      readonly writerTarget: "selected-workspace";
      readonly selectedWorkspaceWrite: true;
      readonly writerStarted: true;
      readonly writeEffect: "verified";
      readonly writeFailureState: WorkspaceWriteFailureState;
      readonly changedFiles: readonly [string];
      readonly writeIntents: readonly [string];
      readonly appliedPatchRecord: false;
      readonly postWriteVerification: "passed";
      readonly terminalClassification: "success";
      readonly terminalSuccessAllowed: true;
      readonly mutationSuccessClaimAllowed: true;
      readonly resultSessionStatus: "write-success";
      readonly nextAction: string;
      readonly doNext: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly source: "single-file-apply-patch-workspace-write-route";
      readonly status: "blocked";
      readonly blocker: WorkspaceWriteRouteBlocker;
      readonly targetPath?: string;
      readonly dryRunRoute?: SingleFileApplyPatchOptInDryRunRouteAccepted;
      readonly writeDecision?: WriteDecisionGate;
      readonly guardedGate?: GuardedWriteGate;
      readonly finalStaleRead?: FinalStaleRead;
      readonly failures: readonly PatchFailure[];
      readonly workspaceWriterInvoked: boolean;
      readonly writerTarget: "none" | "selected-workspace";
      readonly selectedWorkspaceWrite: boolean;
      readonly writerStarted: boolean;
      readonly writeEffect: WorkspaceWriteEffect;
      readonly writeFailureState: WorkspaceWriteFailureState;
      readonly changedFiles: readonly [];
      readonly writeIntents: readonly [];
      readonly appliedPatchRecord: false;
      readonly postWriteVerification: "not-run" | "blocked" | "failed";
      readonly terminalClassification: "stopped";
      readonly terminalSuccessAllowed: false;
      readonly mutationSuccessClaimAllowed: false;
      readonly resultSessionStatus: "stopped";
      readonly nextAction: string;
      readonly doNext: string;
      readonly evidence: readonly string[];
    };

export async function runWorkspaceWriteRoute(
  options: WorkspaceWriteRouteOptions,
): Promise<WorkspaceWriteRoute> {
  if (options.abortSignal?.aborted) {
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase: "before-writer",
    });
    return blocked({
      blocker: "aborted-before-write",
      failures: [],
      nextAction:
        "Stop: apply_patch workspace write was aborted before the workspace writer became reachable.",
      evidence: [
        "apply-patch-workspace-write-route:aborted-before-write",
        ...writeFailureState.evidence,
      ],
      writeFailureState,
    });
  }

  if (!options.explicitRuntimeOptIn) {
    return blocked({
      blocker: "runtime-opt-in-missing",
      failures: [],
      nextAction:
        "Keep apply_patch rejected unless an explicit runtime route opt-in is present.",
      evidence: ["apply-patch-workspace-write-route:runtime-opt-in-missing"],
    });
  }

  const parsedBeforeRead = parseApplyPatchText(options.rawPatchText);
  if (
    options.explicitWorkspaceWriteOptIn &&
    parsedBeforeRead.ok &&
    parsedBeforeRead.patch.operations.length === 1 &&
    parsedBeforeRead.patch.operations[0]?.kind === "update"
  ) {
    const targetAuthority = options.validateWriteTarget(
      parsedBeforeRead.patch.operations[0].path,
    );
    if (targetAuthority.ok === false) {
      return blocked({
        blocker: "workspace-boundary",
        targetPath: parsedBeforeRead.patch.operations[0].path,
        failures: [],
        nextAction: targetAuthority.message,
        evidence: [
          "apply-patch-workspace-write-route:workspace-boundary-blocked",
          ...targetAuthority.evidence,
        ],
      });
    }
  }

  const dryRunRoute = buildSingleFileApplyPatchOptInDryRunRoute({
    workspaceRoot: options.workspaceRoot,
    rawPatchText: options.rawPatchText,
    readFile: options.readFile,
    dryRun: true,
    explicitOptIn: true,
    ...(options.requestedUserDecision
      ? { requestedUserDecision: options.requestedUserDecision }
      : {}),
  });
  if (dryRunRoute.explicitOptIn !== true) {
    return blocked({
      blocker: "dry-run",
      failures: [],
      nextAction: dryRunRoute.nextAction,
      evidence: ["apply-patch-workspace-write-route:dry-run-rejected"],
    });
  }

  if (dryRunRoute.dryRun.status !== "dry-run-ready") {
    return blocked({
      blocker: "dry-run",
      dryRunRoute,
      failures: dryRunRoute.dryRun.failedFiles,
      nextAction: dryRunRoute.nextAction,
      evidence: ["apply-patch-workspace-write-route:dry-run-blocked"],
    });
  }

  const writeDecision = buildWriteDecisionGate({
    permissionUx: dryRunRoute.permissionUx,
    explicitApprovedForWrite:
      options.explicitWorkspaceWriteOptIn === true &&
      options.requestedUserDecision === "approved",
    promptText: options.rawPatchText,
  });
  if (!options.explicitWorkspaceWriteOptIn) {
    return blocked({
      blocker: "workspace-write-opt-in-missing",
      dryRunRoute,
      writeDecision,
      failures: [],
      nextAction:
        "Keep the runtime route no-write unless the real workspace write entrypoint is explicitly opted in.",
      evidence: ["apply-patch-workspace-write-route:workspace-write-opt-in-missing"],
    });
  }

  if (writeDecision.status !== "approved-for-write") {
    return blocked({
      blocker: "write-decision",
      dryRunRoute,
      writeDecision,
      failures: [],
      nextAction: writeDecision.nextAction,
      evidence: ["apply-patch-workspace-write-route:write-decision-blocked"],
    });
  }

  const singleFileUpdateOnly =
    dryRunRoute.dryRun.wouldChangeFiles.length === 1 &&
    dryRunRoute.permissionUx.baseEvidence?.targetPath !== undefined;
  const guardedGate = buildGuardedWriteGate({
    explicitOptIn: options.explicitWorkspaceWriteOptIn,
    writeDecision,
    singleFileUpdateOnly,
    defaultProductionRejectionUnchanged:
      options.defaultProductionRejectionUnchanged,
    promptText: options.rawPatchText,
  });
  if (guardedGate.status !== "ready") {
    return blocked({
      blocker: "guarded-gate",
      dryRunRoute,
      writeDecision,
      guardedGate,
      failures: [],
      nextAction: guardedGate.nextAction,
      evidence: ["apply-patch-workspace-write-route:guarded-gate-blocked"],
    });
  }

  const parsed = parseApplyPatchText(options.rawPatchText);
  if (parsed.ok === false) {
    return blocked({
      blocker: "patch-parse",
      dryRunRoute,
      writeDecision,
      guardedGate,
      failures: [parsed.failure],
      nextAction: parsed.failure.nextAction,
      evidence: ["apply-patch-workspace-write-route:parse-blocked"],
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
      dryRunRoute,
      writeDecision,
      guardedGate,
      failures: verification.failures,
      nextAction:
        verification.failures[0]?.nextAction ??
        "Regenerate the single-file Update File patch against current content.",
      evidence: ["apply-patch-workspace-write-route:verification-blocked"],
    });
  }

  const writeIntent = buildNoPartialPatchApplicationContract(verification);
  if (writeIntent.ok === false) {
    return blocked({
      blocker: "patch-verification",
      dryRunRoute,
      writeDecision,
      guardedGate,
      failures: writeIntent.failures,
      nextAction:
        writeIntent.failures[0]?.nextAction ??
        "Regenerate the single-file Update File patch.",
      evidence: ["apply-patch-workspace-write-route:no-partial-blocked"],
    });
  }

  const intent = writeIntent.writeIntents[0];
  if (
    writeIntent.writeIntents.length !== 1 ||
    !intent ||
    intent.kind !== "update" ||
    intent.path !== guardedGate.targetPath
  ) {
    return blocked({
      blocker: "target-mismatch",
      dryRunRoute,
      writeDecision,
      guardedGate,
      failures: [],
      nextAction:
        "Only one approval-bound Update File target may enter the workspace write route.",
      evidence: ["apply-patch-workspace-write-route:target-mismatch"],
    });
  }

  if (!pathStaysInsideWorkspace(options.workspaceRoot, intent.path)) {
    return blocked({
      blocker: "workspace-boundary",
      dryRunRoute,
      writeDecision,
      guardedGate,
      failures: [],
      nextAction: "Refuse to write outside the selected workspace.",
      evidence: ["apply-patch-workspace-write-route:workspace-boundary-blocked"],
    });
  }

  const targetAuthority = options.validateWriteTarget(intent.path);
  if (targetAuthority.ok === false) {
    return blocked({
      blocker: "workspace-boundary",
      targetPath: intent.path,
      dryRunRoute,
      writeDecision,
      guardedGate,
      failures: [],
      nextAction: targetAuthority.message,
      evidence: [
        "apply-patch-workspace-write-route:workspace-boundary-blocked",
        ...targetAuthority.evidence,
      ],
    });
  }

  const finalContent = options.readVerifiedFile(intent.path);
  const finalStaleRead = buildSingleFileApplyPatchFinalStaleReadContract({
    permissionUx: dryRunRoute.permissionUx,
    currentContent: finalContent,
    phase: "final-write-preflight",
    writerCandidatePresent: true,
  });
  if (finalStaleRead.finalRevalidation !== "passed") {
    return blocked({
      blocker: "final-stale-read",
      dryRunRoute,
      writeDecision,
      guardedGate,
      finalStaleRead,
      failures: [],
      nextAction: finalStaleRead.nextAction,
      evidence: ["apply-patch-workspace-write-route:final-stale-read-blocked"],
    });
  }

  if (finalContent === intent.content) {
    return blocked({
      blocker: "no-op",
      targetPath: intent.path,
      dryRunRoute,
      writeDecision,
      guardedGate,
      finalStaleRead,
      failures: [],
      nextAction:
        "No workspace write was performed because the approved patch would not change the target file.",
      evidence: ["apply-patch-workspace-write-route:no-op-blocked-before-writer"],
    });
  }

  if (options.abortSignal?.aborted) {
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase: "before-writer",
      targetPath: intent.path,
    });
    return blocked({
      blocker: "aborted-before-write",
      targetPath: intent.path,
      dryRunRoute,
      writeDecision,
      guardedGate,
      finalStaleRead,
      failures: [],
      nextAction:
        "Stop: apply_patch workspace write was aborted after final stale-read but before the workspace writer ran.",
      evidence: [
        "apply-patch-workspace-write-route:aborted-before-writer",
        ...writeFailureState.evidence,
      ],
      writeFailureState,
    });
  }

  const applied = await applySingleFileUpdateIntent(writeIntent, {
    writeFile: options.writeFile,
  });
  if (applied.ok === false) {
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase: "writer-failed",
      targetPath: intent.path,
    });
    return blocked({
      blocker: "write-application",
      targetPath: intent.path,
      dryRunRoute,
      writeDecision,
      guardedGate,
      finalStaleRead,
      failures: applied.failedFiles,
      workspaceWriterInvoked: true,
      writerTarget: "selected-workspace",
      selectedWorkspaceWrite: true,
      postWriteVerification: "blocked",
      nextAction: `${applied.failedFiles[0]?.nextAction ?? "Retry after checking workspace write permissions."} ${writeFailureState.nextAction}`,
      evidence: [
        "apply-patch-workspace-write-route:write-application-blocked",
        ...writeFailureState.evidence,
      ],
      writeFailureState,
    });
  }

  const writtenContent = options.readVerifiedFile(intent.path);
  if (writtenContent !== intent.content) {
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase: "post-write-verification-failed",
      targetPath: intent.path,
    });
    return blocked({
      blocker: "post-write-verification",
      targetPath: intent.path,
      dryRunRoute,
      writeDecision,
      guardedGate,
      finalStaleRead,
      failures: [],
      workspaceWriterInvoked: true,
      writerTarget: "selected-workspace",
      selectedWorkspaceWrite: true,
      postWriteVerification: "failed",
      nextAction: writeFailureState.nextAction,
      evidence: [
        "apply-patch-workspace-write-route:post-write-verification-failed",
        ...writeFailureState.evidence,
      ],
      writeFailureState,
    });
  }

  const targetPath = applied.changedFiles[0];
  if (!targetPath || applied.changedFiles.length !== 1) {
    return blocked({
      blocker: "write-application",
      dryRunRoute,
      writeDecision,
      guardedGate,
      finalStaleRead,
      failures: [],
      nextAction:
        "Stop: workspace write route did not report exactly one changed file.",
      evidence: ["apply-patch-workspace-write-route:changed-files-invalid"],
    });
  }

  const nextAction =
    "Review the selected workspace change; default apply_patch remains rejected outside this explicit write entrypoint.";
  const writeFailureState = buildWorkspaceWriteFailureState({
    phase: "verified-write",
    targetPath,
  });
  return {
    source: "single-file-apply-patch-workspace-write-route",
    status: "written",
    targetPath,
    dryRunRoute,
    writeDecision,
    guardedGate,
    finalStaleRead,
    workspaceWriterInvoked: true,
    writerTarget: "selected-workspace",
    selectedWorkspaceWrite: true,
    writerStarted: true,
    writeEffect: "verified",
    writeFailureState,
    changedFiles: [targetPath],
    writeIntents: [targetPath],
    appliedPatchRecord: false,
    postWriteVerification: "passed",
    terminalClassification: "success",
    terminalSuccessAllowed: true,
    mutationSuccessClaimAllowed: true,
    resultSessionStatus: "write-success",
    nextAction,
    doNext: nextAction,
    evidence: [
      "apply-patch-workspace-write-route:explicit-runtime-opt-in",
      "apply-patch-workspace-write-route:explicit-workspace-write-opt-in",
      "apply-patch-workspace-write-route:approved-for-write",
      "apply-patch-workspace-write-route:single-file-update-only",
      "apply-patch-workspace-write-route:final-stale-read-immediately-before-writer",
      "apply-patch-workspace-write-route:workspace-writer-invoked",
      "apply-patch-workspace-write-route:selected-workspace-write",
      "apply-patch-workspace-write-route:post-write-verification-passed",
      "apply-patch-workspace-write-route:success-after-verified-write",
      "apply-patch-workspace-write-route:default-production-rejection-unchanged",
      ...writeFailureState.evidence,
    ],
  };
}

function pathStaysInsideWorkspace(
  workspaceRoot: string,
  relativePath: string,
): boolean {
  const resolved = path.resolve(workspaceRoot, relativePath);
  const relative = path.relative(workspaceRoot, resolved);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

function blocked(
  input: {
    readonly blocker: WorkspaceWriteRouteBlocker;
    readonly targetPath?: string;
    readonly dryRunRoute?: SingleFileApplyPatchOptInDryRunRouteAccepted;
    readonly writeDecision?: WriteDecisionGate;
    readonly guardedGate?: GuardedWriteGate;
    readonly finalStaleRead?: FinalStaleRead;
    readonly failures: readonly PatchFailure[];
    readonly workspaceWriterInvoked?: boolean;
    readonly writerTarget?: "none" | "selected-workspace";
    readonly selectedWorkspaceWrite?: boolean;
    readonly writeFailureState?: WorkspaceWriteFailureState;
    readonly failurePhase?: WorkspaceWriteFailurePhase;
    readonly postWriteVerification?: "not-run" | "blocked" | "failed";
    readonly nextAction: string;
    readonly evidence: readonly string[];
  },
): WorkspaceWriteRoute {
  const writeFailureState =
    input.writeFailureState ??
    buildWorkspaceWriteFailureState({
      phase: input.failurePhase ?? "before-writer",
      targetPath: input.targetPath,
    });
  return {
    source: "single-file-apply-patch-workspace-write-route",
    status: "blocked",
    blocker: input.blocker,
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    ...(input.dryRunRoute ? { dryRunRoute: input.dryRunRoute } : {}),
    ...(input.writeDecision ? { writeDecision: input.writeDecision } : {}),
    ...(input.guardedGate ? { guardedGate: input.guardedGate } : {}),
    ...(input.finalStaleRead ? { finalStaleRead: input.finalStaleRead } : {}),
    failures: input.failures,
    workspaceWriterInvoked: input.workspaceWriterInvoked ?? false,
    writerTarget: input.writerTarget ?? "none",
    selectedWorkspaceWrite: input.selectedWorkspaceWrite ?? false,
    writerStarted: writeFailureState.writerStarted,
    writeEffect: writeFailureState.writeEffect,
    writeFailureState,
    changedFiles: [],
    writeIntents: [],
    appliedPatchRecord: false,
    postWriteVerification: input.postWriteVerification ?? "not-run",
    terminalClassification: "stopped",
    terminalSuccessAllowed: false,
    mutationSuccessClaimAllowed: false,
    resultSessionStatus: "stopped",
    nextAction: input.nextAction,
    doNext: input.nextAction,
    evidence: [
      ...input.evidence,
      ...writeFailureState.evidence,
      `apply-patch-workspace-write-route:blocker:${input.blocker}`,
      `apply-patch-workspace-write-route:write-effect:${writeFailureState.writeEffect}`,
      `apply-patch-workspace-write-route:failure-phase:${writeFailureState.failurePhase}`,
      "apply-patch-workspace-write-route:changed-files-empty",
      "apply-patch-workspace-write-route:write-intents-empty",
      ...(input.workspaceWriterInvoked
        ? ["apply-patch-workspace-write-route:writer-invoked-no-success-claim"]
        : ["apply-patch-workspace-write-route:no-writer-invoked"]),
      "apply-patch-workspace-write-route:no-applied-patch-record",
      "apply-patch-workspace-write-route:no-success-claim",
    ],
  };
}
