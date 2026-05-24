#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildPlanningMutationHandoffProjection } from "../packages/ts-shell/src/orchestration/planningMutationHandoffProjection.js";
import { runPlanningMutationProofRoute } from "../packages/ts-shell/src/orchestration/planningMutationProofRoute.js";
import { runMvpIntegratedFlow } from "../packages/ts-shell/src/orchestration/runMvpIntegratedFlow.js";
import { createWorkspaceWriteAuthority } from "../packages/ts-shell/src/orchestration/patchResult/workspaceAuthority.js";

type ProductResult = Awaited<ReturnType<typeof runMvpIntegratedFlow>>;

interface ProductScenario {
  readonly id: string;
  readonly prompt: string;
  readonly expectedProductPath: boolean;
  readonly expectedTaskKind?: string;
  readonly expectedHandoffState?: string;
  readonly expectedProofApply?: string;
  readonly expectedProofVerification?: string;
  readonly maxTurns?: number;
}

interface ProductReport {
  readonly id: string;
  readonly prompt: string;
  readonly status: ProductResult["status"];
  readonly terminalClassification: ProductResult["terminalClassification"];
  readonly taskKind?: string;
  readonly productPathUsed: boolean;
  readonly editTargets: readonly string[];
  readonly handoffState: string | null;
  readonly proposalState: string | null;
  readonly anchorState: string | null;
  readonly confirmationState: string | null;
  readonly proofRouteState: string | null;
  readonly proofApplyState: string | null;
  readonly proofVerificationState: string | null;
  readonly claimTerminal: string | null;
  readonly changedFiles: readonly string[];
  readonly noWriteSafety: {
    readonly workspaceUnchanged: boolean;
    readonly mutationAuthorityNotGranted: boolean;
    readonly providerNotCalled: boolean;
    readonly applyNotRun: boolean;
    readonly commandDispatchNotRun: boolean;
    readonly proofBackendNotRun: boolean;
  };
  readonly workspaceChangedFiles: readonly string[];
  readonly failures: readonly string[];
}

interface ControlledProofReport {
  readonly id: "trusted-controlled-proof";
  readonly bridgeState: string;
  readonly anchorState: string;
  readonly confirmationState: string;
  readonly backendLane: string;
  readonly applyState: string;
  readonly verificationState: string;
  readonly claimTerminal: string;
  readonly terminalResult: string;
  readonly liveSuccess: boolean;
  readonly changedFiles: readonly string[];
  readonly verifiedFiles: readonly string[];
  readonly unexpectedChangedFiles: readonly string[];
  readonly providerCallDuringApply: boolean;
  readonly workspaceChangedFiles: readonly string[];
  readonly finalContentMatched: boolean;
  readonly failures: readonly string[];
}

const originalDaemonEnabled = process.env.DAEMON_ENABLED;
const originalAuditLogPath = process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH;
process.env.DAEMON_ENABLED = "0";

const testRoot = process.env.PRIVATE_AGENTS_TEST_ROOT?.trim() ||
  path.join(os.tmpdir(), "private-agents-test");
const workspaceRoot = await fs.mkdtemp(path.join(testRoot, "route209-product-path-"));
const controlledRoot = await fs.mkdtemp(path.join(testRoot, "route209-controlled-proof-"));
process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH = path.join(
  workspaceRoot,
  ".sisyphus",
  "audit",
  "permissions.jsonl",
);

try {
  await seedWorkspace(workspaceRoot);
  await seedControlledWorkspace(controlledRoot);
  const productScenarios: readonly ProductScenario[] = [
    {
      id: "vague-bugfix",
      prompt: "Fix the planner target ranking bug and cover the adjacent test",
      expectedProductPath: true,
      expectedTaskKind: "edit-file",
      expectedHandoffState: "handoff-ready",
      expectedProofApply: "not-run",
      expectedProofVerification: "not-run",
    },
    {
      id: "vague-feature",
      prompt: "Create a context memory reuse feature for the planning runtime",
      expectedProductPath: true,
      expectedTaskKind: "write-file",
      expectedProofApply: "not-run",
      expectedProofVerification: "not-run",
    },
    {
      id: "insufficient-context",
      prompt: "Analyze the billing webhook retry policy and where to change it",
      expectedProductPath: true,
      expectedTaskKind: "edit-file",
      expectedHandoffState: "unsupported",
      expectedProofApply: "not-run",
      expectedProofVerification: "not-run",
    },
    {
      id: "unsupported-broad-refactor",
      prompt: "Implement a broad refactor across all source files and update every module boundary",
      expectedProductPath: true,
      expectedTaskKind: "edit-file",
      expectedHandoffState: "unsupported",
      expectedProofApply: "not-run",
      expectedProofVerification: "not-run",
    },
    {
      id: "command-only",
      prompt: "Run git status",
      expectedProductPath: false,
      expectedTaskKind: "run-command",
      maxTurns: 3,
    },
  ];

  const productReports: ProductReport[] = [];
  for (const scenario of productScenarios) {
    productReports.push(await runProductScenario(scenario));
  }
  const controlledProof = await runControlledProofScenario(controlledRoot);
  const failures = [
    ...productReports.flatMap((report) =>
      report.failures.map((failure) => `${report.id}: ${failure}`),
    ),
    ...controlledProof.failures.map((failure) => `${controlledProof.id}: ${failure}`),
  ];

  console.log(JSON.stringify({
    route: "209",
    gate: "route209-planning-proof-handoff-benchmark",
    productWorkspace: path.basename(workspaceRoot),
    controlledWorkspace: path.basename(controlledRoot),
    realProviderTouched: false,
    providerMode: "synthetic",
    productReports,
    controlledProof,
  }, null, 2));
  if (failures.length > 0) {
    for (const failure of failures) {
      console.log(`[fail] ${failure}`);
    }
    process.exit(1);
  }
  console.log("[pass] route209-planning-proof-handoff-benchmark");
} finally {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
  await fs.rm(controlledRoot, { recursive: true, force: true });
  if (originalDaemonEnabled === undefined) {
    delete process.env.DAEMON_ENABLED;
  } else {
    process.env.DAEMON_ENABLED = originalDaemonEnabled;
  }
  if (originalAuditLogPath === undefined) {
    delete process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH;
  } else {
    process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH = originalAuditLogPath;
  }
}

async function runProductScenario(scenario: ProductScenario): Promise<ProductReport> {
  const before = await snapshotWorkspace(workspaceRoot);
  const result = await runMvpIntegratedFlow({
    sessionId: `sess_route209_benchmark_${scenario.id.replace(/[^a-z0-9_]/gi, "_")}`,
    prompt: scenario.prompt,
    workspaceRoot,
    escalationDecision: "deny",
    providerMode: "synthetic",
    maxTurns: scenario.maxTurns ?? 4,
  });
  const after = await snapshotWorkspace(workspaceRoot);
  const workspaceChangedFiles = diffSnapshots(before, after);
  const report = projectProductReport({ scenario, result, workspaceChangedFiles });
  return {
    ...report,
    failures: validateProductReport({ scenario, report }),
  };
}

function projectProductReport(input: {
  readonly scenario: ProductScenario;
  readonly result: ProductResult;
  readonly workspaceChangedFiles: readonly string[];
}): ProductReport {
  const result = input.result;
  const evidence = result.codingResult?.evidence ?? [];
  const finalOutput = result.finalOutput ?? "";
  const productPathUsed = evidence.includes("planning-runtime-product:path:runMvpIntegratedFlow") ||
    finalOutput.includes("Planning runtime: product-path review-only handoff");
  const changedFiles = result.codingResult?.changedFiles ?? [];
  const editTargets = unique([
    ...(result.codingResult?.unverifiedFiles ?? []).map((file) => file.path),
    ...(result.codingResult?.failedFiles ?? []).map((file) => file.path),
  ].filter((entry) => entry !== "(planning-runtime)"));
  return {
    id: input.scenario.id,
    prompt: input.scenario.prompt,
    status: result.status,
    terminalClassification: result.terminalClassification,
    taskKind: result.codingResult?.taskKind,
    productPathUsed,
    editTargets,
    handoffState: extractLineValue(finalOutput, "Handoff state:"),
    proposalState: extractLineValue(finalOutput, "Proposal state:"),
    anchorState: extractLineValue(finalOutput, "Anchor state:"),
    confirmationState: extractLineValue(finalOutput, "Confirmation state:"),
    proofRouteState: extractProofRouteLineValue(finalOutput, "State:"),
    proofApplyState: extractProofRouteLineValue(finalOutput, "Apply state:"),
    proofVerificationState: extractProofRouteLineValue(finalOutput, "Verification state:"),
    claimTerminal: extractProofRouteLineValue(finalOutput, "Claim terminal:"),
    changedFiles,
    noWriteSafety: {
      workspaceUnchanged: input.workspaceChangedFiles.length === 0,
      mutationAuthorityNotGranted: hasMarker({
        finalOutput,
        evidence,
        marker: "mutationAuthority=not-granted",
        alternate: "planning-runtime:mutation-authority:not-granted",
      }),
      providerNotCalled: hasMarker({
        finalOutput,
        evidence,
        marker: "provider-called=false",
        alternate: "planning-runtime:provider-call:not-run",
      }),
      applyNotRun: hasMarker({
        finalOutput,
        evidence,
        marker: "apply=not-run",
        alternate: "planning-mutation-handoff:apply:not-run",
      }),
      commandDispatchNotRun: hasMarker({
        finalOutput,
        evidence,
        marker: "command-dispatch=not-run",
        alternate: "planning-runtime:command-dispatch:not-run",
      }),
      proofBackendNotRun: evidence.includes("planning-mutation-proof-handoff:backend:not-run") ||
        finalOutput.includes("Backend: not-run"),
    },
    workspaceChangedFiles: input.workspaceChangedFiles,
    failures: [],
  };
}

function validateProductReport(input: {
  readonly scenario: ProductScenario;
  readonly report: ProductReport;
}): readonly string[] {
  const failures: string[] = [];
  const scenario = input.scenario;
  const report = input.report;
  if (report.productPathUsed !== scenario.expectedProductPath) {
    failures.push(`productPathUsed=${report.productPathUsed} expected ${scenario.expectedProductPath}`);
  }
  if (scenario.expectedTaskKind && report.taskKind !== scenario.expectedTaskKind) {
    failures.push(`taskKind=${report.taskKind ?? "missing"} expected ${scenario.expectedTaskKind}`);
  }
  if (scenario.expectedHandoffState && report.handoffState !== scenario.expectedHandoffState) {
    failures.push(`handoffState=${report.handoffState ?? "missing"} expected ${scenario.expectedHandoffState}`);
  }
  if (scenario.expectedProofApply && report.proofApplyState !== scenario.expectedProofApply) {
    failures.push(`proofApplyState=${report.proofApplyState ?? "missing"} expected ${scenario.expectedProofApply}`);
  }
  if (scenario.expectedProofVerification && report.proofVerificationState !== scenario.expectedProofVerification) {
    failures.push(
      `proofVerificationState=${report.proofVerificationState ?? "missing"} expected ${scenario.expectedProofVerification}`,
    );
  }
  if (scenario.expectedProductPath) {
    if (!report.proofRouteState) failures.push("proof route state missing");
    if (!report.claimTerminal) failures.push("claim terminal missing");
    for (const [key, value] of Object.entries(report.noWriteSafety)) {
      if (!value) failures.push(`no-write marker failed: ${key}`);
    }
  }
  if (report.changedFiles.length > 0) {
    failures.push(`changed files in default product path: ${report.changedFiles.join(",")}`);
  }
  if (report.workspaceChangedFiles.length > 0) {
    failures.push(`workspace changed in default product path: ${report.workspaceChangedFiles.join(",")}`);
  }
  return failures;
}

async function runControlledProofScenario(root: string): Promise<ControlledProofReport> {
  const targetPath = "src/planning/targetRanking.ts";
  const sourceContent = await fs.readFile(path.join(root, targetPath), "utf8");
  const expectedContent = [
    "export function rankPlannerTargets(task: string) {",
    "  return task.trim().includes('planner') ? 'targetRanking.ts' : 'unknown';",
    "}",
    "",
  ].join("\n");
  const before = await snapshotWorkspace(root);
  const authority = createWorkspaceWriteAuthority(root);
  const route = await runPlanningMutationProofRoute({
    requestId: "route209-controlled-proof-benchmark",
    handoff: buildPlanningMutationHandoffProjection({
      editTargets: [
        {
          path: targetPath,
          rationale: "benchmark exact target from product planning handoff contract",
          handoffRoute: "existing-proof-carrying-mutation-runtime",
          readiness: "ready-for-review",
        },
      ],
      missingFacts: [],
      taskKind: "edit-file",
      verificationIntentAvailable: true,
      contextReceipts: [
        {
          id: "context-receipt:route209-controlled:1",
          path: targetPath,
          summary: "controlled fixture target source",
          relevance: "target file",
        },
      ],
      readEvidence: [
        {
          id: "read-evidence:route209-controlled:1",
          path: targetPath,
          reason: "controlled fixture target",
          source: "benchmark-fixture",
        },
      ],
      expectedChangeSummary: "Trim the task before planner target ranking.",
      verificationIntentSummary: "verificationPlan=route209_controlled_readback; command-dispatch=not-run",
      verificationEvidenceIds: ["route209_controlled_readback"],
    }),
    rawProposal: {
      operationKind: "exact-fenced-replacement",
      targets: [
        {
          path: targetPath,
          oldText: "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';",
          newText: "  return task.trim().includes('planner') ? 'targetRanking.ts' : 'unknown';",
        },
      ],
      verificationPlan: ["readback verifies controlled fixture final content"],
    },
    currentContentByTargetPath: new Map([[targetPath, sourceContent]]),
    confirmation: { state: "trusted-confirmed" },
    workspace: {
      scope: "controlled-temp-workspace",
      fencedOptions: workspaceOptions(root, authority),
      targetSetOptions: workspaceOptions(root, authority),
    },
    readVerifiedFile: authority.readVerifiedFile,
    expectedContentByTargetPath: new Map([[targetPath, expectedContent]]),
    providerCalled: true,
    taskKind: "edit-file",
  });
  const after = await snapshotWorkspace(root);
  const workspaceChangedFiles = diffSnapshots(before, after);
  const finalContent = await fs.readFile(path.join(root, targetPath), "utf8");
  const report: ControlledProofReport = {
    id: "trusted-controlled-proof",
    bridgeState: route.bridge.state,
    anchorState: route.bridge.anchorState,
    confirmationState: route.proofHandoff.confirmationState,
    backendLane: route.proofHandoff.backendLane,
    applyState: route.proofHandoff.applyState,
    verificationState: route.verification.verificationState,
    claimTerminal: route.terminalState,
    terminalResult: route.terminalResult,
    liveSuccess: route.liveSuccess,
    changedFiles: route.changedFiles,
    verifiedFiles: route.verifiedFiles,
    unexpectedChangedFiles: route.verification.unexpectedChangedFiles,
    providerCallDuringApply: route.providerCallDuringApply,
    workspaceChangedFiles,
    finalContentMatched: finalContent === expectedContent,
    failures: [],
  };
  return {
    ...report,
    failures: validateControlledProofReport(report, targetPath),
  };
}

function validateControlledProofReport(
  report: ControlledProofReport,
  targetPath: string,
): readonly string[] {
  const failures: string[] = [];
  if (report.bridgeState !== "confirmation-required") failures.push(`bridgeState=${report.bridgeState}`);
  if (report.anchorState !== "exact-ready") failures.push(`anchorState=${report.anchorState}`);
  if (report.confirmationState !== "trusted-confirmed") failures.push(`confirmationState=${report.confirmationState}`);
  if (report.backendLane !== "existing-proof-carrying-mutation-backend") failures.push(`backendLane=${report.backendLane}`);
  if (report.applyState !== "single-target-applied") failures.push(`applyState=${report.applyState}`);
  if (report.verificationState !== "succeeded") failures.push(`verificationState=${report.verificationState}`);
  if (report.claimTerminal !== "verification-succeeded-not-live") failures.push(`claimTerminal=${report.claimTerminal}`);
  if (report.terminalResult !== "verification-succeeded") failures.push(`terminalResult=${report.terminalResult}`);
  if (report.liveSuccess) failures.push("liveSuccess must remain false for synthetic/focused evidence");
  if (report.providerCallDuringApply) failures.push("provider call happened during apply");
  if (report.unexpectedChangedFiles.length > 0) {
    failures.push(`unexpected changed files: ${report.unexpectedChangedFiles.join(",")}`);
  }
  if (!sameMembers(report.changedFiles, [targetPath])) {
    failures.push(`changedFiles=${report.changedFiles.join(",")}`);
  }
  if (!sameMembers(report.verifiedFiles, [targetPath])) {
    failures.push(`verifiedFiles=${report.verifiedFiles.join(",")}`);
  }
  if (!sameMembers(report.workspaceChangedFiles, [targetPath])) {
    failures.push(`workspaceChangedFiles=${report.workspaceChangedFiles.join(",")}`);
  }
  if (!report.finalContentMatched) failures.push("final content did not match expected readback content");
  return failures;
}

function workspaceOptions(root: string, authority: ReturnType<typeof createWorkspaceWriteAuthority>) {
  return {
    workspaceRoot: root,
    explicitRuntimeOptIn: true,
    explicitWorkspaceWriteOptIn: true,
    requestedUserDecision: "approved" as const,
    defaultProductionRejectionUnchanged: true as const,
    readFile: authority.readFile,
    readVerifiedFile: authority.readVerifiedFile,
    validateWriteTarget: authority.validateWriteTarget,
    writeFile: authority.writeFile,
  };
}

async function seedWorkspace(root: string): Promise<void> {
  await fs.mkdir(path.join(root, "src", "planning"), { recursive: true });
  await fs.mkdir(path.join(root, "src", "feature"), { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "route209-product-path-benchmark",
      scripts: { test: "vitest run", build: "tsc -p tsconfig.json" },
    }, null, 2),
  );
  await seedPlanningFiles(root);
  await fs.writeFile(path.join(root, "src", "feature", "featureA.ts"), "export const marker = 'v1';\n");
  await fs.writeFile(path.join(root, "src", "feature", "featureB.ts"), "export const marker = 'v1';\n");
  await fs.writeFile(
    path.join(root, "README.md"),
    "Route209 benchmark fixture for product-path planning handoff coverage.\n",
  );
}

async function seedControlledWorkspace(root: string): Promise<void> {
  await fs.mkdir(path.join(root, "src", "planning"), { recursive: true });
  await seedPlanningFiles(root);
}

async function seedPlanningFiles(root: string): Promise<void> {
  await fs.writeFile(
    path.join(root, "src", "planning", "targetRanking.ts"),
    [
      "export function rankPlannerTargets(task: string) {",
      "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';",
      "}",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(root, "src", "planning", "contextMemory.ts"),
    [
      "export function rememberContext(task: string) {",
      "  return task.includes('memory') ? 'contextMemory.ts' : 'unknown';",
      "}",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(root, "src", "planning", "plannerRuntime.ts"),
    [
      "import { rankPlannerTargets } from './targetRanking.js';",
      "import { rememberContext } from './contextMemory.js';",
      "export function planRuntime(task: string) {",
      "  return task.includes('memory') ? rememberContext(task) : rankPlannerTargets(task);",
      "}",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(root, "src", "planning", "targetRanking.test.ts"),
    [
      "import { rankPlannerTargets } from './targetRanking.js';",
      "expect(rankPlannerTargets('planner target ranking')).toBe('targetRanking.ts');",
      "",
    ].join("\n"),
  );
}

async function snapshotWorkspace(root: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  await walk(root, root, snapshot);
  return snapshot;
}

async function walk(root: string, current: string, snapshot: Map<string, string>): Promise<void> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".sisyphus" || entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    const absolutePath = path.join(current, entry.name);
    const relativePath = path.relative(root, absolutePath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      await walk(root, absolutePath, snapshot);
      continue;
    }
    if (entry.isFile()) {
      snapshot.set(relativePath, await fs.readFile(absolutePath, "utf8"));
    }
  }
}

function diffSnapshots(before: Map<string, string>, after: Map<string, string>): readonly string[] {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return Array.from(keys)
    .filter((key) => before.get(key) !== after.get(key))
    .sort();
}

function extractLineValue(output: string, label: string): string | null {
  const line = output.split("\n").find((entry) => entry.startsWith(label));
  return line ? line.slice(label.length).trim() : null;
}

function extractProofRouteLineValue(output: string, label: string): string | null {
  const lines = output.split("\n");
  const index = lines.findIndex((line) => line === "Proof backend route:");
  if (index < 0) return null;
  const line = lines.slice(index + 1, index + 20).find((entry) => entry.startsWith(label));
  return line ? line.slice(label.length).trim() : null;
}

function hasMarker(input: {
  readonly finalOutput: string;
  readonly evidence: readonly string[];
  readonly marker: string;
  readonly alternate: string;
}): boolean {
  return input.finalOutput.includes(input.marker) ||
    input.evidence.includes(input.marker) ||
    input.evidence.includes(input.alternate);
}

function sameMembers(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length &&
    expected.every((entry) => actual.includes(entry));
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
