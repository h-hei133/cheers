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
import { buildMultiFileWriteRouteResult } from "./patchResult/multiFileWriteResult.js";
import {
  patchIsExactlyTwoUpdateFiles,
  runMultiFileWriteRoute,
} from "./patchResult/multiFileWriteRoute.js";
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

    if (patchIsExactlyTwoUpdateFiles(rawPatchText)) {
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
