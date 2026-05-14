import type { OrchestrationResult } from "./types.js";
import {
  buildNoWriteRuntimeRoute,
  type NoWriteRuntimeSource,
} from "./patchResult/noWriteRuntimeRoute.js";
import { buildNoWriteRuntimeRouteResult } from "./patchResult/runtimeRouteResult.js";
import { buildWorkspaceCreateRouteResult } from "./patchResult/workspaceCreateResult.js";
import {
  patchIsSingleAddFile,
  runWorkspaceCreateRoute,
} from "./patchResult/workspaceCreateRoute.js";
import { buildWorkspaceDeleteRouteResult } from "./patchResult/workspaceDeleteResult.js";
import {
  patchIsSingleDeleteFile,
  runWorkspaceDeleteRoute,
} from "./patchResult/workspaceDeleteRoute.js";
import { buildMultiFileWriteRouteResult } from "./patchResult/multiFileWriteResult.js";
import {
  patchIsTwoOrThreeUpdateFiles,
  runMultiFileWriteRoute,
} from "./patchResult/multiFileWriteRoute.js";
import { buildWorkspaceMoveRouteResult } from "./patchResult/workspaceMoveResult.js";
import {
  patchIsSingleMoveFile,
  runWorkspaceMoveRoute,
} from "./patchResult/workspaceMoveRoute.js";
import { buildWorkspaceWriteRouteResult } from "./patchResult/workspaceWriteResult.js";
import { runWorkspaceWriteRoute } from "./patchResult/workspaceWriteRoute.js";
import type { SingleFileApplyPatchRequestedUserDecision } from "./patchResult/singleFileApplyPatchPermissionUxContract.js";
import type {
  WorkspaceCreateTargetAuthority,
  WorkspaceWriteTargetAuthority,
} from "./patchResult/workspaceAuthority.js";

export interface ApplyPatchRuntimeRouteOptions {
  readonly explicitRuntimeOptIn: boolean;
  readonly rawPatchText?: string;
  readonly requestedUserDecision?: SingleFileApplyPatchRequestedUserDecision;
  readonly runtimeSource?: NoWriteRuntimeSource;
  readonly workspaceWrite?: {
    readonly explicitWorkspaceWriteOptIn: boolean;
  };
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
    if (patchIsSingleAddFile(rawPatchText)) {
      const route = await runWorkspaceCreateRoute({
        workspaceRoot: input.workspaceRoot,
        rawPatchText,
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
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
      return buildWorkspaceCreateRouteResult({
        sessionId: input.sessionId,
        prompt: input.prompt,
        route,
      });
    }

    if (patchIsTwoOrThreeUpdateFiles(rawPatchText)) {
      const route = await runMultiFileWriteRoute({
        workspaceRoot: input.workspaceRoot,
        rawPatchText,
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
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
      return buildMultiFileWriteRouteResult({
        sessionId: input.sessionId,
        prompt: input.prompt,
        route,
      });
    }

    if (patchIsSingleMoveFile(rawPatchText)) {
      const route = await runWorkspaceMoveRoute({
        workspaceRoot: input.workspaceRoot,
        rawPatchText,
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
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
      return buildWorkspaceMoveRouteResult({
        sessionId: input.sessionId,
        prompt: input.prompt,
        route,
      });
    }

    if (patchIsSingleDeleteFile(rawPatchText)) {
      const route = await runWorkspaceDeleteRoute({
        workspaceRoot: input.workspaceRoot,
        rawPatchText,
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
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
      return buildWorkspaceDeleteRouteResult({
        sessionId: input.sessionId,
        prompt: input.prompt,
        route,
      });
    }

    const route = await runWorkspaceWriteRoute({
      workspaceRoot: input.workspaceRoot,
      rawPatchText,
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
    rawPatchText,
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
