#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

import { buildVerificationCommandPlan } from "../packages/ts-shell/src/orchestration/verificationCommandPlan.js";

type TaskCategory =
  | "bugfix-behavior"
  | "feature-output"
  | "test-related"
  | "multi-file-coordinated"
  | "verification-failure-repair";

type TaskVerdict =
  | "verified-success"
  | "verified-success-with-repair"
  | "review-only"
  | "confirmation-required"
  | "verification-failed"
  | "repair-required"
  | "blocked"
  | "unsupported";

interface Route219Task {
  readonly id: string;
  readonly category: TaskCategory;
  readonly moduleArea: string;
  readonly description: string;
  readonly whyItMatters: string;
  readonly selectedFiles: readonly string[];
  readonly expectedVerificationCommand: string;
  readonly repairTrigger: string;
  readonly needsLiveProviderPatch: boolean;
  readonly needsSelectedWorkspaceApply: boolean;
}

interface Route219TaskVerdictRow {
  readonly taskId: string;
  readonly category: TaskCategory;
  readonly context: "found" | "missing";
  readonly provider: "not-run-default-safe" | "required-later";
  readonly proposal: "not-run" | "required-later";
  readonly anchor: "not-run" | "required-later";
  readonly apply: "not-run";
  readonly verificationCommand: string;
  readonly verification: "task-relevant-not-allowlisted" | "not-run" | "blocked";
  readonly repair: "not-run" | "repair-trigger-planned";
  readonly finalVerdict: TaskVerdict;
  readonly notProvenClaims: readonly string[];
}

interface DefaultSafetyReport {
  readonly providerCalled: false;
  readonly apply: "not-run";
  readonly commandDispatch: "not-run";
}

const repoRoot = process.cwd();

const taskPack: readonly Route219Task[] = [
  {
    id: "verification-selector-targeted-test-allowlist",
    category: "bugfix-behavior",
    moduleArea: "verification selection",
    description:
      "Allow task-relevant focused verification selection without dispatching unsupported shell commands.",
    whyItMatters:
      "Route219 success cannot rely on node --version or generic help output for source edits.",
    selectedFiles: [
      "packages/ts-shell/src/orchestration/verificationCommandPlan.ts",
      "packages/ts-shell/src/orchestration/verificationCommandPlan.test.ts",
    ],
    expectedVerificationCommand:
      "npm test -w packages/ts-shell -- src/orchestration/verificationCommandPlan.test.ts",
    repairTrigger: "focused test command is rejected before runtime by the current allowlist",
    needsLiveProviderPatch: true,
    needsSelectedWorkspaceApply: true,
  },
  {
    id: "product-task-verdict-scorecard",
    category: "feature-output",
    moduleArea: "product verdict projection",
    description:
      "Add a compact task-level verdict surface that joins context, proposal, apply, verification, repair, and not-proven claims.",
    whyItMatters:
      "Route219 needs a practical result judge so repair-ready and review-only states cannot look like task success.",
    selectedFiles: [
      "packages/ts-shell/src/orchestration/planningRuntimeProductProjection.ts",
      "packages/ts-shell/src/orchestration/planningRuntimeProductExecution.test.ts",
    ],
    expectedVerificationCommand:
      "npm test -w packages/ts-shell -- src/orchestration/planningRuntimeProductExecution.test.ts",
    repairTrigger: "missing verdict row keeps task success unproven",
    needsLiveProviderPatch: true,
    needsSelectedWorkspaceApply: true,
  },
  {
    id: "repair-loop-original-failure-preserved",
    category: "verification-failure-repair",
    moduleArea: "verification repair loop",
    description:
      "Drive a failed verification into the repair flow while preserving the original failure in the final task verdict.",
    whyItMatters:
      "Route218 only proved repair continuation creation; Route219 must prove repair execution or honest repair-required stop.",
    selectedFiles: [
      "packages/ts-shell/src/orchestration/planningRuntimeProductRepair.ts",
      "packages/ts-shell/src/orchestration/verificationRepairLoop.ts",
      "packages/ts-shell/src/orchestration/verificationRepairResult.ts",
    ],
    expectedVerificationCommand:
      "npm test -w packages/ts-shell -- src/orchestration/verificationRepairBridge.test.ts src/orchestration/verificationRepairContext.test.ts",
    repairTrigger: "verification command failure or failed readback enters repair flow",
    needsLiveProviderPatch: false,
    needsSelectedWorkspaceApply: true,
  },
  {
    id: "target-set-per-file-evidence",
    category: "multi-file-coordinated",
    moduleArea: "target-set edit route",
    description:
      "Keep target-set task results per-file so one successful file cannot hide another target failure.",
    whyItMatters:
      "Route219 requires multi-file task evidence, not a flattened hunk-set success marker.",
    selectedFiles: [
      "packages/ts-shell/src/orchestration/targetSetEditRoute.ts",
      "packages/ts-shell/src/orchestration/targetSetEditResult.ts",
      "packages/ts-shell/src/orchestration/targetSetEditRoute.test.ts",
    ],
    expectedVerificationCommand:
      "npm test -w packages/ts-shell -- src/orchestration/targetSetEditRoute.test.ts src/orchestration/targetSetEditResult.test.ts",
    repairTrigger: "partial target-set failure should stop with per-file failed and unattempted evidence",
    needsLiveProviderPatch: true,
    needsSelectedWorkspaceApply: true,
  },
  {
    id: "route219-task-pack-regression",
    category: "test-related",
    moduleArea: "route benchmark",
    description:
      "Add a route benchmark that rejects toy tasks, shallow verification, fake live success, and missing verdict rows.",
    whyItMatters:
      "The route needs a repeatable gate that distinguishes COMPLETE, PARTIAL, and BLOCKED from local fixture success.",
    selectedFiles: [
      "scripts/route219-real-task-quality-benchmark.ts",
      "package.json",
    ],
    expectedVerificationCommand: "npm run verify:route219-real-task-quality-benchmark",
    repairTrigger: "benchmark detects missing task-level evidence or overclaimed live/apply success",
    needsLiveProviderPatch: false,
    needsSelectedWorkspaceApply: false,
  },
];

const defaultSafety: DefaultSafetyReport = {
  providerCalled: false,
  apply: "not-run",
  commandDispatch: "not-run",
};

const rows = await Promise.all(taskPack.map(buildBaselineVerdictRow));
const failures = validateBaseline({ taskPack, rows, defaultSafety });
const status = failures.length === 0 ? "PARTIAL" : "FAILED";

console.log(JSON.stringify({
  route: "219",
  gate: "route219-real-task-quality-benchmark",
  phase: "phase0-task-pack-and-baseline",
  status,
  statusReason: status === "PARTIAL"
    ? "Task pack and default-safe baseline are established; live patch, apply, task verification, and repair execution are intentionally not yet proven."
    : "Phase0 baseline invariants failed.",
  defaultSafety,
  counts: {
    taskCount: taskPack.length,
    liveProviderPatchEvidence: 0,
    verifiedSuccess: 0,
    appliedAndVerified: 0,
    multiFileTasks: taskPack.filter((task) => task.selectedFiles.length > 1).length,
    repairFlowReached: 0,
  },
  taskPack: taskPack.map((task) => ({
    id: task.id,
    category: task.category,
    moduleArea: task.moduleArea,
    selectedFiles: task.selectedFiles,
    expectedVerificationCommand: task.expectedVerificationCommand,
    needsLiveProviderPatch: task.needsLiveProviderPatch,
    needsSelectedWorkspaceApply: task.needsSelectedWorkspaceApply,
    whyItMatters: task.whyItMatters,
    likelyRepairTrigger: task.repairTrigger,
  })),
  verdictTable: rows,
  topBlockers: [
    "focused task-relevant npm test commands are not yet allowlisted for product verification dispatch",
    "repair continuation exists, but repair apply and re-verification are not yet proven in the product path",
    "live provider patch evidence must be collected with explicit Route219 opt-in before COMPLETE",
    "multi-file task evidence must be preserved per file after apply/readback, not only in the task pack",
  ],
  providerSafety: {
    liveOptIn: false,
    realProviderTouched: false,
    rawProviderOutput: "excluded",
    oldTextPrinted: false,
    newTextPrinted: false,
  },
}, null, 2));

if (failures.length > 0) {
  for (const failure of failures) console.log(`[fail] ${failure}`);
  process.exit(1);
}

console.log("[pass] route219-real-task-quality-benchmark phase0-baseline");

async function buildBaselineVerdictRow(task: Route219Task): Promise<Route219TaskVerdictRow> {
  const context = await selectedFilesExist(task.selectedFiles) ? "found" : "missing";
  const plan = buildVerificationCommandPlan({
    explicitCommand: task.expectedVerificationCommand,
    sourceProposalId: `route219-${task.id}`,
  });
  const verification =
    plan.state === "not-allowlisted"
      ? "task-relevant-not-allowlisted"
      : plan.state === "ready"
        ? "not-run"
        : "blocked";
  return {
    taskId: task.id,
    category: task.category,
    context,
    provider: task.needsLiveProviderPatch ? "required-later" : "not-run-default-safe",
    proposal: task.needsLiveProviderPatch ? "required-later" : "not-run",
    anchor: task.needsLiveProviderPatch ? "required-later" : "not-run",
    apply: "not-run",
    verificationCommand: task.expectedVerificationCommand,
    verification,
    repair: task.category === "verification-failure-repair"
      ? "repair-trigger-planned"
      : "not-run",
    finalVerdict: context === "found" ? "review-only" : "blocked",
    notProvenClaims: [
      ...(task.needsLiveProviderPatch ? ["live provider patch evidence"] : []),
      ...(task.needsSelectedWorkspaceApply ? ["selected workspace apply"] : []),
      "task-relevant verification command passed",
      ...(task.category === "multi-file-coordinated" ? ["per-file apply/readback evidence"] : []),
      ...(task.category === "verification-failure-repair" ? ["repair apply and re-verification"] : []),
    ],
  };
}

async function selectedFilesExist(files: readonly string[]): Promise<boolean> {
  for (const file of files) {
    try {
      await fs.access(path.join(repoRoot, file));
    } catch {
      return false;
    }
  }
  return true;
}

function validateBaseline(input: {
  readonly taskPack: readonly Route219Task[];
  readonly rows: readonly Route219TaskVerdictRow[];
  readonly defaultSafety: DefaultSafetyReport;
}): string[] {
  const failures: string[] = [];
  if (input.taskPack.length < 5) failures.push(`task-count=${input.taskPack.length}`);
  for (const category of [
    "bugfix-behavior",
    "feature-output",
    "test-related",
    "multi-file-coordinated",
    "verification-failure-repair",
  ] as const) {
    if (!input.taskPack.some((task) => task.category === category)) {
      failures.push(`missing-category=${category}`);
    }
  }
  const moduleAreas = new Set(input.taskPack.map((task) => task.moduleArea));
  if (moduleAreas.size < 4) failures.push(`module-diversity=${moduleAreas.size}`);
  if (!input.taskPack.some((task) => task.selectedFiles.length >= 2)) {
    failures.push("missing-multi-file-task");
  }
  if (!input.taskPack.some((task) => task.needsLiveProviderPatch)) {
    failures.push("missing-live-provider-task");
  }
  if (!input.rows.every((row) => row.context === "found")) {
    failures.push("missing-selected-file-context");
  }
  if (!input.rows.every((row) => row.finalVerdict === "review-only")) {
    failures.push("baseline-verdict-must-remain-review-only");
  }
  if (!input.rows.some((row) => row.verification === "task-relevant-not-allowlisted")) {
    failures.push("missing-task-relevant-verification-blocker");
  }
  if (input.defaultSafety.providerCalled !== false) failures.push("default-provider-called");
  if (input.defaultSafety.apply !== "not-run") failures.push(`default-apply=${input.defaultSafety.apply}`);
  if (input.defaultSafety.commandDispatch !== "not-run") {
    failures.push(`default-command-dispatch=${input.defaultSafety.commandDispatch}`);
  }
  return failures;
}
