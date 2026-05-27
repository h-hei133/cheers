#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runMvpIntegratedFlow } from "../../../packages/ts-shell/src/orchestration/runMvpIntegratedFlow.js";
import type { PlanningRuntimeProductExecutionOptions } from "../../../packages/ts-shell/src/orchestration/planningRuntimeProductExecution.js";

type ProductResult = Awaited<ReturnType<typeof runMvpIntegratedFlow>>;

interface Scenario {
  readonly id: string;
  readonly prompt: string;
  readonly seedKind: "planning" | "feature" | "minimal";
  readonly execution?: "confirmed" | "verification-failure";
  readonly expected: {
    readonly productPathUsed: boolean;
    readonly reviewSurfacePresent: boolean;
    readonly confirmationState?: string;
    readonly backendConsumption?: string;
    readonly applyState?: string;
    readonly verificationState?: string;
    readonly terminalVerdict?: string;
    readonly changedFiles?: readonly string[];
    readonly verifiedFiles?: readonly string[];
    readonly noWorkspaceChanges?: boolean;
  };
  readonly maxTurns?: number;
}

interface ScenarioReport {
  readonly id: string;
  readonly status: ProductResult["status"];
  readonly terminalClassification: ProductResult["terminalClassification"];
  readonly productPathUsed: boolean;
  readonly reviewSurfacePresent: boolean;
  readonly confirmationState: string | null;
  readonly backendConsumption: string | null;
  readonly applyState: string | null;
  readonly verificationState: string | null;
  readonly terminalVerdict: string | null;
  readonly claimResult: string | null;
  readonly changedFiles: readonly string[];
  readonly verifiedFiles: readonly string[];
  readonly workspaceChangedFiles: readonly string[];
  readonly sessionEvidence: {
    readonly productPath: boolean;
    readonly reviewSurface: boolean;
    readonly confirmation: boolean;
    readonly backend: boolean;
    readonly verification: boolean;
    readonly terminal: boolean;
  };
  readonly safetyMarkers: {
    readonly realProviderTouched: false;
    readonly providerCallDuringApplyFalse: boolean;
    readonly confirmationFromPromptFalse: boolean;
    readonly commandDispatchDuringConfirmationFalse: boolean;
    readonly noNewWriter: boolean;
    readonly noFuzzyApply: boolean;
  };
  readonly failures: readonly string[];
}

const originalDaemonEnabled = process.env.DAEMON_ENABLED;
const originalAuditLogPath = process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH;
process.env.DAEMON_ENABLED = "0";

const testRoot = process.env.PRIVATE_AGENTS_TEST_ROOT?.trim() ||
  path.join(os.tmpdir(), "private-agents-test");
await fs.mkdir(testRoot, { recursive: true });
const auditRoot = await fs.mkdtemp(path.join(testRoot, "route210-audit-"));
process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH = path.join(
  auditRoot,
  ".sisyphus",
  "audit",
  "permissions.jsonl",
);

const scenarios: readonly Scenario[] = [
  {
    id: "vague-bugfix-review-only-default",
    prompt: "Fix the planner target ranking bug and cover the adjacent test",
    seedKind: "planning",
    expected: {
      productPathUsed: true,
      reviewSurfacePresent: true,
      confirmationState: "not-confirmed",
      backendConsumption: "not-run",
      applyState: "not-run",
      verificationState: "not-run",
      noWorkspaceChanges: true,
    },
  },
  {
    id: "vague-bugfix-confirmed-controlled-execution",
    prompt: "Fix the planner target ranking bug and cover the adjacent test",
    seedKind: "planning",
    execution: "confirmed",
    expected: {
      productPathUsed: true,
      reviewSurfacePresent: true,
      confirmationState: "trusted-confirmed",
      backendConsumption: "existing-proof-carrying-mutation-backend",
      applyState: "single-target-applied",
      verificationState: "succeeded",
      terminalVerdict: "verification-succeeded-not-live",
      changedFiles: ["src/planning/targetRanking.ts"],
      verifiedFiles: ["src/planning/targetRanking.ts"],
    },
  },
  {
    id: "vague-feature-review-only",
    prompt: "Create a context memory reuse feature for the planning runtime",
    seedKind: "feature",
    expected: {
      productPathUsed: true,
      reviewSurfacePresent: true,
      confirmationState: "not-confirmed",
      backendConsumption: "not-run",
      applyState: "not-run",
      verificationState: "not-run",
      noWorkspaceChanges: true,
    },
  },
  {
    id: "insufficient-context-stops-before-confirmation",
    prompt: "Analyze the billing webhook retry policy and where to change it",
    seedKind: "minimal",
    expected: {
      productPathUsed: true,
      reviewSurfacePresent: true,
      confirmationState: "not-confirmed",
      backendConsumption: "not-run",
      applyState: "not-run",
      verificationState: "not-run",
      noWorkspaceChanges: true,
    },
  },
  {
    id: "command-only-bypasses-mutation-confirmation",
    prompt: "Run npm publish for this project now",
    seedKind: "planning",
    expected: {
      productPathUsed: false,
      reviewSurfacePresent: false,
      noWorkspaceChanges: true,
    },
    maxTurns: 3,
  },
  {
    id: "verification-failure-cannot-success",
    prompt: "Fix the planner target ranking bug and cover the adjacent test",
    seedKind: "planning",
    execution: "verification-failure",
    expected: {
      productPathUsed: true,
      reviewSurfacePresent: true,
      confirmationState: "trusted-confirmed",
      backendConsumption: "existing-proof-carrying-mutation-backend",
      applyState: "single-target-applied",
      verificationState: "failed",
      terminalVerdict: "repair-eligible",
      changedFiles: ["src/planning/targetRanking.ts"],
      verifiedFiles: [],
    },
  },
];

try {
  const reports: ScenarioReport[] = [];
  for (const scenario of scenarios) {
    reports.push(await runScenario(scenario));
  }
  const failures = reports.flatMap((report) =>
    report.failures.map((failure) => `${report.id}: ${failure}`),
  );
  console.log(JSON.stringify({
    route: "210",
    gate: "route210-review-confirm-execute-benchmark",
    realProviderTouched: false,
    providerMode: "synthetic",
    reports,
  }, null, 2));
  if (failures.length > 0) {
    for (const failure of failures) {
      console.log(`[fail] ${failure}`);
    }
    process.exit(1);
  }
  console.log("[pass] route210-review-confirm-execute-benchmark");
} finally {
  await fs.rm(auditRoot, { recursive: true, force: true });
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

async function runScenario(scenario: Scenario): Promise<ScenarioReport> {
  const workspaceRoot = await fs.mkdtemp(path.join(testRoot, `route210-${scenario.id}-`));
  try {
    await seedWorkspace(workspaceRoot, scenario.seedKind);
    const before = await snapshotWorkspace(workspaceRoot);
    const execution = executionOptions(scenario.execution);
    const result = await runMvpIntegratedFlow({
      sessionId: `sess_route210_${scenario.id.replace(/[^a-z0-9_]/gi, "_")}`,
      prompt: scenario.prompt,
      workspaceRoot,
      escalationDecision: "deny",
      providerMode: "synthetic",
      maxTurns: scenario.maxTurns ?? 4,
      ...(execution ? { planningMutationExecution: execution } : {}),
    });
    const after = await snapshotWorkspace(workspaceRoot);
    const workspaceChangedFiles = diffSnapshots(before, after);
    const report = projectReport({
      scenario,
      result,
      workspaceChangedFiles,
    });
    return {
      ...report,
      failures: validateReport({ scenario, report }),
    };
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

function executionOptions(
  kind: Scenario["execution"],
): PlanningRuntimeProductExecutionOptions | undefined {
  if (!kind) return undefined;
  const expectedContent = kind === "verification-failure"
    ? "expected content intentionally mismatches readback\n"
    : planningExpectedContent();
  return {
    confirmation: { state: "trusted-confirmed" },
    rawProposal: exactProposal(),
    controlledWorkspace: {
      scope: "controlled-temp-workspace",
      source: "benchmark",
    },
    expectedContentByTargetPath: new Map([
      ["src/planning/targetRanking.ts", expectedContent],
    ]),
  };
}

function projectReport(input: {
  readonly scenario: Scenario;
  readonly result: ProductResult;
  readonly workspaceChangedFiles: readonly string[];
}): ScenarioReport {
  const finalOutput = input.result.finalOutput ?? "";
  const evidence = input.result.codingResult?.evidence ?? [];
  const productPathUsed =
    evidence.includes("planning-runtime-product:path:runMvpIntegratedFlow") ||
    finalOutput.includes("Planning runtime: product-path review-only handoff");
  const reviewSurfacePresent = finalOutput.includes("Review-confirm-execute loop:");
  const report: ScenarioReport = {
    id: input.scenario.id,
    status: input.result.status,
    terminalClassification: input.result.terminalClassification,
    productPathUsed,
    reviewSurfacePresent,
    confirmationState: extractLoopLineValue(finalOutput, "Explicit confirmation:"),
    backendConsumption: extractLoopLineValue(finalOutput, "Backend consumption:"),
    applyState: extractLoopLineValue(finalOutput, "Apply state:"),
    verificationState: extractLoopLineValue(finalOutput, "Readback verification:"),
    terminalVerdict: extractLoopLineValue(finalOutput, "Terminal verdict:"),
    claimResult: extractLoopLineValue(finalOutput, "Terminal result:"),
    changedFiles: input.result.codingResult?.changedFiles ?? [],
    verifiedFiles: input.result.codingResult?.verifiedFiles ?? [],
    workspaceChangedFiles: input.workspaceChangedFiles,
    sessionEvidence: {
      productPath: evidence.includes("planning-runtime-product:path:runMvpIntegratedFlow"),
      reviewSurface: evidence.includes("planning-runtime-product:review-surface:structured-handoff"),
      confirmation: evidence.some((entry) => entry.startsWith("planning-runtime-product:confirmation:")),
      backend: evidence.some((entry) => entry.startsWith("planning-runtime-product:backend-consumption:")),
      verification: evidence.some((entry) => entry.startsWith("planning-runtime-product:proof-verification:")),
      terminal: evidence.some((entry) => entry.startsWith("planning-runtime-product:proof-terminal:")),
    },
    safetyMarkers: {
      realProviderTouched: false,
      providerCallDuringApplyFalse: evidence.includes("planning-mutation-proof-route:provider-call-during-apply:false"),
      confirmationFromPromptFalse: evidence.includes("planning-runtime-product:confirmation-from-prompt:false"),
      commandDispatchDuringConfirmationFalse: evidence.includes("planning-runtime-product:command-dispatch-during-confirmation:false"),
      noNewWriter: evidence.includes("planning-mutation-proof-handoff:no-new-writer") || !reviewSurfacePresent,
      noFuzzyApply: evidence.includes("planning-mutation-proof-handoff:no-fuzzy-apply") || !reviewSurfacePresent,
    },
    failures: [],
  };
  return report;
}

function validateReport(input: {
  readonly scenario: Scenario;
  readonly report: ScenarioReport;
}): readonly string[] {
  const failures: string[] = [];
  const expected = input.scenario.expected;
  const report = input.report;
  compare("productPathUsed", report.productPathUsed, expected.productPathUsed, failures);
  compare("reviewSurfacePresent", report.reviewSurfacePresent, expected.reviewSurfacePresent, failures);
  compareOptional("confirmationState", report.confirmationState, expected.confirmationState, failures);
  compareOptional("backendConsumption", report.backendConsumption, expected.backendConsumption, failures);
  compareOptional("applyState", report.applyState, expected.applyState, failures);
  compareOptional("verificationState", report.verificationState, expected.verificationState, failures);
  compareOptional("terminalVerdict", report.terminalVerdict, expected.terminalVerdict, failures);
  compareListOptional("changedFiles", report.changedFiles, expected.changedFiles, failures);
  compareListOptional("verifiedFiles", report.verifiedFiles, expected.verifiedFiles, failures);
  if (expected.noWorkspaceChanges && report.workspaceChangedFiles.length > 0) {
    failures.push(`workspaceChangedFiles=${report.workspaceChangedFiles.join(",")}`);
  }
  if (expected.productPathUsed) {
    for (const [key, value] of Object.entries(report.sessionEvidence)) {
      if (!value) failures.push(`sessionEvidence.${key}=false`);
    }
    for (const [key, value] of Object.entries(report.safetyMarkers)) {
      if (key === "realProviderTouched") {
        if (value !== false) failures.push("safetyMarkers.realProviderTouched=true");
        continue;
      }
      if (!value) failures.push(`safetyMarkers.${key}=false`);
    }
  }
  if (input.scenario.id === "verification-failure-cannot-success") {
    if (report.status === "completed" || report.terminalClassification === "success") {
      failures.push("verification failure reported success");
    }
  }
  if (input.scenario.id.includes("review-only") && report.changedFiles.length > 0) {
    failures.push(`review-only changedFiles=${report.changedFiles.join(",")}`);
  }
  return failures;
}

async function seedWorkspace(
  root: string,
  kind: Scenario["seedKind"],
): Promise<void> {
  await fs.mkdir(path.join(root, "src", "planning"), { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: `route210-${kind}`,
      scripts: { test: "vitest run", build: "tsc -p tsconfig.json" },
    }, null, 2),
  );
  if (kind === "minimal") {
    await fs.writeFile(path.join(root, "README.md"), "minimal benchmark fixture\n");
    return;
  }
  await fs.writeFile(
    path.join(root, "src", "planning", "targetRanking.ts"),
    planningSourceContent(),
  );
  await fs.writeFile(
    path.join(root, "src", "planning", "targetRanking.test.ts"),
    "expect(rankPlannerTargets('planner target ranking')).toBe('targetRanking.ts');\n",
  );
  if (kind === "feature") {
    await fs.writeFile(
      path.join(root, "src", "planning", "contextMemory.ts"),
      "export const contextMemory = 'v1';\n",
    );
  }
}

async function snapshotWorkspace(root: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  await walk(root, root, snapshot);
  return snapshot;
}

async function walk(
  root: string,
  current: string,
  snapshot: Map<string, string>,
): Promise<void> {
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

function diffSnapshots(
  before: Map<string, string>,
  after: Map<string, string>,
): readonly string[] {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return Array.from(keys)
    .filter((key) => before.get(key) !== after.get(key))
    .sort();
}

function extractLoopLineValue(output: string, label: string): string | null {
  const lines = output.split("\n");
  const index = lines.findIndex((line) => line === "Review-confirm-execute loop:");
  if (index < 0) return null;
  const line = lines.slice(index + 1, index + 60).find((entry) => entry.startsWith(label));
  return line ? line.slice(label.length).trim() : null;
}

function compare(
  name: string,
  actual: boolean,
  expected: boolean,
  failures: string[],
): void {
  if (actual !== expected) failures.push(`${name}=${actual} expected ${expected}`);
}

function compareOptional(
  name: string,
  actual: string | null,
  expected: string | undefined,
  failures: string[],
): void {
  if (expected !== undefined && actual !== expected) {
    failures.push(`${name}=${actual ?? "missing"} expected ${expected}`);
  }
}

function compareListOptional(
  name: string,
  actual: readonly string[],
  expected: readonly string[] | undefined,
  failures: string[],
): void {
  if (!expected) return;
  if (actual.length !== expected.length || expected.some((entry) => !actual.includes(entry))) {
    failures.push(`${name}=${actual.join(",")} expected ${expected.join(",")}`);
  }
}

function exactProposal() {
  return {
    operationKind: "exact-fenced-replacement" as const,
    targets: [
      {
        path: "src/planning/targetRanking.ts",
        oldText: "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';",
        newText: "  return task.trim().includes('planner') ? 'targetRanking.ts' : 'unknown';",
      },
    ],
    verificationPlan: ["readback verifies controlled fixture final content"],
  };
}

function planningSourceContent(): string {
  return [
    "export function rankPlannerTargets(task: string) {",
    "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';",
    "}",
    "",
  ].join("\n");
}

function planningExpectedContent(): string {
  return [
    "export function rankPlannerTargets(task: string) {",
    "  return task.trim().includes('planner') ? 'targetRanking.ts' : 'unknown';",
    "}",
    "",
  ].join("\n");
}
