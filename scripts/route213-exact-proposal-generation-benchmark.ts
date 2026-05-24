#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runMvpIntegratedFlow } from "../packages/ts-shell/src/orchestration/runMvpIntegratedFlow.js";
import type { PlanningRuntimeProductExecutionOptions } from "../packages/ts-shell/src/orchestration/planningRuntimeProductExecution.js";

type ProductResult = Awaited<ReturnType<typeof runMvpIntegratedFlow>>;

interface TaskCase {
  readonly id: string;
  readonly task: string;
  readonly workspace: "current-repo" | "fixture";
  readonly execution?: PlanningRuntimeProductExecutionOptions;
  readonly escalationDecision?: "allow-once" | "deny";
  readonly expected: {
    readonly proposal: string;
    readonly proposalSource?: string;
    readonly anchor: string;
    readonly confirmation: string;
    readonly apply: string;
    readonly readback: string;
    readonly command: string;
    readonly commandDispatch: string;
    readonly terminal: string;
    readonly provider: string;
    readonly changedFiles?: readonly string[];
    readonly evidenceIncludes?: readonly string[];
  };
}

interface TaskReport {
  readonly id: string;
  readonly productPath: boolean;
  readonly proposal: string;
  readonly proposalSource: string | null;
  readonly provider: string;
  readonly anchor: string | null;
  readonly confirmation: string | null;
  readonly apply: string | null;
  readonly readback: string | null;
  readonly command: string | null;
  readonly commandDispatch: string | null;
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
const auditRoot = await fs.mkdtemp(path.join(testRoot, "route213-audit-"));
process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH = path.join(
  auditRoot,
  ".sisyphus",
  "audit",
  "permissions.jsonl",
);

const cases: readonly TaskCase[] = [
  {
    id: "route212-vague-bugfix-now-exact",
    task: "Fix planning runtime product output so confirmed apply results do not still look review-only",
    workspace: "current-repo",
    expected: {
      proposal: "prepared-exact",
      proposalSource: "planning-runtime-deterministic",
      anchor: "exact-ready",
      confirmation: "not-confirmed",
      apply: "not-run",
      readback: "not-run",
      command: "not-requested",
      commandDispatch: "not-run",
      terminal: "confirmation-required",
      provider: "not-run",
      evidenceIncludes: [
        "planning-exact-proposal:prepared-exact",
        "planning-exact-proposal:raw-content-excluded",
        "planning-runtime-product-proposal:manual-json:not-required",
      ],
    },
  },
  {
    id: "route212-feature-output-now-exact",
    task: "Improve repair loop result reporting so task results include provider anchor apply verification and repair status",
    workspace: "current-repo",
    expected: {
      proposal: "prepared-exact",
      proposalSource: "planning-runtime-deterministic",
      anchor: "exact-ready",
      confirmation: "not-confirmed",
      apply: "not-run",
      readback: "not-run",
      command: "not-requested",
      commandDispatch: "not-run",
      terminal: "confirmation-required",
      provider: "not-run",
      evidenceIncludes: [
        "planning-exact-proposal:prepared-exact",
        "planning-runtime-product-proposal:provider-called:false",
      ],
    },
  },
  {
    id: "fixture-confirmed-controlled-apply-verifies",
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
      proposal: "prepared-exact",
      proposalSource: "planning-runtime-deterministic",
      anchor: "exact-ready",
      confirmation: "trusted-confirmed",
      apply: "single-target-applied",
      readback: "succeeded",
      command: "passed",
      commandDispatch: "existing-tool-runtime",
      terminal: "verification-succeeded",
      provider: "not-run",
      changedFiles: ["src/planning/targetRanking.ts"],
      evidenceIncludes: [
        "planning-mutation-proof-handoff:existing-backend-consumed",
        "planning-mutation-proof-handoff:no-new-writer",
        "planning-mutation-proof-handoff:no-fuzzy-apply",
        "planning-mutation-proof-verification:file:src/planning/targetRanking.ts:readback:passed",
      ],
    },
  },
  {
    id: "fixture-live-opt-in-config-failed",
    task: "Fix the planner target ranking bug and cover the adjacent test",
    workspace: "fixture",
    execution: {
      liveProviderProposal: { optIn: true, source: "benchmark" },
    },
    expected: {
      proposal: "live-provider-config-failed",
      proposalSource: "none",
      anchor: "missing-exact-mapping",
      confirmation: "not-confirmed",
      apply: "not-run",
      readback: "not-run",
      command: "not-requested",
      commandDispatch: "not-run",
      terminal: "provider-unavailable",
      provider: "not-run",
      evidenceIncludes: [
        "planning-runtime-product-proposal:live-provider-status:CONFIG-FAILED",
        "planning-runtime-product-proposal:live-provider-primary:not-run",
        "planning-runtime-product-proposal:raw-provider-output-excluded",
      ],
    },
  },
  {
    id: "unsupported-unmatched-target-review-only",
    task: "Fix provider proposal quality so live proposals classify review-only output correctly",
    workspace: "current-repo",
    expected: {
      proposal: "review-only",
      proposalSource: "none",
      anchor: "missing-exact-mapping",
      confirmation: "not-confirmed",
      apply: "not-run",
      readback: "not-run",
      command: "not-requested",
      commandDispatch: "not-run",
      terminal: "review-required",
      provider: "not-run",
      evidenceIncludes: [
        "planning-runtime-product-proposal:deterministic:no-exact-proposal",
      ],
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
    route: "213",
    gate: "route213-exact-proposal-generation-benchmark",
    beforeBlocker: "review-only/missing-exact-mapping",
    afterBlocker: "exact-ready/confirmation-required for bounded product tasks",
    providerStatus: "explicit-opt-in-config-failed-in-default-benchmark",
    realProviderTouched: false,
    defaultProvider: "not-run",
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
  console.log("[pass] route213-exact-proposal-generation-benchmark");
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
      sessionId: `sess_route213_${taskCase.id.replace(/[^a-z0-9_]/gi, "_")}`,
      prompt: taskCase.task,
      workspaceRoot,
      escalationDecision: taskCase.escalationDecision ?? "deny",
      providerMode: "synthetic",
      maxTurns: 4,
      ...(taskCase.execution ? { planningMutationExecution: taskCase.execution } : {}),
    });
    const report = projectReport({ id: taskCase.id, result });
    return {
      ...report,
      failures: validateReport({ taskCase, report, evidence: result.codingResult?.evidence ?? [] }),
    };
  } finally {
    if (taskCase.workspace === "fixture") {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  }
}

function projectReport(input: {
  readonly id: string;
  readonly result: ProductResult;
}): TaskReport {
  const result = input.result;
  const finalOutput = result.finalOutput ?? "";
  const evidence = result.codingResult?.evidence ?? [];
  const proposal =
    markerValue(evidence, "planning-runtime-product:proposal-preparation:") ??
    "not-proven";
  return {
    id: input.id,
    productPath: evidence.includes("planning-runtime-product:path:runMvpIntegratedFlow"),
    proposal,
    proposalSource: extractLineValue(finalOutput, "Product proposal source:"),
    provider: evidence.includes("provider-called=true") ? "called" : "not-run",
    anchor: extractLineValue(finalOutput, "Anchor state:"),
    confirmation: extractLineValue(finalOutput, "Explicit confirmation:"),
    apply: extractLineValue(finalOutput, "Apply state:"),
    readback: extractLineValue(finalOutput, "Readback verification:"),
    command: extractLineValue(finalOutput, "Verification command:"),
    commandDispatch: extractLineValue(finalOutput, "Verification command dispatch:"),
    terminal: extractLineValue(finalOutput, "Terminal result:"),
    changedFiles: result.codingResult?.changedFiles ?? [],
    blocker: result.codingResult?.failedFiles[0]?.reason ?? "none",
    failures: [],
  };
}

function validateReport(input: {
  readonly taskCase: TaskCase;
  readonly report: TaskReport;
  readonly evidence: readonly string[];
}): readonly string[] {
  const failures: string[] = [];
  const expected = input.taskCase.expected;
  if (!input.report.productPath) failures.push("productPath=false");
  compare("proposal", input.report.proposal, expected.proposal, failures);
  if (expected.proposalSource) {
    compare("proposalSource", input.report.proposalSource, expected.proposalSource, failures);
  }
  compare("provider", input.report.provider, expected.provider, failures);
  compare("anchor", input.report.anchor, expected.anchor, failures);
  compare("confirmation", input.report.confirmation, expected.confirmation, failures);
  compare("apply", input.report.apply, expected.apply, failures);
  compare("readback", input.report.readback, expected.readback, failures);
  compare("command", input.report.command, expected.command, failures);
  compare("commandDispatch", input.report.commandDispatch, expected.commandDispatch, failures);
  compare("terminal", input.report.terminal, expected.terminal, failures);
  if (expected.changedFiles) {
    compare(
      "changedFiles",
      input.report.changedFiles.join(","),
      expected.changedFiles.join(","),
      failures,
    );
  } else if (input.report.changedFiles.length > 0) {
    failures.push(`unexpectedChangedFiles=${input.report.changedFiles.join(",")}`);
  }
  for (const marker of expected.evidenceIncludes ?? []) {
    if (!input.evidence.includes(marker)) {
      failures.push(`missingEvidence=${marker}`);
    }
  }
  if (
    input.evidence.some((entry) =>
      /api[_-]?key|authorization|bearer|provider\.env/i.test(entry),
    )
  ) {
    failures.push("secret-like-evidence-leak");
  }
  return failures;
}

async function seedVerificationFixture(id: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `route213-${id}-`));
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

function markerValue(evidence: readonly string[], prefix: string): string | null {
  const marker = evidence.find((entry) => entry.startsWith(prefix));
  return marker ? marker.slice(prefix.length) : null;
}

function extractLineValue(output: string, label: string): string | null {
  const line = output.split(/\r?\n/).find((entry) => entry.startsWith(label));
  if (!line) return null;
  return line.slice(label.length).trim();
}

function compare(
  label: string,
  actual: string | null,
  expected: string,
  failures: string[],
): void {
  if (actual !== expected) {
    failures.push(`${label}=${actual ?? "null"} expected ${expected}`);
  }
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
