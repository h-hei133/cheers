import path from "node:path";
import {
  buildStoppedFencedReplacementPlan,
  planExactFencedReplacement,
  type ExactFencedReplacementPlan,
  type FencedEditMapping,
  type FencedEditPlanBlocker,
} from "./fencedEditPlanner.js";
import type { SingleFileApplyPatchRequestedUserDecision } from "./patchResult/singleFileApplyPatchPermissionUxContract.js";
import type {
  WorkspaceWriteTargetAuthority,
} from "./patchResult/workspaceAuthority.js";
import {
  runWorkspaceWriteRoute,
  type WorkspaceWriteRoute,
} from "./patchResult/workspaceWriteRoute.js";
import {
  classifyFencedEditOutcome,
  fencedEditOutcomeEvidence,
} from "./fencedEditOutcome.js";
import type { RecoveryAuthorityStoreConfig } from "./patchRecovery/recoveryAuthorityStore.js";

export type FencedEditReplacementRoute =
  | {
      readonly source: "fenced-edit-replacement-route";
      readonly status: "written";
      readonly targetPath: string;
      readonly plan: Extract<ExactFencedReplacementPlan, { ok: true }>;
      readonly workspaceRoute: Extract<WorkspaceWriteRoute, { status: "written" }>;
      readonly changedFiles: readonly [string];
      readonly postWriteVerification: "passed";
      readonly terminalClassification: "success";
      readonly evidence: readonly string[];
    }
  | {
      readonly source: "fenced-edit-replacement-route";
      readonly status: "blocked";
      readonly targetPath?: string;
      readonly blocker: string;
      readonly plan: ExactFencedReplacementPlan;
      readonly workspaceRoute?: Extract<WorkspaceWriteRoute, { status: "blocked" }>;
      readonly changedFiles: readonly [];
      readonly postWriteVerification: "not-run" | "blocked" | "failed";
      readonly terminalClassification: "stopped" | "error";
      readonly nextAction: string;
      readonly evidence: readonly string[];
    };

export interface FencedEditReplacementRouteOptions {
  readonly workspaceRoot: string;
  readonly targetPath?: string;
  readonly mapping?: FencedEditMapping;
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
  readonly recoveryAuthority?: RecoveryAuthorityStoreConfig;
  readonly abortSignal?: AbortSignal;
}

export async function runFencedEditReplacementRoute(
  options: FencedEditReplacementRouteOptions,
): Promise<FencedEditReplacementRoute> {
  if (options.targetPath) {
    const targetAuthority = options.validateWriteTarget(options.targetPath);
    if (targetAuthority.ok === false) {
      const plan = planExactFencedReplacement({
        targetPath: options.targetPath,
        originalContent: undefined,
        mapping: options.mapping,
      });
      const outcome = classifyFencedEditOutcome({
        status: "blocked",
        blocker: `workspace-${targetAuthority.reason}`,
        postWriteVerification: "not-run",
      });
      return {
        source: "fenced-edit-replacement-route",
        status: "blocked",
        targetPath: options.targetPath,
        blocker: `workspace-${targetAuthority.reason}`,
        plan,
        changedFiles: [],
        postWriteVerification: "not-run",
        terminalClassification: blockedTerminalClassification(outcome),
        nextAction: targetAuthority.message,
        evidence: [
          ...fencedEditOutcomeEvidence(outcome),
          "fenced-edit-route:workspace-authority-blocked",
          ...targetAuthority.evidence,
          ...plan.evidence,
          "fenced-edit-route:no-writer-invoked",
        ],
      };
    }
  }

  const originalContent = options.targetPath
    ? options.readFile(path.resolve(options.workspaceRoot, options.targetPath))
    : undefined;
  const plan = planExactFencedReplacement({
    targetPath: options.targetPath,
    originalContent,
    mapping: options.mapping,
  });

  if (plan.ok === false) {
    const outcome = classifyFencedEditOutcome({
      status: "blocked",
      blocker: plan.blocker,
      postWriteVerification: "not-run",
    });
    return {
      source: "fenced-edit-replacement-route",
      status: "blocked",
      ...(plan.targetPath ? { targetPath: plan.targetPath } : {}),
      blocker: plan.blocker,
      plan,
      changedFiles: [],
      postWriteVerification: "not-run",
      terminalClassification: blockedTerminalClassification(outcome),
      nextAction: plan.nextAction,
      evidence: [
        ...fencedEditOutcomeEvidence(outcome),
        "fenced-edit-route:planning-blocked",
        ...plan.evidence,
        "fenced-edit-route:no-writer-invoked",
      ],
    };
  }

  const workspaceRoute = await runWorkspaceWriteRoute({
    workspaceRoot: options.workspaceRoot,
    rawPatchText: plan.rawPatchText,
    explicitRuntimeOptIn: options.explicitRuntimeOptIn,
    explicitWorkspaceWriteOptIn: options.explicitWorkspaceWriteOptIn,
    ...(options.requestedUserDecision
      ? { requestedUserDecision: options.requestedUserDecision }
      : {}),
    defaultProductionRejectionUnchanged:
      options.defaultProductionRejectionUnchanged,
    readFile: options.readFile,
    readVerifiedFile: options.readVerifiedFile,
    validateWriteTarget: options.validateWriteTarget,
    writeFile: options.writeFile,
    ...(options.recoveryAuthority
      ? { recoveryAuthority: options.recoveryAuthority }
      : {}),
    ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
  });

  if (workspaceRoute.status === "blocked") {
    const outcome = classifyFencedEditOutcome({
      status: "blocked",
      blocker: `workspace-${workspaceRoute.blocker}`,
      writerStarted: workspaceRoute.writerStarted,
      postWriteVerification: workspaceRoute.postWriteVerification,
    });
    return {
      source: "fenced-edit-replacement-route",
      status: "blocked",
      targetPath: plan.targetPath,
      blocker: `workspace-${workspaceRoute.blocker}`,
      plan,
      workspaceRoute,
      changedFiles: [],
      postWriteVerification: workspaceRoute.postWriteVerification,
      terminalClassification: blockedTerminalClassification(outcome),
      nextAction: workspaceRoute.nextAction,
      evidence: [
        ...fencedEditOutcomeEvidence(outcome),
        "fenced-edit-route:workspace-route-blocked",
        ...plan.evidence,
        ...workspaceRoute.evidence,
        "fenced-edit-route:no-success-claim",
      ],
    };
  }

  const outcome = classifyFencedEditOutcome({
    status: "written",
    postWriteVerification: workspaceRoute.postWriteVerification,
  });
  return {
    source: "fenced-edit-replacement-route",
    status: "written",
    targetPath: plan.targetPath,
    plan,
    workspaceRoute,
    changedFiles: workspaceRoute.changedFiles,
    postWriteVerification: workspaceRoute.postWriteVerification,
    terminalClassification: "success",
    evidence: [
      ...fencedEditOutcomeEvidence(outcome),
      "fenced-edit-route:exact-replacement-written",
      ...plan.evidence,
      ...workspaceRoute.evidence,
      "fenced-edit-route:continuation-safe-evidence",
    ],
  };
}

export function buildStoppedFencedEditReplacementRoute(input: {
  readonly targetPath?: string;
  readonly blocker: FencedEditPlanBlocker | string;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): Extract<FencedEditReplacementRoute, { status: "blocked" }> {
  const plan = buildStoppedFencedReplacementPlan({
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    blocker: fencedPlanBlocker(input.blocker),
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: input.evidence,
  });
  const outcome = classifyFencedEditOutcome({
    status: "blocked",
    blocker: input.blocker,
    postWriteVerification: "not-run",
  });
  return {
    source: "fenced-edit-replacement-route",
    status: "blocked",
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    blocker: input.blocker,
    plan,
    changedFiles: [],
    postWriteVerification: "not-run",
    terminalClassification: blockedTerminalClassification(outcome),
    nextAction: input.nextAction,
    evidence: [
      ...fencedEditOutcomeEvidence(outcome),
      "fenced-edit-route:activation-blocked",
      ...input.evidence,
      ...plan.evidence,
      "fenced-edit-route:no-writer-invoked",
    ],
  };
}

function fencedPlanBlocker(blocker: string): FencedEditPlanBlocker {
  switch (blocker) {
    case "missing-target":
    case "ambiguous-target":
    case "missing-mapping":
    case "unsupported-fuzzy":
    case "unsupported-discovery":
    case "unsupported-broad":
    case "unsupported-multi-file":
    case "unsupported-generated":
    case "unsupported-rollback":
    case "target-missing":
    case "mapping-not-found":
    case "multiple-matches":
    case "no-op":
    case "unsafe-patch-control-line":
      return blocker;
    default:
      return "missing-mapping";
  }
}

function blockedTerminalClassification(input: {
  readonly terminalClassification: "success" | "stopped" | "error";
}): "stopped" | "error" {
  return input.terminalClassification === "error" ? "error" : "stopped";
}
