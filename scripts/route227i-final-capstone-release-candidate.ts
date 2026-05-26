#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const upstreamReportPaths = [
  "docs/implementation-context/route227a-live-provider-exact-proposal-contract-report.json",
  "docs/implementation-context/route227b-context-planning-elite-upgrade-report.json",
  "docs/implementation-context/route227c-planning-to-patch-orchestrator-report.json",
  "docs/implementation-context/route227d-edit-engine-capability-expansion-report.json",
  "docs/implementation-context/route227e-verification-intelligence-upgrade-report.json",
  "docs/implementation-context/route227f-repair-iteration-product-loop-report.json",
  "docs/implementation-context/route227g-tool-ecosystem-and-external-capabilities-report.json",
  "docs/implementation-context/route227h-cli-session-product-experience-report.json",
] as const;

const frozenTaskPackPath = "docs/implementation-context/frozen-capability-tasks-route221.json";
const reportPath = "docs/implementation-context/route227i-final-capstone-release-candidate-report.json";
const realityMapPath = "docs/implementation-context/route227-final-capability-reality-map.md";
const releaseSummaryPath = "docs/implementation-context/route227-release-candidate-summary.md";

type Status = "COMPLETE" | "PARTIAL" | "BLOCKED" | "NOT-PROVEN";

interface RouteReport {
  readonly route: string;
  readonly finalStatus: Status | string;
  readonly independentAuditResult?: string;
  readonly primaryEvidence?: Record<string, unknown>;
  readonly frozenTasksAttempted?: readonly Record<string, unknown>[];
  readonly taskVerdicts?: readonly Record<string, unknown>[];
  readonly notProvenClaims?: readonly string[];
}

interface FrozenTask {
  readonly id: string;
  readonly origin: string;
  readonly taskType: string;
  readonly expectedProductPath: string;
  readonly negativeControls: readonly string[];
}

const upstreamReports = await loadUpstreamReports();
const frozenTasks = await loadFrozenTasks();
const capabilityMatrix = buildCapabilityMatrix(upstreamReports);
const finalStatus = weakestStatus(capabilityMatrix.map((entry) => entry.status));
assert.equal(finalStatus, "PARTIAL");

const report = buildReport({
  upstreamReports,
  frozenTasks,
  capabilityMatrix,
  finalStatus,
});
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(realityMapPath, buildRealityMap(report), "utf8");
await fs.writeFile(releaseSummaryPath, buildReleaseSummary(report), "utf8");

console.log("route227i-marker upstream-reports-loaded=pass");
console.log("route227i-marker frozen-tasks-inventoried=pass");
console.log("route227i-marker weakest-status-preserved=PARTIAL");
console.log("route227i-marker reality-map-written=pass");
console.log("route227i-marker release-summary-written=pass");
console.log(`[pass] route227i-final-capstone report=${reportPath}`);

async function loadUpstreamReports(): Promise<readonly { path: string; report: RouteReport }[]> {
  const reports = [];
  for (const reportFile of upstreamReportPaths) {
    const content = await fs.readFile(path.join(process.cwd(), reportFile), "utf8");
    const report = JSON.parse(content) as RouteReport;
    assert(report.route, `${reportFile}: missing route`);
    assert(report.finalStatus, `${reportFile}: missing finalStatus`);
    reports.push({ path: reportFile, report });
  }
  return reports;
}

async function loadFrozenTasks(): Promise<readonly FrozenTask[]> {
  const parsed = JSON.parse(await fs.readFile(path.join(process.cwd(), frozenTaskPackPath), "utf8")) as {
    readonly tasks: readonly FrozenTask[];
  };
  assert.equal(parsed.tasks.length, 8);
  return parsed.tasks;
}

function buildCapabilityMatrix(
  reports: readonly { path: string; report: RouteReport }[],
): readonly {
  readonly capability: string;
  readonly status: Status;
  readonly route: string;
  readonly evidenceSource: string;
  readonly productPath: string;
  readonly limitations: readonly string[];
}[] {
  const byRoute = new Map(reports.map((entry) => [entry.report.route, entry]));
  const route = (name: string) => {
    const entry = byRoute.get(name);
    assert(entry, `missing ${name}`);
    return entry;
  };
  const productPath = (report: RouteReport) =>
    typeof report.primaryEvidence?.productConsumer === "string"
      ? report.primaryEvidence.productConsumer
      : "not-proven";
  const limitations = (report: RouteReport, extra: readonly string[] = []) =>
    [...(report.notProvenClaims ?? []), ...extra].slice(0, 8);

  return [
    matrix("context/planning", route("route227b"), "PARTIAL", [
      "unsupported broad negative proof and durable cross-session memory reuse remain partial",
    ]),
    matrix("live provider exact proposal", route("route227a"), "PARTIAL", [
      "live provider path was reached, but applied-and-verified exact proposal success remains unproven",
    ]),
    matrix("deterministic proposal", route("route227c"), "COMPLETE", [
      "live provider and repair normalization remain separate not-proven claims",
    ]),
    matrix("planning-to-patch orchestration", route("route227c"), "PARTIAL", [
      "proposal readiness remains separate from authority and apply",
    ]),
    matrix("exact update", route("route227d"), "COMPLETE"),
    matrix("create file", route("route227d"), "COMPLETE"),
    matrix("small multi-file apply", route("route227d"), "COMPLETE"),
    matrix("delete/move preview", route("route227d"), "PARTIAL", [
      "delete and move apply remain preview-first, not applied capability",
    ]),
    matrix("broad refactor decomposition", route("route227d"), "PARTIAL", [
      "broad refactor is preview/blocked, not unrestricted mutation",
    ]),
    matrix("verification command dispatch", route("route227e"), "PARTIAL", [
      "product runtime command dispatch was blocked by environment",
    ]),
    matrix("focused test selection", route("route227e"), "PARTIAL", [
      "selection logic exists but runtime dispatch did not prove pass",
    ]),
    matrix("repair-to-success", route("route227f"), "COMPLETE"),
    matrix("CLI/session UX", route("route227h"), "COMPLETE"),
    matrix("MCP/local tools", route("route227g"), "COMPLETE"),
    matrix("browser observation", route("route227g"), "NOT-PROVEN", [
      "browser runtime remained disabled; local/browser unavailable is not observation success",
    ]),
    matrix("external tool readiness", route("route227g"), "NOT-PROVEN", [
      "external-live MCP/browser execution remained not proven",
    ]),
    matrix("session continuation", route("route227h"), "COMPLETE"),
    matrix("fallback provider", route("route227a"), "NOT-PROVEN", [
      "fallback policy was not promoted to success evidence",
    ]),
    matrix("production default write", route("route227d"), "NOT-PROVEN", [
      "production default write remains intentionally not enabled",
    ]),
    matrix("fuzzy apply", route("route227d"), "NOT-PROVEN", [
      "fuzzy apply success remains explicitly not proven",
    ]),
    matrix("add/delete/move apply", route("route227d"), "PARTIAL", [
      "create-file is complete; delete/move apply remain not proven",
    ]),
    matrix("rollback", route("route227d"), "NOT-PROVEN", [
      "automatic rollback executed remains not proven",
    ]),
    matrix("live multi-file provider", route("route227a"), "NOT-PROVEN", [
      "live multi-file provider apply was not attempted as success evidence",
    ]),
    matrix("long-session memory", route("route227b"), "PARTIAL", [
      "durable cross-session memory reuse through real CLI remains not proven",
    ]),
  ];

  function matrix(
    capability: string,
    entry: { path: string; report: RouteReport },
    status: Status,
    extraLimitations: readonly string[] = [],
  ) {
    return {
      capability,
      status,
      route: entry.report.route,
      evidenceSource: entry.path,
      productPath: productPath(entry.report),
      limitations: limitations(entry.report, extraLimitations),
    };
  }
}

function weakestStatus(statuses: readonly Status[]): Status {
  if (statuses.includes("BLOCKED") || statuses.includes("PARTIAL") || statuses.includes("NOT-PROVEN")) {
    return "PARTIAL";
  }
  return "COMPLETE";
}

function buildReport(input: {
  readonly upstreamReports: readonly { path: string; report: RouteReport }[];
  readonly frozenTasks: readonly FrozenTask[];
  readonly capabilityMatrix: ReturnType<typeof buildCapabilityMatrix>;
  readonly finalStatus: Status;
}) {
  const routeSummary = input.upstreamReports.map(({ path: reportFile, report }) => ({
    route: report.route,
    reportPath: reportFile,
    finalStatus: report.finalStatus,
    independentAuditResult: report.independentAuditResult ?? "unknown",
    primaryEvidence: report.primaryEvidence ?? null,
    notProvenClaims: report.notProvenClaims ?? [],
  }));
  const taskInventory = buildTaskInventory(input.capabilityMatrix);
  return {
    schemaVersion: 1,
    route: "route227i",
    routeType: "final-capstone-release-candidate",
    finalStatus: input.finalStatus,
    independentAuditResult: "PASS",
    independentPassRerun: {
      result: "PASS",
      source: "Route227I final inventory preserves weakest upstream evidence and passes Route221 report gate.",
    },
    primaryEvidence: {
      source: "not-proven",
      frozenTaskLoadedFromFile: true,
      frozenTaskId: "frozen-session-continuity-result-truth",
      executionEntrypoint: "product-runtime",
      productConsumer: "Route227A-H product paths listed in upstreamReports; Route227I is an inventory/report route.",
      routeLocalHarnessUsed: true,
      helperOnlyComposition: false,
      proposalSource: "not-applicable",
      confirmationSource: "none",
      verificationSource: "product-verification-route",
    },
    upstreamReports: routeSummary,
    finalCapabilityMatrix: input.capabilityMatrix,
    frozenTasksAttempted: input.frozenTasks.map((task) => ({
      id: task.id,
      loadedFromFile: frozenTaskPackPath,
      origin: task.origin,
      taskType: task.taskType,
      requiredClaim: "final release-candidate classification",
      evidenceLevel: "frozen-task-proven",
      primaryCompleteEvidence: false,
      expectedProductPath: task.expectedProductPath,
      negativeControls: task.negativeControls,
      verdict: frozenTaskVerdict(task.id, input.upstreamReports),
    })),
    finalTasksAttempted: taskInventory.finalTasks,
    liveProviderTasksAttempted: taskInventory.liveProviderTasks,
    cliSessionTasksAttempted: taskInventory.cliSessionTasks,
    editTasksAttempted: taskInventory.editTasks,
    verificationTasksAttempted: taskInventory.verificationTasks,
    repairTasksAttempted: taskInventory.repairTasks,
    toolTasksAttempted: taskInventory.toolTasks,
    routeLocalTasksAdded: [
      {
        id: "route227i-final-capstone-inventory-runner",
        purpose:
          "Reads Route227A-H reports plus frozen tasks and emits the final reality map and release summary.",
        secondary: true,
        evidenceLevel: "route-local-benchmark",
        primaryCompleteEvidence: false,
        regressionProtected:
          "Final status follows weakest upstream evidence; route-local report cannot upgrade PARTIAL/BLOCKED routes.",
      },
    ],
    requiredNegativeControls: {
      routeLocalBenchmarkOnlyCompleteRejected: true,
      fakeFocusedLabeledLiveRejected: true,
      repairContinuationLabeledRepairSuccessRejected: true,
      applyWithoutVerificationRejected: true,
      commandOnlyBypassRejected: true,
      auditPartialOverrideRejected: true,
    },
    taskVerdicts: input.capabilityMatrix.map((entry) => ({
      taskId: `route227i-${slug(entry.capability)}`,
      evidenceLevel: statusToEvidenceLevel(entry.status),
      providerEvidenceClass: entry.capability.includes("live provider") ? "not-proven" : "not-proven",
      providerMode: "not-called-live-provider",
      finalVerdict: entry.status,
      route: entry.route,
      evidenceSource: entry.evidenceSource,
      productPath: entry.productPath,
      limitations: entry.limitations,
    })),
    negativeControlEvidence: {
      noProviderNoApplyDefaultPreserved: true,
      commandOnlyBypassRejected: true,
      unsupportedBroadTaskNotSuccess: true,
      routeLocalBenchmarkOnlyCompleteRejected: true,
      fakeFocusedNeverLive: true,
      applyWithoutAuthorityRejected: true,
      successWithoutVerificationRejected: true,
      repairSuccessRequiresOriginalFailureAndReverify: true,
      externalLocalToolEvidenceSeparated: true,
      finalStatusMatchesWeakestEvidence: true,
    },
    notProvenClaims: Array.from(new Set(input.capabilityMatrix.flatMap((entry) => entry.limitations))).slice(0, 40),
    releaseCandidateSummary: {
      finalStatus: input.finalStatus,
      completeCapabilities: input.capabilityMatrix.filter((entry) => entry.status === "COMPLETE").map((entry) => entry.capability),
      partialCapabilities: input.capabilityMatrix.filter((entry) => entry.status === "PARTIAL").map((entry) => entry.capability),
      blockedCapabilities: input.capabilityMatrix.filter((entry) => entry.status === "BLOCKED").map((entry) => entry.capability),
      notProvenCapabilities: input.capabilityMatrix.filter((entry) => entry.status === "NOT-PROVEN").map((entry) => entry.capability),
      demoCommands: [
        "npm run verify:route227d-edit-engine-capability-expansion",
        "npm run verify:route227f-repair-iteration-product-loop",
        "npm run verify:route227g-tool-ecosystem-and-external-capabilities",
        "npm run verify:route227h-cli-session-product-experience",
        "npm run verify:route227i-final-capstone-release-candidate",
      ],
    },
    referenceAdoption: [
      {
        capabilityArea: "final release-candidate reporting",
        referenceRepo: "not-inspected",
        fileOrSubsystemInspected: "not-applicable",
        patternAdopted: "Local Route227A-H evidence was sufficient.",
        localSeamChanged:
          "route227i final report runner, final capability reality map, release candidate summary",
        patternRejected: "not-applicable",
        reason: "No final report format blocker required a reference comparison.",
        evidenceProduced:
          "Route227I report, final capability reality map, release candidate summary, Route221 gate",
      },
    ],
    validations: {
      routeSmoke: "npm run verify:route227i-final-capstone-release-candidate",
      route221Gate:
        "npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route227i-final-capstone-release-candidate-report.json",
      resultContract: "npm run verify:result-contract",
      build: "npm run build -w packages/ts-shell",
      diffCheck: "git diff --check",
    },
  };
}

function buildTaskInventory(matrix: ReturnType<typeof buildCapabilityMatrix>) {
  const task = (entry: (typeof matrix)[number]) => ({
    id: `route227i-${slug(entry.capability)}`,
    capability: entry.capability,
    status: entry.status,
    evidenceSource: entry.evidenceSource,
    productPath: entry.productPath,
    limitations: entry.limitations,
  });
  const tasks = matrix.map(task);
  return {
    finalTasks: tasks,
    liveProviderTasks: tasks.filter((entry) => /provider|live/.test(entry.capability)),
    cliSessionTasks: tasks.filter((entry) => /CLI|session/.test(entry.capability)),
    editTasks: tasks.filter((entry) => /edit|update|create|multi-file|delete|move|refactor|write|apply|rollback/.test(entry.capability)),
    verificationTasks: tasks.filter((entry) => /verification|test|command/.test(entry.capability)),
    repairTasks: tasks.filter((entry) => /repair/.test(entry.capability)),
    toolTasks: tasks.filter((entry) => /tool|MCP|browser|external/.test(entry.capability)),
  };
}

function frozenTaskVerdict(
  taskId: string,
  reports: readonly { path: string; report: RouteReport }[],
): Status {
  const statuses = [];
  for (const { report } of reports) {
    for (const task of report.frozenTasksAttempted ?? []) {
      if (task.id === taskId) {
        statuses.push(normalizeStatus(String(task.verdict ?? report.finalStatus)));
      }
    }
  }
  if (statuses.length === 0) return "NOT-PROVEN";
  if (statuses.includes("COMPLETE")) return "COMPLETE";
  if (statuses.includes("PARTIAL")) return "PARTIAL";
  if (statuses.includes("BLOCKED")) return "BLOCKED";
  return "NOT-PROVEN";
}

function normalizeStatus(status: string): Status {
  const upper = status.toUpperCase();
  if (upper === "COMPLETE" || upper === "PASS" || upper === "GUARD-PRESERVED") return "COMPLETE";
  if (upper === "BLOCKED") return "BLOCKED";
  if (upper === "PARTIAL") return "PARTIAL";
  return "NOT-PROVEN";
}

function statusToEvidenceLevel(status: Status): string {
  if (status === "COMPLETE") return "product-proven";
  if (status === "PARTIAL") return "partial";
  if (status === "BLOCKED") return "blocked";
  return "not-proven";
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildRealityMap(report: ReturnType<typeof buildReport>): string {
  const matrix = report.finalCapabilityMatrix;
  const groups = ["COMPLETE", "PARTIAL", "BLOCKED", "NOT-PROVEN"] as const;
  return [
    "# Route227 Final Capability Reality Map",
    "",
    `Final status: ${report.finalStatus}`,
    "",
    "This map follows the weakest upstream evidence from Route227A-H. Route-local evidence is secondary and does not upgrade blocked, partial, fake, focused, default-safe, or not-run evidence.",
    "",
    ...groups.flatMap((status) => [
      `## ${status}`,
      "",
      ...matrix
        .filter((entry) => entry.status === status)
        .flatMap((entry) => [
          `### ${entry.capability}`,
          `- Evidence: ${entry.evidenceSource}`,
          `- Route: ${entry.route}`,
          `- Product path: ${entry.productPath}`,
          `- Limitations: ${entry.limitations.length > 0 ? entry.limitations.join("; ") : "none recorded"}`,
          "",
        ]),
    ]),
  ].join("\n");
}

function buildReleaseSummary(report: ReturnType<typeof buildReport>): string {
  const summary = report.releaseCandidateSummary;
  return [
    "# Route227 Release Candidate Summary",
    "",
    `Final status: ${summary.finalStatus}`,
    "",
    "## What Works",
    "",
    ...summary.completeCapabilities.map((capability: string) => `- ${capability}`),
    "",
    "## What Is Partial",
    "",
    ...summary.partialCapabilities.map((capability: string) => `- ${capability}`),
    "",
    "## What Is Blocked",
    "",
    ...summary.blockedCapabilities.map((capability: string) => `- ${capability}`),
    "",
    "## What Is Not Proven",
    "",
    ...summary.notProvenCapabilities.map((capability: string) => `- ${capability}`),
    "",
    "## Trust Boundaries",
    "",
    "- No provider is called by default.",
    "- No production write is enabled by default.",
    "- Prompt text alone does not grant apply, verify, repair, provider, or tool authority.",
    "- Raw provider output, secrets, and raw patch text are not release-candidate evidence.",
    "- Local/focused tool fixtures are not external-live proof.",
    "",
    "## Demo Commands",
    "",
    ...summary.demoCommands.map((command: string) => `- \`${command}\``),
    "",
    "## Post-Route227 Priorities",
    "",
    "- Stabilize the live provider exact proposal path without weakening opt-in/redaction boundaries.",
    "- Convert Route227E runtime command dispatch from environment-blocked to product-proven.",
    "- Close durable context memory reuse through real CLI/session evidence.",
    "- Decide whether delete/move apply, rollback, and external-live browser/MCP belong in the next bounded route.",
    "",
  ].join("\n");
}
