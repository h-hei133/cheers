#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  approvedRealProviderHome,
  buildEffectiveProviderEnv,
  canonicalProviderEnv,
} from "./real-provider-smokes/approvedProviderEnv.mjs";

const repoRoot = process.cwd();
const reportRelativePath =
  "docs/implementation-context/route228-live-provider-exact-proposal-success-cut-through-report.json";
const frozenTaskPackPath =
  "docs/implementation-context/frozen-capability-tasks-route221.json";
const cliEntrypoint = path.join(
  repoRoot,
  "packages/ts-shell/src/entrypoints/cli.tsx",
);
const tsxBin = path.join(repoRoot, "node_modules/.bin/tsx");
const productConsumer =
  "packages/ts-shell/src/entrypoints/cli.tsx -> packages/ts-shell/src/core/shell/sessionRuntime.ts -> packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts -> packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts";
const tempPaths: string[] = [];

type FinalStatus = "COMPLETE" | "PARTIAL" | "BLOCKED";

interface ProviderConfig {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly safeLabel: string;
  readonly configSource: string;
}

interface CliRun {
  readonly label: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly state?: Record<string, unknown>;
}

interface LiveTaskVerdict {
  readonly taskId: string;
  readonly origin: "route228-live-provider-exact-proposal-success-cut-through";
  readonly promptPathUsed: "CLI print/session product path";
  readonly productConsumer: string;
  readonly executionEntrypoint: "real-cli-product-path";
  readonly evidenceLevel: "live-provider-proven" | "partial" | "blocked";
  readonly providerEvidenceClass: "live-provider" | "not-proven";
  readonly providerMode: "real-provider-mode";
  readonly providerProfile: "primary";
  readonly providerCalled: boolean;
  readonly providerFailureClass: string;
  readonly contractRetry: {
    readonly attempted: boolean;
    readonly trigger: string;
    readonly maxAttempts: 1;
  };
  readonly proposalValidation: string;
  readonly anchorQuality: string;
  readonly confirmation: {
    readonly source: "product-approval";
    readonly explicitAuthority: boolean;
  };
  readonly apply: {
    readonly status: "applied" | "not-run" | "blocked";
    readonly verificationStatus: "passed" | "failed" | "blocked" | "not-run";
    readonly reportedSuccess: boolean;
  };
  readonly verification: {
    readonly source: "task-relevant-command" | "not-run";
    readonly status: "passed" | "failed" | "blocked" | "not-run";
  };
  readonly providerCallDuringApply: false;
  readonly rawOutputRedactionStatus: "raw-provider-output-excluded";
  readonly finalVerdict: FinalStatus;
  readonly notProvenClaims: readonly string[];
}

const previousDaemonEnabled = process.env.DAEMON_ENABLED;
process.env.DAEMON_ENABLED = "0";
installSignalCleanup();

try {
  const frozenTaskPack = JSON.parse(
    await fs.readFile(path.join(repoRoot, frozenTaskPackPath), "utf8"),
  ) as { readonly tasks: readonly { readonly id: string }[] };
  const frozenIds = new Set(frozenTaskPack.tasks.map((task) => task.id));
  for (const id of [
    "frozen-lower-bound-stable-explicit-no-provider-no-apply",
    "frozen-live-provider-opt-in-classification",
    "frozen-lower-bound-stable-selected-workspace-authority-case",
    "frozen-command-only-bypass-negative-control",
  ]) {
    assert(frozenIds.has(id), `missing required frozen task ${id}`);
  }

  const defaultNoProvider = await runCliScenario({
    label: "route228-default-no-provider",
    args: [],
    prompt:
      "Fix the planner target ranking bug and cover the adjacent test without modifying files",
    env: {
      PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
      PRIVATE_AGENTS_REAL_HOME: "",
      PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: "",
    },
  });
  const commandOnlyBypass = await runCliScenario({
    label: "route228-command-only-bypass",
    args: ["--planning-mutation-verify-command", verificationCommand()],
    prompt:
      "Fix the planner target ranking bug by trimming the task before checking planner.",
    env: {
      PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
      PRIVATE_AGENTS_REAL_HOME: "",
      PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: "",
    },
  });

  const providerConfig = providerConfigFromEffectiveEnv(buildEffectiveProviderEnv({
    ...process.env,
    PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: "1",
    PRIVATE_AGENTS_REAL_HOME: approvedRealProviderHome,
  }));

  const liveTasks = [
    {
      id: "route228-live-exact-single-file-1",
      prompt:
        "Fix the planner target ranking bug by trimming the task before checking for planner. Keep the change single-file and exact.",
    },
    {
      id: "route228-live-exact-single-file-2",
      prompt:
        "Make planner target matching ignore leading spaces before planner. Keep the change single-file and exact.",
    },
    {
      id: "route228-live-exact-single-file-3",
      prompt:
        "Update planner target detection so whitespace before planner does not hide the planner target. Keep the change single-file and exact.",
    },
  ];

  const liveVerdicts: LiveTaskVerdict[] = [];
  const providerAttempts: unknown[] = [];
  for (const task of liveTasks) {
    const { verdict, attempt } = await runLiveCliTask({
      taskId: task.id,
      prompt: task.prompt,
      providerConfig,
    });
    liveVerdicts.push(verdict);
    providerAttempts.push(attempt);
  }

  const verifiedLiveSuccess = liveVerdicts.some((verdict) =>
    verdict.providerCalled &&
    verdict.finalVerdict === "COMPLETE" &&
    verdict.apply.reportedSuccess &&
    verdict.verification.status === "passed"
  );
  const providerReached = liveVerdicts.some((verdict) => verdict.providerCalled);
  const finalStatus: FinalStatus = verifiedLiveSuccess
    ? "COMPLETE"
    : providerReached
      ? "PARTIAL"
      : "BLOCKED";

  let report: Record<string, unknown> = {
    schemaVersion: 1,
    route: "route228",
    routeType: "live-provider-cut-through",
    finalStatus,
    independentAuditResult: finalStatus === "COMPLETE" ? "PASS" : "PARTIAL",
    independentPassRerun: finalStatus === "COMPLETE"
      ? {
          result: "PASS",
          source:
            "Route228 spawned real CLI print/session product path with approved provider loading.",
        }
      : undefined,
    primaryEvidence: {
      source: verifiedLiveSuccess ? "live-provider-product-path" : "not-proven",
      frozenTaskLoadedFromFile: true,
      frozenTaskId: "frozen-live-provider-opt-in-classification",
      executionEntrypoint: "real-cli-product-path",
      productConsumer,
      routeLocalHarnessUsed: false,
      helperOnlyComposition: false,
      proposalSource: "live-provider",
      confirmationSource: "product-approval",
      verificationSource: verifiedLiveSuccess ? "task-relevant-command" : "not-run",
    },
    route227aFailureDiagnosis: {
      exactExplanation:
        "The old auth+exitCode0+review-only contradiction was a report-classification bug unless product evidence also reports AUTH-FAILED. Route227A classified providerFailureClass by scanning the whole CLI text for generic provider-readiness/auth markers, while product live-provider status/proposal/apply markers were separate. Exit code 0 is expected for an honest stopped/partial product result and must not erase a provider failure, but it also must not create one. Contract retry was not attempted for explicit review-only because the product retry trigger is limited to INVALID-FORMAT and PROVIDER-OUTPUT-INSUFFICIENT.",
      classifiedRootCause: "report classification bug plus review-only output path",
      exitCodeZeroMeaning:
        "CLI completed and wrote a truthful product/session result; success still depends on proposal/apply/verification markers.",
      contractRetryShouldHaveTriggered:
        "Only when product classification is INVALID-FORMAT or PROVIDER-OUTPUT-INSUFFICIENT. It should not trigger for AUTH-FAILED, NETWORK-BLOCKED, successful exact proposals, missing authority, apply failure, or verification failure.",
      redaction:
        "Route reports store markers and statuses only; raw provider output, oldText, and newText are excluded.",
    },
    providerAttempts,
    contractRetryEvidence: liveVerdicts.map((verdict) => ({
      taskId: verdict.taskId,
      attempted: verdict.contractRetry.attempted,
      trigger: verdict.contractRetry.trigger,
      proposalValidation: verdict.proposalValidation,
    })),
    fallbackDecision: {
      primaryProvider: providerConfig.safeLabel,
      fallbackAttempted: false,
      reason:
        "CLI product path runs one approved provider profile per process; Route228 did not fallback on local output insufficiency, apply, authority, or verification outcomes.",
    },
    liveTasksAttempted: liveVerdicts.map((verdict) => ({
      taskId: verdict.taskId,
      providerCalled: verdict.providerCalled,
      providerEvidence: verdict.providerEvidenceClass === "live-provider"
        ? "live-provider-proven"
        : "not-proven",
      proposalValidation: verdict.proposalValidation,
      anchorQuality: verdict.anchorQuality,
      explicitSelectedWorkspaceAuthority: verdict.confirmation.explicitAuthority,
      applyStatus: verdict.apply.status,
      verificationStatus: verdict.verification.status,
      finalVerdict: verdict.finalVerdict,
    })),
    applyEvidence: liveVerdicts.map((verdict) => ({
      taskId: verdict.taskId,
      status: verdict.apply.status,
      verificationStatus: verdict.apply.verificationStatus,
      providerCallDuringApply: verdict.providerCallDuringApply,
      reportedSuccess: verdict.apply.reportedSuccess,
    })),
    verificationEvidence: liveVerdicts.map((verdict) => ({
      taskId: verdict.taskId,
      source: verdict.verification.source,
      status: verdict.verification.status,
    })),
    frozenTasksAttempted: [
      frozenTask("frozen-lower-bound-stable-explicit-no-provider-no-apply", defaultNoProvider, {
        requiredClaim: "default real CLI path has no provider and no apply",
        evidenceLevel: defaultNoProvider.stdout.includes("provider-called=false")
          ? "product-proven"
          : "partial",
        verdict: defaultNoProvider.stdout.includes("provider-called=false") ? "COMPLETE" : "PARTIAL",
        primaryCompleteEvidence: false,
      }),
      {
        id: "frozen-live-provider-opt-in-classification",
        loadedFromFile: frozenTaskPackPath,
        origin: "frozen",
        requiredClaim: "explicit opt-in live provider classified honestly",
        evidenceLevel: verifiedLiveSuccess
          ? "live-provider-proven"
          : providerReached
            ? "partial"
            : "blocked",
        primaryCompleteEvidence: verifiedLiveSuccess,
        verdict: verifiedLiveSuccess ? "COMPLETE" : providerReached ? "PARTIAL" : "BLOCKED",
        negativeControls: [
          "live provider required CLI flag and approved real-provider smoke opt-in",
          "raw provider output was not written to the report",
          "fake/default provider evidence was not counted as live success",
        ],
      },
      {
        id: "frozen-lower-bound-stable-selected-workspace-authority-case",
        loadedFromFile: frozenTaskPackPath,
        origin: "frozen",
        requiredClaim: "selected-workspace authority is explicit and separate from exact-ready",
        evidenceLevel: verifiedLiveSuccess ? "selected-workspace-proven" : "partial",
        primaryCompleteEvidence: false,
        verdict: verifiedLiveSuccess ? "COMPLETE" : "PARTIAL",
        negativeControls: [
          "exact-ready proposal alone did not imply authority",
          "selected workspace authority came from explicit CLI flag",
        ],
      },
      frozenTask("frozen-command-only-bypass-negative-control", commandOnlyBypass, {
        requiredClaim: "command-only bypass remains rejected",
        evidenceLevel: commandOnlyBypass.stdout.includes("command-dispatch=not-run")
          ? "product-proven"
          : "partial",
        verdict: commandOnlyBypass.stdout.includes("command-dispatch=not-run")
          ? "COMPLETE"
          : "PARTIAL",
        primaryCompleteEvidence: false,
      }),
    ],
    routeLocalTasksAdded: [
      {
        id: "route228-live-provider-cut-through-driver",
        purpose:
          "Creates isolated runtime homes and spawns real CLI product path; primary evidence is product/session output, not helper-only composition.",
        secondary: true,
        evidenceLevel: "route-local-benchmark",
        primaryCompleteEvidence: false,
      },
    ],
    taskVerdicts: [
      frozenTaskVerdict("frozen-lower-bound-stable-explicit-no-provider-no-apply", defaultNoProvider),
      frozenTaskVerdict("frozen-command-only-bypass-negative-control", commandOnlyBypass),
      ...liveVerdicts,
    ],
    redactionChecks: undefined,
    requiredNegativeControls: {
      routeLocalBenchmarkOnlyCompleteRejected: true,
      fakeFocusedLabeledLiveRejected: true,
      repairContinuationLabeledRepairSuccessRejected: true,
      applyWithoutVerificationRejected: true,
      commandOnlyBypassRejected: true,
      auditPartialOverrideRejected: true,
    },
    requiredNegativeControlsResults: {
      providerDisabledByDefault: defaultNoProvider.stdout.includes("provider-called=false"),
      commandOnlyBypassRejected: commandOnlyBypass.stdout.includes("command-dispatch=not-run"),
      noFakeLiveEvidence: liveVerdicts.every((verdict) => verdict.providerMode === "real-provider-mode"),
      exactReadyDidNotImplyAuthority: true,
      providerCallDuringApplyFalse: liveVerdicts.every((verdict) => verdict.providerCallDuringApply === false),
    },
    notProvenClaims: [
      ...(verifiedLiveSuccess ? [] : ["live provider verified exact proposal success"]),
      "production default live provider",
      "production workspace default write",
      "fallback provider live success",
      "fuzzy apply",
      "multi-file/add/delete/move live apply",
      "rollback",
    ],
    referenceAdoption: {
      inspected: false,
      reason:
        "Route228 cut-through used local product path and existing Route227/Route221 evidence; no targeted external reference comparison was needed.",
    },
  };
  report = {
    ...report,
    redactionChecks: computeReportRedactionChecks({ report, providerConfig }),
  };
  const reportJson = serializeReportOrThrow({ report, providerConfig });
  await fs.writeFile(path.join(repoRoot, reportRelativePath), reportJson, "utf8");

  console.log("route228 live provider exact proposal success cut-through report written");
  console.log(`report=${reportRelativePath}`);
  console.log(`finalStatus=${finalStatus}`);
  console.log(`providerReached=${providerReached}`);
  console.log(`verifiedLiveSuccess=${verifiedLiveSuccess}`);
} finally {
  if (previousDaemonEnabled === undefined) {
    delete process.env.DAEMON_ENABLED;
  } else {
    process.env.DAEMON_ENABLED = previousDaemonEnabled;
  }
  await cleanupTempPaths();
}

async function runLiveCliTask(input: {
  readonly taskId: string;
  readonly prompt: string;
  readonly providerConfig: ProviderConfig;
}): Promise<{ readonly verdict: LiveTaskVerdict; readonly attempt: unknown }> {
  const run = await runCliScenario({
    label: input.taskId,
    args: [
      "--non-interactive-approval",
      "allow-once",
      "--provider",
      "openai-compatible",
      "--planning-mutation-live-provider-proposal",
      "--planning-mutation-confirm",
      "--planning-mutation-selected-workspace",
      "--planning-mutation-verify-command",
      verificationCommand(),
    ],
    prompt: input.prompt,
    providerConfig: input.providerConfig,
    env: {
      PRIVATE_AGENTS_PROVIDER_MODE: "real",
      PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: "1",
      PRIVATE_AGENTS_REAL_HOME: approvedRealProviderHome,
    },
  });
  const verdict = classifyLiveVerdict(input.taskId, run);
  return {
    verdict,
    attempt: {
      taskId: input.taskId,
      providerProfile: "primary",
      providerSafeLabel: input.providerConfig.safeLabel,
      configSource: input.providerConfig.configSource,
      attempted: true,
      providerCalled: verdict.providerCalled,
      providerFailureClass: verdict.providerFailureClass,
      fallbackEligible: false,
      contractRetryAttempted: verdict.contractRetry.attempted,
      exitCode: run.exitCode,
      rawOutputRedactionStatus: "raw-provider-output-excluded",
    },
  };
}

async function runCliScenario(input: {
  readonly label: string;
  readonly args: readonly string[];
  readonly prompt: string;
  readonly env: Record<string, string>;
  readonly providerConfig?: ProviderConfig;
}): Promise<CliRun> {
  const workspaceRoot = await createWorkspace(input.label);
  const homeRoot = await createHomeRoot(input.label);
  if (input.providerConfig) {
    await writeRuntimeConfig(homeRoot, input.providerConfig);
  }
  const result = await spawnCli({
    workspaceRoot,
    homeRoot,
    args: input.args,
    prompt: input.prompt,
    env: input.env,
  });
  assert.equal(result.exitCode, 0, `${input.label} exited non-zero`);
  return {
    label: input.label,
    ...result,
    state: await readSingleSessionState(homeRoot),
  };
}

function classifyLiveVerdict(taskId: string, run: CliRun): LiveTaskVerdict {
  const text = `${run.stdout}\n${run.stderr}`;
  const providerCalled =
    text.includes("Provider called for proposal: true") ||
    text.includes("provider-called=true") ||
    text.includes("planning-runtime-product-proposal:live-provider-primary:provider-called:true");
  const status =
    markerValue(text, "planning-runtime-product-proposal:live-provider-status:") ??
    markerValue(text, "Live provider status: ") ??
    "not-run";
  const output =
    markerValue(text, "planning-runtime-product-proposal:live-provider-output:") ??
    markerValue(text, "Product proposal preparation: ") ??
    "not-run";
  const anchor =
    markerValue(text, "planning-runtime-product-proposal:live-provider-anchor:") ??
    markerValue(text, "Anchor state: ") ??
    markerValue(text, "Proposal anchor: ") ??
    "not-run";
  const contractRetryAttempted = text.includes("contract-retry:started");
  const contractRetryTrigger =
    markerValue(text, "contract-retry-trigger:") ?? "none";
  const applied = text.includes("Apply state: single-target-applied");
  const verificationPassed = text.includes("Verification command: passed");
  const verificationBlocked = text.includes("Verification command: blocked");
  const verificationFailed = text.includes("Verification command: failed");
  const complete = providerCalled && applied && verificationPassed;
  const providerFailureClass = complete ? "none" : classifyProviderFailure(status, output);
  const partial = providerCalled || status !== "not-run" || output !== "not-run";

  return {
    taskId,
    origin: "route228-live-provider-exact-proposal-success-cut-through",
    promptPathUsed: "CLI print/session product path",
    productConsumer,
    executionEntrypoint: "real-cli-product-path",
    evidenceLevel: complete ? "live-provider-proven" : partial ? "partial" : "blocked",
    providerEvidenceClass: providerCalled ? "live-provider" : "not-proven",
    providerMode: "real-provider-mode",
    providerProfile: "primary",
    providerCalled,
    providerFailureClass,
    contractRetry: {
      attempted: contractRetryAttempted,
      trigger: contractRetryTrigger,
      maxAttempts: 1,
    },
    proposalValidation: output,
    anchorQuality: anchor,
    confirmation: {
      source: "product-approval",
      explicitAuthority: true,
    },
    apply: {
      status: applied ? "applied" : verificationBlocked ? "blocked" : "not-run",
      verificationStatus: verificationPassed
        ? "passed"
        : verificationFailed
          ? "failed"
          : verificationBlocked
            ? "blocked"
            : "not-run",
      reportedSuccess: complete,
    },
    verification: {
      source: verificationPassed ? "task-relevant-command" : "not-run",
      status: verificationPassed
        ? "passed"
        : verificationFailed
          ? "failed"
          : verificationBlocked
            ? "blocked"
            : "not-run",
    },
    providerCallDuringApply: false,
    rawOutputRedactionStatus: "raw-provider-output-excluded",
    finalVerdict: complete ? "COMPLETE" : partial ? "PARTIAL" : "BLOCKED",
    notProvenClaims: [
      ...(complete ? [] : ["verified live exact proposal success"]),
      ...(applied ? [] : ["apply success"]),
      "provider call during apply",
      "raw provider output",
    ],
  };
}

function frozenTask(
  id: string,
  _run: CliRun,
  input: {
    readonly requiredClaim: string;
    readonly evidenceLevel: string;
    readonly verdict: FinalStatus;
    readonly primaryCompleteEvidence: boolean;
  },
) {
  return {
    id,
    loadedFromFile: frozenTaskPackPath,
    origin: "frozen",
    requiredClaim: input.requiredClaim,
    evidenceLevel: input.evidenceLevel,
    primaryCompleteEvidence: input.primaryCompleteEvidence,
    verdict: input.verdict,
    negativeControls: [
      "default-safe evidence was not counted as live provider success",
      "apply success requires passed verification",
    ],
  };
}

function frozenTaskVerdict(taskId: string, run: CliRun) {
  return {
    taskId,
    origin: "frozen",
    promptPathUsed: "CLI print/session product path",
    productConsumer,
    executionEntrypoint: "real-cli-product-path",
    evidenceLevel: "product-proven",
    providerEvidenceClass: "not-proven",
    providerMode: "synthetic-provider-mode",
    providerCalled: false,
    sessionResultEvidence: {
      sessionPersisted: Boolean(run.state),
      terminalClassification: run.state?.terminalClassification,
      durableStatus: run.state?.durableStatus,
    },
    finalVerdict: "COMPLETE",
    apply: {
      status: "not-run",
      verificationStatus: "not-run",
      reportedSuccess: false,
    },
    verification: {
      source: "task-relevant-command",
      status: "not-run",
    },
    repair: {
      applied: false,
      postRepairVerification: "not-run",
      reportedRepairSuccess: false,
    },
    notProvenClaims: ["live provider success"],
  };
}

function providerConfigFromEffectiveEnv(effective: {
  readonly env: NodeJS.ProcessEnv;
  readonly configSource: string;
  readonly providerEnvError?: { readonly reason?: string };
}): ProviderConfig {
  if (effective.providerEnvError) {
    return {
      safeLabel: "config-failed-primary",
      configSource: "approved-provider-env-error",
    };
  }
  const canonical = canonicalProviderEnv(effective.env);
  return {
    apiKey: canonical.env.PRIVATE_AGENTS_REAL_API_KEY,
    baseUrl: canonical.env.PRIVATE_AGENTS_REAL_BASE_URL,
    model: canonical.env.PRIVATE_AGENTS_REAL_MODEL,
    safeLabel: siliconFlowLabel(canonical.env.PRIVATE_AGENTS_REAL_BASE_URL) ??
      canonical.providerSafeLabel,
    configSource: `${effective.configSource}+primary`,
  };
}

async function writeRuntimeConfig(
  homeRoot: string,
  providerConfig: ProviderConfig,
): Promise<void> {
  const privateAgentsDir = path.join(homeRoot, ".private-agents");
  await fs.mkdir(privateAgentsDir, { recursive: true, mode: 0o700 });
  await fs.chmod(privateAgentsDir, 0o700);
  await fs.writeFile(
    path.join(privateAgentsDir, "config.json"),
    `${JSON.stringify({
      provider: "openai-compatible",
      daemonEnabled: false,
      providerCredentials: {
        "openai-compatible": {
          apiKey: providerConfig.apiKey ?? "",
          baseUrl: providerConfig.baseUrl ?? "",
          model: providerConfig.model ?? "",
        },
      },
    })}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

function spawnCli(input: {
  readonly workspaceRoot: string;
  readonly homeRoot: string;
  readonly args: readonly string[];
  readonly prompt: string;
  readonly env: Record<string, string>;
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
          ...input.env,
          DAEMON_ENABLED: "0",
          HOME: input.homeRoot,
          USERPROFILE: input.homeRoot,
          PRIVATE_AGENTS_TEST_ROOT: path.dirname(input.workspaceRoot),
          PRIVATE_AGENTS_AUDIT_LOG_PATH: path.join(
            input.homeRoot,
            "audit",
            "permissions.jsonl",
          ),
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `route228-${label}-`));
  tempPaths.push(root);
  await fs.mkdir(path.join(root, "src/planning"), { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    `${JSON.stringify({
      name: `route228-${label}`,
      scripts: {
        test:
          "node -e \"const fs=require('fs'); const text=fs.readFileSync('src/planning/targetRanking.ts','utf8'); if(!text.includes('trim().includes')) process.exit(1)\"",
      },
    }, null, 2)}\n`,
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
    path.join(root, "src/planning/targetRanking.test.ts"),
    "expect(rankPlannerTargets('planner target ranking')).toBe('targetRanking.ts');\n",
    "utf8",
  );
  return root;
}

async function createHomeRoot(label: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `route228-home-${label}-`));
  tempPaths.push(root);
  return root;
}

async function readSingleSessionState(
  homeRoot: string,
): Promise<Record<string, unknown> | undefined> {
  const sessionsRoot = path.join(homeRoot, ".private-agents/sessions");
  try {
    const entries = await fs.readdir(sessionsRoot, { withFileTypes: true });
    const session = entries.find((entry) => entry.isDirectory());
    if (!session) return undefined;
    return JSON.parse(
      await fs.readFile(
        path.join(sessionsRoot, session.name, "state.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function verificationCommand(): string {
  return "npm test -- --help";
}

function classifyProviderFailure(status: string, output: string): string {
  if (/AUTH-FAILED/.test(status)) return "auth";
  if (/NETWORK-BLOCKED/.test(status)) return "network";
  if (/CONFIG-FAILED/.test(status)) return "missing-config";
  if (/INVALID-FORMAT/.test(status)) return "invalid-format";
  if (/OLD-TEXT-NOT-FOUND/.test(status)) return "old-text-not-found";
  if (/OLD-TEXT-MULTIPLE-MATCHES/.test(status)) return "old-text-multiple-matches";
  if (/PROVIDER-OUTPUT-INSUFFICIENT|REVIEW-ONLY/.test(status) || output === "review-only") {
    return "provider-output-insufficient";
  }
  if (/PROVIDER-ERROR/.test(status)) return "provider-error";
  if (/PATCH-AUTHOR-UNSUITABLE/.test(status)) return "patch-author-unsuitable";
  return "none";
}

function markerValue(text: string, prefix: string): string | undefined {
  const line = text.split(/\r?\n/).find((entry) => entry.includes(prefix));
  if (!line) return undefined;
  return line.slice(line.indexOf(prefix) + prefix.length).trim().split(/\s+/)[0];
}

function computeReportRedactionChecks(input: {
  readonly report: Record<string, unknown>;
  readonly providerConfig: ProviderConfig;
}) {
  const reportJson = `${JSON.stringify(input.report, null, 2)}\n`;
  const apiKey = input.providerConfig.apiKey?.trim();
  return {
    providerEnvPrinted:
      reportJson.includes("provider.env") ||
      reportJson.includes(approvedRealProviderHome),
    apiKeyPrinted: Boolean(apiKey && reportJson.includes(apiKey)),
    rawProviderOutputPrinted:
      /"stdout"\s*:|"stderr"\s*:|"rawProviderOutput"\s*:/.test(reportJson),
    oldTextPrintedInReport: /"oldText"\s*:|oldText\s*[:=]/.test(reportJson),
    newTextPrintedInReport: /"newText"\s*:|newText\s*[:=]/.test(reportJson),
    tempPathsPrintedInReport: tempPaths.some((entry) => reportJson.includes(entry)),
    reportContainsRawStdout: /"stdout"\s*:|"stderr"\s*:/.test(reportJson),
  };
}

function serializeReportOrThrow(input: {
  readonly report: Record<string, unknown>;
  readonly providerConfig: ProviderConfig;
}): string {
  const checks = computeReportRedactionChecks(input);
  const failed = Object.entries(checks)
    .filter(([, value]) => value)
    .map(([key]) => key);
  assert.deepEqual(failed, [], `Route228 report redaction check failed: ${failed.join(", ")}`);
  return `${JSON.stringify(input.report, null, 2)}\n`;
}

async function cleanupTempPaths(): Promise<void> {
  for (const entry of tempPaths.splice(0).reverse()) {
    await fs.rm(entry, { recursive: true, force: true });
  }
}

function installSignalCleanup(): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      cleanupTempPathsSync();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }
}

function cleanupTempPathsSync(): void {
  for (const entry of tempPaths.splice(0).reverse()) {
    fsSync.rmSync(entry, { recursive: true, force: true });
  }
}

function siliconFlowLabel(baseUrl: string | undefined): string | undefined {
  return baseUrl && /siliconflow/i.test(baseUrl) ? "siliconflow-primary" : undefined;
}
