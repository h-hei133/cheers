import path from "node:path";
import type { QueryEvent } from "../core/query/events.js";
import type { SandboxEnforcer } from "../sandbox/index.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";
import { createWorkspaceWriteAuthority } from "../orchestration/patchResult/workspaceAuthority.js";
import {
  buildFencedEditReplacementRouteResult,
  runFencedEditReplacementRoute,
  selectFencedEditReplacementActivation,
} from "../orchestration/editPatchModule.js";
import type { EditRuntimeStageResult } from "./discoveryEditRuntimeStage.js";

export async function runFencedEditRuntimeStage(input: {
  readonly plan: WorkflowTaskPlan;
  readonly prompt: string;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly enforcer: SandboxEnforcer;
  readonly events: QueryEvent[];
  readonly baseNotes: readonly string[];
  readonly abortSignal?: AbortSignal;
}): Promise<EditRuntimeStageResult | undefined> {
  const fencedActivation = selectFencedEditReplacementActivation({
    prompt: input.prompt,
    ...(input.plan.targetPath ? { targetPath: input.plan.targetPath } : {}),
    ...(input.plan.replaceFrom && input.plan.replaceTo
      ? {
          replaceDirective: {
            from: input.plan.replaceFrom,
            to: input.plan.replaceTo,
          },
        }
      : {}),
    hasMultipleTargets:
      (input.plan.additionalTargetPaths?.length ?? 0) > 0 ||
      /(?:\s|^)(?:and|,)\s+[\w./\\-]+\.(?:ts|tsx|js|jsx|py|go|rs|md|txt|json|yaml|yml)\b/i.test(
        input.prompt,
      ),
  });
  if (fencedActivation.status === "stopped") {
    const result = buildFencedEditReplacementRouteResult({
      sessionId: input.sessionId,
      prompt: input.prompt,
      route: fencedActivation.route,
    });
    return {
      events: input.events,
      notes: [
        ...input.baseNotes,
        "fenced-edit-activation: stopped before mutation",
        ...fencedActivation.evidence,
      ],
      codingResult: result.codingResult!,
      userFacingOutput: result.finalOutput,
    };
  }
  if (fencedActivation.status === "selected") {
    const workspaceAuthority = createWorkspaceWriteAuthority(input.workspaceRoot);
    const absoluteTarget = path.isAbsolute(fencedActivation.targetPath)
      ? fencedActivation.targetPath
      : path.join(input.workspaceRoot, fencedActivation.targetPath);
    const approval = await input.enforcer.checkAndEnforce("edit", {
      scope: "filesystem",
      operation: "write",
      target: absoluteTarget,
      workspaceRoot: input.workspaceRoot,
    });
    const route = await runFencedEditReplacementRoute({
      workspaceRoot: input.workspaceRoot,
      targetPath: fencedActivation.targetPath,
      mapping: fencedActivation.mapping,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: approval.allowed ? "approved" : "denied",
      defaultProductionRejectionUnchanged: true,
      readFile: workspaceAuthority.readFile,
      readVerifiedFile: workspaceAuthority.readVerifiedFile,
      validateWriteTarget: workspaceAuthority.validateWriteTarget,
      writeFile: workspaceAuthority.writeFile,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
    const activatedRoute = {
      ...route,
      evidence: [...fencedActivation.evidence, ...route.evidence],
    };
    const result = buildFencedEditReplacementRouteResult({
      sessionId: input.sessionId,
      prompt: input.prompt,
      route: activatedRoute,
    });
    return {
      events: input.events,
      notes: [
        ...input.baseNotes,
        `fenced-edit-activation: selected target=${fencedActivation.targetPath}`,
        `fenced-edit-activation: permission=${approval.allowed ? "approved" : "denied"}`,
        ...fencedActivation.evidence,
        ...activatedRoute.evidence,
      ],
      codingResult: result.codingResult!,
      userFacingOutput: result.finalOutput,
    };
  }
  return undefined;
}
