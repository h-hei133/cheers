#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildPlanningMutationHandoffProjection } from "../packages/ts-shell/src/orchestration/planningMutationHandoffProjection.js";
import type { ProviderEditRawProposal } from "../packages/ts-shell/src/orchestration/providerEditProposal.js";
import { preparePlanningRuntimeProductProposal } from "../packages/ts-shell/src/orchestration/planningRuntimeProductProposal.js";
import { runMvpIntegratedFlow } from "../packages/ts-shell/src/orchestration/runMvpIntegratedFlow.js";
import { runPlanningRuntime } from "../packages/ts-shell/src/orchestration/planningRuntime.js";

type ProductResult = Awaited<ReturnType<typeof runMvpIntegratedFlow>>;

const TARGET_RANKING_OLD_TEXT =
  "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';";
const RESULT_SURFACE_OLD_TEXT = "export const resultSurfaceLabel = 'result';";

interface TaskPackEntry {
  readonly id: string;
  readonly capability: string;
  readonly targetFiles: readonly string[];
  readonly moduleArea: string;
  readonly expectedVerification: string;
  readonly liveProvider: boolean;
  readonly notToyReason: string;
  readonly risk: string;
  readonly fallbackClassification: string;
}

interface ProductReport {
  readonly id: string;
  readonly productPath: boolean;
  readonly providerCalled: boolean;
  readonly applyState: string;
  readonly readback: string;
  readonly command: string;
  readonly commandDispatch: string;
  readonly repair: string;
  readonly changedFiles: readonly string[];
}

const originalDaemonEnabled = process.env.DAEMON_ENABLED;
const originalAuditLogPath = process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH;
process.env.DAEMON_ENABLED = "0";

const testRoot = process.env.PRIVATE_AGENTS_TEST_ROOT?.trim() ||
  path.join(os.tmpdir(), "private-agents-test", "route218-real-authorized-coding-benchmark");
await fs.mkdir(testRoot, { recursive: true });
const auditRoot = await fs.mkdtemp(path.join(testRoot, "route218-audit-"));
process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH = path.join(
  auditRoot,
  ".sisyphus",
  "audit",
  "permissions.jsonl",
);

const taskPack: readonly TaskPackEntry[] = [
  {
    id: "cross-module-planning-single-file",
    capability: "cross-module single-file",
    targetFiles: ["src/planning/targetRanking.ts"],
    moduleArea: "planning/orchestration",
    expectedVerification: "readback plus focused command when authorized",
    liveProvider: true,
    notToyReason: "planner fallback behavior affects target selection output",
    risk: "single-file exact anchor may be missing or ambiguous",
    fallbackClassification: "PROVIDER-OUTPUT-INSUFFICIENT or REVIEW-ONLY",
  },
  {
    id: "cross-module-result-single-file",
    capability: "cross-module single-file",
    targetFiles: ["src/result/resultSurface.ts"],
    moduleArea: "result/session surface",
    expectedVerification: "readback of result surface label",
    liveProvider: true,
    notToyReason: "result surface wording changes user-visible classification",
    risk: "provider may propose prose-only review",
    fallbackClassification: "REVIEW-ONLY",
  },
  {
    id: "cross-module-script-single-file",
    capability: "cross-module single-file",
    targetFiles: ["scripts/route218Verifier.ts"],
    moduleArea: "script/verifier",
    expectedVerification: "focused verifier command",
    liveProvider: true,
    notToyReason: "script/verifier case exercises non-src target selection",
    risk: "provider may lack exact script anchor",
    fallbackClassification: "PROVIDER-OUTPUT-INSUFFICIENT",
  },
  {
    id: "small-multi-file-target-set",
    capability: "small multi-file exact proposal",
    targetFiles: ["src/planning/targetRanking.ts", "src/result/resultSurface.ts"],
    moduleArea: "planning plus result surface",
    expectedVerification: "per-file readback evidence",
    liveProvider: true,
    notToyReason: "two modules must be proposed independently without hiding partial failure",
    risk: "one file can anchor while another fails",
    fallbackClassification: "truthful per-file REVIEW-ONLY or blocked evidence",
  },
  {
    id: "selected-workspace-authorized-apply",
    capability: "selected workspace authorized apply",
    targetFiles: ["src/planning/targetRanking.ts"],
    moduleArea: "workspace authority",
    expectedVerification: "selected workspace readback",
    liveProvider: false,
    notToyReason: "exercises production-shaped selected workspace authority instead of temp-only proof",
    risk: "authority must be explicit and bounded",
    fallbackClassification: "blocked authority reason",
  },
  {
    id: "verification-failure-repair-continuation",
    capability: "repair continuation",
    targetFiles: ["src/planning/targetRanking.ts"],
    moduleArea: "verification/repair/result session",
    expectedVerification: "failed readback preserved then repair continuation created",
    liveProvider: false,
    notToyReason: "failure must not become success and original failure must remain visible",
    risk: "repair-ready state can be mistaken for repaired",
    fallbackClassification: "blocked repair or repair-continuation-created",
  },
];

try {
  const reports: ProductReport[] = [];
  reports.push(await runDefaultSafetyCase());
  reports.push(await runSelectedWorkspaceCase());
  reports.push(await runVerificationCommandCase());
  reports.push(await runRepairContinuationCase());
  const targetSet = await runTargetSetProposalCase();

  const failures = [
    ...validateTaskPack(taskPack),
    ...validateProductReports(reports),
    ...validateTargetSet(targetSet),
  ];

  console.log(JSON.stringify({
    route: "218",
    gate: "route218-real-authorized-coding-benchmark",
    status: failures.length === 0 ? "PHASE0_PHASE2_BASELINE" : "FAILED",
    providerStatus: "fake-provider-only",
    liveProviderTouched: false,
    rawProviderOutput: "excluded",
    oldTextPrinted: false,
    newTextPrinted: false,
    defaultSafety: reports[0],
    taskPack: taskPack.map((entry) => ({
      id: entry.id,
      capability: entry.capability,
      targetFiles: entry.targetFiles,
      moduleArea: entry.moduleArea,
      expectedVerification: entry.expectedVerification,
      liveProvider: entry.liveProvider,
      notToyReason: entry.notToyReason,
      risk: entry.risk,
      fallbackClassification: entry.fallbackClassification,
    })),
    targetSet,
    reports,
  }, null, 2));

  if (failures.length > 0) {
    for (const failure of failures) console.log(`[fail] ${failure}`);
    process.exit(1);
  }
  console.log("[pass] route218-real-authorized-coding-benchmark");
} finally {
  await fs.rm(auditRoot, { recursive: true, force: true });
  restoreEnv("DAEMON_ENABLED", originalDaemonEnabled);
  restoreEnv("PRIVATE_AGENTS_AUDIT_LOG_PATH", originalAuditLogPath);
}

async function runDefaultSafetyCase(): Promise<ProductReport> {
  return runProductCase({
    id: "default-no-provider-no-apply-no-command",
    execution: undefined,
    escalationDecision: "deny",
  });
}

async function runSelectedWorkspaceCase(): Promise<ProductReport> {
  const workspaceRoot = await seedWorkspace("selected-workspace-authorized-apply");
  try {
    const result = await runMvpIntegratedFlow({
      sessionId: "sess_route218_selected_workspace",
      prompt: "Fix the planner target ranking bug and cover the adjacent test",
      workspaceRoot,
      maxTurns: 4,
      planningMutationExecution: {
        confirmation: { state: "trusted-confirmed" },
        selectedWorkspace: {
          scope: "selected-workspace",
          source: "benchmark",
          explicitWorkspaceAuthority: true,
          allowedRoot: workspaceRoot,
        },
      },
    });
    return projectProductReport("selected-workspace-authorized-apply", result);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function runVerificationCommandCase(): Promise<ProductReport> {
  return runProductCase({
    id: "authorized-verification-command",
    escalationDecision: "allow-once",
    execution: {
      confirmation: { state: "trusted-confirmed" },
      controlledWorkspace: { scope: "controlled-temp-workspace", source: "benchmark" },
      verificationCommand: {
        command: "node --version",
        approval: "explicit",
        source: "benchmark",
      },
    },
  });
}

async function runRepairContinuationCase(): Promise<ProductReport> {
  return runProductCase({
    id: "verification-failure-repair-continuation",
    escalationDecision: "deny",
    execution: {
      confirmation: { state: "trusted-confirmed" },
      controlledWorkspace: { scope: "controlled-temp-workspace", source: "benchmark" },
      expectedContentByTargetPath: new Map([
        ["src/planning/targetRanking.ts", "wrong expected content\n"],
      ]),
    },
  });
}

async function runProductCase(input: {
  readonly id: string;
  readonly escalationDecision: "allow-once" | "deny";
  readonly execution?: Parameters<typeof runMvpIntegratedFlow>[0]["planningMutationExecution"];
}): Promise<ProductReport> {
  const workspaceRoot = await seedWorkspace(input.id);
  try {
    const result = await runMvpIntegratedFlow({
      sessionId: `sess_route218_${input.id}`.replace(/[^a-z0-9_]/gi, "_"),
      prompt: "Fix the planner target ranking bug and cover the adjacent test",
      workspaceRoot,
      maxTurns: 4,
      escalationDecision: input.escalationDecision,
      ...(input.execution ? { planningMutationExecution: input.execution } : {}),
    });
    return projectProductReport(input.id, result);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function runTargetSetProposalCase() {
  const workspaceRoot = await seedWorkspace("small-multi-file-target-set");
  try {
    const planningResult = await runPlanningRuntime({
      workspaceRoot,
      userTask: "Fix the planner target ranking bug and cover the adjacent test",
      maxRepoFiles: 8,
      maxCandidates: 4,
      taskKindHint: "edit-file",
    });
    const preparation = await preparePlanningRuntimeProductProposal({
      workspaceRoot,
      handoff: targetSetHandoff(),
      planningResult,
      liveProvider: {
        optIn: true,
        source: "benchmark",
        taskEvidence: {
          mode: "small-target-set-exact-patch",
          taskIntentSummary:
            "Update the planner fallback label and the result surface label together.",
        },
        attempts: [
          {
            role: "primary",
            providerSafeLabel: "focused-fake-primary",
            providerConfigSource: "benchmark-fixture",
            providerAvailability: {
              kind: "available",
              providerKindLabel: "focused-fake-primary",
            },
            readinessStatus: "ready",
            evidenceSource: "fake-provider",
            provider: {
              proposeEdit: () => targetSetProposal(),
            },
          },
        ],
      },
    });
    const evidence = preparation.evidence;
    return {
      id: "small-multi-file-target-set",
      status: preparation.status,
      providerCalled: preparation.providerCalled,
      liveEvidenceSource: preparation.liveEvidenceSource,
      targetFiles: preparation.rawProposal?.targets?.map((target) => target.path) ?? [],
      outputValidation: markerValue(evidence, "provider-output-validation:status:") ?? "not-run",
      anchor: markerValue(evidence, "provider-anchored-proposal:handoff:") ?? "not-run",
      exactClassification:
        markerValue(evidence, "planning-runtime-product-proposal:live-provider-exact-classification:") ?? "not-run",
      apply: "not-run",
      perFileEvidence: preparation.rawProposal?.targets?.map((target) => ({
        target: target.path,
        exactProposal: Boolean(target.oldText && target.newText) ? "ready" : "missing",
        apply: "not-run",
        verify: "not-run",
      })) ?? [],
      rawProviderOutputExcluded: evidence.includes("planning-runtime-product-proposal:raw-provider-output-excluded"),
    };
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

function projectProductReport(id: string, result: ProductResult): ProductReport {
  const evidence = result.codingResult?.evidence ?? [];
  const output = result.finalOutput ?? "";
  return {
    id,
    productPath: evidence.includes("planning-runtime-product:path:runMvpIntegratedFlow"),
    providerCalled: evidence.includes("provider-called=true"),
    applyState: extractLineValue(output, "Apply state:") ?? "not-run",
    readback:
      markerValue(evidence, "planning-runtime-product:proof-verification:") ??
      extractLineValue(output, "Readback verification:") ??
      "not-run",
    command: extractLineValue(output, "Verification command:") ?? "not-requested",
    commandDispatch: extractLineValue(output, "Verification command dispatch:") ?? "not-run",
    repair: markerValue(evidence, "planning-runtime-product-repair:state:") ?? "not-proven",
    changedFiles: result.codingResult?.changedFiles ?? [],
  };
}

function validateTaskPack(entries: readonly TaskPackEntry[]): string[] {
  const failures: string[] = [];
  if (entries.length < 6) failures.push(`task-pack-count=${entries.length}`);
  const singleFileModules = new Set(
    entries
      .filter((entry) => entry.capability === "cross-module single-file")
      .map((entry) => entry.moduleArea),
  );
  if (singleFileModules.size < 3) failures.push(`cross-module-single-file-modules=${singleFileModules.size}`);
  if (!entries.some((entry) => entry.targetFiles.length > 1)) failures.push("missing-multi-file-task");
  if (!entries.some((entry) => entry.capability.includes("selected workspace"))) failures.push("missing-selected-workspace-task");
  if (!entries.some((entry) => entry.capability.includes("repair"))) failures.push("missing-repair-task");
  return failures;
}

function validateProductReports(reports: readonly ProductReport[]): string[] {
  const failures: string[] = [];
  const defaultReport = reports.find((report) => report.id === "default-no-provider-no-apply-no-command");
  if (!defaultReport) failures.push("missing-default-report");
  if (defaultReport?.providerCalled) failures.push("default-provider-called");
  if (defaultReport?.applyState !== "not-run") failures.push(`default-apply=${defaultReport?.applyState}`);
  if (defaultReport?.commandDispatch !== "not-run") failures.push(`default-command=${defaultReport?.commandDispatch}`);
  const selected = reports.find((report) => report.id === "selected-workspace-authorized-apply");
  if (selected?.applyState !== "single-target-applied") failures.push(`selected-apply=${selected?.applyState}`);
  if (selected?.readback !== "succeeded") failures.push(`selected-readback=${selected?.readback}`);
  const command = reports.find((report) => report.id === "authorized-verification-command");
  if (command?.command !== "passed") failures.push(`verification-command=${command?.command}`);
  if (command?.commandDispatch !== "existing-tool-runtime") failures.push(`verification-dispatch=${command?.commandDispatch}`);
  const repair = reports.find((report) => report.id === "verification-failure-repair-continuation");
  if (repair?.repair !== "repair-continuation-created") failures.push(`repair=${repair?.repair}`);
  if (repair?.readback !== "failed") failures.push(`repair-readback=${repair?.readback}`);
  return failures;
}

function validateTargetSet(targetSet: Awaited<ReturnType<typeof runTargetSetProposalCase>>): string[] {
  const failures: string[] = [];
  if (targetSet.status !== "prepared-exact") failures.push(`target-set-status=${targetSet.status}`);
  if (targetSet.liveEvidenceSource !== "fake-provider") failures.push(`target-set-source=${targetSet.liveEvidenceSource}`);
  if (targetSet.outputValidation !== "valid-exact-hunk-set") failures.push(`target-set-output=${targetSet.outputValidation}`);
  if (targetSet.anchor !== "exact-hunk-set") failures.push(`target-set-anchor=${targetSet.anchor}`);
  if (targetSet.targetFiles.length !== 2) failures.push(`target-set-file-count=${targetSet.targetFiles.length}`);
  if (!targetSet.rawProviderOutputExcluded) failures.push("target-set-raw-provider-output-not-excluded");
  if (targetSet.apply !== "not-run") failures.push(`target-set-apply=${targetSet.apply}`);
  return failures;
}

async function seedWorkspace(id: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(testRoot, `${id}-`));
  await fs.mkdir(path.join(root, "src", "planning"), { recursive: true });
  await fs.mkdir(path.join(root, "src", "result"), { recursive: true });
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: id }, null, 2));
  await fs.writeFile(path.join(root, "src", "planning", "targetRanking.ts"), [
    "export function rankPlannerTargets(task: string) {",
    TARGET_RANKING_OLD_TEXT,
    "}",
    "",
  ].join("\n"));
  await fs.writeFile(
    path.join(root, "src", "planning", "targetRanking.test.ts"),
    "expect(rankPlannerTargets('planner target ranking')).toBe('targetRanking.ts');\n",
  );
  await fs.writeFile(
    path.join(root, "src", "result", "resultSurface.ts"),
    `${RESULT_SURFACE_OLD_TEXT}\n`,
  );
  return root;
}

function targetSetHandoff() {
  return buildPlanningMutationHandoffProjection({
    editTargets: [
      {
        path: "src/planning/targetRanking.ts",
        rationale: "repo score 99; explicit planner target",
        handoffRoute: "existing-proof-carrying-mutation-runtime",
        readiness: "ready-for-review",
      },
      {
        path: "src/result/resultSurface.ts",
        rationale: "repo score 92; explicit result surface target",
        handoffRoute: "existing-proof-carrying-mutation-runtime",
        readiness: "ready-for-review",
      },
    ],
    missingFacts: [],
    taskKind: "edit-file",
    verificationIntentAvailable: true,
    readEvidence: [
      {
        id: "read-evidence:route218:1",
        path: "src/planning/targetRanking.ts",
        reason: "target file",
        source: "repo-intelligence",
      },
      {
        id: "read-evidence:route218:2",
        path: "src/result/resultSurface.ts",
        reason: "target file",
        source: "repo-intelligence",
      },
    ],
    expectedChangeSummary:
      "Update the planner fallback label and result surface label together.",
    verificationIntentSummary:
      "verificationPlan=readback target set; state=ready; command-dispatch=not-run",
    verificationEvidenceIds: ["verification_plan_route218_target_set"],
  });
}

function targetSetProposal(): ProviderEditRawProposal {
  return {
    operationKind: "exact-fenced-replacement",
    targets: [
      {
        path: "src/planning/targetRanking.ts",
        oldText: TARGET_RANKING_OLD_TEXT,
        newText: "  return task.includes('planner') ? 'targetRanking.ts' : 'unmatched-target';",
        summary: "improve planner fallback label",
      },
      {
        path: "src/result/resultSurface.ts",
        oldText: RESULT_SURFACE_OLD_TEXT,
        newText: "export const resultSurfaceLabel = 'verified-result';",
        summary: "improve result surface label",
      },
    ],
    verificationPlan: ["readback verifies both target files"],
  };
}

function markerValue(evidence: readonly string[], prefix: string): string | undefined {
  const marker = evidence.find((entry) => entry.startsWith(prefix));
  return marker?.slice(prefix.length);
}

function extractLineValue(output: string, prefix: string): string | undefined {
  const line = output.split(/\r?\n/).find((entry) => entry.trim().startsWith(prefix));
  return line?.slice(line.indexOf(prefix) + prefix.length).trim();
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
