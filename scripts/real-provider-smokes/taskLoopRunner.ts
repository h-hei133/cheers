import {
  createOpenAICompatibleAnchoredSmokeAdapter,
  classifyOpenAICompatibleAnchoredSmokeError,
} from "../../packages/ts-shell/src/orchestration/openAICompatibleAnchoredSmokeAdapter.js";
import { checkRealProviderReadiness } from "../../packages/ts-shell/src/core/shell/providerReadiness.js";
import { approveLiveProviderAdapter } from "../../packages/ts-shell/src/orchestration/liveProviderAdapterApproval.js";
import { runRealTaskLoopRuntime } from "../../packages/ts-shell/src/orchestration/realTaskLoopRuntime.js";
import {
  realTaskLoopExactNewText,
  realTaskLoopExactOldText,
  realTaskLoopRepairableFailedText,
} from "../../packages/ts-shell/src/orchestration/realTaskLoopFixture.js";
import type { RealTaskLoopRuntimeOutput } from "../../packages/ts-shell/src/orchestration/realTaskLoopRuntime.js";
import type { ProviderEditAvailability } from "../../packages/ts-shell/src/orchestration/providerEditPlanner.js";
import type { ProviderEditRawProposal } from "../../packages/ts-shell/src/orchestration/providerEditProposal.js";
import type { RealProviderProposalDryRunProvider } from "../../packages/ts-shell/src/orchestration/realProviderProposalDryRun.js";
import type { RuntimeProvider } from "../../packages/ts-shell/src/config/runtimeConfig.js";

type ReadinessStatus =
  | "ready"
  | "missing-config"
  | "missing-key"
  | "unsupported"
  | "auth"
  | "network"
  | "not-ready"
  | "unknown";

interface RunnerConfig {
  readonly fakeReady: boolean;
  readonly providerKind: string;
  readonly providerSafeLabel: string;
  readonly providerConfigSource: string;
  readonly providerEnvError?: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
}

const liveOptIn = process.env.PRIVATE_AGENTS_LIVE_TASK_LOOP_SMOKE?.trim() === "1";
const realProviderOptIn = process.env.PRIVATE_AGENTS_REAL_PROVIDER_SMOKE?.trim() === "1";
const confirmApply = process.env.PRIVATE_AGENTS_CONFIRM_TASK_LOOP_APPLY?.trim() === "1";
const simulateVerificationFailure = process.env.PRIVATE_AGENTS_TASK_LOOP_SIMULATE_VERIFICATION_FAILURE?.trim() === "1";
const repairProof = process.env.PRIVATE_AGENTS_TASK_LOOP_REPAIR_PROOF?.trim() === "1";
const confirmRepairApply = process.env.PRIVATE_AGENTS_CONFIRM_TASK_LOOP_REPAIR_APPLY?.trim() === "1";
const testRoot = process.env.PRIVATE_AGENTS_TEST_ROOT?.trim();
const routeApprovalLabel = process.env.PRIVATE_AGENTS_TASK_LOOP_APPROVAL_LABEL?.trim() || "Route 200 task loop";
const routeSupportLabel = process.env.PRIVATE_AGENTS_TASK_LOOP_ROUTE_LABEL?.trim() || "route200 task loop";
const runnerLabel = process.env.PRIVATE_AGENTS_TASK_LOOP_RUNNER_LABEL?.trim() || "route200-real-provider-task-loop-mvp";
const requestId = process.env.PRIVATE_AGENTS_TASK_LOOP_REQUEST_ID?.trim() || "route200-live-task-loop";
const config = readConfig();

console.log(`task-loop-runner=${runnerLabel}`);
console.log(`live-task-loop-opt-in=${liveOptIn}`);
console.log(`real-provider-smoke-opt-in=${realProviderOptIn}`);
console.log(`confirm-apply=${confirmApply}`);
console.log(`simulate-verification-failure=${simulateVerificationFailure}`);
console.log(`repair-proof=${repairProof}`);
console.log(`confirm-repair-apply=${confirmRepairApply}`);
console.log("private-config-manual-read=false");

run().catch((error) => {
  const providerErrorClass = classifyOpenAICompatibleAnchoredSmokeError(error);
  console.log("runner-error=true");
  console.log("runtime-state=unavailable");
  console.log(`provider-error-class=${providerErrorClass}`);
  process.exitCode = exitCodeForProviderErrorClass(providerErrorClass);
});

async function run(): Promise<void> {
  if (config.providerEnvError) {
    await runWithApprovalSkip({
      providerReadinessStatus: "missing-config",
      skipDetail: config.providerEnvError,
      providerAvailability: { kind: "not-configured", reason: config.providerEnvError },
    });
    return;
  }

  if (!liveOptIn || !realProviderOptIn) {
    await runWithApprovalSkip({
      providerReadinessStatus: liveOptIn ? "not-ready" : "unknown",
      skipDetail: liveOptIn
        ? "real provider smoke opt-in is required"
        : "live task loop opt-in is required",
      providerAvailability: { kind: "opt-in-required", reason: "live task loop and real provider smoke opt-ins are required" },
    });
    return;
  }

  if (config.fakeReady) {
    const approval = approveLiveProviderAdapter({
      explicitLiveSmokeOptIn: true,
      realProviderSmokeOptIn: true,
      providerReadinessStatus: "ready",
      providerKind: "openai-compatible",
      providerSafeLabel: config.providerSafeLabel,
      providerConfigSource: config.providerConfigSource,
      privateConfigManualRead: false,
      fixtureSafetyStatus: "safe",
      redactionStatus: "redacted-and-budgeted",
    });
    const provider = repairProof ? buildTaskLoopRepairableFailureProvider() : buildTaskLoopFakeProvider();
    await runApproved({
      provider,
      providerAvailability: { kind: "available", providerKindLabel: config.providerSafeLabel },
      approval,
    });
    return;
  }

  if (config.providerKind !== "openai-compatible") {
    await runWithApprovalSkip({
      providerReadinessStatus: "unsupported",
      skipDetail: `provider ${config.providerKind || "unknown"} is not approved for ${routeApprovalLabel}`,
      providerAvailability: { kind: "unsupported", reason: `${routeSupportLabel} supports openai-compatible only` },
    });
    return;
  }

  const missingConfig = firstMissingConfig(config);
  if (missingConfig) {
    await runWithApprovalSkip({
      providerReadinessStatus: missingConfig === "api-key" ? "missing-key" : "missing-config",
      skipDetail: `${missingConfig} is missing`,
      providerAvailability: { kind: "not-configured", reason: `${missingConfig} is missing` },
    });
    return;
  }

  const readiness = await checkRealProviderReadiness({
    provider: "openai-compatible",
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
  });
  if (readiness.ok === false) {
    const readinessStatus = mapReadinessFailure(readiness.failure.kind);
    await runWithApprovalSkip({
      providerReadinessStatus: readinessStatus,
      skipDetail: readiness.failure.stopReason,
      providerAvailability: availabilityForReadiness(readinessStatus, readiness.failure.stopReason),
    });
    return;
  }

  const approval = approveLiveProviderAdapter({
    explicitLiveSmokeOptIn: true,
    realProviderSmokeOptIn: true,
    providerReadinessStatus: "ready",
    providerKind: "openai-compatible",
    providerSafeLabel: config.providerSafeLabel,
    providerConfigSource: config.providerConfigSource,
    privateConfigManualRead: false,
    fixtureSafetyStatus: "safe",
    redactionStatus: "redacted-and-budgeted",
  });
  if (!approval.adapterApproved) {
    await runWithApprovalSkip({
      providerReadinessStatus: "ready",
      skipDetail: approval.skipReason ?? "adapter not approved",
      providerAvailability: { kind: "unsupported", reason: approval.skipReason ?? "adapter not approved" },
    });
    return;
  }

  const provider = createOpenAICompatibleAnchoredSmokeAdapter({
    apiKey: config.apiKey!,
    baseUrl: config.baseUrl!,
    model: config.model!,
    providerSafeLabel: config.providerSafeLabel,
  });
  await runApproved({
    provider,
    providerAvailability: { kind: "available", providerKindLabel: config.providerSafeLabel },
    approval,
  });
}

async function runWithApprovalSkip(input: {
  readonly providerReadinessStatus: ReadinessStatus;
  readonly skipDetail: string;
  readonly providerAvailability: ProviderEditAvailability;
}): Promise<void> {
  const approval = approveLiveProviderAdapter({
    explicitLiveSmokeOptIn: liveOptIn,
    realProviderSmokeOptIn: realProviderOptIn,
    providerReadinessStatus: input.providerReadinessStatus,
    providerKind: config.providerKind,
    providerSafeLabel: config.providerSafeLabel,
    providerConfigSource: config.providerConfigSource,
    providerAvailability: input.providerAvailability,
    privateConfigManualRead: false,
    fixtureSafetyStatus: "safe",
    redactionStatus: "redacted-and-budgeted",
  });
  printApproval(approval);
  console.log(`readiness-status=${input.providerReadinessStatus}`);
  console.log(`readiness-detail=${safeDetail(input.skipDetail)}`);
  const output = await runRealTaskLoopRuntime({
    requestId,
    providerMode: liveOptIn && realProviderOptIn ? "real-opt-in" : "default-skip",
    confirmApply: false,
    simulateVerificationFailure,
    runRepairAfterVerificationFailure: repairProof,
    confirmRepairApply,
    providerAvailability: input.providerAvailability,
    ...(testRoot ? { testRoot } : {}),
  });
  printRuntimeOutput(output, {
    readinessStatus: input.providerReadinessStatus,
    approvalProviderErrorClass: approval.providerErrorClass,
  });
}

async function runApproved(input: {
  readonly provider: RealProviderProposalDryRunProvider;
  readonly providerAvailability: ProviderEditAvailability;
  readonly approval: ReturnType<typeof approveLiveProviderAdapter>;
}): Promise<void> {
  printApproval(input.approval);
  const output = await runRealTaskLoopRuntime({
    requestId,
    providerMode: "real-opt-in",
    confirmApply,
    simulateVerificationFailure,
    runRepairAfterVerificationFailure: repairProof,
    confirmRepairApply,
    providerAvailability: input.providerAvailability,
    provider: input.provider,
    evidenceSource: config.fakeReady ? "fake-ready" : "live-provider",
    ...(testRoot ? { testRoot } : {}),
  });
  printRuntimeOutput(output, {
    readinessStatus: "ready",
    approvalProviderErrorClass: input.approval.providerErrorClass,
  });
}

function printRuntimeOutput(
  output: Awaited<ReturnType<typeof runRealTaskLoopRuntime>>,
  classification: {
    readonly readinessStatus: ReadinessStatus;
    readonly approvalProviderErrorClass?: string;
  },
): void {
  console.log(output.result.output);
  const evidence = output.result.evidence.join("\n");
  for (const marker of [
    `provider-called=${output.result.providerCalled}`,
    `output-validation=${output.result.outputValidationStatus}`,
    `confirmation=${output.result.confirmationStatus}`,
    `apply=${output.result.applyStatus}`,
    `verification=${output.result.verificationStatus}`,
    `mutation-scope=${output.result.mutationScope}`,
    `anchor-quality=${output.result.anchorQuality}`,
    `snapshot=${output.result.snapshotStatus}`,
    `recovery=${output.result.recoveryStatus}`,
    `repair-status=${output.result.repairProof?.status ?? "not-run"}`,
    `repair-proposal=${output.result.repairProof?.proposalStatus ?? "not-run"}`,
    `repair-anchor=${output.result.repairProof?.anchorStatus ?? "not-run"}`,
    `repair-confirmation=${output.result.repairProof?.confirmationStatus ?? "not-requested"}`,
    `repair-apply=${output.result.repairProof?.applyStatus ?? "not-run"}`,
    `repair-verification=${output.result.repairProof?.verificationStatus ?? "not-run"}`,
    `repair-evidence-original-readback=${evidence.includes("real-task-loop-repair:original-readback:failed")}`,
    `repair-evidence-proposal-source=${output.result.repairProof?.evidenceSource ?? "none"}`,
    `repair-evidence-existing-exact-apply-lane=${evidence.includes("real-task-loop-repair:apply-route:existing-exact-lane")}`,
    `repair-evidence-final-readback=${evidence.includes("real-task-loop-repair:readback:status:passed")}`,
    `repair-evidence-runtime-derived=${evidence.includes("real-task-loop-repair:original-readback:failed") && evidence.includes("real-task-loop-repair:readback:status:passed")}`,
    `status=${output.result.status}`,
    `claim-ledger=${output.result.claimLedger.ledgerId}`,
    `claim-ledger-source=${output.result.claimLedger.evidenceSource}`,
    `claim-ledger-terminal=${output.result.claimLedger.terminal.status}`,
    `claim-ledger-live-success=${output.result.claimLedger.terminal.liveSuccess}`,
    `claim-ledger-not-proven=${output.result.claimLedger.notProvenClaims.length === 0 ? "none" : output.result.claimLedger.notProvenClaims.map((claim) => claim.group).join(",")}`,
    "no-broad-mutation=true",
    `provider-call-during-apply=${output.result.providerCallDuringApply}`,
  ]) {
    console.log(marker);
  }

  if (output.runtime?.dryRun?.providerErrorClass) {
    console.log(`provider-error-class=${output.runtime.dryRun.providerErrorClass}`);
  }
  const exitCode = exitCodeForOutput(output, classification);
  if (exitCode !== 0) process.exitCode = exitCode;
}

function readConfig(): RunnerConfig {
  const env = process.env;
  const providerKind = normalizeProvider(
    env.PRIVATE_AGENTS_REAL_PROVIDER ?? env.PRIVATE_AGENTS_PROVIDER,
  ) ?? "unknown";
  const providerSafeLabel =
    env.PRIVATE_AGENTS_TASK_LOOP_PROVIDER_SAFE_LABEL?.trim() ||
    (providerKind === "openai-compatible" ? "openai-compatible" : providerKind);
  return {
    fakeReady: env.PRIVATE_AGENTS_TASK_LOOP_FAKE_READY?.trim() === "1",
    providerKind,
    providerSafeLabel,
    providerConfigSource: env.PRIVATE_AGENTS_TASK_LOOP_CONFIG_SOURCE?.trim() || "unknown",
    providerEnvError: env.PRIVATE_AGENTS_TASK_LOOP_PROVIDER_ENV_ERROR?.trim() || undefined,
    apiKey:
      env.PRIVATE_AGENTS_REAL_API_KEY?.trim() ||
      env.OPENAI_COMPATIBLE_API_KEY?.trim() ||
      env.OPENAI_API_KEY?.trim(),
    baseUrl:
      env.PRIVATE_AGENTS_REAL_BASE_URL?.trim() ||
      env.PRIVATE_AGENTS_PROVIDER_BASE_URL?.trim() ||
      env.PRIVATE_AGENTS_BASE_URL?.trim() ||
      env.OPENAI_COMPATIBLE_BASE_URL?.trim() ||
      env.OPENAI_BASE_URL?.trim() ||
      env.OPENAI_API_BASE?.trim() ||
      env.OPENAI_API_BASE_URL?.trim() ||
      env.API_BASE_URL?.trim() ||
      env.BASE_URL?.trim(),
    model:
      env.PRIVATE_AGENTS_REAL_MODEL?.trim() ||
      env.PRIVATE_AGENTS_PROVIDER_MODEL?.trim() ||
      env.PRIVATE_AGENTS_MODEL?.trim() ||
      env.OPENAI_COMPATIBLE_MODEL?.trim() ||
      env.OPENAI_MODEL?.trim() ||
      env.MODEL?.trim(),
  };
}

function firstMissingConfig(config: RunnerConfig): "api-key" | "base-url" | "model" | undefined {
  if (!config.apiKey) return "api-key";
  if (!config.baseUrl) return "base-url";
  if (!config.model) return "model";
  return undefined;
}

function mapReadinessFailure(kind: string): ReadinessStatus {
  switch (kind) {
    case "missing-key":
      return "missing-key";
    case "missing-config":
      return "missing-config";
    case "unsupported-provider":
      return "unsupported";
    case "auth":
      return "auth";
    case "network":
      return "network";
    default:
      return "unknown";
  }
}

function availabilityForReadiness(status: ReadinessStatus, reason: string): ProviderEditAvailability {
  if (status === "unsupported") return { kind: "unsupported", reason };
  if (status === "missing-config" || status === "missing-key") {
    return { kind: "not-configured", reason };
  }
  return { kind: "request-blocked", reason };
}

function printApproval(approval: ReturnType<typeof approveLiveProviderAdapter>): void {
  console.log(`adapter-approval-decision=${approval.decision}`);
  console.log(`adapter-approved=${approval.adapterApproved ? "true" : "false"}`);
  console.log(`provider-kind=${approval.providerKind}`);
  console.log(`provider-safe-label=${approval.providerSafeLabel}`);
  console.log(`provider-config-source=${approval.providerConfigSource}`);
  console.log(`provider-error-class=${approval.providerErrorClass || "none"}`);
  if (approval.skipReason) console.log(`skip-reason=${approval.skipReason}`);
}

function buildTaskLoopFakeProvider(): RealProviderProposalDryRunProvider {
  return {
    proposeEdit: (): ProviderEditRawProposal => ({
      operationKind: "exact-fenced-replacement",
      targets: [
        {
          path: "src/smoke.ts",
          summary: "rename startApp declaration and local call site to runApp",
          oldText: realTaskLoopExactOldText,
          newText: realTaskLoopExactNewText,
        },
      ],
      confidence: "high",
      riskSummary: "controlled fixture exact rename",
      verificationPlan: ["safe readback verifies runApp and absence of startApp"],
    }),
  };
}

function buildTaskLoopRepairableFailureProvider(): RealProviderProposalDryRunProvider {
  return {
    proposeEdit: (): ProviderEditRawProposal => ({
      operationKind: "exact-fenced-replacement",
      targets: [
        {
          path: "src/smoke.ts",
          summary: "rename declaration while leaving controlled readback failure for repair",
          oldText: realTaskLoopExactOldText,
          newText: realTaskLoopRepairableFailedText,
        },
      ],
      confidence: "high",
      riskSummary: "controlled fixture repair proof chain",
      verificationPlan: ["readback fails before repair and succeeds after confirmed repair"],
    }),
  };
}

function normalizeProvider(value: string | undefined): RuntimeProvider | undefined {
  const normalized = value?.trim().toLowerCase().replace(/_/g, "-");
  switch (normalized) {
    case "compatible":
    case "openaicompatible":
    case "openai-compatible-api":
    case "siliconflow":
    case "deepseek":
      return "openai-compatible";
    case "openai":
    case "anthropic":
    case "openai-compatible":
    case "google":
    case "antigravity":
    case "claudecode":
      return normalized;
    default:
      return undefined;
  }
}

function safeDetail(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9][A-Za-z0-9._-]{8,}\b/g, "[REDACTED_API_KEY]")
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[REAL_PROVIDER_HOME]");
}

function exitCodeForOutput(
  output: RealTaskLoopRuntimeOutput,
  classification: {
    readonly readinessStatus: ReadinessStatus;
    readonly approvalProviderErrorClass?: string;
  },
): number {
  const evidence = output.result.evidence.join("\n");
  const repairRuntimeEvidence = {
    originalReadbackFailed: evidence.includes("real-task-loop-repair:original-readback:failed"),
    existingExactApplyLane: evidence.includes("real-task-loop-repair:apply-route:existing-exact-lane"),
    finalReadbackPassed: evidence.includes("real-task-loop-repair:readback:status:passed"),
    runtimeDerived: evidence.includes("real-task-loop-repair:original-readback:failed") &&
      evidence.includes("real-task-loop-repair:readback:status:passed") &&
      output.result.repairProof?.verificationRuntimeDerived === true,
  };
  const providerErrorClass = output.runtime?.dryRun?.providerErrorClass ||
    normalizeProviderErrorClass(classification.approvalProviderErrorClass);
  if (providerErrorClass) return exitCodeForProviderErrorClass(providerErrorClass);
  if (classification.readinessStatus !== "ready") {
    return exitCodeForReadinessStatus(classification.readinessStatus);
  }
  if (repairProof) {
    if (!confirmApply) return 1;
    if (!confirmRepairApply) {
      return output.result.claimLedger.terminal.status === "repair-confirmation-required" &&
        output.result.providerCalled === true &&
        output.result.outputValidationStatus === "valid-exact-single-target" &&
        output.result.anchorQuality === "exact-ready" &&
        output.result.confirmationStatus === "trusted-confirmed" &&
        output.result.applyStatus === "succeeded" &&
        output.result.verificationStatus === "failed" &&
        output.result.repairProof?.proposalStatus === "created" &&
        output.result.repairProof?.anchorStatus === "exact-ready" &&
        output.result.repairProof?.confirmationStatus === "required" &&
        output.result.repairProof?.applyStatus === "not-run" &&
        output.result.repairProof?.verificationStatus === "not-run" &&
        repairRuntimeEvidence.originalReadbackFailed === true &&
        repairRuntimeEvidence.existingExactApplyLane === false &&
        repairRuntimeEvidence.finalReadbackPassed === false &&
        repairRuntimeEvidence.runtimeDerived === false &&
        output.result.providerCallDuringApply === false
        ? 0
        : 1;
    }
    return output.result.claimLedger.terminal.status === "verification-succeeded-with-repair-not-live" &&
      output.result.claimLedger.terminal.liveSuccess === false &&
      output.result.providerCalled === true &&
      output.result.applyStatus === "succeeded" &&
      output.result.verificationStatus === "failed" &&
      output.result.repairProof?.evidenceSource === "fake-provider" &&
      output.result.repairProof?.applyStatus === "succeeded" &&
      output.result.repairProof?.verificationStatus === "succeeded" &&
      output.result.repairProof?.providerCallDuringApply === false &&
      repairRuntimeEvidence.originalReadbackFailed === true &&
      repairRuntimeEvidence.existingExactApplyLane === true &&
      repairRuntimeEvidence.finalReadbackPassed === true &&
      repairRuntimeEvidence.runtimeDerived === true
      ? 0
      : 1;
  }
  if (output.result.applyStatus === "failed" || output.result.verificationStatus === "failed") return 1;

  if (!liveOptIn) {
    return output.result.providerCalled === false &&
      output.result.applyStatus === "not-run" &&
      output.result.verificationStatus === "not-run"
      ? 0
      : 1;
  }

  if (!realProviderOptIn) return 3;

  if (confirmApply) {
    if (config.fakeReady) {
      return output.result.claimLedger.evidenceSource === "fake-ready" &&
        output.result.claimLedger.terminal.liveSuccess === false &&
        output.result.claimLedger.terminal.status === "verification-succeeded-not-live" &&
        output.result.providerCalled === true &&
        output.result.outputValidationStatus === "valid-exact-single-target" &&
        output.result.anchorQuality === "exact-ready" &&
        output.result.confirmationStatus === "trusted-confirmed" &&
        output.result.applyStatus === "succeeded" &&
        output.result.verificationStatus === "succeeded" &&
        output.result.mutationScope === "controlled-temp-workspace" &&
        output.result.providerCallDuringApply === false &&
        (output.result.snapshotStatus === "created" || output.result.recoveryStatus === "available")
        ? 0
        : 1;
    }
    return output.result.claimLedger.evidenceSource === "live-provider" &&
      output.result.claimLedger.terminal.status === "verified-success" &&
      output.result.claimLedger.terminal.liveSuccess === true
      ? 0
      : 1;
  }

  return output.result.claimLedger.terminal.status === "confirmation-required" &&
    output.result.providerCalled === true &&
    output.result.outputValidationStatus === "valid-exact-single-target" &&
    output.result.anchorQuality === "exact-ready" &&
    output.result.confirmationStatus === "required" &&
    output.result.applyStatus === "not-run" &&
    output.result.verificationStatus === "not-run"
    ? 0
    : 1;
}

function exitCodeForReadinessStatus(status: ReadinessStatus): number {
  if (status === "network") return 2;
  if (
    status === "auth" ||
    status === "missing-key" ||
    status === "missing-config" ||
    status === "unsupported" ||
    status === "not-ready"
  ) {
    return 3;
  }
  return liveOptIn ? 3 : 0;
}

function exitCodeForProviderErrorClass(providerErrorClass: string): number {
  if (providerErrorClass === "network" || providerErrorClass === "timeout") return 2;
  if (
    providerErrorClass === "auth" ||
    providerErrorClass === "missing-key" ||
    providerErrorClass === "unsupported"
  ) {
    return 3;
  }
  return 1;
}

function normalizeProviderErrorClass(value: string | undefined): string | undefined {
  if (!value || value === "none") return undefined;
  return value;
}
