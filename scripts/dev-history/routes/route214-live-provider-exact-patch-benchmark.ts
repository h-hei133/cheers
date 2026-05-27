#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runMvpIntegratedFlow } from "../../../packages/ts-shell/src/orchestration/runMvpIntegratedFlow.js";
import type { PlanningRuntimeProductExecutionOptions } from "../../../packages/ts-shell/src/orchestration/planningRuntimeProductExecution.js";
import type { ProviderEditRawProposal } from "../../../packages/ts-shell/src/orchestration/providerEditProposal.js";

type ProductResult = Awaited<ReturnType<typeof runMvpIntegratedFlow>>;

interface TaskCase {
  readonly id: string;
  readonly workspace: "single" | "duplicate";
  readonly execution?: PlanningRuntimeProductExecutionOptions;
  readonly escalationDecision?: "allow-once" | "deny";
  readonly expected: {
    readonly proposal: string;
    readonly classification: string;
    readonly anchor: string | null;
    readonly terminal: string | null;
    readonly apply: string | null;
    readonly provider: "called" | "not-run";
    readonly changedFiles?: readonly string[];
  };
}

interface TaskReport {
  readonly id: string;
  readonly provider: "called" | "not-run";
  readonly proposal: string;
  readonly classification: string;
  readonly primaryStatus: string;
  readonly fallbackStatus: string;
  readonly anchor: string | null;
  readonly terminal: string | null;
  readonly apply: string | null;
  readonly readback: string | null;
  readonly commandDispatch: string;
  readonly changedFiles: readonly string[];
  readonly failures: readonly string[];
}

const originalDaemonEnabled = process.env.DAEMON_ENABLED;
const originalAuditLogPath = process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH;
process.env.DAEMON_ENABLED = "0";

const testRoot = process.env.PRIVATE_AGENTS_TEST_ROOT?.trim() ||
  path.join(os.tmpdir(), "private-agents-test");
await fs.mkdir(testRoot, { recursive: true });
const auditRoot = await fs.mkdtemp(path.join(testRoot, "route214-audit-"));
process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH = path.join(
  auditRoot,
  ".sisyphus",
  "audit",
  "permissions.jsonl",
);

const targetPath = "src/planning/targetRanking.ts";
const oldText = "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';";
const newText = "  return task.trim().includes('planner') ? 'targetRanking.ts' : 'unknown';";

const cases: readonly TaskCase[] = [
  {
    id: "default-no-provider-no-apply",
    workspace: "single",
    expected: {
      proposal: "prepared-exact",
      classification: "not-run",
      anchor: "exact-ready",
      terminal: "confirmation-required",
      apply: "not-run",
      provider: "not-run",
    },
  },
  {
    id: "fake-live-exact-ready",
    workspace: "single",
    execution: liveExecution(() => exactProposal()),
    expected: {
      proposal: "prepared-exact",
      classification: "exact-ready",
      anchor: "exact-ready",
      terminal: "confirmation-required",
      apply: "not-run",
      provider: "called",
    },
  },
  {
    id: "fake-live-invalid-format",
    workspace: "single",
    execution: liveExecution(() => ({ operationKind: "generated-replacement" })),
    expected: {
      proposal: "live-provider-invalid-format",
      classification: "invalid-format",
      anchor: "missing-exact-mapping",
      terminal: "review-only",
      apply: "not-run",
      provider: "called",
    },
  },
  {
    id: "fake-live-target-mismatch",
    workspace: "single",
    execution: liveExecution(() => ({
      operationKind: "exact-fenced-replacement",
      targets: [{ path: "src/other.ts", oldText: "old", newText: "new" }],
    })),
    expected: {
      proposal: "live-provider-target-mismatch",
      classification: "target-mismatch",
      anchor: "missing-exact-mapping",
      terminal: "review-only",
      apply: "not-run",
      provider: "called",
    },
  },
  {
    id: "fake-live-old-text-not-found",
    workspace: "single",
    execution: liveExecution(() => ({
      operationKind: "exact-fenced-replacement",
      targets: [{ path: targetPath, oldText: "missing old text", newText: "replacement" }],
    })),
    expected: {
      proposal: "live-provider-old-text-not-found",
      classification: "old-text-not-found",
      anchor: "missing-exact-mapping",
      terminal: "review-only",
      apply: "not-run",
      provider: "called",
    },
  },
  {
    id: "fake-live-old-text-multiple-matches",
    workspace: "duplicate",
    execution: liveExecution(() => exactProposal()),
    expected: {
      proposal: "live-provider-old-text-multiple-matches",
      classification: "old-text-multiple-matches",
      anchor: "missing-exact-mapping",
      terminal: "review-only",
      apply: "not-run",
      provider: "called",
    },
  },
  {
    id: "fake-live-confirmed-apply-verifies",
    workspace: "single",
    escalationDecision: "allow-once",
    execution: {
      ...liveExecution(() => exactProposal()),
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
      classification: "exact-ready",
      anchor: "exact-ready",
      terminal: "verified",
      apply: "single-target-applied",
      provider: "called",
      changedFiles: [targetPath],
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
    route: "214",
    gate: "route214-live-provider-exact-patch-contract",
    baselineReviewOnlyCause:
      "live provider prompt/parser accepted review-only target summaries without requiring exact oldText/newText",
    contract:
      "single target exact patch JSON targetFile/oldText/newText/reason/verificationHint or explicit review-only reason",
    rawProviderOutput: "excluded",
    realProviderTouched: false,
    defaultProvider: "not-run",
    defaultApply: "not-run",
    defaultCommandDispatch: "not-run",
    reports,
  }, null, 2));
  if (failures.length > 0) {
    for (const failure of failures) console.log(`[fail] ${failure}`);
    process.exit(1);
  }
  console.log("[pass] route214-live-provider-exact-patch-contract");
} finally {
  await fs.rm(auditRoot, { recursive: true, force: true });
  restoreEnv("DAEMON_ENABLED", originalDaemonEnabled);
  restoreEnv("PRIVATE_AGENTS_AUDIT_LOG_PATH", originalAuditLogPath);
}

async function runTaskCase(taskCase: TaskCase): Promise<TaskReport> {
  const workspaceRoot = await seedWorkspace(taskCase.workspace);
  try {
    const before = await snapshotWorkspace(workspaceRoot);
    const result = await runMvpIntegratedFlow({
      sessionId: `sess_route214_${taskCase.id.replace(/[^a-z0-9_]/gi, "_")}`,
      prompt: "Fix the planner target ranking bug and cover the adjacent test",
      workspaceRoot,
      escalationDecision: taskCase.escalationDecision ?? "deny",
      providerMode: "synthetic",
      maxTurns: 4,
      ...(taskCase.execution ? { planningMutationExecution: taskCase.execution } : {}),
    });
    const after = await snapshotWorkspace(workspaceRoot);
    const report = projectReport({
      id: taskCase.id,
      result,
      changedFiles: diffSnapshots(before, after),
    });
    return {
      ...report,
      failures: validateReport(report, taskCase.expected),
    };
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

function projectReport(input: {
  readonly id: string;
  readonly result: ProductResult;
  readonly changedFiles: readonly string[];
}): TaskReport {
  const evidence = input.result.codingResult?.evidence ?? [];
  const finalOutput = input.result.finalOutput ?? "";
  return {
    id: input.id,
    provider: evidence.includes("provider-called=true") ? "called" : "not-run",
    proposal: markerValue(evidence, "planning-runtime-product-proposal:status:") ?? "not-proven",
    classification:
      markerValue(evidence, "planning-runtime-product-proposal:live-provider-exact-classification:") ??
      terminalClassToRoute214Classification(
        markerValue(evidence, "planning-runtime-product-proposal:live-provider-status:"),
      ),
    primaryStatus:
      markerValue(evidence, "planning-runtime-product-proposal:live-provider-primary:status:") ??
      "not-run",
    fallbackStatus:
      markerValue(evidence, "planning-runtime-product-proposal:live-provider-fallback:status:") ??
      (evidence.includes("planning-runtime-product-proposal:live-provider-fallback:provider-called:true")
        ? "provider-called"
        : "not-run"),
    anchor: extractLineValue(finalOutput, "Anchor state:"),
    terminal: extractLineValue(finalOutput, "Loop verdict:"),
    apply: extractLineValue(finalOutput, "Apply state:"),
    readback: extractLineValue(finalOutput, "Readback state:"),
    commandDispatch:
      markerValue(evidence, "planning-runtime-product-verification-command:dispatch:") ??
      "not-run",
    changedFiles: input.changedFiles,
    failures: [],
  };
}

function validateReport(
  report: TaskReport,
  expected: TaskCase["expected"],
): readonly string[] {
  const failures: string[] = [];
  if (report.provider !== expected.provider) failures.push(`provider=${report.provider}`);
  if (report.proposal !== expected.proposal) failures.push(`proposal=${report.proposal}`);
  if (report.classification !== expected.classification) {
    failures.push(`classification=${report.classification}`);
  }
  if (report.anchor !== expected.anchor) failures.push(`anchor=${report.anchor}`);
  if (report.terminal !== expected.terminal) failures.push(`terminal=${report.terminal}`);
  if (report.apply !== expected.apply) failures.push(`apply=${report.apply}`);
  const expectedChanged = expected.changedFiles ?? [];
  if (report.changedFiles.join(",") !== expectedChanged.join(",")) {
    failures.push(`changedFiles=${report.changedFiles.join(",")}`);
  }
  if (report.commandDispatch !== "not-run" && report.terminal !== "verified") {
    failures.push(`commandDispatch=${report.commandDispatch}`);
  }
  return failures;
}

function liveExecution(
  proposeEdit: () => ProviderEditRawProposal,
): PlanningRuntimeProductExecutionOptions {
  return {
    liveProviderProposal: {
      optIn: true,
      source: "benchmark",
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
          provider: { proposeEdit },
        },
      ],
      fallbackPolicy: {
        enabled: false,
        reason: "single fake provider benchmark attempt",
      },
    },
  };
}

async function seedWorkspace(kind: "single" | "duplicate"): Promise<string> {
  const root = await fs.mkdtemp(path.join(testRoot, "route214-workspace-"));
  await fs.mkdir(path.join(root, "src", "planning"), { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "route214-live-provider-exact-patch-contract" }, null, 2),
  );
  await fs.writeFile(
    path.join(root, targetPath),
    [
      "export function rankPlannerTargets(task: string) {",
      oldText,
      ...(kind === "duplicate" ? [oldText] : []),
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

async function snapshotWorkspace(root: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  await walk(root, root, snapshot);
  return snapshot;
}

async function walk(root: string, current: string, snapshot: Map<string, string>): Promise<void> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".sisyphus") continue;
    const absolutePath = path.join(current, entry.name);
    const relativePath = path.relative(root, absolutePath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      await walk(root, absolutePath, snapshot);
    } else if (entry.isFile()) {
      snapshot.set(relativePath, await fs.readFile(absolutePath, "utf8"));
    }
  }
}

function diffSnapshots(before: Map<string, string>, after: Map<string, string>): readonly string[] {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return Array.from(keys).filter((key) => before.get(key) !== after.get(key)).sort();
}

function exactProposal(): ProviderEditRawProposal {
  return {
    operationKind: "exact-fenced-replacement",
    targets: [
      {
        path: targetPath,
        oldText,
        newText,
      },
    ],
    verificationPlan: ["readback verifies planner target ranking trims input"],
  };
}

function markerValue(evidence: readonly string[], prefix: string): string | undefined {
  return evidence.filter((entry) => entry.startsWith(prefix)).at(-1)?.slice(prefix.length);
}

function terminalClassToRoute214Classification(value: string | undefined): string {
  switch (value) {
    case "INVALID-FORMAT":
      return "invalid-format";
    case "TARGET-MISMATCH":
      return "target-mismatch";
    case "OLD-TEXT-NOT-FOUND":
      return "old-text-not-found";
    case "OLD-TEXT-MULTIPLE-MATCHES":
      return "old-text-multiple-matches";
    case "NETWORK-BLOCKED":
      return "network-blocked";
    case "AUTH-FAILED":
      return "auth-failed";
    case "CONFIG-FAILED":
      return "config-failed";
    case "provider-called":
      return "review-only";
    default:
      return "not-run";
  }
}

function extractLineValue(output: string, label: string): string | null {
  const line = output.split("\n").find((entry) => entry.startsWith(label));
  return line ? line.slice(label.length).trim() : null;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
