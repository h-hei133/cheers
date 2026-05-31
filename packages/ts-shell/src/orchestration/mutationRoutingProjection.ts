import type { OrchestrationResult } from "./types.js";
import {
  buildNoWriteRuntimeRoute,
  type NoWriteRuntimeSource,
} from "./patchResult/noWriteRuntimeRoute.js";
import { buildNoWriteRuntimeRouteResult } from "./patchResult/runtimeRouteResult.js";
import { buildWorkspaceCreateRouteResult } from "../edit/result/workspace/workspaceCreateResult.js";
import {
  patchIsSingleAddFile,
  runWorkspaceCreateRoute,
} from "./patchResult/workspaceCreateRoute.js";
import { buildWorkspaceDeleteRouteResult } from "../edit/result/workspace/workspaceDeleteResult.js";
import {
  patchIsSingleDeleteFile,
  runWorkspaceDeleteRoute,
} from "./patchResult/workspaceDeleteRoute.js";
import { buildMultiFileWriteRouteResult } from "../edit/result/workspace/multiFileWriteResult.js";
import {
  patchIsBoundedUpdateFiles,
  runMultiFileWriteRoute,
} from "./patchResult/multiFileWriteRoute.js";
import { buildWorkspaceMoveRouteResult } from "../edit/result/workspace/workspaceMoveResult.js";
import {
  patchIsSingleMoveFile,
  runWorkspaceMoveRoute,
} from "./patchResult/workspaceMoveRoute.js";
import { buildWorkspaceWriteRouteResult } from "../edit/result/workspace/workspaceWriteResult.js";
import { runWorkspaceWriteRoute } from "./patchResult/workspaceWriteRoute.js";
import type { SingleFileApplyPatchRequestedUserDecision } from "./patchResult/singleFileApplyPatchPermissionUxContract.js";
import type {
  WorkspaceCreateTargetAuthority,
  WorkspaceWriteTargetAuthority,
} from "../edit/authority/workspace.js";
import {
  classifyBoundedApplyPatchCandidate,
  type BoundedApplyPatchCandidateProjection,
} from "../edit/patch/plan/candidate.js";
import { buildMixedFileWriteRouteResult } from "../edit/result/workspace/mixedFileWriteResult.js";
import {
  patchIsBoundedMixedWriteFiles,
  runMixedFileWriteRoute,
} from "./patchResult/mixedFileWriteRoute.js";
import type { RecoveryAuthorityStoreConfig } from "./patchRecovery/recoveryAuthorityStore.js";

export interface ApplyPatchRuntimeRouteOptions {
  readonly explicitRuntimeOptIn: boolean;
  readonly rawPatchText?: string;
  readonly requestedUserDecision?: SingleFileApplyPatchRequestedUserDecision;
  readonly runtimeSource?: NoWriteRuntimeSource;
  readonly workspaceWrite?: {
    readonly explicitWorkspaceWriteOptIn: boolean;
  };
  readonly recoveryAuthority?: RecoveryAuthorityStoreConfig;
}

export interface MutationRoutingProjectionAuthority {
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly readVerifiedFile: (relativePath: string) => string | undefined;
  readonly directoryExists: (absolutePath: string) => boolean;
  readonly validateCreateTarget: (
    relativePath: string,
  ) => WorkspaceCreateTargetAuthority;
  readonly createFileExclusive: (
    relativePath: string,
    content: string,
  ) => void | Promise<void>;
  readonly moveFileExclusive: (
    sourcePath: string,
    targetPath: string,
  ) => void | Promise<void>;
  readonly deleteFile: (relativePath: string) => void | Promise<void>;
  readonly validateWriteTarget: (
    relativePath: string,
  ) => WorkspaceWriteTargetAuthority;
  readonly writeFile: (
    relativePath: string,
    content: string,
  ) => void | Promise<void>;
}

export async function projectApplyPatchRuntimeMutationRoute(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly workspaceRoot: string;
  readonly routeOptions?: ApplyPatchRuntimeRouteOptions;
  readonly getWorkspaceAuthority: () => MutationRoutingProjectionAuthority;
  readonly readNoWriteRuntimeFile: (absolutePath: string) => string | undefined;
  readonly abortSignal?: AbortSignal;
}): Promise<OrchestrationResult | undefined> {
  const routeOptions = input.routeOptions;
  if (!routeOptions) {
    return undefined;
  }

  const rawPatchText = routeOptions.rawPatchText ?? input.prompt;
  if (routeOptions.workspaceWrite?.explicitWorkspaceWriteOptIn) {
    const workspaceAuthority = input.getWorkspaceAuthority();
    const boundedCandidate = classifyBoundedApplyPatchCandidate({
      workspaceRoot: input.workspaceRoot,
      rawPatchText,
    });
    const routePatchText = boundedCandidate.normalizedRawPatchText ?? rawPatchText;
    if (
      boundedCandidate.status === "candidate" &&
      boundedCandidate.operationFamily === "single" &&
      boundedCandidate.normalizedOperations[0]?.kind === "create" &&
      patchIsSingleAddFile(routePatchText)
    ) {
      const route = await runWorkspaceCreateRoute({
        workspaceRoot: input.workspaceRoot,
        rawPatchText: routePatchText,
        explicitRuntimeOptIn: routeOptions.explicitRuntimeOptIn,
        explicitWorkspaceWriteOptIn:
          routeOptions.workspaceWrite.explicitWorkspaceWriteOptIn,
        ...(routeOptions.requestedUserDecision
          ? { requestedUserDecision: routeOptions.requestedUserDecision }
          : {}),
        defaultProductionRejectionUnchanged: true,
        readFile: workspaceAuthority.readFile,
        readVerifiedFile: workspaceAuthority.readVerifiedFile,
        directoryExists: workspaceAuthority.directoryExists,
        validateCreateTarget: workspaceAuthority.validateCreateTarget,
        createFileExclusive: workspaceAuthority.createFileExclusive,
        ...(routeOptions.recoveryAuthority
          ? { recoveryAuthority: routeOptions.recoveryAuthority }
          : {}),
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
      return buildWorkspaceCreateRouteResult({
        sessionId: input.sessionId,
        prompt: input.prompt,
        route,
      });
    }

    if (
      boundedCandidate.status === "candidate" &&
      boundedCandidate.operationFamily === "update-only" &&
      patchIsBoundedUpdateFiles(routePatchText)
    ) {
      const route = await runMultiFileWriteRoute({
        workspaceRoot: input.workspaceRoot,
        rawPatchText: routePatchText,
        explicitRuntimeOptIn: routeOptions.explicitRuntimeOptIn,
        explicitWorkspaceWriteOptIn:
          routeOptions.workspaceWrite.explicitWorkspaceWriteOptIn,
        ...(routeOptions.requestedUserDecision
          ? { requestedUserDecision: routeOptions.requestedUserDecision }
          : {}),
        defaultProductionRejectionUnchanged: true,
        readFile: workspaceAuthority.readFile,
        readVerifiedFile: workspaceAuthority.readVerifiedFile,
        validateWriteTarget: workspaceAuthority.validateWriteTarget,
        writeFile: workspaceAuthority.writeFile,
        ...(routeOptions.recoveryAuthority
          ? { recoveryAuthority: routeOptions.recoveryAuthority }
          : {}),
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
      return buildMultiFileWriteRouteResult({
        sessionId: input.sessionId,
        prompt: input.prompt,
        route,
      });
    }

    if (
      boundedCandidate.status === "candidate" &&
      boundedCandidate.operationFamily === "single" &&
      boundedCandidate.normalizedOperations[0]?.kind === "move" &&
      patchIsSingleMoveFile(routePatchText)
    ) {
      const route = await runWorkspaceMoveRoute({
        workspaceRoot: input.workspaceRoot,
        rawPatchText: routePatchText,
        explicitRuntimeOptIn: routeOptions.explicitRuntimeOptIn,
        explicitWorkspaceWriteOptIn:
          routeOptions.workspaceWrite.explicitWorkspaceWriteOptIn,
        ...(routeOptions.requestedUserDecision
          ? { requestedUserDecision: routeOptions.requestedUserDecision }
          : {}),
        defaultProductionRejectionUnchanged: true,
        readFile: workspaceAuthority.readFile,
        readVerifiedFile: workspaceAuthority.readVerifiedFile,
        directoryExists: workspaceAuthority.directoryExists,
        validateWriteTarget: workspaceAuthority.validateWriteTarget,
        validateCreateTarget: workspaceAuthority.validateCreateTarget,
        moveFileExclusive: workspaceAuthority.moveFileExclusive,
        ...(routeOptions.recoveryAuthority
          ? { recoveryAuthority: routeOptions.recoveryAuthority }
          : {}),
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
      return buildWorkspaceMoveRouteResult({
        sessionId: input.sessionId,
        prompt: input.prompt,
        route,
      });
    }

    if (
      boundedCandidate.status === "candidate" &&
      boundedCandidate.operationFamily === "single" &&
      boundedCandidate.normalizedOperations[0]?.kind === "delete" &&
      patchIsSingleDeleteFile(routePatchText)
    ) {
      const route = await runWorkspaceDeleteRoute({
        workspaceRoot: input.workspaceRoot,
        rawPatchText: routePatchText,
        explicitRuntimeOptIn: routeOptions.explicitRuntimeOptIn,
        explicitWorkspaceWriteOptIn:
          routeOptions.workspaceWrite.explicitWorkspaceWriteOptIn,
        ...(routeOptions.requestedUserDecision
          ? { requestedUserDecision: routeOptions.requestedUserDecision }
          : {}),
        defaultProductionRejectionUnchanged: true,
        readFile: workspaceAuthority.readFile,
        readVerifiedFile: workspaceAuthority.readVerifiedFile,
        directoryExists: workspaceAuthority.directoryExists,
        validateWriteTarget: workspaceAuthority.validateWriteTarget,
        deleteFile: workspaceAuthority.deleteFile,
        ...(routeOptions.recoveryAuthority
          ? { recoveryAuthority: routeOptions.recoveryAuthority }
          : {}),
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
      return buildWorkspaceDeleteRouteResult({
        sessionId: input.sessionId,
        prompt: input.prompt,
        route,
      });
    }

    if (
      boundedCandidate.status === "candidate" &&
      routeUsesMixedWriteRoute(boundedCandidate) &&
      patchIsBoundedMixedWriteFiles(routePatchText)
    ) {
      const route = await runMixedFileWriteRoute({
        workspaceRoot: input.workspaceRoot,
        rawPatchText: routePatchText,
        explicitRuntimeOptIn: routeOptions.explicitRuntimeOptIn,
        explicitWorkspaceWriteOptIn:
          routeOptions.workspaceWrite.explicitWorkspaceWriteOptIn,
        ...(routeOptions.requestedUserDecision
          ? { requestedUserDecision: routeOptions.requestedUserDecision }
          : {}),
        defaultProductionRejectionUnchanged: true,
        readFile: workspaceAuthority.readFile,
        readVerifiedFile: workspaceAuthority.readVerifiedFile,
        directoryExists: workspaceAuthority.directoryExists,
        validateWriteTarget: workspaceAuthority.validateWriteTarget,
        validateCreateTarget: workspaceAuthority.validateCreateTarget,
        writeFile: workspaceAuthority.writeFile,
        createFileExclusive: workspaceAuthority.createFileExclusive,
        moveFileExclusive: workspaceAuthority.moveFileExclusive,
        deleteFile: workspaceAuthority.deleteFile,
        ...(routeOptions.recoveryAuthority
          ? { recoveryAuthority: routeOptions.recoveryAuthority }
          : {}),
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
      return buildMixedFileWriteRouteResult({
        sessionId: input.sessionId,
        prompt: input.prompt,
        route,
      });
    }

    const route = await runWorkspaceWriteRoute({
      workspaceRoot: input.workspaceRoot,
      rawPatchText: routePatchText,
      explicitRuntimeOptIn: routeOptions.explicitRuntimeOptIn,
      explicitWorkspaceWriteOptIn:
        routeOptions.workspaceWrite.explicitWorkspaceWriteOptIn,
      ...(routeOptions.requestedUserDecision
        ? { requestedUserDecision: routeOptions.requestedUserDecision }
        : {}),
      defaultProductionRejectionUnchanged: true,
      readFile: workspaceAuthority.readFile,
      readVerifiedFile: workspaceAuthority.readVerifiedFile,
      validateWriteTarget: workspaceAuthority.validateWriteTarget,
      writeFile: workspaceAuthority.writeFile,
      ...(routeOptions.recoveryAuthority
        ? { recoveryAuthority: routeOptions.recoveryAuthority }
        : {}),
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
    return buildWorkspaceWriteRouteResult({
      sessionId: input.sessionId,
      prompt: input.prompt,
      route,
    });
  }

  const route = buildNoWriteRuntimeRoute({
    workspaceRoot: input.workspaceRoot,
    rawPatchText: classifyBoundedApplyPatchCandidate({
      workspaceRoot: input.workspaceRoot,
      rawPatchText,
    }).normalizedRawPatchText ?? rawPatchText,
    explicitRuntimeOptIn: routeOptions.explicitRuntimeOptIn,
    ...(routeOptions.requestedUserDecision
      ? { requestedUserDecision: routeOptions.requestedUserDecision }
      : {}),
    runtimeSource: routeOptions.runtimeSource ?? "production-adjacent",
    readFile: input.readNoWriteRuntimeFile,
  });

  return buildNoWriteRuntimeRouteResult({
    sessionId: input.sessionId,
    prompt: input.prompt,
    route,
  });
}

function routeUsesMixedWriteRoute(
  candidate: Extract<BoundedApplyPatchCandidateProjection, { status: "candidate" }>,
): boolean {
  return (
    candidate.operationFamily === "mixed" ||
    candidate.operationFamily === "delete-only" ||
    candidate.operationFamily === "move-only"
  );
}
