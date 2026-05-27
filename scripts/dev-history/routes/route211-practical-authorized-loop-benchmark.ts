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
  readonly seedKind: "planning" | "minimal";
  readonly execution?: PlanningRuntimeProductExecutionOptions;
  readonly escalationDecision?: "allow-once" | "deny";
  readonly expected: {
    readonly productPathUsed: boolean;
    readonly providerState:
      | "default-safe"
      | "CONFIG-FAILED"
      | "NETWORK-BLOCKED"
      | "fake-provider-called"
      | "live-provider-called"
      | "not-proven";
    readonly fallbackState?:
      | "not-run"
      | "enabled-not-called"
      | "fake-fallback-called"
      | "live-fallback-called";
    readonly liveProviderEvidenceSource?: string;
    readonly proposalState?: string;
    readonly proposalSource?: string;
    readonly confirmationState?: string;
    readonly workspaceAuthority?: string;
    readonly applyState?: string;
    readonly verificationState?: string;
    readonly commandState?: string;
    readonly commandDispatch?: string;
    readonly repairState?: string;
    readonly changedFiles?: readonly string[];
    readonly noWorkspaceChanges?: boolean;
  };
}

interface ScenarioReport {
  readonly id: string;
  readonly status: ProductResult["status"];
  readonly productPathUsed: boolean;
  readonly providerState:
    | "default-safe"
    | "CONFIG-FAILED"
    | "NETWORK-BLOCKED"
    | "fake-provider-called"
    | "live-provider-called"
    | "not-proven";
  readonly fallbackState:
    | "not-run"
    | "enabled-not-called"
    | "fake-fallback-called"
    | "live-fallback-called";
  readonly liveProviderEvidenceSource: string;
  readonly proposalState: string;
  readonly proposalSource: string;
  readonly anchorState: string | null;
  readonly confirmationState: string | null;
  readonly workspaceAuthority: string;
  readonly applyState: string | null;
  readonly verificationState: string | null;
  readonly commandState: string;
  readonly commandDispatch: string;
  readonly repairState: string;
  readonly terminalVerdict: string | null;
  readonly changedFiles: readonly string[];
  readonly workspaceChangedFiles: readonly string[];
  readonly safety: {
    readonly providerDefaultNotCalled: boolean;
    readonly providerCallRequiresExplicitLiveOptIn: boolean;
    readonly applyDefaultNotRun: boolean;
    readonly commandDefaultNotRun: boolean;
    readonly noNewWriter: boolean;
    readonly noFuzzyApply: boolean;
    readonly rawProviderOutputExcluded: boolean;
  };
  readonly failures: readonly string[];
}

const originalDaemonEnabled = process.env.DAEMON_ENABLED;
const originalAuditLogPath = process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH;
process.env.DAEMON_ENABLED = "0";

const testRoot = process.env.PRIVATE_AGENTS_TEST_ROOT?.trim() ||
  path.join(os.tmpdir(), "private-agents-test");
await fs.mkdir(testRoot, { recursive: true });
const auditRoot = await fs.mkdtemp(path.join(testRoot, "route211-audit-"));
process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH = path.join(
  auditRoot,
  ".sisyphus",
  "audit",
  "permissions.jsonl",
);

const scenarios: readonly Scenario[] = [
  {
    id: "default-vague-review-only-no-provider-apply-command",
    prompt: "Fix the planner target ranking bug and cover the adjacent test",
    seedKind: "planning",
    expected: {
      productPathUsed: true,
      providerState: "default-safe",
      proposalState: "prepared-exact",
      proposalSource: "planning-runtime-deterministic",
      confirmationState: "not-confirmed",
      workspaceAuthority: "missing",
      applyState: "not-run",
      verificationState: "not-run",
      commandState: "not-requested",
      commandDispatch: "not-run",
      repairState: "not-needed",
      noWorkspaceChanges: true,
    },
  },
  {
    id: "live-provider-opt-in-config-failed-no-secrets",
    prompt: "Fix the planner target ranking bug and cover the adjacent test",
    seedKind: "planning",
    execution: {
      liveProviderProposal: { optIn: true, source: "benchmark" },
    },
    expected: {
      productPathUsed: true,
      providerState: "CONFIG-FAILED",
      fallbackState: "not-run",
      liveProviderEvidenceSource: "not-proven",
      proposalState: "live-provider-config-failed",
      proposalSource: "live-provider-proposal",
      confirmationState: "not-confirmed",
      workspaceAuthority: "missing",
      applyState: "not-run",
      commandState: "not-requested",
      commandDispatch: "not-run",
      repairState: "not-needed",
      noWorkspaceChanges: true,
    },
  },
  {
    id: "live-provider-primary-network-fake-fallback-no-write",
    prompt: "Fix the planner target ranking bug and cover the adjacent test",
    seedKind: "planning",
    execution: {
      liveProviderProposal: {
        optIn: true,
        source: "benchmark",
        fallbackPolicy: {
          enabled: true,
          reason: "primary network failure may use configured fallback once",
        },
        attempts: [
          {
            role: "primary",
            providerSafeLabel: "siliconflow-primary-cn",
            providerConfigSource: "approved-provider-env",
            providerAvailability: {
              kind: "available",
              providerKindLabel: "siliconflow-primary-cn",
            },
            readinessStatus: "network",
            evidenceSource: "live-provider",
            provider: buildExactProposalProvider(),
          },
          {
            role: "fallback",
            providerSafeLabel: "focused-fake-fallback",
            providerConfigSource: "benchmark-fixture",
            providerAvailability: {
              kind: "available",
              providerKindLabel: "focused-fake-fallback",
            },
            readinessStatus: "ready",
            evidenceSource: "fake-provider",
            provider: buildExactProposalProvider(),
          },
        ],
      },
    },
    expected: {
      productPathUsed: true,
      providerState: "fake-provider-called",
      fallbackState: "fake-fallback-called",
      liveProviderEvidenceSource: "fake-provider",
      proposalState: "prepared-exact",
      proposalSource: "live-provider-proposal",
      confirmationState: "not-confirmed",
      workspaceAuthority: "missing",
      applyState: "not-run",
      commandState: "not-requested",
      commandDispatch: "not-run",
      repairState: "not-needed",
      noWorkspaceChanges: true,
    },
  },
  {
    id: "confirmed-controlled-apply-no-manual-json",
    prompt: "Fix the planner target ranking bug and cover the adjacent test",
    seedKind: "planning",
    execution: {
      confirmation: { state: "trusted-confirmed" },
      controlledWorkspace: { scope: "controlled-temp-workspace", source: "benchmark" },
    },
    expected: {
      productPathUsed: true,
      providerState: "default-safe",
      liveProviderEvidenceSource: "default-safe",
      proposalState: "prepared-exact",
      proposalSource: "planning-runtime-deterministic",
      confirmationState: "trusted-confirmed",
      workspaceAuthority: "trusted-controlled-temp-workspace",
      applyState: "single-target-applied",
      verificationState: "succeeded",
      commandState: "not-requested",
      commandDispatch: "not-run",
      repairState: "not-needed",
      changedFiles: ["src/planning/targetRanking.ts"],
    },
  },
  {
    id: "confirmed-selected-workspace-apply",
    prompt: "Fix the planner target ranking bug and cover the adjacent test",
    seedKind: "planning",
    execution: {
      confirmation: { state: "trusted-confirmed" },
      selectedWorkspace: {
        scope: "selected-workspace",
        source: "benchmark",
        explicitWorkspaceAuthority: true,
      },
    },
    expected: {
      productPathUsed: true,
      providerState: "default-safe",
      proposalState: "prepared-exact",
      proposalSource: "planning-runtime-deterministic",
      confirmationState: "trusted-confirmed",
      workspaceAuthority: "trusted-selected-workspace",
      applyState: "single-target-applied",
      verificationState: "succeeded",
      commandState: "not-requested",
      commandDispatch: "not-run",
      repairState: "not-needed",
      changedFiles: ["src/planning/targetRanking.ts"],
    },
  },
  {
    id: "allowlisted-verification-command-passed",
    prompt: "Fix the planner target ranking bug and cover the adjacent test",
    seedKind: "planning",
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
      productPathUsed: true,
      providerState: "default-safe",
      proposalState: "prepared-exact",
      proposalSource: "planning-runtime-deterministic",
      confirmationState: "trusted-confirmed",
      workspaceAuthority: "trusted-controlled-temp-workspace",
      applyState: "single-target-applied",
      verificationState: "succeeded",
      commandState: "passed",
      commandDispatch: "existing-tool-runtime",
      repairState: "not-needed",
      changedFiles: ["src/planning/targetRanking.ts"],
    },
  },
  {
    id: "verification-failed-opens-repair-continuation",
    prompt: "Fix the planner target ranking bug and cover the adjacent test",
    seedKind: "planning",
    execution: {
      confirmation: { state: "trusted-confirmed" },
      controlledWorkspace: { scope: "controlled-temp-workspace", source: "benchmark" },
      expectedContentByTargetPath: new Map([
        ["src/planning/targetRanking.ts", "wrong expected content\n"],
      ]),
    },
    expected: {
      productPathUsed: true,
      providerState: "default-safe",
      proposalState: "prepared-exact",
      proposalSource: "planning-runtime-deterministic",
      confirmationState: "trusted-confirmed",
      workspaceAuthority: "trusted-controlled-temp-workspace",
      applyState: "single-target-applied",
      verificationState: "failed",
      commandState: "not-requested",
      commandDispatch: "not-run",
      repairState: "repair-continuation-created",
      changedFiles: ["src/planning/targetRanking.ts"],
    },
  },
  {
    id: "command-only-bypass-blocked-before-dispatch",
    prompt: "Fix the planner target ranking bug and cover the adjacent test",
    seedKind: "planning",
    execution: {
      verificationCommand: {
        command: "node --version",
        approval: "explicit",
        source: "benchmark",
      },
    },
    expected: {
      productPathUsed: true,
      providerState: "default-safe",
      proposalState: "prepared-exact",
      proposalSource: "planning-runtime-deterministic",
      confirmationState: "not-confirmed",
      workspaceAuthority: "missing",
      applyState: "not-run",
      commandState: "not-run",
      commandDispatch: "not-run",
      repairState: "not-needed",
      noWorkspaceChanges: true,
    },
  },
  {
    id: "unsupported-broad-refactor-stops-clearly",
    prompt: "Fix the planner target ranking bug and cover the adjacent test",
    seedKind: "minimal",
    expected: {
      productPathUsed: true,
      providerState: "default-safe",
      proposalState: "not-run",
      proposalSource: "planning-handoff-summary",
      confirmationState: "not-confirmed",
      workspaceAuthority: "missing",
      applyState: "not-run",
      commandState: "not-requested",
      commandDispatch: "not-run",
      repairState: "not-needed",
      noWorkspaceChanges: true,
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
    route: "211",
    gate: "route211-practical-authorized-loop-benchmark",
    liveProviderRealCall: "not-run",
    liveProviderOptInClassified: "CONFIG-FAILED-or-fake-provider-called",
    reports,
  }, null, 2));
  if (failures.length > 0) {
    for (const failure of failures) {
      console.log(`[fail] ${failure}`);
    }
    process.exit(1);
  }
  console.log("[pass] route211-practical-authorized-loop-benchmark");
} finally {
  await fs.rm(auditRoot, { recursive: true, force: true });
  restoreEnv("DAEMON_ENABLED", originalDaemonEnabled);
  restoreEnv("PRIVATE_AGENTS_AUDIT_LOG_PATH", originalAuditLogPath);
}

async function runScenario(scenario: Scenario): Promise<ScenarioReport> {
  const workspaceRoot = await fs.mkdtemp(path.join(testRoot, `route211-${scenario.id}-`));
  try {
    await seedWorkspace(workspaceRoot, scenario.seedKind);
    const before = await snapshotWorkspace(workspaceRoot);
    const execution = withSelectedWorkspaceRoot(scenario.execution, workspaceRoot);
    const result = await runMvpIntegratedFlow({
      sessionId: `sess_route211_${scenario.id.replace(/[^a-z0-9_]/gi, "_")}`,
      prompt: scenario.prompt,
      workspaceRoot,
      escalationDecision: scenario.escalationDecision ?? "deny",
      providerMode: "synthetic",
      maxTurns: 4,
      ...(execution ? { planningMutationExecution: execution } : {}),
    });
    const after = await snapshotWorkspace(workspaceRoot);
    const report = projectReport({
      id: scenario.id,
      result,
      workspaceChangedFiles: diffSnapshots(before, after),
    });
    return {
      ...report,
      failures: validateReport({ scenario, report }),
    };
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

function projectReport(input: {
  readonly id: string;
  readonly result: ProductResult;
  readonly workspaceChangedFiles: readonly string[];
}): ScenarioReport {
  const finalOutput = input.result.finalOutput ?? "";
  const evidence = input.result.codingResult?.evidence ?? [];
  const productPathUsed = evidence.includes("planning-runtime-product:path:runMvpIntegratedFlow");
  const providerState = evidence.includes("planning-runtime-product-proposal:live-provider-status:CONFIG-FAILED")
    ? "CONFIG-FAILED"
    : evidence.includes("planning-runtime-product-proposal:live-provider-status:NETWORK-BLOCKED")
      ? "NETWORK-BLOCKED"
      : evidence.includes("planning-runtime-product:live-provider-evidence-source:fake-provider") &&
        evidence.includes("provider-called=true")
        ? "fake-provider-called"
        : evidence.includes("planning-runtime-product:live-provider-evidence-source:live-provider") &&
          evidence.includes("provider-called=true")
          ? "live-provider-called"
          : evidence.includes("provider-called=false")
            ? "default-safe"
            : "not-proven";
  const liveProviderEvidenceSource =
    markerValue(evidence, "planning-runtime-product:live-provider-evidence-source:") ?? "not-proven";
  const fallbackState = classifyFallbackState(evidence);
  const proposalState = markerValue(evidence, "planning-runtime-product-proposal:status:") ??
    (productPathUsed ? "not-run" : "not-proven");
  const proposalSource = markerValue(evidence, "planning-runtime-product-proposal:source:") ??
    "not-proven";
  const selectedWorkspace = markerValue(evidence, "planning-runtime-product:selected-workspace:");
  const controlledWorkspace = markerValue(evidence, "planning-runtime-product:controlled-workspace:");
  const workspaceAuthority = selectedWorkspace === "trusted-selected-workspace"
    ? selectedWorkspace
    : controlledWorkspace ?? "missing";
  return {
    id: input.id,
    status: input.result.status,
    productPathUsed,
    providerState,
    fallbackState,
    liveProviderEvidenceSource,
    proposalState,
    proposalSource,
    anchorState: extractLineValue(finalOutput, "Anchor state:"),
    confirmationState: extractLineValue(finalOutput, "Explicit confirmation:"),
    workspaceAuthority,
    applyState: extractLineValue(finalOutput, "Apply state:"),
    verificationState: extractLineValue(finalOutput, "Readback verification:"),
    commandState: markerValue(evidence, "planning-runtime-product-verification-command:state:") ?? "not-proven",
    commandDispatch: markerValue(evidence, "planning-runtime-product-verification-command:dispatch:") ?? "not-proven",
    repairState: markerValue(evidence, "planning-runtime-product-repair:state:") ?? "not-proven",
    terminalVerdict: extractLineValue(finalOutput, "Terminal verdict:"),
    changedFiles: input.result.codingResult?.changedFiles ?? [],
    workspaceChangedFiles: input.workspaceChangedFiles,
    safety: {
      providerDefaultNotCalled: input.id.includes("default")
        ? evidence.includes("provider-called=false")
        : true,
      providerCallRequiresExplicitLiveOptIn: !evidence.includes("provider-called=true") ||
        evidence.includes("planning-runtime-product:live-opt-in:true"),
      applyDefaultNotRun: input.id.includes("default") ? evidence.includes("apply=not-run") : true,
      commandDefaultNotRun: input.id.includes("default") ? evidence.includes("command-dispatch=not-run") : true,
      noNewWriter: evidence.includes("planning-mutation-proof-handoff:no-new-writer") || !productPathUsed,
      noFuzzyApply: evidence.includes("planning-mutation-proof-handoff:no-fuzzy-apply") || !productPathUsed,
      rawProviderOutputExcluded: !JSON.stringify({ evidence, finalOutput }).includes("provider.env") &&
        !JSON.stringify({ evidence, finalOutput }).includes("apiKey"),
    },
    failures: [],
  };
}

function validateReport(input: {
  readonly scenario: Scenario;
  readonly report: ScenarioReport;
}): readonly string[] {
  const failures: string[] = [];
  const expected = input.scenario.expected;
  const report = input.report;
  compare("productPathUsed", report.productPathUsed, expected.productPathUsed, failures);
  compareOptional("providerState", report.providerState, expected.providerState, failures);
  compareOptional("fallbackState", report.fallbackState, expected.fallbackState, failures);
  compareOptional("liveProviderEvidenceSource", report.liveProviderEvidenceSource, expected.liveProviderEvidenceSource, failures);
  compareOptional("proposalState", report.proposalState, expected.proposalState, failures);
  compareOptional("proposalSource", report.proposalSource, expected.proposalSource, failures);
  compareOptional("confirmationState", report.confirmationState, expected.confirmationState, failures);
  compareOptional("workspaceAuthority", report.workspaceAuthority, expected.workspaceAuthority, failures);
  compareOptional("applyState", report.applyState, expected.applyState, failures);
  compareOptional("verificationState", report.verificationState, expected.verificationState, failures);
  compareOptional("commandState", report.commandState, expected.commandState, failures);
  compareOptional("commandDispatch", report.commandDispatch, expected.commandDispatch, failures);
  compareOptional("repairState", report.repairState, expected.repairState, failures);
  compareListOptional("changedFiles", report.changedFiles, expected.changedFiles, failures);
  if (expected.noWorkspaceChanges && report.workspaceChangedFiles.length > 0) {
    failures.push(`workspaceChangedFiles=${report.workspaceChangedFiles.join(",")}`);
  }
  for (const [key, value] of Object.entries(report.safety)) {
    if (!value) failures.push(`safety.${key}=false`);
  }
  return failures;
}

function buildExactProposalProvider() {
  return {
    proposeEdit: () => ({
      operationKind: "exact-fenced-replacement" as const,
      targets: [
        {
          path: "src/planning/targetRanking.ts",
          summary: "Trim the planner task string before keyword matching.",
          oldText: "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';",
          newText: "  return task.trim().includes('planner') ? 'targetRanking.ts' : 'unknown';",
        },
      ],
      verificationPlan: [
        "readback verifies targetRanking.ts contains the trimmed planner predicate",
      ],
    }),
  };
}

function classifyFallbackState(
  evidence: readonly string[],
): ScenarioReport["fallbackState"] {
  const fallbackPolicy =
    markerValue(evidence, "planning-runtime-product-proposal:live-provider-fallback-policy:") ??
    "disabled";
  if (fallbackPolicy !== "enabled") return "not-run";
  const fallbackCalled = evidence.includes(
    "planning-runtime-product-proposal:live-provider-fallback:provider-called:true",
  );
  if (!fallbackCalled) return "enabled-not-called";
  const fallbackEvidenceSource = markerValue(
    evidence,
    "planning-runtime-product-proposal:live-provider-fallback:evidence-source:",
  );
  return fallbackEvidenceSource === "live-provider"
    ? "live-fallback-called"
    : "fake-fallback-called";
}

function withSelectedWorkspaceRoot(
  execution: PlanningRuntimeProductExecutionOptions | undefined,
  workspaceRoot: string,
): PlanningRuntimeProductExecutionOptions | undefined {
  if (!execution?.selectedWorkspace) return execution;
  return {
    ...execution,
    selectedWorkspace: {
      ...execution.selectedWorkspace,
      allowedRoot: execution.selectedWorkspace.allowedRoot ?? workspaceRoot,
    },
  };
}

async function seedWorkspace(
  root: string,
  kind: Scenario["seedKind"],
): Promise<void> {
  await fs.mkdir(path.join(root, "src", "planning"), { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: `route211-${kind}`, scripts: { test: "vitest run" } }, null, 2),
  );
  if (kind === "minimal") {
    await fs.writeFile(path.join(root, "README.md"), "minimal benchmark fixture\n");
    return;
  }
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
}

async function snapshotWorkspace(root: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  await walk(root, root, snapshot);
  return snapshot;
}

async function walk(root: string, current: string, snapshot: Map<string, string>): Promise<void> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".sisyphus" || entry.name === ".git" || entry.name === "node_modules") continue;
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

function extractLineValue(output: string, label: string): string | null {
  const line = output.split("\n").find((entry) => entry.startsWith(label));
  return line ? line.slice(label.length).trim() : null;
}

function markerValue(evidence: readonly string[], prefix: string): string | undefined {
  const marker = evidence.find((entry) => entry.startsWith(prefix));
  return marker?.slice(prefix.length);
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

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
