#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runMvpIntegratedFlow } from "../packages/ts-shell/src/orchestration/runMvpIntegratedFlow.js";
import type { PlanningRuntimeProductExecutionOptions } from "../packages/ts-shell/src/orchestration/planningRuntimeProductExecution.js";

type ProductResult = Awaited<ReturnType<typeof runMvpIntegratedFlow>>;

interface TaskCase {
  readonly id: string;
  readonly type: "vague-bugfix" | "feature-output" | "verification";
  readonly task: string;
  readonly workspace: "current-repo" | "fixture";
  readonly execution?: PlanningRuntimeProductExecutionOptions;
  readonly escalationDecision?: "allow-once" | "deny";
  readonly expected: {
    readonly candidateIncludes?: readonly string[];
    readonly readIncludes?: readonly string[];
    readonly handoff?: string;
    readonly proposal?: string;
    readonly anchor?: string;
    readonly confirmation?: string;
    readonly apply?: string;
    readonly readback?: string;
    readonly command?: string;
    readonly commandDispatch?: string;
    readonly repair?: string;
    readonly changedFiles?: readonly string[];
    readonly blockerIncludes?: string;
  };
}

interface TaskReport {
  readonly id: string;
  readonly type: TaskCase["type"];
  readonly task: string;
  readonly productPath: boolean;
  readonly candidates: readonly string[];
  readonly reads: readonly string[];
  readonly analysis: string;
  readonly plan: string;
  readonly handoff: string | null;
  readonly readiness: string | null;
  readonly proposal: string;
  readonly provider: string;
  readonly anchor: string | null;
  readonly confirmation: string | null;
  readonly apply: string | null;
  readonly verification: string | null;
  readonly command: string | null;
  readonly commandDispatch: string | null;
  readonly repair: string;
  readonly terminal: string | null;
  readonly changedFiles: readonly string[];
  readonly blocker: string;
  readonly failures: readonly string[];
}

const originalDaemonEnabled = process.env.DAEMON_ENABLED;
const originalAuditLogPath = process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH;
process.env.DAEMON_ENABLED = "0";

const testRoot = process.env.PRIVATE_AGENTS_TEST_ROOT?.trim() ||
  path.join(os.tmpdir(), "private-agents-test");
await fs.mkdir(testRoot, { recursive: true });
const auditRoot = await fs.mkdtemp(path.join(testRoot, "route212-audit-"));
process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH = path.join(
  auditRoot,
  ".sisyphus",
  "audit",
  "permissions.jsonl",
);

const cases: readonly TaskCase[] = [
  {
    id: "current-vague-bugfix-review-ready",
    type: "vague-bugfix",
    task: "Fix planning runtime product output so confirmed apply results do not still look review-only",
    workspace: "current-repo",
    expected: {
      candidateIncludes: [
        "packages/ts-shell/src/orchestration/planningRuntimeProductProjection.ts",
      ],
      readIncludes: [
        "packages/ts-shell/src/orchestration/planningRuntimeProductProjection.ts:explicit target",
      ],
      handoff: "handoff-ready",
      proposal: "prepared-exact",
      anchor: "exact-ready",
      confirmation: "not-confirmed",
      apply: "not-run",
      readback: "not-run",
      command: "not-requested",
      commandDispatch: "not-run",
      repair: "not-needed",
      blockerIncludes: "Exact-ready proposal needs explicit trusted confirmation",
    },
  },
  {
    id: "current-feature-output-review-ready",
    type: "feature-output",
    task: "Improve repair loop result reporting so task results include provider anchor apply verification and repair status",
    workspace: "current-repo",
    expected: {
      candidateIncludes: [
        "packages/ts-shell/src/orchestration/realTaskLoopRepairChain.ts",
      ],
      handoff: "handoff-ready",
      proposal: "prepared-exact",
      anchor: "exact-ready",
      confirmation: "not-confirmed",
      apply: "not-run",
      readback: "not-run",
      command: "not-requested",
      commandDispatch: "not-run",
      repair: "not-needed",
      blockerIncludes: "Exact-ready proposal needs explicit trusted confirmation",
    },
  },
  {
    id: "fixture-confirmed-verification-command",
    type: "verification",
    task: "Fix the planner target ranking bug and cover the adjacent test",
    workspace: "fixture",
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
    expected: {
      candidateIncludes: ["src/planning/targetRanking.ts"],
      readIncludes: ["src/planning/targetRanking.ts:explicit target"],
      handoff: "handoff-ready",
      proposal: "prepared-exact",
      anchor: "exact-ready",
      confirmation: "trusted-confirmed",
      apply: "single-target-applied",
      readback: "succeeded",
      command: "passed",
      commandDispatch: "existing-tool-runtime",
      repair: "not-needed",
      changedFiles: ["src/planning/targetRanking.ts"],
    },
  },
];

try {
  const reports: TaskReport[] = [];
  for (const taskCase of cases) {
    reports.push(await runTaskCase(taskCase));
  }

  const failures = reports.flatMap((report) =>
    report.failures.map((failure) => `${report.id}: ${failure}`),
  );
  console.log(JSON.stringify({
    route: "212",
    gate: "route212-real-task-capability-sprint",
    providerStatus: "not-run",
    realProviderTouched: false,
    defaultApply: "not-run",
    defaultCommandDispatch: "not-run",
    reports,
  }, null, 2));
  if (failures.length > 0) {
    for (const failure of failures) {
      console.log(`[fail] ${failure}`);
    }
    process.exit(1);
  }
  console.log("[pass] route212-real-task-capability-sprint");
} finally {
  await fs.rm(auditRoot, { recursive: true, force: true });
  restoreEnv("DAEMON_ENABLED", originalDaemonEnabled);
  restoreEnv("PRIVATE_AGENTS_AUDIT_LOG_PATH", originalAuditLogPath);
}

async function runTaskCase(taskCase: TaskCase): Promise<TaskReport> {
  const workspaceRoot = taskCase.workspace === "current-repo"
    ? process.cwd()
    : await seedVerificationFixture(taskCase.id);
  try {
    const result = await runMvpIntegratedFlow({
      sessionId: `sess_route212_${taskCase.id.replace(/[^a-z0-9_]/gi, "_")}`,
      prompt: taskCase.task,
      workspaceRoot,
      escalationDecision: taskCase.escalationDecision ?? "deny",
      providerMode: "synthetic",
      maxTurns: 4,
      ...(taskCase.execution ? { planningMutationExecution: taskCase.execution } : {}),
    });
    const report = projectReport({ taskCase, result });
    return {
      ...report,
      failures: validateReport({ taskCase, report }),
    };
  } finally {
    if (taskCase.workspace === "fixture") {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  }
}

function projectReport(input: {
  readonly taskCase: TaskCase;
  readonly result: ProductResult;
}): TaskReport {
  const finalOutput = input.result.finalOutput ?? "";
  const evidence = input.result.codingResult?.evidence ?? [];
  const candidates = unique(
    evidence
      .filter((entry) => entry.startsWith("planning-runtime-product:candidate:"))
      .map((entry) => entry.slice("planning-runtime-product:candidate:".length)),
  );
  const reads = unique(
    evidence
      .filter((entry) => entry.startsWith("planning-runtime-product:read-reason:"))
      .map((entry) => entry.slice("planning-runtime-product:read-reason:".length)),
  );
  const proposal =
    markerValue(evidence, "planning-runtime-product:proposal-preparation:") ??
    "not-proven";
  return {
    id: input.taskCase.id,
    type: input.taskCase.type,
    task: input.taskCase.task,
    productPath: evidence.includes("planning-runtime-product:path:runMvpIntegratedFlow"),
    candidates,
    reads,
    analysis: extractLineValue(finalOutput, "Confidence:") ?? "not-proven",
    plan: extractExecutablePlanSummary(finalOutput) ?? "not-proven",
    handoff: extractLineValue(finalOutput, "Handoff state:"),
    readiness: extractLineValue(finalOutput, "Readiness:"),
    proposal,
    provider: evidence.includes("provider-called=true") ? "called" : "not-run",
    anchor: extractLineValue(finalOutput, "Anchor state:"),
    confirmation: extractLineValue(finalOutput, "Explicit confirmation:"),
    apply: extractLineValue(finalOutput, "Apply state:"),
    verification: extractLineValue(finalOutput, "Readback verification:"),
    command: extractLineValue(finalOutput, "Verification command:"),
    commandDispatch: extractLineValue(finalOutput, "Verification command dispatch:"),
    repair: markerValue(evidence, "planning-runtime-product-repair:state:") ?? "not-proven",
    terminal: extractLineValue(finalOutput, "Terminal result:"),
    changedFiles: input.result.codingResult?.changedFiles ?? [],
    blocker: input.result.codingResult?.failedFiles[0]?.reason ?? "none",
    failures: [],
  };
}

function validateReport(input: {
  readonly taskCase: TaskCase;
  readonly report: TaskReport;
}): readonly string[] {
  const failures: string[] = [];
  const expected = input.taskCase.expected;
  if (!input.report.productPath) failures.push("productPath=false");
  for (const candidate of expected.candidateIncludes ?? []) {
    if (!input.report.candidates.includes(candidate)) {
      failures.push(`missing candidate ${candidate}`);
    }
  }
  for (const read of expected.readIncludes ?? []) {
    if (!input.report.reads.includes(read)) {
      failures.push(`missing read ${read}`);
    }
  }
  compareOptional("handoff", input.report.handoff, expected.handoff, failures);
  compareOptional("proposal", input.report.proposal, expected.proposal, failures);
  compareOptional("anchor", input.report.anchor, expected.anchor, failures);
  compareOptional("confirmation", input.report.confirmation, expected.confirmation, failures);
  compareOptional("apply", input.report.apply, expected.apply, failures);
  compareOptional("readback", input.report.verification, expected.readback, failures);
  compareOptional("command", input.report.command, expected.command, failures);
  compareOptional("commandDispatch", input.report.commandDispatch, expected.commandDispatch, failures);
  compareOptional("repair", input.report.repair, expected.repair, failures);
  if (expected.blockerIncludes && !input.report.blocker.includes(expected.blockerIncludes)) {
    failures.push(`blocker=${input.report.blocker}`);
  }
  if (expected.changedFiles) {
    for (const file of expected.changedFiles) {
      if (!input.report.changedFiles.includes(file)) {
        failures.push(`missing changed file ${file}`);
      }
    }
  }
  if (input.taskCase.workspace === "current-repo" && input.report.changedFiles.length > 0) {
    failures.push(`current repo changed files reported: ${input.report.changedFiles.join(",")}`);
  }
  if (input.taskCase.workspace === "current-repo" && input.report.provider !== "not-run") {
    failures.push("current repo provider called");
  }
  return failures;
}

async function seedVerificationFixture(id: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(testRoot, `${id}-`));
  await fs.mkdir(path.join(root, "src", "planning"), { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: id, scripts: { test: "node --version" } }, null, 2),
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
    path.join(root, "src", "planning", "targetRanking.test.ts"),
    "expect(rankPlannerTargets('planner target ranking')).toBe('targetRanking.ts');\n",
  );
  return root;
}

function extractExecutablePlanSummary(output: string): string | undefined {
  const lines = output.split("\n");
  const index = lines.findIndex((line) => line === "Executable plan:");
  if (index < 0) return undefined;
  return lines[index + 1]?.replace(/^Summary:\s*/, "");
}

function extractLineValue(output: string, label: string): string | null {
  const line = output.split("\n").find((entry) => entry.startsWith(label));
  return line ? line.slice(label.length).trim() : null;
}

function markerValue(evidence: readonly string[], prefix: string): string | undefined {
  return evidence.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
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

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
