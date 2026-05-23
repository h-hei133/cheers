#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runMvpIntegratedFlow } from "../packages/ts-shell/src/orchestration/runMvpIntegratedFlow.js";

type BenchmarkResult = Awaited<ReturnType<typeof runMvpIntegratedFlow>>;

interface BenchmarkScenario {
  readonly id: string;
  readonly prompt: string;
  readonly expectedProductPath: boolean;
  readonly expectedTaskKind?: string;
  readonly expectedHandoffReadiness?: "review-ready" | "blocked";
  readonly expectMissingFacts?: boolean;
  readonly expectedStopReasonIncludes?: string;
  readonly requireCandidates?: boolean;
  readonly maxTurns?: number;
}

interface BenchmarkReport {
  readonly id: string;
  readonly prompt: string;
  readonly status: BenchmarkResult["status"];
  readonly terminalClassification: BenchmarkResult["terminalClassification"];
  readonly taskKind?: string;
  readonly productPathUsed: boolean;
  readonly productPathRoute?: string;
  readonly candidates: readonly string[];
  readonly stagedReads: readonly string[];
  readonly analysisPresent: boolean;
  readonly planPresent: boolean;
  readonly editTargets: readonly string[];
  readonly verificationIntent: string | null;
  readonly handoffReadiness: string | null;
  readonly missingFacts: string;
  readonly noWriteSafety: {
    readonly changedFilesEmpty: boolean;
    readonly workspaceUnchanged: boolean;
    readonly mutationAuthorityNotGranted: boolean;
    readonly providerNotCalled: boolean;
    readonly applyNotRun: boolean;
    readonly commandDispatchNotRun: boolean;
  };
  readonly workspaceChangedFiles: readonly string[];
  readonly failures: readonly string[];
}

const originalDaemonEnabled = process.env.DAEMON_ENABLED;
const originalAuditLogPath = process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH;
process.env.DAEMON_ENABLED = "0";

const testRoot = process.env.PRIVATE_AGENTS_TEST_ROOT?.trim() ||
  path.join(os.tmpdir(), "private-agents-test");
const workspaceRoot = await fs.mkdtemp(path.join(testRoot, "route208-product-path-"));
process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH = path.join(
  workspaceRoot,
  ".sisyphus",
  "audit",
  "permissions.jsonl",
);

try {
  await seedWorkspace(workspaceRoot);
  const scenarios: readonly BenchmarkScenario[] = [
    {
      id: "vague-bugfix",
      prompt: "Fix the planner target ranking bug and cover the adjacent test",
      expectedProductPath: true,
      expectedTaskKind: "edit-file",
      expectedHandoffReadiness: "review-ready",
      requireCandidates: true,
    },
    {
      id: "vague-feature-planning",
      prompt: "Create a context memory reuse feature for the planning runtime",
      expectedProductPath: true,
      expectedTaskKind: "write-file",
      requireCandidates: true,
    },
    {
      id: "test-related",
      prompt: "Analyze planner target ranking files and related tests",
      expectedProductPath: true,
      expectedTaskKind: "inspect-files",
      expectedHandoffReadiness: "blocked",
      requireCandidates: true,
    },
    {
      id: "multi-file-impact",
      prompt: "Why does planner target ranking fail across runtime and tests?",
      expectedProductPath: true,
      expectedTaskKind: "repo-explain",
      expectedHandoffReadiness: "blocked",
      requireCandidates: true,
    },
    {
      id: "insufficient-context",
      prompt: "Analyze the billing webhook retry policy and where to change it",
      expectedProductPath: true,
      expectedTaskKind: "edit-file",
      expectedHandoffReadiness: "blocked",
      expectMissingFacts: true,
    },
    {
      id: "command-only",
      prompt: "Run git status",
      expectedProductPath: false,
      expectedTaskKind: "run-command",
      maxTurns: 3,
    },
    {
      id: "unsupported-broad-refactor",
      prompt: "Implement a broad refactor across all source files and update every module boundary",
      expectedProductPath: true,
      expectedTaskKind: "edit-file",
      maxTurns: 4,
    },
  ];

  const reports: BenchmarkReport[] = [];
  for (const scenario of scenarios) {
    reports.push(await runScenario(scenario));
  }

  const failures = reports.flatMap((report) =>
    report.failures.map((failure) => `${report.id}: ${failure}`),
  );
  console.log(JSON.stringify({
    route: "208",
    gate: "route208-product-path-benchmark",
    workspace: path.basename(workspaceRoot),
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
  console.log("[pass] route208-product-path-benchmark");
} finally {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
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

async function runScenario(scenario: BenchmarkScenario): Promise<BenchmarkReport> {
  const before = await snapshotWorkspace(workspaceRoot);
  const result = await runMvpIntegratedFlow({
    sessionId: `sess_route208_benchmark_${scenario.id.replace(/[^a-z0-9_]/gi, "_")}`,
    prompt: scenario.prompt,
    workspaceRoot,
    escalationDecision: "deny",
    providerMode: "synthetic",
    maxTurns: scenario.maxTurns ?? 4,
  });
  const after = await snapshotWorkspace(workspaceRoot);
  const workspaceChangedFiles = diffSnapshots(before, after);
  const report = projectReport({ scenario, result, workspaceChangedFiles });
  return {
    ...report,
    failures: validateReport({ scenario, report, result }),
  };
}

function projectReport(input: {
  readonly scenario: BenchmarkScenario;
  readonly result: BenchmarkResult;
  readonly workspaceChangedFiles: readonly string[];
}): BenchmarkReport {
  const result = input.result;
  const evidence = result.codingResult?.evidence ?? [];
  const finalOutput = result.finalOutput ?? "";
  const productPathUsed = evidence.includes("planning-runtime-product:path:runMvpIntegratedFlow") ||
    finalOutput.includes("Planning runtime: product-path review-only handoff");
  const candidates = unique(
    evidence
      .filter((entry) => entry.startsWith("planning-runtime-product:candidate:"))
      .map((entry) => entry.slice("planning-runtime-product:candidate:".length)),
  );
  const stagedReads = unique(
    evidence
      .filter((entry) => entry.startsWith("planning-runtime-product:read-reason:"))
      .map((entry) => entry.slice("planning-runtime-product:read-reason:".length)),
  );
  const editTargets = unique([
    ...(result.codingResult?.unverifiedFiles ?? []).map((file) => file.path),
    ...(result.codingResult?.failedFiles ?? []).map((file) => file.path),
  ].filter((entry) => entry !== "(planning-runtime)"));
  const productPathRoute = evidence.find((entry) =>
    entry.startsWith("planning-runtime-product:route:"),
  );
  return {
    id: input.scenario.id,
    prompt: input.scenario.prompt,
    status: result.status,
    terminalClassification: result.terminalClassification,
    taskKind: result.codingResult?.taskKind,
    productPathUsed,
    ...(productPathRoute ? { productPathRoute } : {}),
    candidates,
    stagedReads,
    analysisPresent: finalOutput.includes("Grounded analysis:"),
    planPresent: finalOutput.includes("Executable plan:"),
    editTargets,
    verificationIntent: extractSectionFirstLine(finalOutput, "Verification intent:"),
    handoffReadiness: extractReviewOnlyHandoffReadiness(finalOutput),
    missingFacts: extractLineValue(finalOutput, "Missing facts:") ?? "",
    noWriteSafety: {
      changedFilesEmpty: (result.codingResult?.changedFiles ?? []).length === 0,
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
    },
    workspaceChangedFiles: input.workspaceChangedFiles,
    failures: [],
  };
}

function validateReport(input: {
  readonly scenario: BenchmarkScenario;
  readonly report: BenchmarkReport;
  readonly result: BenchmarkResult;
}): readonly string[] {
  const failures: string[] = [];
  const report = input.report;
  const scenario = input.scenario;
  if (report.productPathUsed !== scenario.expectedProductPath) {
    failures.push(`productPathUsed=${report.productPathUsed} expected ${scenario.expectedProductPath}`);
  }
  if (scenario.expectedTaskKind && report.taskKind !== scenario.expectedTaskKind) {
    failures.push(`taskKind=${report.taskKind ?? "missing"} expected ${scenario.expectedTaskKind}`);
  }
  if (scenario.requireCandidates && report.candidates.length === 0) {
    failures.push("expected at least one candidate");
  }
  if (scenario.expectedProductPath) {
    if (!report.analysisPresent) failures.push("grounded analysis missing");
    if (!report.planPresent) failures.push("executable plan missing");
    if (!report.verificationIntent) failures.push("verification intent missing");
    if (!report.handoffReadiness) failures.push("handoff readiness missing");
    for (const [key, value] of Object.entries(report.noWriteSafety)) {
      if (!value) failures.push(`no-write marker failed: ${key}`);
    }
  }
  if (scenario.expectedHandoffReadiness && report.handoffReadiness !== scenario.expectedHandoffReadiness) {
    failures.push(`handoffReadiness=${report.handoffReadiness ?? "missing"} expected ${scenario.expectedHandoffReadiness}`);
  }
  if (scenario.expectMissingFacts && (!report.missingFacts || report.missingFacts === "none")) {
    failures.push("expected missing facts");
  }
  if (scenario.expectedStopReasonIncludes) {
    const combined = `${input.result.stopReason ?? ""}\n${input.result.finalOutput ?? ""}`;
    if (!combined.includes(scenario.expectedStopReasonIncludes)) {
      failures.push(`stop reason did not include ${scenario.expectedStopReasonIncludes}`);
    }
  }
  if (!report.noWriteSafety.changedFilesEmpty) {
    failures.push("changedFiles was not empty");
  }
  if (!report.noWriteSafety.workspaceUnchanged) {
    failures.push(`workspace changed: ${report.workspaceChangedFiles.join(", ")}`);
  }
  return failures;
}

async function seedWorkspace(root: string): Promise<void> {
  await fs.mkdir(path.join(root, "src", "planning"), { recursive: true });
  await fs.mkdir(path.join(root, "src", "feature"), { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "route208-product-path-benchmark",
      scripts: { test: "vitest run", build: "tsc -p tsconfig.json" },
    }, null, 2),
  );
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
  await fs.writeFile(
    path.join(root, "src", "planning", "plannerRuntime.test.ts"),
    [
      "import { planRuntime } from './plannerRuntime.js';",
      "expect(planRuntime('planner target')).toBe('targetRanking.ts');",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(root, "src", "feature", "featureA.ts"),
    "export const marker = 'v1';\n",
  );
  await fs.writeFile(
    path.join(root, "src", "feature", "featureB.ts"),
    "export const marker = 'v1';\n",
  );
  await fs.writeFile(
    path.join(root, "README.md"),
    "Route208 benchmark fixture for product-path planning runtime coverage.\n",
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

function extractLineValue(output: string, label: string): string | undefined {
  const line = output.split("\n").find((entry) => entry.startsWith(label));
  return line ? line.slice(label.length).trim() : undefined;
}

function extractSectionFirstLine(output: string, label: string): string | null {
  const lines = output.split("\n");
  const index = lines.findIndex((line) => line === label);
  if (index < 0) {
    return null;
  }
  return lines[index + 1]?.trim() || null;
}

function extractReviewOnlyHandoffReadiness(output: string): string | null {
  const lines = output.split("\n");
  const index = lines.findIndex((line) => line === "Review-only handoff:");
  if (index < 0) {
    return null;
  }
  const readinessLine = lines.slice(index + 1, index + 8).find((line) =>
    line.startsWith("Readiness:"),
  );
  return readinessLine ? readinessLine.slice("Readiness:".length).trim() : null;
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

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
