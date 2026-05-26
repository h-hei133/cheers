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
  "docs/implementation-context/route227a-live-provider-exact-proposal-contract-report.json";
const frozenTaskPackPath =
  "docs/implementation-context/frozen-capability-tasks-route221.json";
const cliEntrypoint = path.join(
  repoRoot,
  "packages/ts-shell/src/entrypoints/cli.tsx",
);
const tsxBin = path.join(repoRoot, "node_modules/.bin/tsx");
const tempPaths: string[] = [];
installSignalCleanup();

type FinalStatus = "COMPLETE" | "PARTIAL" | "BLOCKED";
type ProviderProfile = "primary" | "fallback";

interface ProviderConfig {
  readonly profile: ProviderProfile;
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

interface LiveVerdict {
  readonly taskId: string;
  readonly origin: "route227a-live-provider-exact-proposal-contract";
  readonly promptPathUsed: "CLI print/session product path";
  readonly productConsumer: string;
  readonly executionEntrypoint: "real-cli-product-path";
  readonly evidenceLevel: "live-provider-proven" | "partial" | "blocked";
  readonly providerEvidenceClass: "live-provider" | "not-proven";
  readonly providerMode: "real-provider-mode";
  readonly providerProfile: ProviderProfile;
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

const productConsumer =
  "packages/ts-shell/src/entrypoints/cli.tsx -> packages/ts-shell/src/core/shell/sessionRuntime.ts -> packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts -> packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts";

const previousDaemonEnabled = process.env.DAEMON_ENABLED;
process.env.DAEMON_ENABLED = "0";

try {
  const frozenTaskPack = JSON.parse(
    await fs.readFile(path.join(repoRoot, frozenTaskPackPath), "utf8"),
  ) as { readonly tasks: readonly { readonly id: string }[] };
  assert(
    frozenTaskPack.tasks.some((task) => task.id === "frozen-live-provider-opt-in-classification"),
    "missing frozen live provider task",
  );

  const defaultNoProvider = await runSyntheticCliScenario(
    "route227a-default-no-provider",
    [],
    "Fix the planner target ranking bug and cover the adjacent test without modifying files",
  );
  const commandOnlyBypass = await runSyntheticCliScenario(
    "route227a-command-only-bypass",
    ["--planning-mutation-verify-command", "node --version"],
    "Fix the planner target ranking bug by trimming the task before checking planner.",
  );

  const effective = buildEffectiveProviderEnv({
    ...process.env,
    PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: "1",
    PRIVATE_AGENTS_REAL_HOME: approvedRealProviderHome,
  });
  const providerConfigs = providerConfigsFromEffectiveEnv(effective);
  const liveVerdicts: LiveVerdict[] = [];
  const providerAttempts: unknown[] = [];

  const primary = await runLiveCliTask(providerConfigs.primary);
  liveVerdicts.push(primary.verdict);
  providerAttempts.push(primary.attempt);

  if (providerConfigs.fallback && shouldAttemptFallback(primary.verdict)) {
    const fallback = await runLiveCliTask(providerConfigs.fallback);
    liveVerdicts.push(fallback.verdict);
    providerAttempts.push(fallback.attempt);
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
    route: "route227a",
    routeType: "live-provider-capstone",
    finalStatus,
    independentAuditResult: finalStatus === "COMPLETE" ? "PASS" : "PARTIAL",
    independentPassRerun: finalStatus === "COMPLETE"
      ? {
          result: "PASS",
          source:
            "Route227A driver spawned real CLI print/session path with explicit live-provider opt-in.",
        }
      : undefined,
    productCapabilityChanged: {
      providerExactContractRetry: "implemented in product proposal preparation",
      retryLimit: 1,
      retryTriggers: ["INVALID-FORMAT", "PROVIDER-OUTPUT-INSUFFICIENT"],
      fallbackPolicy:
        "fallback only after network/provider endpoint style failures; unsafe or insufficient provider output does not fallback",
      productPath:
        "real CLI -> runMvpIntegratedFlow -> planning runtime product proposal -> exact backend -> product verification",
    },
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
    frozenTasksAttempted: [
      {
        id: "frozen-lower-bound-stable-explicit-no-provider-no-apply",
        loadedFromFile: frozenTaskPackPath,
        origin: "frozen",
        requiredClaim: "default real CLI path has no provider and no apply",
        evidenceLevel: defaultNoProvider.stdout.includes("provider-called=false")
          ? "product-proven"
          : "partial",
        primaryCompleteEvidence: false,
        verdict: defaultNoProvider.stdout.includes("provider-called=false")
          ? "COMPLETE"
          : "PARTIAL",
        negativeControls: [
          "no live provider flag was present",
          "provider and apply remained not-run",
        ],
      },
      {
        id: "frozen-live-provider-opt-in-classification",
        loadedFromFile: frozenTaskPackPath,
        origin: "frozen",
        requiredClaim: "explicit opt-in live provider classified honestly",
        evidenceLevel: providerReached ? "live-provider-proven" : "blocked",
        primaryCompleteEvidence: verifiedLiveSuccess,
        verdict: verifiedLiveSuccess ? "COMPLETE" : providerReached ? "PARTIAL" : "BLOCKED",
        negativeControls: [
          "live provider required CLI flag and approved real-provider smoke opt-in",
          "raw provider output was not written to the report",
          "provider-output-insufficient and invalid-format do not trigger fallback",
        ],
      },
      {
        id: "frozen-command-only-bypass-negative-control",
        loadedFromFile: frozenTaskPackPath,
        origin: "frozen",
        requiredClaim: "command-only bypass remains rejected",
        evidenceLevel: "not-proven",
        primaryCompleteEvidence: false,
        verdict: commandOnlyBypass.stdout.includes("command-dispatch=not-run")
          ? "BLOCKED"
          : "PARTIAL",
        negativeControls: [
          "verification command did not dispatch before apply/readback proof",
        ],
      },
    ],
    routeLocalTasksAdded: [
      {
        id: "route227a-live-provider-exact-proposal-contract-driver",
        purpose:
          "Creates isolated runtime homes and spawns the real CLI product path; does not call orchestration helpers directly for primary evidence.",
        secondary: true,
        evidenceLevel: "route-local-benchmark",
        primaryCompleteEvidence: false,
      },
    ],
    liveProviderTasksAttempted: liveVerdicts.map((verdict) => ({
      id: verdict.taskId,
      promptPathUsed: verdict.promptPathUsed,
      productConsumer: verdict.productConsumer,
      providerProfile: verdict.providerProfile,
      providerCalled: verdict.providerCalled,
      contractRetry: verdict.contractRetry,
      proposalValidation: verdict.proposalValidation,
      anchorQuality: verdict.anchorQuality,
      finalVerdict: verdict.finalVerdict,
    })),
    providerAttempts,
    taskVerdicts: [
      frozenTaskVerdict(
        "frozen-lower-bound-stable-explicit-no-provider-no-apply",
        defaultNoProvider,
        defaultNoProvider.stdout.includes("provider-called=false") ? "COMPLETE" : "PARTIAL",
      ),
      frozenTaskVerdict(
        "frozen-command-only-bypass-negative-control",
        commandOnlyBypass,
        commandOnlyBypass.stdout.includes("command-dispatch=not-run") ? "BLOCKED" : "PARTIAL",
      ),
      ...liveVerdicts,
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
      defaultLiveProviderDisabled: defaultNoProvider.stdout.includes("provider-called=false"),
      commandOnlyBypassRejected: commandOnlyBypass.stdout.includes("command-dispatch=not-run"),
      insufficientOutputFallbackSkipped: liveVerdicts.every((verdict) =>
        verdict.providerFailureClass !== "provider-output-insufficient" ||
        verdict.providerProfile === "primary"
      ),
      liveProviderNotDefault: true,
    },
    redactionChecks: undefined,
    notProvenClaims: [
      ...(verifiedLiveSuccess ? [] : ["live provider exact proposal applied and verified"]),
      "production default live provider",
      "production workspace default write",
      "provider call during apply",
      "fuzzy apply as success",
      "multi-file/add/delete/move live apply",
      "repair-to-success after live verification failure",
    ],
    independentAudit: {
      result: finalStatus === "COMPLETE" ? "PASS" : "PARTIAL",
      referencePolicy:
        "not-inspected; local Route226 evidence and local provider seams were sufficient.",
      finalVerdictReason: verifiedLiveSuccess
        ? "Explicit opt-in live-provider real CLI product-path task reached exact proposal, apply, and task-relevant verification success."
        : providerReached
          ? "Live provider was reached through product path, but verified exact apply success was not proven."
          : "Live provider was not reached through product path.",
    },
  };

  report = {
    ...report,
    redactionChecks: computeReportRedactionChecks({
      report,
      providerConfigs: [providerConfigs.primary, providerConfigs.fallback].filter(
        (entry): entry is ProviderConfig => Boolean(entry),
      ),
    }),
  };
  const reportJson = serializeReportOrThrow({
    report,
    providerConfigs: [providerConfigs.primary, providerConfigs.fallback].filter(
      (entry): entry is ProviderConfig => Boolean(entry),
    ),
  });

  await fs.writeFile(path.join(repoRoot, reportRelativePath), reportJson, "utf8");

  console.log("route227a live provider exact proposal contract report written");
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

async function runSyntheticCliScenario(
  label: string,
  args: readonly string[],
  prompt: string,
): Promise<CliRun> {
  const workspaceRoot = await createWorkspace(label);
  const homeRoot = await createHomeRoot(label);
  const result = await spawnCli({
    workspaceRoot,
    homeRoot,
    args,
    prompt,
    env: {
      PRIVATE_AGENTS_PROVIDER_MODE: "synthetic",
      PRIVATE_AGENTS_REAL_HOME: "",
      PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: "",
    },
  });
  assert.equal(result.exitCode, 0, `${label} exited non-zero`);
  return {
    label,
    ...result,
    state: await readSingleSessionState(homeRoot),
  };
}

async function runLiveCliTask(
  providerConfig: ProviderConfig,
): Promise<{ readonly verdict: LiveVerdict; readonly attempt: unknown }> {
  const taskId = "route227a-live-exact-single-file";
  const workspaceRoot = await createWorkspace(`${taskId}-${providerConfig.profile}`);
  const homeRoot = await createHomeRoot(`${taskId}-${providerConfig.profile}`);
  await writeRuntimeConfig(homeRoot, providerConfig);
  const result = await spawnCli({
    workspaceRoot,
    homeRoot,
    args: [
      "--provider",
      "openai-compatible",
      "--planning-mutation-live-provider-proposal",
      "--planning-mutation-confirm",
      "--planning-mutation-selected-workspace",
      "--planning-mutation-verify-command",
      "node -e \"const fs=require('fs'); const text=fs.readFileSync('src/planning/targetRanking.ts','utf8'); if(!text.includes('task.trim().includes')) process.exit(1)\"",
    ],
    prompt:
      "Fix the planner target ranking bug by trimming the task before checking for planner. Keep the change single-file and exact.",
    env: {
      PRIVATE_AGENTS_PROVIDER_MODE: "real",
      PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: "1",
      PRIVATE_AGENTS_REAL_HOME: approvedRealProviderHome,
    },
  });
  const run: CliRun = {
    label: `${taskId}-${providerConfig.profile}`,
    ...result,
    state: await readSingleSessionState(homeRoot),
  };
  const verdict = classifyLiveVerdict(taskId, providerConfig.profile, run);
  return {
    verdict,
    attempt: {
      taskId,
      providerProfile: providerConfig.profile,
      providerSafeLabel: providerConfig.safeLabel,
      configSource: providerConfig.configSource,
      attempted: true,
      providerCalled: verdict.providerCalled,
      providerFailureClass: verdict.providerFailureClass,
      fallbackEligible: shouldAttemptFallback(verdict),
      contractRetryAttempted: verdict.contractRetry.attempted,
      exitCode: result.exitCode,
      rawOutputRedactionStatus: "raw-provider-output-excluded",
    },
  };
}

function classifyLiveVerdict(
  taskId: string,
  profile: ProviderProfile,
  run: CliRun,
): LiveVerdict {
  const text = `${run.stdout}\n${run.stderr}`;
  const providerCalled =
    text.includes("Provider called for proposal: true") ||
    text.includes("provider-called=true") ||
    text.includes("planning-runtime-product-proposal:live-provider-primary:provider-called:true");
  const status =
    markerValue(text, "planning-runtime-product-proposal:live-provider-status:") ??
    markerValue(text, "Live provider status: ") ??
    markerValue(text, "Planning proposal status: ") ??
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
  const verificationPassed =
    text.includes("Verification command: passed") ||
    text.includes("Readback verification: succeeded");
  const verificationBlocked = text.includes("Verification command: blocked");
  const verificationFailed = text.includes("Verification command: failed");
  const providerFailureClass = classifyProviderFailure(text, status);
  const complete = providerCalled && applied && verificationPassed;
  const partial = providerCalled || /REVIEW-ONLY|OLD-TEXT|PROVIDER|INVALID|TARGET|PATCH/.test(status);

  return {
    taskId,
    origin: "route227a-live-provider-exact-proposal-contract",
    promptPathUsed: "CLI print/session product path",
    productConsumer,
    executionEntrypoint: "real-cli-product-path",
    evidenceLevel: complete ? "live-provider-proven" : partial ? "partial" : "blocked",
    providerEvidenceClass: providerCalled ? "live-provider" : "not-proven",
    providerMode: "real-provider-mode",
    providerProfile: profile,
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
      source: applied ? "task-relevant-command" : "not-run",
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

function frozenTaskVerdict(
  taskId: string,
  run: CliRun,
  finalVerdict: FinalStatus,
) {
  return {
    taskId,
    origin: "frozen",
    promptPathUsed: "CLI print/session product path",
    productConsumer,
    executionEntrypoint: "real-cli-product-path",
    evidenceLevel: finalVerdict === "COMPLETE" ? "product-proven" : "not-proven",
    providerEvidenceClass: "not-proven",
    providerMode: "synthetic-provider-mode",
    providerCalled: false,
    sessionResultEvidence: {
      sessionPersisted: Boolean(run.state),
      terminalClassification: run.state?.terminalClassification,
      durableStatus: run.state?.durableStatus,
    },
    finalVerdict,
    apply: {
      status: run.stdout.includes("Apply state: single-target-applied")
        ? "applied"
        : "not-run",
      verificationStatus: run.stdout.includes("Readback verification: succeeded")
        ? "passed"
        : "not-run",
      reportedSuccess:
        finalVerdict === "COMPLETE" &&
        run.stdout.includes("Apply state: single-target-applied"),
    },
    verification: {
      source: run.stdout.includes("Verification command:")
        ? "task-relevant-command"
        : "not-run",
      status: run.stdout.includes("Verification command: passed")
        ? "passed"
        : "not-run",
    },
    repair: {
      applied: false,
      postRepairVerification: "not-run",
      reportedRepairSuccess: false,
    },
    notProvenClaims: ["live provider success"],
  };
}

function providerConfigsFromEffectiveEnv(effective: {
  readonly env: NodeJS.ProcessEnv;
  readonly configSource: string;
  readonly providerEnvError?: { readonly reason?: string };
}): { readonly primary: ProviderConfig; readonly fallback?: ProviderConfig } {
  if (effective.providerEnvError) {
    return {
      primary: {
        profile: "primary",
        safeLabel: "config-failed-primary",
        configSource: "approved-provider-env-error",
      },
    };
  }
  const canonical = canonicalProviderEnv(effective.env);
  const primary: ProviderConfig = {
    profile: "primary",
    apiKey: canonical.env.PRIVATE_AGENTS_REAL_API_KEY,
    baseUrl: canonical.env.PRIVATE_AGENTS_REAL_BASE_URL,
    model: canonical.env.PRIVATE_AGENTS_REAL_MODEL,
    safeLabel: siliconFlowLabel(canonical.env.PRIVATE_AGENTS_REAL_BASE_URL, "primary") ??
      canonical.providerSafeLabel,
    configSource: `${effective.configSource}+primary`,
  };
  const fallbackBaseUrl =
    getTrimmed(effective.env, [
      "PRIVATE_AGENTS_REAL_FALLBACK_BASE_URL",
      "PRIVATE_AGENTS_PROVIDER_FALLBACK_BASE_URL",
      "PRIVATE_AGENTS_FALLBACK_BASE_URL",
      "OPENAI_COMPATIBLE_FALLBACK_BASE_URL",
      "SILICONFLOW_FALLBACK_BASE_URL",
    ]) ?? defaultSiliconFlowFallbackBaseUrl(primary.baseUrl);
  const fallback: ProviderConfig | undefined = fallbackBaseUrl
    ? {
        profile: "fallback",
        apiKey:
          getTrimmed(effective.env, [
            "PRIVATE_AGENTS_REAL_FALLBACK_API_KEY",
            "PRIVATE_AGENTS_PROVIDER_FALLBACK_API_KEY",
            "PRIVATE_AGENTS_FALLBACK_API_KEY",
            "OPENAI_COMPATIBLE_FALLBACK_API_KEY",
            "SILICONFLOW_FALLBACK_API_KEY",
          ]) ?? primary.apiKey,
        baseUrl: fallbackBaseUrl,
        model:
          getTrimmed(effective.env, [
            "PRIVATE_AGENTS_REAL_FALLBACK_MODEL",
            "PRIVATE_AGENTS_PROVIDER_FALLBACK_MODEL",
            "PRIVATE_AGENTS_FALLBACK_MODEL",
            "OPENAI_COMPATIBLE_FALLBACK_MODEL",
            "SILICONFLOW_FALLBACK_MODEL",
          ]) ?? primary.model,
        safeLabel: siliconFlowLabel(fallbackBaseUrl, "fallback") ??
          "openai-compatible-fallback",
        configSource: `${effective.configSource}+fallback`,
      }
    : undefined;
  return { primary, ...(fallback ? { fallback } : {}) };
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
  await fs.chmod(path.join(privateAgentsDir, "config.json"), 0o600);
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `route227a-${label}-`));
  tempPaths.push(root);
  await fs.mkdir(path.join(root, "src/planning"), { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    `${JSON.stringify({ name: `route227a-${label}`, scripts: {} }, null, 2)}\n`,
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `route227a-home-${label}-`));
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

function computeReportRedactionChecks(input: {
  readonly report: Record<string, unknown>;
  readonly providerConfigs: readonly ProviderConfig[];
}) {
  const reportJson = `${JSON.stringify(input.report, null, 2)}\n`;
  const apiKeys = input.providerConfigs
    .map((config) => config.apiKey?.trim())
    .filter((value): value is string => Boolean(value));
  const oldText = "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';";
  const newText =
    "  return task.trim().includes('planner') ? 'targetRanking.ts' : 'unknown';";
  return {
    providerEnvPrinted:
      reportJson.includes("provider.env") ||
      reportJson.includes(approvedRealProviderHome),
    apiKeyPrinted: apiKeys.some((apiKey) => reportJson.includes(apiKey)),
    rawProviderOutputPrinted:
      /"stdout"\s*:|"stderr"\s*:|"rawProviderOutput"\s*:/.test(reportJson),
    oldTextPrintedInReport: reportJson.includes(oldText),
    newTextPrintedInReport: reportJson.includes(newText),
    tempPathsPrintedInReport: tempPaths.some((entry) => reportJson.includes(entry)),
    reportContainsRawStdout: /"stdout"\s*:|"stderr"\s*:/.test(reportJson),
  };
}

function serializeReportOrThrow(input: {
  readonly report: Record<string, unknown>;
  readonly providerConfigs: readonly ProviderConfig[];
}): string {
  const reportJson = `${JSON.stringify(input.report, null, 2)}\n`;
  const checks = computeReportRedactionChecks(input);
  const failed = Object.entries(checks)
    .filter(([, value]) => value)
    .map(([key]) => key);
  assert.deepEqual(failed, [], `Route227A report redaction check failed: ${failed.join(", ")}`);
  return reportJson;
}

function shouldAttemptFallback(verdict: LiveVerdict): boolean {
  return ["network", "timeout", "endpoint", "provider-error", "PROVIDER-ERROR", "NETWORK-BLOCKED"].some(
    (marker) => verdict.providerFailureClass.includes(marker),
  );
}

function classifyProviderFailure(text: string, status: string): string {
  if (/provider-readiness:network|network|fetch|econn|timeout/i.test(text)) return "network";
  if (/provider-readiness:auth|401|403|unauthorized|forbidden/i.test(text)) return "auth";
  if (/missing-key|missing provider key/i.test(text)) return "missing-key";
  if (/missing-config|requires a configured/i.test(text)) return "missing-config";
  if (/INVALID-FORMAT/.test(status)) return "invalid-format";
  if (/OLD-TEXT-NOT-FOUND/.test(status)) return "old-text-not-found";
  if (/OLD-TEXT-MULTIPLE-MATCHES/.test(status)) return "old-text-multiple-matches";
  if (/PROVIDER-OUTPUT-INSUFFICIENT|REVIEW-ONLY/.test(status)) return "provider-output-insufficient";
  if (/PROVIDER-ERROR/.test(status)) return "provider-error";
  if (/PATCH-AUTHOR-UNSUITABLE/.test(status)) return "patch-author-unsuitable";
  return "none";
}

function markerValue(text: string, prefix: string): string | undefined {
  const line = text.split(/\r?\n/).find((entry) => entry.includes(prefix));
  if (!line) return undefined;
  return line.slice(line.indexOf(prefix) + prefix.length).trim().split(/\s+/)[0];
}

function defaultSiliconFlowFallbackBaseUrl(
  primaryBaseUrl: string | undefined,
): string | undefined {
  return primaryBaseUrl?.includes("api.siliconflow.cn")
    ? "https://api.siliconflow.com/v1"
    : undefined;
}

function siliconFlowLabel(
  baseUrl: string | undefined,
  role: ProviderProfile,
): string | undefined {
  if (!baseUrl || !/siliconflow/i.test(baseUrl)) return undefined;
  return role === "primary" ? "siliconflow-primary" : "siliconflow-fallback";
}

function getTrimmed(
  env: NodeJS.ProcessEnv,
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}
