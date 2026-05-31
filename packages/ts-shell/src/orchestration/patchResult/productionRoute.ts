import type { GuardedWriteGate } from "./guardedWriteGate.js";
import type { SingleFileApplyPatchPermissionUxContract } from "../../edit/authority/approval/permission.js";
import {
  runProductionWriteLane,
  type ProductionWriteLane,
} from "./productionWriteLane.js";
import {
  buildRouteWiringGate,
  type RouteWiringGate,
} from "./routeWiringGate.js";

export type ProductionRouteStatus = "written" | "blocked";

export type ProductionRouteBlocker = "route-wiring-gate" | "write-lane";

export interface ProductionRouteOptions {
  readonly workspaceRoot: string;
  readonly rawPatchText: string;
  readonly permissionUx: SingleFileApplyPatchPermissionUxContract;
  readonly guardedGate: GuardedWriteGate;
  readonly explicitRouteOptIn: boolean;
  readonly singleFileUpdateOnly: boolean;
  readonly defaultProductionRejectionUnchanged: boolean;
  readonly safeResultSessionProjection: boolean;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly writeFile: (relativePath: string, content: string) => void | Promise<void>;
  readonly isolatedWorkspace: true;
}

export type ProductionRoute =
  | {
      readonly source: "single-file-apply-patch-production-route";
      readonly status: "written";
      readonly routeGate: RouteWiringGate;
      readonly writeLane: Extract<ProductionWriteLane, { status: "written" }>;
      readonly isolatedWorkspace: true;
      readonly productionWriterInvoked: true;
      readonly productionWriterTarget: "isolated-workspace";
      readonly realRepositoryWrite: false;
      readonly changedFiles: readonly [string];
      readonly writeIntents: readonly [string];
      readonly appliedPatchRecord: false;
      readonly terminalClassification: "success";
      readonly terminalSuccessAllowed: true;
      readonly mutationSuccessClaimAllowed: true;
      readonly resultSessionStatus: "write-success";
      readonly nextAction: string;
      readonly doNext: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly source: "single-file-apply-patch-production-route";
      readonly status: "blocked";
      readonly blocker: ProductionRouteBlocker;
      readonly routeGate: RouteWiringGate;
      readonly writeLane?: Extract<ProductionWriteLane, { status: "blocked" }>;
      readonly isolatedWorkspace: true;
      readonly productionWriterInvoked: false;
      readonly productionWriterTarget: "none";
      readonly realRepositoryWrite: false;
      readonly changedFiles: readonly [];
      readonly writeIntents: readonly [];
      readonly appliedPatchRecord: false;
      readonly terminalClassification: "stopped";
      readonly terminalSuccessAllowed: false;
      readonly mutationSuccessClaimAllowed: false;
      readonly resultSessionStatus: "stopped";
      readonly nextAction: string;
      readonly doNext: string;
      readonly evidence: readonly string[];
    };

export async function runProductionRoute(
  options: ProductionRouteOptions,
): Promise<ProductionRoute> {
  const routeGate = buildRouteWiringGate({
    explicitRouteOptIn: options.explicitRouteOptIn,
    guardedGate: options.guardedGate,
    singleFileUpdateOnly: options.singleFileUpdateOnly,
    defaultProductionRejectionUnchanged:
      options.defaultProductionRejectionUnchanged,
    safeResultSessionProjection: options.safeResultSessionProjection,
  });

  if (routeGate.status !== "ready") {
    return blocked({
      blocker: "route-wiring-gate",
      routeGate,
      nextAction: routeGate.nextAction,
      evidence: ["apply-patch-production-route:route-gate-blocked"],
    });
  }

  const writeLane = await runProductionWriteLane({
    workspaceRoot: options.workspaceRoot,
    rawPatchText: options.rawPatchText,
    permissionUx: options.permissionUx,
    guardedGate: options.guardedGate,
    readFile: options.readFile,
    writeFile: options.writeFile,
    isolatedWorkspace: options.isolatedWorkspace,
  });

  if (writeLane.status !== "written") {
    return blocked({
      blocker: "write-lane",
      routeGate,
      writeLane,
      nextAction: writeLane.nextAction,
      evidence: ["apply-patch-production-route:write-lane-blocked"],
    });
  }

  const nextAction =
    "Record guarded production route evidence; default apply_patch remains rejected outside explicit opt-in.";
  return {
    source: "single-file-apply-patch-production-route",
    status: "written",
    routeGate,
    writeLane,
    isolatedWorkspace: options.isolatedWorkspace,
    productionWriterInvoked: true,
    productionWriterTarget: writeLane.productionWriterTarget,
    realRepositoryWrite: false,
    changedFiles: writeLane.changedFiles,
    writeIntents: writeLane.writeIntents,
    appliedPatchRecord: false,
    terminalClassification: "success",
    terminalSuccessAllowed: true,
    mutationSuccessClaimAllowed: true,
    resultSessionStatus: "write-success",
    nextAction,
    doNext: nextAction,
    evidence: [
      "apply-patch-production-route:explicit-route-opt-in",
      "apply-patch-production-route:route-gate-ready",
      "apply-patch-production-route:write-lane-written",
      "apply-patch-production-route:success-after-verified-write",
      "apply-patch-production-route:production-writer-isolated-workspace",
      "apply-patch-production-route:default-production-rejection-unchanged",
    ],
  };
}

function blocked(input: {
  readonly blocker: ProductionRouteBlocker;
  readonly routeGate: RouteWiringGate;
  readonly writeLane?: Extract<ProductionWriteLane, { status: "blocked" }>;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): ProductionRoute {
  return {
    source: "single-file-apply-patch-production-route",
    status: "blocked",
    blocker: input.blocker,
    routeGate: input.routeGate,
    ...(input.writeLane ? { writeLane: input.writeLane } : {}),
    isolatedWorkspace: true,
    productionWriterInvoked: false,
    productionWriterTarget: "none",
    realRepositoryWrite: false,
    changedFiles: [],
    writeIntents: [],
    appliedPatchRecord: false,
    terminalClassification: "stopped",
    terminalSuccessAllowed: false,
    mutationSuccessClaimAllowed: false,
    resultSessionStatus: "stopped",
    nextAction: input.nextAction,
    doNext: input.nextAction,
    evidence: [
      ...input.evidence,
      `apply-patch-production-route:blocker:${input.blocker}`,
      "apply-patch-production-route:changed-files-empty",
      "apply-patch-production-route:write-intents-empty",
      "apply-patch-production-route:production-writer-invoked-false",
      "apply-patch-production-route:real-repository-write-false",
      "apply-patch-production-route:no-success-claim",
    ],
  };
}
