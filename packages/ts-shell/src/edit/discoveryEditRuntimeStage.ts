import path from "node:path";
import type { QueryEvent } from "../core/query/runtime/events.js";
import type { SandboxEnforcer } from "../sandbox/index.js";
import type { CodingResultSummary } from "../orchestration/types.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";
import { buildDiscoveryEditRuntimeRequest } from "../orchestration/discoveryEditRuntime.js";
import {
  buildDiscoveryEditPlanResult,
  buildFencedEditReplacementRouteResult,
  buildTargetSetEditRouteResult,
  planDiscoveryEdit,
  runFencedEditReplacementRoute,
  runTargetSetEditRoute,
} from "../orchestration/editPatchModule.js";
import { createWorkspaceWriteAuthority } from "../orchestration/patchResult/workspaceAuthority.js";

export interface EditRuntimeStageResult {
  readonly events: QueryEvent[];
  readonly notes: string[];
  readonly codingResult: CodingResultSummary;
  readonly userFacingOutput: string;
}

export async function runDiscoveryEditRuntimeStage(input: {
  readonly plan: WorkflowTaskPlan;
  readonly prompt: string;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly enforcer: SandboxEnforcer;
  readonly events: QueryEvent[];
  readonly baseNotes: readonly string[];
  readonly abortSignal?: AbortSignal;
}): Promise<EditRuntimeStageResult | undefined> {
  const discoveryEditRequest = buildDiscoveryEditRuntimeRequest({
    prompt: input.prompt,
    workspaceRoot: input.workspaceRoot,
    targetPath: input.plan.targetPath,
  });
  if (!discoveryEditRequest) {
    return undefined;
  }

  const discoveryPlan = planDiscoveryEdit(discoveryEditRequest);
  if (
    discoveryPlan.status !== "ready-for-handoff" &&
    discoveryPlan.status !== "ready-for-target-set"
  ) {
    const result = buildDiscoveryEditPlanResult({
      sessionId: input.sessionId,
      prompt: input.prompt,
      plan: discoveryPlan,
    });
    return {
      events: input.events,
      notes: [
        ...input.baseNotes,
        "discovery-edit: manifest produced without mutation",
        discoveryPlan.manifest.transcriptSummary,
        ...discoveryPlan.evidence,
      ],
      codingResult: result.codingResult!,
      userFacingOutput: result.finalOutput,
    };
  }

  if (discoveryPlan.status === "ready-for-target-set") {
    const workspaceAuthority = createWorkspaceWriteAuthority(input.workspaceRoot);
    const approvalResults = [];
    for (const targetPath of discoveryPlan.confirmedTargetSet) {
      const absoluteTarget = path.isAbsolute(targetPath)
        ? targetPath
        : path.join(input.workspaceRoot, targetPath);
      approvalResults.push(
        await input.enforcer.checkAndEnforce("edit", {
          scope: "filesystem",
          operation: "write",
          target: absoluteTarget,
          workspaceRoot: input.workspaceRoot,
        }),
      );
    }
    const allApproved = approvalResults.every((approval) => approval.allowed);
    const route = await runTargetSetEditRoute({
      workspaceRoot: input.workspaceRoot,
      manifest: discoveryPlan.manifest,
      confirmedTargetSet: discoveryPlan.confirmedTargetSet,
      mapping: discoveryPlan.mapping,
      maxFiles: 3,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: allApproved ? "approved" : "denied",
      defaultProductionRejectionUnchanged: true,
      readFile: workspaceAuthority.readFile,
      readVerifiedFile: workspaceAuthority.readVerifiedFile,
      validateWriteTarget: workspaceAuthority.validateWriteTarget,
      writeFile: workspaceAuthority.writeFile,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
    const result = buildTargetSetEditRouteResult({
      sessionId: input.sessionId,
      prompt: input.prompt,
      route: {
        ...route,
        evidence: [
          discoveryPlan.manifest.transcriptSummary,
          ...discoveryPlan.evidence,
          "discovery-edit-handoff:target-set-edit-route",
          ...route.evidence,
        ],
      },
    });
    return {
      events: input.events,
      notes: [
        ...input.baseNotes,
        `discovery-edit: confirmed target-set=${discoveryPlan.confirmedTargetSet.join(",")}`,
        `discovery-edit: permission=${allApproved ? "approved" : "denied"}`,
        discoveryPlan.manifest.transcriptSummary,
        ...discoveryPlan.evidence,
        ...route.evidence,
      ],
      codingResult: result.codingResult!,
      userFacingOutput: result.finalOutput,
    };
  }

  const workspaceAuthority = createWorkspaceWriteAuthority(input.workspaceRoot);
  const absoluteTarget = path.isAbsolute(discoveryPlan.confirmation.targetPath)
    ? discoveryPlan.confirmation.targetPath
    : path.join(input.workspaceRoot, discoveryPlan.confirmation.targetPath);
  const approval = await input.enforcer.checkAndEnforce("edit", {
    scope: "filesystem",
    operation: "write",
    target: absoluteTarget,
    workspaceRoot: input.workspaceRoot,
  });
  const route = await runFencedEditReplacementRoute({
    workspaceRoot: input.workspaceRoot,
    targetPath: discoveryPlan.confirmation.targetPath,
    mapping: discoveryPlan.mapping,
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
    evidence: [
      discoveryPlan.manifest.transcriptSummary,
      ...discoveryPlan.evidence,
      "discovery-edit-handoff:existing-fenced-route",
      ...route.evidence,
    ],
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
      `discovery-edit: confirmed target=${discoveryPlan.confirmation.targetPath}`,
      `discovery-edit: permission=${approval.allowed ? "approved" : "denied"}`,
      discoveryPlan.manifest.transcriptSummary,
      ...discoveryPlan.evidence,
      ...activatedRoute.evidence,
    ],
    codingResult: result.codingResult!,
    userFacingOutput: result.finalOutput,
  };
}
