import type { OrchestrationResult } from "../orchestration/types.js";
import {
  projectApplyPatchRuntimeMutationRoute,
  type ApplyPatchRuntimeRouteOptions,
} from "../orchestration/mutationRoutingProjection.js";
import { createWorkspaceWriteAuthority } from "../orchestration/patchResult/workspaceAuthority.js";
import { createWorkspaceFileReader } from "./workspace/readPolicy.js";

export type { ApplyPatchRuntimeRouteOptions } from "../orchestration/mutationRoutingProjection.js";

export async function runApplyPatchRuntimeBridgeIfRequested(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly workspaceRoot: string;
  readonly routeOptions?: ApplyPatchRuntimeRouteOptions;
  readonly abortSignal?: AbortSignal;
}): Promise<OrchestrationResult | undefined> {
  if (!input.routeOptions) {
    return undefined;
  }

  return projectApplyPatchRuntimeMutationRoute({
    sessionId: input.sessionId,
    prompt: input.prompt,
    workspaceRoot: input.workspaceRoot,
    routeOptions: input.routeOptions,
    getWorkspaceAuthority: () =>
      createWorkspaceWriteAuthority(input.workspaceRoot),
    readNoWriteRuntimeFile: createWorkspaceFileReader(input.workspaceRoot),
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
  });
}
