#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runMvpIntegratedFlow } from "../packages/ts-shell/src/orchestration/runMvpIntegratedFlow.js";
import { parseProviderExactPatchOutput } from "../packages/ts-shell/src/orchestration/providerExactPatchContract.js";
import type { PlanningRuntimeProductExecutionOptions } from "../packages/ts-shell/src/orchestration/planningRuntimeProductExecution.js";
import type { ProviderEditRawProposal } from "../packages/ts-shell/src/orchestration/providerEditProposal.js";

type ProductResult = Awaited<ReturnType<typeof runMvpIntegratedFlow>>;

interface TaskCase {
  readonly id: string;
  readonly workspace: "single" | "duplicate";
  readonly execution?: PlanningRuntimeProductExecutionOptions;
  readonly escalationDecision?: "allow-once" | "deny";
  readonly expected: {
    readonly provider: "called" | "not-run";
    readonly proposal: string;
    readonly classification: string;
    readonly parseStatus: string;
    readonly wrapperKind: string;
    readonly outputShapeKind: string;
    readonly apply: string | null;
    readonly terminal: string | null;
    readonly readback?: string;
    readonly changedFiles?: readonly string[];
  };
}

interface TaskReport {
  readonly id: string;
  readonly provider: "called" | "not-run";
  readonly proposal: string;
  readonly classification: string;
  readonly parseStatus: string;
  readonly wrapperKind: string;
  readonly outputShapeKind: string;
  readonly targetMatched: string;
  readonly oldTextPresent: string;
  readonly newTextPresent: string;
  readonly oldTextLength: string;
  readonly newTextLength: string;
  readonly primaryStatus: string;
  readonly fallbackStatus: string;
  readonly apply: string | null;
  readonly terminal: string | null;
  readonly readback: string | null;
  readonly commandDispatch: string;
  readonly changedFiles: readonly string[];
  readonly failures: readonly string[];
}

interface ParserCase {
  readonly id: string;
  readonly text: string;
  readonly explicitTargets: readonly string[];
  readonly expected: {
    readonly ok: boolean;
    readonly status: string;
    readonly wrapperKind: string;
    readonly outputShapeKind: string;
    readonly targetCandidateCount?: number;
  };
}

const originalDaemonEnabled = process.env.DAEMON_ENABLED;
const originalAuditLogPath = process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH;
process.env.DAEMON_ENABLED = "0";

const testRoot = process.env.PRIVATE_AGENTS_TEST_ROOT?.trim() ||
  path.join(os.tmpdir(), "private-agents-test");
await fs.mkdir(testRoot, { recursive: true });
const auditRoot = await fs.mkdtemp(path.join(testRoot, "route215-audit-"));
process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH = path.join(
  auditRoot,
  ".sisyphus",
  "audit",
  "permissions.jsonl",
);

const targetPath = "src/planning/targetRanking.ts";
const oldText = "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';";
const newText = "  return task.trim().includes('planner') ? 'targetRanking.ts' : 'unknown';";

const parserCases: readonly ParserCase[] = [
  {
    id: "exact-json",
    text: exactJsonText(),
    explicitTargets: [targetPath],
    expected: { ok: true, status: "exact-patch", wrapperKind: "json", outputShapeKind: "exact-json" },
  },
  {
    id: "markdown-json",
    text: markdownJsonText(),
    explicitTargets: [targetPath],
    expected: { ok: true, status: "recovered-exact-patch", wrapperKind: "markdown-json", outputShapeKind: "exact-json" },
  },
  {
    id: "existing-proposal-json",
    text: providerProposalText("targetRanking.ts"),
    explicitTargets: [targetPath],
    expected: { ok: true, status: "recovered-exact-patch", wrapperKind: "json", outputShapeKind: "provider-proposal-json" },
  },
  {
    id: "simple-single-file-diff",
    text: diffText(),
    explicitTargets: [targetPath],
    expected: { ok: true, status: "recovered-exact-patch", wrapperKind: "diff", outputShapeKind: "diff" },
  },
  {
    id: "unsafe-multiple-hunk-diff",
    text: unsafeDiffText(),
    explicitTargets: [targetPath],
    expected: { ok: false, status: "invalid-format", wrapperKind: "diff", outputShapeKind: "diff" },
  },
  {
    id: "ambiguous-target-variant",
    text: exactJsonText("targetRanking.ts"),
    explicitTargets: [targetPath, "test/targetRanking.ts"],
    expected: {
      ok: false,
      status: "target-mismatch",
      wrapperKind: "json",
      outputShapeKind: "exact-json",
      targetCandidateCount: 2,
    },
  },
];

const taskCases: readonly TaskCase[] = [
  {
    id: "default-no-provider-no-apply",
    workspace: "single",
    expected: {
      provider: "not-run",
      proposal: "prepared-exact",
      classification: "not-run",
      parseStatus: "not-run",
      wrapperKind: "not-run",
      outputShapeKind: "not-run",
      apply: "not-run",
      terminal: "confirmation-required",
    },
  },
  {
    id: "fake-live-markdown-json-recovered-exact-ready",
    workspace: "single",
    execution: liveExecution(() => mustParse(markdownJsonText())),
    expected: {
      provider: "called",
      proposal: "prepared-exact",
      classification: "recovered-exact-ready",
      parseStatus: "recovered-exact-patch",
      wrapperKind: "markdown-json",
      outputShapeKind: "exact-json",
      apply: "not-run",
      terminal: "confirmation-required",
    },
  },
  {
    id: "fake-live-existing-proposal-recovered-exact-ready",
    workspace: "single",
    execution: liveExecution(() => mustParse(providerProposalText("targetRanking.ts"))),
    expected: {
      provider: "called",
      proposal: "prepared-exact",
      classification: "recovered-exact-ready",
      parseStatus: "recovered-exact-patch",
      wrapperKind: "json",
      outputShapeKind: "provider-proposal-json",
      apply: "not-run",
      terminal: "confirmation-required",
    },
  },
  {
    id: "fake-live-diff-recovered-exact-ready",
    workspace: "single",
    execution: liveExecution(() => mustParse(diffText())),
    expected: {
      provider: "called",
      proposal: "prepared-exact",
      classification: "recovered-exact-ready",
      parseStatus: "recovered-exact-patch",
      wrapperKind: "diff",
      outputShapeKind: "diff",
      apply: "not-run",
      terminal: "confirmation-required",
    },
  },
  {
    id: "fake-live-old-text-not-found",
    workspace: "single",
    execution: liveExecution(() => ({
      ...mustParse(diffText()),
      targets: [{ path: targetPath, oldText: "missing exact old anchor", newText }],
    })),
    expected: {
      provider: "called",
      proposal: "live-provider-old-text-not-found",
      classification: "old-text-not-found",
      parseStatus: "recovered-exact-patch",
      wrapperKind: "diff",
      outputShapeKind: "diff",
      apply: "not-run",
      terminal: "review-only",
    },
  },
  {
    id: "fake-live-old-text-multiple-matches",
    workspace: "duplicate",
    execution: liveExecution(() => mustParse(markdownJsonText())),
    expected: {
      provider: "called",
      proposal: "live-provider-old-text-multiple-matches",
      classification: "old-text-multiple-matches",
      parseStatus: "recovered-exact-patch",
      wrapperKind: "markdown-json",
      outputShapeKind: "exact-json",
      apply: "not-run",
      terminal: "review-only",
    },
  },
  {
    id: "fake-live-recovered-exact-confirmed-apply-verifies",
    workspace: "single",
    escalationDecision: "allow-once",
    execution: {
      ...liveExecution(() => mustParse(diffText())),
      confirmation: { state: "trusted-confirmed" },
      controlledWorkspace: { scope: "controlled-temp-workspace", source: "benchmark" },
    },
    expected: {
      provider: "called",
      proposal: "prepared-exact",
      classification: "recovered-exact-ready",
      parseStatus: "recovered-exact-patch",
      wrapperKind: "diff",
      outputShapeKind: "diff",
      apply: "single-target-applied",
      terminal: "verified",
      readback: "succeeded",
      changedFiles: [targetPath],
    },
  },
];

try {
  const parserReports = parserCases.map(runParserCase);
  const taskReports: TaskReport[] = [];
  for (const taskCase of taskCases) {
    taskReports.push(await runTaskCase(taskCase));
  }
  const failures = [
    ...parserReports.flatMap((report) => report.failures.map((failure) => `${report.id}: ${failure}`)),
    ...taskReports.flatMap((report) => report.failures.map((failure) => `${report.id}: ${failure}`)),
  ];

  console.log(JSON.stringify({
    route: "215",
    gate: "route215-live-provider-patch-diagnostics-recovery",
    safeDiagnostics: "shape/status/count/length markers only",
    rawProviderOutput: "excluded",
    oldTextPrinted: false,
    newTextPrinted: false,
    realProviderTouched: false,
    defaultProvider: "not-run",
    defaultApply: "not-run",
    defaultCommandDispatch: "not-run",
    parserReports,
    taskReports,
  }, null, 2));
  if (failures.length > 0) {
    for (const failure of failures) console.log(`[fail] ${failure}`);
    process.exit(1);
  }
  console.log("[pass] route215-live-provider-patch-diagnostics-recovery");
} finally {
  await fs.rm(auditRoot, { recursive: true, force: true });
  restoreEnv("DAEMON_ENABLED", originalDaemonEnabled);
  restoreEnv("PRIVATE_AGENTS_AUDIT_LOG_PATH", originalAuditLogPath);
}

function runParserCase(taskCase: ParserCase): {
  readonly id: string;
  readonly ok: boolean;
  readonly status: string;
  readonly wrapperKind: string;
  readonly outputShapeKind: string;
  readonly targetMatched: boolean;
  readonly targetCandidateCount: number;
  readonly oldTextPresent: boolean;
  readonly newTextPresent: boolean;
  readonly rawContentExcluded: boolean;
  readonly failures: readonly string[];
} {
  const result = parseProviderExactPatchOutput({
    text: taskCase.text,
    explicitTargetLabels: taskCase.explicitTargets,
  });
  const report = {
    id: taskCase.id,
    ok: result.ok,
    status: result.status,
    wrapperKind: result.diagnostics.wrapperKind,
    outputShapeKind: result.diagnostics.outputShapeKind,
    targetMatched: result.diagnostics.targetMatched,
    targetCandidateCount: result.diagnostics.targetCandidateCount,
    oldTextPresent: result.diagnostics.oldTextPresent,
    newTextPresent: result.diagnostics.newTextPresent,
    rawContentExcluded: result.evidence.includes("provider-exact-patch-contract:raw-content-excluded"),
    failures: [] as string[],
  };
  if (report.ok !== taskCase.expected.ok) report.failures.push(`ok=${report.ok}`);
  if (report.status !== taskCase.expected.status) report.failures.push(`status=${report.status}`);
  if (report.wrapperKind !== taskCase.expected.wrapperKind) report.failures.push(`wrapper=${report.wrapperKind}`);
  if (report.outputShapeKind !== taskCase.expected.outputShapeKind) report.failures.push(`shape=${report.outputShapeKind}`);
  if (
    taskCase.expected.targetCandidateCount !== undefined &&
    report.targetCandidateCount !== taskCase.expected.targetCandidateCount
  ) {
    report.failures.push(`targetCandidateCount=${report.targetCandidateCount}`);
  }
  if (!report.rawContentExcluded) report.failures.push("raw-content-excluded=false");
  return report;
}

async function runTaskCase(taskCase: TaskCase): Promise<TaskReport> {
  const workspaceRoot = await seedWorkspace(taskCase.workspace);
  try {
    const before = await snapshotWorkspace(workspaceRoot);
    const result = await runMvpIntegratedFlow({
      sessionId: `sess_route215_${taskCase.id.replace(/[^a-z0-9_]/gi, "_")}`,
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
      failures: validateTaskReport(report, taskCase.expected),
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
      terminalClassToRoute215Classification(
        markerValue(evidence, "planning-runtime-product-proposal:live-provider-status:"),
      ),
    parseStatus: markerValue(evidence, "provider-exact-patch-diagnostic:parse-status:") ?? "not-run",
    wrapperKind: markerValue(evidence, "provider-exact-patch-diagnostic:wrapper:") ?? "not-run",
    outputShapeKind: markerValue(evidence, "provider-exact-patch-diagnostic:shape:") ?? "not-run",
    targetMatched: markerValue(evidence, "provider-exact-patch-diagnostic:target-matched:") ?? "not-run",
    oldTextPresent: markerValue(evidence, "provider-exact-patch-diagnostic:old-text-present:") ?? "not-run",
    newTextPresent: markerValue(evidence, "provider-exact-patch-diagnostic:new-text-present:") ?? "not-run",
    oldTextLength: markerValue(evidence, "provider-exact-patch-diagnostic:old-text-length:") ?? "not-run",
    newTextLength: markerValue(evidence, "provider-exact-patch-diagnostic:new-text-length:") ?? "not-run",
    primaryStatus:
      markerValue(evidence, "planning-runtime-product-proposal:live-provider-primary:status:") ??
      (evidence.includes("planning-runtime-product-proposal:live-provider-primary:provider-called:true")
        ? "provider-called"
        : "not-run"),
    fallbackStatus:
      markerValue(evidence, "planning-runtime-product-proposal:live-provider-fallback:status:") ??
      (evidence.includes("planning-runtime-product-proposal:live-provider-fallback:provider-called:true")
        ? "provider-called"
        : "not-run"),
    apply: extractLineValue(finalOutput, "Apply state:"),
    terminal: extractLineValue(finalOutput, "Loop verdict:"),
    readback:
      markerValue(evidence, "planning-runtime-product:proof-verification:") ??
      extractLineValue(finalOutput, "Readback verification:") ??
      extractLineValue(finalOutput, "Readback state:"),
    commandDispatch:
      markerValue(evidence, "planning-runtime-product-verification-command:dispatch:") ??
      "not-run",
    changedFiles: input.changedFiles,
    failures: [],
  };
}

function validateTaskReport(
  report: TaskReport,
  expected: TaskCase["expected"],
): readonly string[] {
  const failures: string[] = [];
  if (report.provider !== expected.provider) failures.push(`provider=${report.provider}`);
  if (report.proposal !== expected.proposal) failures.push(`proposal=${report.proposal}`);
  if (report.classification !== expected.classification) failures.push(`classification=${report.classification}`);
  if (report.parseStatus !== expected.parseStatus) failures.push(`parseStatus=${report.parseStatus}`);
  if (report.wrapperKind !== expected.wrapperKind) failures.push(`wrapper=${report.wrapperKind}`);
  if (report.outputShapeKind !== expected.outputShapeKind) failures.push(`shape=${report.outputShapeKind}`);
  if (report.apply !== expected.apply) failures.push(`apply=${report.apply}`);
  if (report.terminal !== expected.terminal) failures.push(`terminal=${report.terminal}`);
  if (expected.readback !== undefined && report.readback !== expected.readback) {
    failures.push(`readback=${report.readback}`);
  }
  if (report.commandDispatch !== "not-run") failures.push(`commandDispatch=${report.commandDispatch}`);
  const expectedChanged = expected.changedFiles ?? [];
  if (report.changedFiles.join(",") !== expectedChanged.join(",")) {
    failures.push(`changedFiles=${report.changedFiles.join(",")}`);
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

function mustParse(text: string): ProviderEditRawProposal {
  const result = parseProviderExactPatchOutput({
    text,
    explicitTargetLabels: [targetPath],
  });
  if (!result.ok) {
    throw new Error(`fixture parser failed with ${result.status}`);
  }
  return result.rawProposal;
}

function exactJsonText(targetFile = targetPath): string {
  return JSON.stringify({
    targetFile,
    oldText,
    newText,
    reason: "planner target ranking trim",
    verificationHint: "readback target",
  });
}

function markdownJsonText(): string {
  return ["```json", exactJsonText(), "```"].join("\n");
}

function providerProposalText(target = targetPath): string {
  return JSON.stringify({
    operationKind: "exact-fenced-replacement",
    targets: [{ path: target, oldText, newText }],
    confidence: "medium",
    riskSummary: "single target exact replacement",
    verificationPlan: ["readback target"],
  });
}

function diffText(): string {
  return [
    `diff --git a/${targetPath} b/${targetPath}`,
    `--- a/${targetPath}`,
    `+++ b/${targetPath}`,
    "@@ -1,3 +1,3 @@",
    " export function rankPlannerTargets(task: string) {",
    `-${oldText}`,
    `+${newText}`,
    " }",
  ].join("\n");
}

function unsafeDiffText(): string {
  return [
    `--- a/${targetPath}`,
    `+++ b/${targetPath}`,
    "@@ -1 +1 @@",
    "-old",
    "+new",
    "@@ -3 +3 @@",
    "-old2",
    "+new2",
  ].join("\n");
}

async function seedWorkspace(kind: "single" | "duplicate"): Promise<string> {
  const root = await fs.mkdtemp(path.join(testRoot, "route215-workspace-"));
  await fs.mkdir(path.join(root, "src", "planning"), { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "route215-live-provider-patch-diagnostics-recovery" }, null, 2),
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

function markerValue(evidence: readonly string[], prefix: string): string | undefined {
  return evidence.filter((entry) => entry.startsWith(prefix)).at(-1)?.slice(prefix.length);
}

function terminalClassToRoute215Classification(value: string | undefined): string {
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
    case "PROVIDER-ERROR":
    case "FAILED":
      return "provider-error";
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
