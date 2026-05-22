import type { RuntimeProvider } from "../../packages/ts-shell/src/config/runtimeConfig.js";
import { checkRealProviderReadiness } from "../../packages/ts-shell/src/core/shell/providerReadiness.js";
import { approveLiveProviderAdapter } from "../../packages/ts-shell/src/orchestration/liveProviderAdapterApproval.js";
import {
  buildLiveSmokeExpectedAnchoredProposal,
  buildLiveSmokeFixture,
} from "../../packages/ts-shell/src/orchestration/liveProviderSmokeFixture.js";
import { runLiveProviderSmokeCalibration } from "../../packages/ts-shell/src/orchestration/liveProviderSmokeCalibration.js";
import { createOpenAICompatibleAnchoredSmokeAdapter } from "../../packages/ts-shell/src/orchestration/openAICompatibleAnchoredSmokeAdapter.js";
import type { ProviderEditAvailability } from "../../packages/ts-shell/src/orchestration/providerEditPlanner.js";
import type { RealProviderProposalDryRunProvider } from "../../packages/ts-shell/src/orchestration/realProviderProposalDryRun.js";

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
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
}

async function main(): Promise<void> {
  const config = readConfig();
  const fixture = buildLiveSmokeFixture({
    fixtureId: "route199-live-anchored-provider-smoke",
    requestId: "route199-live-anchored-provider-smoke",
  });

  if (config.fakeReady) {
    const provider: RealProviderProposalDryRunProvider = {
      proposeEdit: () => buildLiveSmokeExpectedAnchoredProposal(fixture),
    };
    const approval = approveLiveProviderAdapter({
      explicitLiveSmokeOptIn: true,
      realProviderSmokeOptIn: true,
      providerReadinessStatus: "ready",
      providerKind: "openai-compatible",
      providerSafeLabel: "fake-ready-openai-compatible",
      providerConfigSource: "fake-ready",
      privateConfigManualRead: false,
      fixtureSafetyStatus: "safe",
      redactionStatus: "redacted-and-budgeted",
    });
    const calibration = await runApprovedCalibration({
      fixture,
      provider,
      approval,
      providerSafeLabel: "fake-ready-openai-compatible",
    });
    printCalibration(calibration);
    process.exit(exitCodeForCalibration(calibration));
  }

  if (config.providerKind !== "openai-compatible") {
    printApprovalSkip({
      providerKind: config.providerKind || "unknown",
      providerSafeLabel: config.providerSafeLabel,
      providerConfigSource: config.providerConfigSource,
      readinessStatus: "ready",
      skipStatus: "unsupported",
      skipDetail: `provider ${config.providerKind || "unknown"} is not approved for Route 199 anchored smoke`,
      exitCode: 0,
    });
    return;
  }

  const missingConfig = firstMissingConfig(config);
  if (missingConfig) {
    printApprovalSkip({
      providerKind: config.providerKind,
      providerSafeLabel: config.providerSafeLabel,
      providerConfigSource: config.providerConfigSource,
      readinessStatus: missingConfig === "api-key" ? "missing-key" : "missing-config",
      skipStatus: missingConfig === "api-key" ? "missing-key" : "missing-config",
      skipDetail: `${missingConfig} is missing`,
      exitCode: 0,
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
    printApprovalSkip({
      providerKind: config.providerKind,
      providerSafeLabel: config.providerSafeLabel,
      providerConfigSource: config.providerConfigSource,
      readinessStatus,
      skipStatus: readinessStatus,
      skipDetail: readiness.failure.stopReason,
      exitCode: readinessStatus === "network" ? 2 : 0,
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
    printApproval(approval);
    printCommonMarkers({
      providerKind: approval.providerKind,
      providerSafeLabel: approval.providerSafeLabel,
      adapterApproved: false,
      providerCalled: false,
      providerErrorClass: approval.providerErrorClass,
      outputValidation: "none",
      anchorQuality: "none",
      skipReason: approval.skipReason,
    });
    process.exit(0);
  }

  const provider = createOpenAICompatibleAnchoredSmokeAdapter({
    apiKey: config.apiKey!,
    baseUrl: config.baseUrl!,
    model: config.model!,
    providerSafeLabel: config.providerSafeLabel,
  });
  const calibration = await runApprovedCalibration({
    fixture,
    provider,
    approval,
    providerSafeLabel: config.providerSafeLabel,
  });
  printCalibration(calibration);
  process.exit(exitCodeForCalibration(calibration));
}

function readConfig(): RunnerConfig {
  const env = process.env;
  const fakeReady = env.PRIVATE_AGENTS_ANCHORED_SMOKE_FAKE_READY?.trim() === "1";
  const providerKind = normalizeProvider(
    env.PRIVATE_AGENTS_REAL_PROVIDER ?? env.PRIVATE_AGENTS_PROVIDER,
  ) ?? "unknown";
  const providerSafeLabel =
    env.PRIVATE_AGENTS_ANCHORED_SMOKE_PROVIDER_SAFE_LABEL?.trim() ||
    (providerKind === "openai-compatible" ? "openai-compatible" : providerKind);
  return {
    fakeReady,
    providerKind,
    providerSafeLabel,
    providerConfigSource:
      env.PRIVATE_AGENTS_ANCHORED_SMOKE_CONFIG_SOURCE?.trim() || "unknown",
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

function normalizeProvider(value: string | undefined): RuntimeProvider | undefined {
  const normalized = value?.trim().toLowerCase().replace(/_/g, "-");
  switch (normalized) {
    case "compatible":
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

function printApprovalSkip(input: {
  readonly providerKind: string;
  readonly providerSafeLabel: string;
  readonly providerConfigSource: string;
  readonly readinessStatus: ReadinessStatus;
  readonly skipStatus: ReadinessStatus;
  readonly skipDetail: string;
  readonly exitCode: number;
}): void {
  const approval = approveLiveProviderAdapter({
    explicitLiveSmokeOptIn: true,
    realProviderSmokeOptIn: true,
    providerReadinessStatus: input.readinessStatus,
    providerKind: input.providerKind,
    providerSafeLabel: input.providerSafeLabel,
    providerConfigSource: input.providerConfigSource,
    privateConfigManualRead: false,
    fixtureSafetyStatus: "safe",
    redactionStatus: "redacted-and-budgeted",
  });
  printApproval(approval);
  console.log(`[skip] live-anchored-provider-smoke-readiness - ${input.skipStatus}`);
  console.log(`readiness-status=${input.readinessStatus}`);
  console.log(`readiness-detail=${safeDetail(input.skipDetail)}`);
  printCommonMarkers({
    providerKind: approval.providerKind,
    providerSafeLabel: approval.providerSafeLabel,
    adapterApproved: false,
    providerCalled: false,
    providerErrorClass: approval.providerErrorClass,
    outputValidation: "none",
    anchorQuality: "none",
    skipReason: approval.skipReason,
  });
  process.exit(input.exitCode);
}

async function runApprovedCalibration(input: {
  readonly fixture: ReturnType<typeof buildLiveSmokeFixture>;
  readonly provider: RealProviderProposalDryRunProvider;
  readonly approval: ReturnType<typeof approveLiveProviderAdapter>;
  readonly providerSafeLabel: string;
}) {
  return await runLiveProviderSmokeCalibration({
    requestId: "route199-live-anchored-provider-smoke",
    mode: "live-provider-smoke",
    explicitSmokeOptIn: true,
    providerAvailability: {
      kind: "available",
      providerKindLabel: input.providerSafeLabel,
    } satisfies ProviderEditAvailability,
    fixture: input.fixture,
    adapterApproval: input.approval,
    provider: input.provider,
    redactionStatus: "redacted-and-budgeted",
  });
}

function printApproval(approval: ReturnType<typeof approveLiveProviderAdapter>): void {
  console.log(`adapter-approval-decision=${approval.decision}`);
  console.log(`adapter-approved=${approval.adapterApproved ? "true" : "false"}`);
  if (approval.skipReason) console.log(`skip-reason=${approval.skipReason}`);
}

function printCalibration(calibration: Awaited<ReturnType<typeof runLiveProviderSmokeCalibration>>): void {
  const result = calibration.result;
  printApprovalMarkersFromEvidence(calibration.evidence);
  console.log(`[${exitCodeForCalibration(calibration) === 0 ? "pass" : "product-regression"}] live-anchored-provider-smoke-calibration - ${result.status}`);
  printCommonMarkers({
    providerKind: result.providerKind,
    providerSafeLabel: result.providerSafeLabel,
    adapterApproved: result.adapterApproved,
    providerCalled: result.providerCalled,
    providerErrorClass: result.providerErrorClass,
    outputValidation: result.outputValidationStatus,
    anchorQuality: result.anchorQuality,
    skipReason: result.skipReason,
  });
  console.log(`prompt-audit=${calibration.promptAudit?.status ?? calibration.dryRun?.promptAudit?.status ?? "none"}`);
  console.log(`anchored-proposal-id=${result.anchoredProposalId ?? "none"}`);
  console.log(`quality-report-id=${result.qualityReportId ?? "none"}`);
  console.log(`scorecard-id=${result.scorecardId ?? "none"}`);
  console.log(`result-status=${result.status}`);
  console.log(`dry-run-status=${calibration.dryRun?.status ?? "none"}`);
  console.log(`scorecard-status=${calibration.qualityReport.scorecardStatus}`);
  console.log(`failure-class=${calibration.qualityReport.failureClass}`);
}

function printApprovalMarkersFromEvidence(evidence: readonly string[]): void {
  const decision = evidence.find((entry) =>
    entry.startsWith("live-provider-adapter-approval:decision:"),
  )?.split(":").at(-1);
  if (decision) console.log(`adapter-approval-decision=${decision}`);
}

function printCommonMarkers(input: {
  readonly providerKind: string;
  readonly providerSafeLabel: string;
  readonly adapterApproved: boolean;
  readonly providerCalled: boolean;
  readonly providerErrorClass: string;
  readonly outputValidation: string;
  readonly anchorQuality: string;
  readonly skipReason?: string;
}): void {
  console.log(`provider-kind=${input.providerKind}`);
  console.log(`provider-safe-label=${input.providerSafeLabel}`);
  console.log(`adapter-approved=${input.adapterApproved ? "true" : "false"}`);
  console.log(`provider-called=${input.providerCalled ? "true" : "false"}`);
  console.log(`provider-error-class=${input.providerErrorClass || "none"}`);
  if (input.skipReason) console.log(`skip-reason=${input.skipReason}`);
  console.log(`output-validation=${input.outputValidation}`);
  console.log(`anchor-quality=${input.anchorQuality}`);
  console.log("no-write=true");
  console.log("redaction-status=raw-content-excluded");
  console.log("private-config-manual-read=false");
  console.log("mutation-authority=not-granted");
  console.log("raw-provider-output=excluded");
}

function exitCodeForCalibration(
  calibration: Awaited<ReturnType<typeof runLiveProviderSmokeCalibration>>,
): number {
  const result = calibration.result;
  if (result.noWriteStatus !== "pass" || result.changedFiles.length !== 0) return 1;
  if (result.status === "provider-called-provider-error") {
    if (result.providerErrorClass === "network" || result.providerErrorClass === "timeout") return 2;
    if (
      result.providerErrorClass === "auth" ||
      result.providerErrorClass === "missing-key" ||
      result.providerErrorClass === "unsupported"
    ) {
      return 3;
    }
    return 1;
  }
  if (
    result.status === "provider-called-output-invalid" ||
    result.status === "provider-called-unsafe-output" ||
    result.status === "provider-called-anchor-failed"
  ) {
    return 1;
  }
  return 0;
}

function safeDetail(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9][A-Za-z0-9._-]{8,}\b/g, "[REDACTED_API_KEY]")
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[REAL_PROVIDER_HOME]");
}

main().catch((error) => {
  console.error(safeDetail(error instanceof Error ? error.stack ?? error.message : String(error)));
  process.exit(1);
});
