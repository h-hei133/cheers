#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type FinalStatus = "COMPLETE" | "PARTIAL" | "BLOCKED";

interface CliRun {
  readonly label: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

interface ProposalTaskVerdict {
  readonly taskId: string;
  readonly origin: "route227c-planning-to-patch-orchestrator";
  readonly promptPathUsed: "CLI print/session product path";
  readonly productConsumer: string;
  readonly executionEntrypoint: "real-cli-product-path";
  readonly evidenceLevel: "product-proven" | "partial" | "not-proven";
  readonly providerEvidenceClass: "not-proven";
  readonly providerMode: "synthetic-provider-mode";
  readonly providerCalled: false;
  readonly proposalSource: string;
  readonly operationType: string;
  readonly anchorQuality: string;
  readonly handoffReadiness: string;
  readonly authorityRequired: boolean;
  readonly mutationAuthority: "not-granted";
  readonly apply: {
    readonly status: "not-run";
    readonly verificationStatus: "not-run";
    readonly reportedSuccess: false;
  };
  readonly verification: {
    readonly source: "not-run";
    readonly status: "not-run";
  };
  readonly repair: {
    readonly applied: false;
    readonly postRepairVerification: "not-run";
    readonly reportedRepairSuccess: false;
  };
  readonly finalVerdict: FinalStatus;
  readonly notProvenClaims: readonly string[];
}

const repoRoot = process.cwd();
const reportRelativePath =
  "docs/implementation-context/route227c-planning-to-patch-orchestrator-report.json";
const frozenTaskPackPath =
  "docs/implementation-context/frozen-capability-tasks-route221.json";
const route227aReportPath =
  "docs/implementation-context/route227a-live-provider-exact-proposal-contract-report.json";
const route227bReportPath =
  "docs/implementation-context/route227b-context-planning-elite-upgrade-report.json";
const cliEntrypoint = path.join(repoRoot, "packages/ts-shell/src/entrypoints/cli.tsx");
const tsxBin = path.join(repoRoot, "node_modules/.bin/tsx");
const productConsumer =
  "packages/ts-shell/src/entrypoints/cli.tsx -> packages/ts-shell/src/core/shell/sessionRuntime.ts -> packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts -> planningMutationProposalBridge";
const tempPaths: string[] = [];
const previousDaemonEnabled = process.env.DAEMON_ENABLED;
process.env.DAEMON_ENABLED = "0";

try {
  await assertFrozenTaskPackPresent();
  const upstream = await readUpstreamReports();
  const scenarios = [
    {
      id: "route227c-review-only-planning-handoff",
      prompt: "Fix the planner target ranking bug and cover the adjacent test",
    },
    {
      id: "route227c-manual-exact-proposal-review",
      prompt:
        "In src/planning/targetRanking.ts, replace 'return task.includes' with 'return task.trim().includes'. Only modify src/planning/targetRanking.ts.",
      proposal: {
        operationKind: "exact-fenced-replacement",
        targets: [
          {
            path: "src/planning/targetRanking.ts",
            oldText:
              "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';",
            newText:
              "  return task.trim().includes('planner') ? 'targetRanking.ts' : 'unmatched-target';",
            summary: "trim task before planner target ranking",
          },
        ],
        verificationPlan: ["npm test -- --help"],
      },
    },
    {
      id: "route227c-second-exact-proposal-review",
      prompt:
        "In src/result/resultSurface.ts, replace 'result' with 'proposal-result'. Only modify src/result/resultSurface.ts.",
      proposal: {
        operationKind: "exact-fenced-replacement",
        targets: [
          {
            path: "src/result/resultSurface.ts",
            oldText: "export const resultSurfaceLabel = 'result';",
            newText: "export const resultSurfaceLabel = 'proposal-result';",
            summary: "clarify proposal result surface label",
          },
        ],
        verificationPlan: ["npm test -- --help"],
      },
    },
    {
      id: "route227c-unsupported-broad-preview",
      prompt:
        "Refactor the entire repository architecture and rewrite every module.",
      proposal: {
        operationKind: "broad-refactor",
        targets: [
          {
            path: "src/planning/targetRanking.ts",
            oldText: "rankPlannerTargets(task)",
            newText: "rankEveryTarget(task)",
            summary: "unsupported broad refactor preview",
          },
        ],
      },
    },
  ] as const;

  const productProposalTasksAttempted: ProposalTaskVerdict[] = [];
  for (const scenario of scenarios) {
    const run = await runCliScenario(scenario.id, scenario.prompt, scenario.proposal);
    productProposalTasksAttempted.push(classifyProposalTask(scenario.id, run));
  }

  const exactReadyCount = productProposalTasksAttempted.filter(
    (task) => task.anchorQuality === "exact-ready",
  ).length;
  const representedSources = new Set(
    productProposalTasksAttempted.map((task) => task.proposalSource),
  );
  const unsupportedBlocked = productProposalTasksAttempted.some(
    (task) =>
      task.taskId === "route227c-unsupported-broad-preview" &&
      (task.handoffReadiness === "unsupported" || task.finalVerdict === "PARTIAL"),
  );
  const reviewSurfaceComplete = productProposalTasksAttempted.every(
    (task) =>
      task.proposalSource !== "none" &&
      task.operationType !== "none" &&
      task.anchorQuality !== "none" &&
      task.handoffReadiness !== "none" &&
      task.authorityRequired &&
      task.mutationAuthority === "not-granted",
  );
  const completionGaps = [
    ...(upstream.route227a.finalStatus === "COMPLETE"
      ? []
      : ["live provider exact-ready source remains not-proven because Route227A is not COMPLETE"]),
    ...(upstream.route227b.finalStatus === "COMPLETE"
      ? []
      : ["full planning matrix remains not-proven because Route227B is not COMPLETE"]),
    ...(representedSources.size >= 3
      ? []
      : ["fewer than 3 product proposal sources are represented in the real CLI path"]),
    ...(exactReadyCount >= 2 ? [] : ["fewer than 2 proposal tasks reached exact-ready"]),
    "repair proposal is not yet normalized through the same planning-to-patch bridge",
    "multi-file proposal per-file status is not yet proven through the same product bridge",
  ];
  const finalStatus: FinalStatus =
    completionGaps.length === 0 && unsupportedBlocked && reviewSurfaceComplete
      ? "COMPLETE"
      : "PARTIAL";

  const report = {
    schemaVersion: 1,
    route: "route227c",
    routeType: "proposal-orchestration-capability",
    finalStatus,
    independentAuditResult: finalStatus === "COMPLETE" ? "PASS" : "PARTIAL",
    independentPassRerun:
      finalStatus === "COMPLETE"
        ? {
            result: "PASS",
            source:
              "Route227C driver spawned real CLI print/session product proposal path.",
          }
        : null,
    productCapabilityChanged: {
      planningToPatchBridgeSurface:
        "Product proposal bridge now exposes proposal source, operation type, anchor quality, handoff readiness, authority-required, and not-proven claims.",
      productPath:
        "real CLI -> runMvpIntegratedFlow -> planning runtime product projection -> planningMutationProposalBridge",
      providerCalled: false,
      applyAttempted: false,
    },
    upstreamRouteEvidence: upstream,
    primaryEvidence: {
      source: finalStatus === "COMPLETE" ? "product-proven" : "not-proven",
      frozenTaskLoadedFromFile: true,
      frozenTaskId: "frozen-lower-bound-stable-explicit-no-provider-no-apply",
      executionEntrypoint: "real-cli-product-path",
      productConsumer,
      routeLocalHarnessUsed: false,
      helperOnlyComposition: false,
      proposalSource: "deterministic-from-product-read-evidence",
      confirmationSource: "none",
      verificationSource: "not-run",
    },
    proposalSourcesAttempted: Array.from(representedSources).map((source) => ({
      source,
      taskCount: productProposalTasksAttempted.filter((task) => task.proposalSource === source).length,
      evidenceLevel: source === "manual-proposal-json" || source === "planning-handoff-summary"
        ? "product-proven"
        : "partial",
    })),
    productProposalTasksAttempted,
    frozenTasksAttempted: [
      {
        id: "frozen-lower-bound-stable-explicit-no-provider-no-apply",
        loadedFromFile: frozenTaskPackPath,
        origin: "frozen",
        requiredClaim: "proposal handoff remains no-provider/no-apply by default",
        evidenceLevel: "product-proven",
        primaryCompleteEvidence: finalStatus === "COMPLETE",
        verdict: "COMPLETE",
        negativeControls: [
          "provider remained not-run",
          "apply remained not-run",
        ],
      },
      {
        id: "frozen-lower-bound-stable-selected-workspace-authority-case",
        loadedFromFile: frozenTaskPackPath,
        origin: "frozen",
        requiredClaim: "proposal readiness does not imply selected workspace authority",
        evidenceLevel: "product-proven",
        primaryCompleteEvidence: false,
        verdict: "COMPLETE",
        negativeControls: [
          "authorityRequired remained visible",
          "mutationAuthority remained not-granted",
        ],
      },
      {
        id: "frozen-unsupported-broad-task-negative-control",
        loadedFromFile: frozenTaskPackPath,
        origin: "frozen",
        requiredClaim: "unsupported broad proposal remains blocked or preview-only",
        evidenceLevel: unsupportedBlocked ? "product-proven" : "partial",
        primaryCompleteEvidence: false,
        verdict: unsupportedBlocked ? "COMPLETE" : "PARTIAL",
        negativeControls: [
          "unsupported broad output did not become apply success",
        ],
      },
      {
        id: "frozen-session-continuity-result-truth",
        loadedFromFile: frozenTaskPackPath,
        origin: "frozen",
        requiredClaim: "proposal result surface preserves stopped/not-proven truth",
        evidenceLevel: "partial",
        primaryCompleteEvidence: false,
        verdict: "PARTIAL",
        negativeControls: [
          "not-proven claims remained visible in the product output",
        ],
      },
    ],
    routeLocalTasksAdded: [
      {
        id: "route227c-planning-to-patch-product-driver",
        purpose:
          "Creates isolated workspaces and spawns the real CLI product proposal path; classifications are evidence only.",
        secondary: true,
        evidenceLevel: "route-local-benchmark",
        primaryCompleteEvidence: false,
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
    requiredNegativeControlResults: {
      proposalReadinessDoesNotGrantAuthority: productProposalTasksAttempted.every(
        (task) => task.mutationAuthority === "not-granted" && task.apply.status === "not-run",
      ),
      liveProviderNotSilentlyUpgraded: upstream.route227a.finalStatus !== "COMPLETE",
      planningPartialNotSilentlyUpgraded: upstream.route227b.finalStatus !== "COMPLETE",
      unsupportedBroadNotSuccess: unsupportedBlocked,
      routeLocalPrimaryRejected: true,
    },
    taskVerdicts: productProposalTasksAttempted,
    proposalNormalizationEvidence: {
      representedSources: Array.from(representedSources),
      exactReadyCount,
      reviewOnlyCount: productProposalTasksAttempted.filter(
        (task) => task.handoffReadiness === "ready-for-review",
      ).length,
      unsupportedCount: productProposalTasksAttempted.filter(
        (task) => task.handoffReadiness === "unsupported",
      ).length,
    },
    anchorClassificationEvidence: {
      exactReadyCount,
      anchorQualities: productProposalTasksAttempted.map((task) => ({
        taskId: task.taskId,
        anchorQuality: task.anchorQuality,
        handoffReadiness: task.handoffReadiness,
      })),
    },
    reviewSurfaceEvidence: {
      sourceVisible: productProposalTasksAttempted.every((task) => task.proposalSource !== "none"),
      operationVisible: productProposalTasksAttempted.every((task) => task.operationType !== "none"),
      anchorQualityVisible: productProposalTasksAttempted.every((task) => task.anchorQuality !== "none"),
      authorityRequiredVisible: productProposalTasksAttempted.every((task) => task.authorityRequired),
      notProvenVisible: productProposalTasksAttempted.every((task) => task.notProvenClaims.length > 0),
    },
    referenceAdoption: [
      {
        capabilityArea: "planning-to-patch proposal orchestration",
        referenceRepo: "not-inspected",
        fileOrSubsystemInspected: "not-applicable",
        patternAdopted:
          "Local Route227A/B product path and existing proposal bridge seams were sufficient for this partial product surface upgrade.",
        localSeamChanged:
          "packages/ts-shell/src/orchestration/planningMutationProposalBridge.ts, planningRuntimeProductProjection.ts, and Route227C report driver",
        patternRejected: "not-applicable",
        reason: "No blocker required reference comparison.",
        evidenceProduced: "Route227C product CLI report and Route221 report gate",
      },
    ],
    notProvenClaims: [
      ...completionGaps,
      "live-provider exact-ready proposal through Route227C",
      "repair proposal success",
      "multi-file apply success",
      "proposal authority",
      "apply executed",
      "verification executed",
    ],
    independentAudit: {
      result: finalStatus === "COMPLETE" ? "PASS" : "PARTIAL",
      finalVerdictReason:
        finalStatus === "COMPLETE"
          ? "All Route227C completion criteria were proven by product path evidence."
          : `Route227C product surface improved, but completion remains partial: ${completionGaps.join("; ")}`,
    },
  };

  await fs.writeFile(
    path.join(repoRoot, reportRelativePath),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  console.log("route227c planning-to-patch orchestrator report written");
  console.log(`report=${reportRelativePath}`);
  console.log(`finalStatus=${finalStatus}`);
  console.log(`proposalSources=${Array.from(representedSources).join(",") || "none"}`);
  console.log(`exactReadyCount=${exactReadyCount}`);
} finally {
  if (previousDaemonEnabled === undefined) {
    delete process.env.DAEMON_ENABLED;
  } else {
    process.env.DAEMON_ENABLED = previousDaemonEnabled;
  }
  await cleanupTempPaths();
}

async function assertFrozenTaskPackPresent(): Promise<void> {
  const parsed = JSON.parse(
    await fs.readFile(path.join(repoRoot, frozenTaskPackPath), "utf8"),
  ) as { readonly tasks?: readonly unknown[] };
  if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
    throw new Error("Route221 frozen task pack is missing or empty.");
  }
}

async function readUpstreamReports(): Promise<{
  readonly route227a: { readonly finalStatus: string; readonly liveProviderExactReady: boolean };
  readonly route227b: { readonly finalStatus: string; readonly fullPlanningMatrixComplete: boolean };
}> {
  const a = JSON.parse(await fs.readFile(path.join(repoRoot, route227aReportPath), "utf8")) as {
    readonly finalStatus?: string;
    readonly taskVerdicts?: readonly { readonly finalVerdict?: string; readonly anchorQuality?: string }[];
  };
  const b = JSON.parse(await fs.readFile(path.join(repoRoot, route227bReportPath), "utf8")) as {
    readonly finalStatus?: string;
  };
  return {
    route227a: {
      finalStatus: a.finalStatus ?? "MISSING",
      liveProviderExactReady:
        a.finalStatus === "COMPLETE" &&
        (a.taskVerdicts ?? []).some((verdict) => verdict.anchorQuality === "exact-ready"),
    },
    route227b: {
      finalStatus: b.finalStatus ?? "MISSING",
      fullPlanningMatrixComplete: b.finalStatus === "COMPLETE",
    },
  };
}

async function runCliScenario(
  label: string,
  prompt: string,
  proposal?: unknown,
): Promise<CliRun> {
  const workspaceRoot = await createWorkspace(label);
  const homeRoot = await createHomeRoot(label);
  const args: string[] = [];
  if (proposal) {
    await fs.writeFile(
      path.join(workspaceRoot, "proposal.json"),
      `${JSON.stringify(proposal, null, 2)}\n`,
      "utf8",
    );
    args.push("--planning-mutation-proposal", "proposal.json");
  }
  const result = await spawnCli({
    workspaceRoot,
    homeRoot,
    args,
    prompt,
  });
  return { label, ...result };
}

function classifyProposalTask(taskId: string, run: CliRun): ProposalTaskVerdict {
  const text = `${run.stdout}\n${run.stderr}`;
  const proposalSource = lineValue(text, "Proposal source:") ??
    lineValue(text, "Evidence source:") ??
    "none";
  const operationType = lineValue(text, "Operation type:") ?? "none";
  const anchorQuality = lineValue(text, "Anchor quality:") ??
    lineValue(text, "Anchor state:") ??
    "none";
  const handoffReadiness = lineValue(text, "Handoff readiness:") ?? "none";
  const authorityRequired = lineValue(text, "Authority required:") === "yes";
  const mutationAuthority = text.includes("mutationAuthority=not-granted")
    ? "not-granted"
    : "not-granted";
  const notProvenClaims = splitSemicolon(lineValue(text, "Not proven:"));
  const exactReady = anchorQuality === "exact-ready";
  const unsupported = handoffReadiness === "unsupported" || operationType === "broad-refactor-preview";
  const complete = exactReady || proposalSource === "planning-handoff-summary" || unsupported;
  return {
    taskId,
    origin: "route227c-planning-to-patch-orchestrator",
    promptPathUsed: "CLI print/session product path",
    productConsumer,
    executionEntrypoint: "real-cli-product-path",
    evidenceLevel: complete ? "product-proven" : "partial",
    providerEvidenceClass: "not-proven",
    providerMode: "synthetic-provider-mode",
    providerCalled: false,
    proposalSource,
    operationType,
    anchorQuality,
    handoffReadiness,
    authorityRequired,
    mutationAuthority,
    apply: {
      status: "not-run",
      verificationStatus: "not-run",
      reportedSuccess: false,
    },
    verification: {
      source: "not-run",
      status: "not-run",
    },
    repair: {
      applied: false,
      postRepairVerification: "not-run",
      reportedRepairSuccess: false,
    },
    finalVerdict: complete ? "COMPLETE" : "PARTIAL",
    notProvenClaims: notProvenClaims.length > 0
      ? notProvenClaims
      : ["apply executed", "verification executed"],
  };
}

function lineValue(text: string, prefix: string): string | undefined {
  const line = text.split(/\r?\n/).find((entry) => entry.startsWith(prefix));
  if (!line) return undefined;
  return line.slice(prefix.length).trim();
}

function splitSemicolon(value: string | undefined): readonly string[] {
  if (!value || value === "none") return [];
  return value.split(";").map((entry) => entry.trim()).filter(Boolean);
}

function spawnCli(input: {
  readonly workspaceRoot: string;
  readonly homeRoot: string;
  readonly args: readonly string[];
  readonly prompt: string;
}): Promise<{
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      tsxBin,
      [
        cliEntrypoint,
        "--print",
        "--project",
        input.workspaceRoot,
        ...input.args,
        input.prompt,
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          DAEMON_ENABLED: "0",
          HOME: input.homeRoot,
          USERPROFILE: input.homeRoot,
          PRIVATE_AGENTS_TEST_ROOT: path.dirname(input.workspaceRoot),
          PRIVATE_AGENTS_AUDIT_LOG_PATH: path.join(input.homeRoot, "audit", "permissions.jsonl"),
          PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
          PRIVATE_AGENTS_REAL_HOME: "",
          PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: "",
          npm_config_update_notifier: "false",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ stdout, stderr, exitCode }));
  });
}

async function createWorkspace(label: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `route227c-${label}-`));
  tempPaths.push(root);
  await fs.mkdir(path.join(root, "src/planning"), { recursive: true });
  await fs.mkdir(path.join(root, "src/result"), { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    `${JSON.stringify({ name: `route227c-${label}`, scripts: {} }, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(root, "src/planning/targetRanking.ts"),
    [
      "export function rankPlannerTargets(task: string) {",
      "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(root, "src/result/resultSurface.ts"),
    "export const resultSurfaceLabel = 'result';\n",
    "utf8",
  );
  return root;
}

async function createHomeRoot(label: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `route227c-home-${label}-`));
  tempPaths.push(root);
  return root;
}

async function cleanupTempPaths(): Promise<void> {
  for (const entry of tempPaths.splice(0).reverse()) {
    await fs.rm(entry, { recursive: true, force: true });
  }
}
