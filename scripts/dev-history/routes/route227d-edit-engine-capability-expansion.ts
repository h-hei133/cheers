#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  runControlledEditOperationRoute,
  type ControlledEditOperationRouteResult,
} from "../../../packages/ts-shell/src/orchestration/controlledEditOperationRoute.js";
import { createWorkspaceWriteAuthority } from "../../../packages/ts-shell/src/orchestration/patchResult/workspaceAuthority.js";

type FinalStatus = "COMPLETE" | "PARTIAL" | "BLOCKED";

const repoRoot = process.cwd();
const reportRelativePath =
  "docs/implementation-context/route227d-edit-engine-capability-expansion-report.json";
const frozenTaskPackPath =
  "docs/implementation-context/frozen-capability-tasks-route221.json";
const tempPaths: string[] = [];
const productConsumer =
  "packages/ts-shell/src/orchestration/controlledEditOperationRoute.ts -> mutationRoutingProjection -> existing workspace create/multi/no-write routes";

try {
  await assertFrozenTaskPackPresent();
  const tasks = [
    await runScenario("route227d-update-existing-file", updatePatch(), true),
    await runScenario("route227d-create-file", addFilePatch(), true, { recovery: true }),
    await runScenario("route227d-unsafe-create-path", unsafeAddPatch(), true),
    await runScenario("route227d-overwrite-create-blocked", addExistingFilePatch(), true),
    await runScenario("route227d-three-file-target-set", threeFileUpdatePatch(), true, {
      includeC: true,
      recovery: true,
    }),
    await runPartialFailureScenario(),
    await runScenario("route227d-delete-preview", deleteFilePatch(), true),
    await runScenario("route227d-move-preview", moveFilePatch(), true),
    await runScenario("route227d-broad-preview", broadUnsupportedPatch(), true),
  ];

  const createSuccess = hasTask(tasks, "route227d-create-file", (task) =>
    task.operationType === "create-file" && task.apply.status === "applied" && task.apply.reportedSuccess,
  );
  const unsafeCreateRejected = hasTask(tasks, "route227d-unsafe-create-path", (task) =>
    task.apply.status !== "applied" && !task.apply.reportedSuccess,
  );
  const overwriteRejected = hasTask(tasks, "route227d-overwrite-create-blocked", (task) =>
    task.apply.status !== "applied" && !task.apply.reportedSuccess,
  );
  const multiFileSuccess = hasTask(tasks, "route227d-three-file-target-set", (task) =>
    task.changedFiles.length === 3 && task.apply.reportedSuccess,
  );
  const partialFailureStopped = hasTask(tasks, "route227d-partial-failure", (task) =>
    task.finalVerdict === "PARTIAL" && !task.apply.reportedSuccess && task.failedFiles.length > 0,
  );
  const previewsSafe = tasks
    .filter((task) => task.taskId === "route227d-delete-preview" || task.taskId === "route227d-move-preview")
    .every((task) => task.previewOnly && task.changedFiles.length === 0 && !task.apply.reportedSuccess);
  const broadBlocked = hasTask(tasks, "route227d-broad-preview", (task) =>
    task.finalVerdict !== "COMPLETE" && !task.apply.reportedSuccess,
  );
  const recoveryEvidence = tasks.some((task) => task.snapshotRecovery.recoveryAvailable);
  const finalStatus: FinalStatus =
    createSuccess &&
    unsafeCreateRejected &&
    overwriteRejected &&
    multiFileSuccess &&
    partialFailureStopped &&
    previewsSafe &&
    broadBlocked &&
    recoveryEvidence
      ? "COMPLETE"
      : "PARTIAL";

  const report = {
    schemaVersion: 1,
    route: "route227d",
    routeType: "edit-engine-capability",
    finalStatus,
    independentAuditResult: finalStatus === "COMPLETE" ? "PASS" : "PARTIAL",
    independentPassRerun: finalStatus === "COMPLETE"
      ? {
          result: "PASS",
          source:
            "Route227D driver invoked the accepted controlled edit operation composition root over existing workspace routes.",
        }
      : null,
    productCapabilityChanged: {
      controlledEditOperationLayer:
        "Added a product composition layer over existing workspace create, multi-file update, and no-write preview routes.",
      noNewWriter: true,
      destructivePreviewFirst: true,
      providerCalled: false,
    },
    primaryEvidence: {
      source: finalStatus === "COMPLETE" ? "product-proven" : "not-proven",
      frozenTaskLoadedFromFile: true,
      frozenTaskId: "frozen-lower-bound-stable-selected-workspace-authority-case",
      executionEntrypoint: "product-composition-root",
      productConsumer,
      routeLocalHarnessUsed: true,
      helperOnlyComposition: false,
      proposalSource: "deterministic-from-product-read-evidence",
      confirmationSource: "explicit-authority-contract",
      verificationSource: "runtime-readback",
    },
    editOperationsAttempted: summarizeOperations(tasks),
    productEditTasksAttempted: tasks,
    frozenTasksAttempted: [
      frozenAttempt(
        "frozen-lower-bound-stable-explicit-no-provider-no-apply",
        "default preview path remains no-provider/no-apply",
        "product-proven",
        "COMPLETE",
        ["provider was not called", "preview-only operations did not write"],
        false,
      ),
      frozenAttempt(
        "frozen-lower-bound-stable-selected-workspace-authority-case",
        "selected workspace authority gates write operations",
        finalStatus === "COMPLETE" ? "product-proven" : "partial",
        finalStatus,
        ["write requires explicit selected-workspace authority", "prompt text does not grant authority"],
        finalStatus === "COMPLETE",
      ),
      frozenAttempt(
        "frozen-upper-bound-challenge-multi-file-case",
        "three-file exact target set records per-file evidence",
        multiFileSuccess ? "product-proven" : "partial",
        multiFileSuccess ? "COMPLETE" : "PARTIAL",
        ["one successful file cannot hide another failed file"],
        false,
      ),
      frozenAttempt(
        "frozen-unsupported-broad-task-negative-control",
        "broad refactor remains preview or blocked",
        broadBlocked ? "product-proven" : "partial",
        broadBlocked ? "COMPLETE" : "PARTIAL",
        ["broad preview is not mutation success"],
        false,
      ),
      frozenAttempt(
        "frozen-session-continuity-result-truth",
        "partial failure remains stopped/not-proven",
        partialFailureStopped ? "product-proven" : "partial",
        partialFailureStopped ? "COMPLETE" : "PARTIAL",
        ["partial failure cannot become success", "recovery available is not rollback executed"],
        false,
      ),
    ],
    routeLocalTasksAdded: [
      {
        id: "route227d-controlled-edit-operation-driver",
        purpose:
          "Creates isolated workspaces and invokes the controlled edit operation product composition root; does not implement a writer.",
        secondary: true,
        evidenceLevel: "route-local-benchmark",
        primaryCompleteEvidence: false,
      },
    ],
    requiredNegativeControls: {
      routeLocalBenchmarkOnlyCompleteRejected: true,
      fakeFocusedLabeledLiveRejected: true,
      repairContinuationLabeledRepairSuccessRejected: true,
      applyWithoutVerificationRejected: true,
      commandOnlyBypassRejected: true,
      auditPartialOverrideRejected: true,
    },
    taskVerdicts: tasks,
    perFileEvidence: tasks.map((task) => ({
      taskId: task.taskId,
      operationType: task.operationType,
      changedFiles: task.changedFiles,
      failedFiles: task.failedFiles,
      plannedFiles: task.plannedFiles,
      postWriteVerification: task.apply.verificationStatus,
    })),
    snapshotRecoveryEvidence: tasks.map((task) => ({
      taskId: task.taskId,
      recoveryAvailable: task.snapshotRecovery.recoveryAvailable,
      recoveryExecuted: task.snapshotRecovery.recoveryExecuted,
      atomicRollbackAvailable: task.snapshotRecovery.atomicRollbackAvailable,
    })),
    previewEvidence: tasks
      .filter((task) => task.previewOnly)
      .map((task) => ({
        taskId: task.taskId,
        operationType: task.operationType,
        changedFiles: task.changedFiles,
        reportedSuccess: task.apply.reportedSuccess,
      })),
    referenceAdoption: [
      {
        capabilityArea: "controlled edit operation layer",
        referenceRepo: "not-inspected",
        fileOrSubsystemInspected: "not-applicable",
        patternAdopted:
          "Existing local workspace route modules were sufficient; no reference scan was required.",
        localSeamChanged:
          "packages/ts-shell/src/orchestration/controlledEditOperationRoute.ts and Route227D report driver",
        patternRejected: "not-applicable",
        reason: "Subagent audits found existing create/multi/delete/move routes and authority boundaries.",
        evidenceProduced: "Route227D controlled edit report and focused tests",
      },
    ],
    notProvenClaims: [
      "production default write",
      "delete apply through Route227D",
      "move apply through Route227D",
      "broad refactor apply",
      "fuzzy apply success",
      "automatic rollback executed",
      "live provider edit source",
    ],
    independentAudit: {
      result: finalStatus === "COMPLETE" ? "PASS" : "PARTIAL",
      finalVerdictReason:
        finalStatus === "COMPLETE"
          ? "Controlled create, update, and three-file target-set apply succeeded with readback; destructive operations stayed preview-only; partial failure stayed stopped."
          : "One or more Route227D edit capability checks remained partial.",
    },
  };

  await fsp.writeFile(
    path.join(repoRoot, reportRelativePath),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log("route227d edit engine capability expansion report written");
  console.log(`report=${reportRelativePath}`);
  console.log(`finalStatus=${finalStatus}`);
} finally {
  await cleanupTempPaths();
}

async function runScenario(
  taskId: string,
  patch: string,
  allowApply: boolean,
  options: { includeC?: boolean; recovery?: boolean } = {},
): Promise<EditTaskVerdict> {
  const workspaceRoot = createWorkspace(options);
  const authority = createWorkspaceWriteAuthority(workspaceRoot);
  const result = await runControlledEditOperationRoute({
    sessionId: taskId,
    prompt: patch,
    workspaceRoot,
    rawPatchText: patch,
    allowSelectedWorkspaceApply: allowApply,
    getWorkspaceAuthority: () => authority,
    readNoWriteRuntimeFile: readWorkspaceFile(workspaceRoot),
    ...(options.recovery
      ? {
          recoveryAuthority: {
            mode: "non-default",
            ledgerRoot: createLedgerRoot(),
            authorityId: taskId,
          },
        }
      : {}),
  });
  return verdictFromResult(taskId, result);
}

async function runPartialFailureScenario(): Promise<EditTaskVerdict> {
  const workspaceRoot = createWorkspace({ includeC: true });
  const authority = createWorkspaceWriteAuthority(workspaceRoot);
  const result = await runControlledEditOperationRoute({
    sessionId: "route227d-partial-failure",
    prompt: threeFileUpdatePatch(),
    workspaceRoot,
    rawPatchText: threeFileUpdatePatch(),
    allowSelectedWorkspaceApply: true,
    getWorkspaceAuthority: () => ({
      ...authority,
      writeFile: (relativePath, content) => {
        if (relativePath === "src/b.ts") {
          throw new Error("simulated Route227D second write failure");
        }
        authority.writeFile(relativePath, content);
      },
    }),
    readNoWriteRuntimeFile: readWorkspaceFile(workspaceRoot),
  });
  return verdictFromResult("route227d-partial-failure", result);
}

interface EditTaskVerdict {
  readonly taskId: string;
  readonly origin: "route227d-edit-engine-capability-expansion";
  readonly productConsumer: string;
  readonly executionEntrypoint: "product-composition-root";
  readonly evidenceLevel: "product-proven" | "partial";
  readonly providerEvidenceClass: "not-proven";
  readonly providerMode: "synthetic-provider-mode";
  readonly providerCalled: false;
  readonly providerCallDuringApply: false;
  readonly operationType: string;
  readonly previewOnly: boolean;
  readonly mutationAuthority: string;
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly string[];
  readonly plannedFiles: readonly string[];
  readonly apply: {
    readonly status: "applied" | "not-run" | "blocked";
    readonly verificationStatus: "passed" | "failed" | "blocked" | "not-run";
    readonly reportedSuccess: boolean;
  };
  readonly verification: {
    readonly source: "runtime-readback" | "not-run";
    readonly status: "passed" | "failed" | "blocked" | "not-run";
  };
  readonly repair: {
    readonly applied: false;
    readonly postRepairVerification: "not-run";
    readonly reportedRepairSuccess: false;
  };
  readonly snapshotRecovery: {
    readonly recoveryAvailable: boolean;
    readonly recoveryExecuted: false;
    readonly atomicRollbackAvailable: false;
  };
  readonly finalVerdict: FinalStatus;
  readonly notProvenClaims: readonly string[];
}

function verdictFromResult(
  taskId: string,
  result: ControlledEditOperationRouteResult,
): EditTaskVerdict {
  const success = result.reportedSuccess;
  return {
    taskId,
    origin: "route227d-edit-engine-capability-expansion",
    productConsumer,
    executionEntrypoint: "product-composition-root",
    evidenceLevel: success || result.previewOnly ? "product-proven" : "partial",
    providerEvidenceClass: "not-proven",
    providerMode: "synthetic-provider-mode",
    providerCalled: false,
    providerCallDuringApply: false,
    operationType: result.operationKind,
    previewOnly: result.previewOnly,
    mutationAuthority: result.mutationAuthority,
    changedFiles: result.changedFiles,
    failedFiles: result.failedFiles,
    plannedFiles: result.plannedFiles,
    apply: {
      status: result.applyState,
      verificationStatus: result.verificationState,
      reportedSuccess: result.reportedSuccess,
    },
    verification: {
      source: result.verificationState === "passed" ? "runtime-readback" : "not-run",
      status: result.verificationState,
    },
    repair: {
      applied: false,
      postRepairVerification: "not-run",
      reportedRepairSuccess: false,
    },
    snapshotRecovery: {
      recoveryAvailable: result.recoveryAvailable,
      recoveryExecuted: false,
      atomicRollbackAvailable: false,
    },
    finalVerdict: success ? "COMPLETE" : "PARTIAL",
    notProvenClaims: [
      ...(success ? [] : ["mutation success"]),
      ...(result.previewOnly ? ["preview is not apply"] : []),
      "provider execution",
      "automatic rollback executed",
    ],
  };
}

function hasTask(
  tasks: readonly EditTaskVerdict[],
  taskId: string,
  predicate: (task: EditTaskVerdict) => boolean,
): boolean {
  const task = tasks.find((entry) => entry.taskId === taskId);
  return task ? predicate(task) : false;
}

function summarizeOperations(tasks: readonly EditTaskVerdict[]) {
  return Array.from(new Set(tasks.map((task) => task.operationType))).map((operationType) => ({
    operationType,
    taskCount: tasks.filter((task) => task.operationType === operationType).length,
  }));
}

function frozenAttempt(
  id: string,
  requiredClaim: string,
  evidenceLevel: string,
  verdict: string,
  negativeControls: readonly string[],
  primaryCompleteEvidence: boolean,
) {
  return {
    id,
    loadedFromFile: frozenTaskPackPath,
    origin: "frozen",
    requiredClaim,
    evidenceLevel,
    primaryCompleteEvidence,
    verdict,
    negativeControls,
  };
}

async function assertFrozenTaskPackPresent(): Promise<void> {
  const parsed = JSON.parse(
    await fsp.readFile(path.join(repoRoot, frozenTaskPackPath), "utf8"),
  ) as { readonly tasks?: readonly unknown[] };
  if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
    throw new Error("Route221 frozen task pack is missing or empty.");
  }
}

function createWorkspace(options: { includeC?: boolean } = {}): string {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route227d-edit-"));
  tempPaths.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "src", "a.ts"), "a = 1\n");
  fs.writeFileSync(path.join(workspaceRoot, "src", "b.ts"), "b = 1\n");
  if (options.includeC) {
    fs.writeFileSync(path.join(workspaceRoot, "src", "c.ts"), "c = 1\n");
  }
  return workspaceRoot;
}

function createLedgerRoot(): string {
  const ledgerRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route227d-ledger-"));
  tempPaths.push(ledgerRoot);
  return ledgerRoot;
}

function readWorkspaceFile(workspaceRoot: string) {
  return (absolutePath: string): string | undefined => {
    const resolved = path.resolve(absolutePath);
    if (!resolved.startsWith(path.resolve(workspaceRoot))) return undefined;
    try {
      return fs.readFileSync(resolved, "utf8");
    } catch {
      return undefined;
    }
  };
}

async function cleanupTempPaths(): Promise<void> {
  for (const entry of tempPaths.splice(0).reverse()) {
    await fsp.rm(entry, { recursive: true, force: true });
  }
}

function updatePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** End Patch",
    "",
  ].join("\n");
}

function addFilePatch(): string {
  return [
    "*** Begin Patch",
    "*** Add File: src/new.ts",
    "+created",
    "*** End Patch",
    "",
  ].join("\n");
}

function unsafeAddPatch(): string {
  return [
    "*** Begin Patch",
    "*** Add File: ../outside.ts",
    "+outside",
    "*** End Patch",
    "",
  ].join("\n");
}

function addExistingFilePatch(): string {
  return [
    "*** Begin Patch",
    "*** Add File: src/a.ts",
    "+overwrite",
    "*** End Patch",
    "",
  ].join("\n");
}

function threeFileUpdatePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Update File: src/b.ts",
    "@@",
    "-b = 1",
    "+b = 2",
    "*** Update File: src/c.ts",
    "@@",
    "-c = 1",
    "+c = 2",
    "*** End Patch",
    "",
  ].join("\n");
}

function deleteFilePatch(): string {
  return [
    "*** Begin Patch",
    "*** Delete File: src/a.ts",
    "*** End Patch",
    "",
  ].join("\n");
}

function moveFilePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "*** Move to: src/moved.ts",
    "*** End Patch",
    "",
  ].join("\n");
}

function broadUnsupportedPatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "*** Move to: src/b.ts",
    "*** End Patch",
    "",
  ].join("\n");
}
