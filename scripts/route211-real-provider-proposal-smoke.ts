#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { checkRealProviderReadiness } from "../packages/ts-shell/src/core/shell/providerReadiness.js";
import type { RuntimeProvider } from "../packages/ts-shell/src/config/runtimeConfig.js";
import { approveLiveProviderAdapter } from "../packages/ts-shell/src/orchestration/liveProviderAdapterApproval.js";
import type { LiveProviderReadinessStatus } from "../packages/ts-shell/src/orchestration/liveProviderAdapterApproval.js";
import { createOpenAICompatibleAnchoredSmokeAdapter } from "../packages/ts-shell/src/orchestration/openAICompatibleAnchoredSmokeAdapter.js";
import type { PlanningRuntimeProductLiveProviderAttempt } from "../packages/ts-shell/src/orchestration/planningRuntimeProductExecution.js";
import type { ProviderEditAvailability } from "../packages/ts-shell/src/orchestration/providerEditPlanner.js";
import { runMvpIntegratedFlow } from "../packages/ts-shell/src/orchestration/runMvpIntegratedFlow.js";
import {
  approvedRealProviderHome,
  buildEffectiveProviderEnv,
  canonicalProviderEnv,
} from "./real-provider-smokes/approvedProviderEnv.mjs";

type ProductResult = Awaited<ReturnType<typeof runMvpIntegratedFlow>>;

interface ProviderConfig {
  readonly provider: RuntimeProvider | "unknown";
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly safeLabel: string;
  readonly configSource: string;
}

interface AttemptBuild {
  readonly attempt: PlanningRuntimeProductLiveProviderAttempt;
  readonly approvalDecision: string;
  readonly adapterApproved: boolean;
  readonly readinessStatus: LiveProviderReadinessStatus;
  readonly providerErrorClass: string;
}

interface SmokeReport {
  readonly status: ProductResult["status"];
  readonly productPathUsed: boolean;
  readonly providerCalled: boolean;
  readonly liveEvidenceSource: string;
  readonly liveProviderStatus: string;
  readonly liveProviderAnchor: string;
  readonly selectedAttempt: string;
  readonly fallbackPolicy: string;
  readonly fallbackCalled: boolean;
  readonly proposalState: string;
  readonly proposalSource: string;
  readonly anchorState: string | null;
  readonly applyState: string | null;
  readonly commandDispatch: string;
  readonly workspaceChangedFiles: readonly string[];
  readonly rawProviderOutputExcluded: boolean;
  readonly noProviderCallDuringApply: boolean;
  readonly noWriteWithoutConfirmation: boolean;
  readonly failures: readonly string[];
}

const liveOptIn =
  process.env.PRIVATE_AGENTS_ROUTE211_LIVE_PROVIDER_SMOKE?.trim() === "1";
const realProviderSmokeOptIn =
  process.env.PRIVATE_AGENTS_REAL_PROVIDER_SMOKE?.trim() === "1";
const realProviderHome = process.env.PRIVATE_AGENTS_REAL_HOME?.trim();

console.log("gate name=route211-real-provider-proposal-smoke");
console.log("route=route211-practical-authorized-coding-loop");
console.log("status taxonomy: pass=0 product-regression=1 provider-network=2 config-or-auth=3");
console.log(`route211-live-provider-opt-in=${liveOptIn ? "true" : "false"}`);
console.log(`real-provider-smoke-opt-in=${realProviderSmokeOptIn ? "true" : "false"}`);
console.log("private-config-manual-read=false");
console.log("raw-provider-output=excluded");

const testRoot = process.env.PRIVATE_AGENTS_TEST_ROOT?.trim() ||
  path.join(os.tmpdir(), "private-agents-test", "route211-real-provider-proposal-smoke");
process.env.PRIVATE_AGENTS_TEST_ROOT = testRoot;
process.env.HOME = process.env.HOME?.startsWith(testRoot)
  ? process.env.HOME
  : path.join(testRoot, "home");
process.env.USERPROFILE = process.env.USERPROFILE?.startsWith(testRoot)
  ? process.env.USERPROFILE
  : path.join(testRoot, "home");
await fs.mkdir(process.env.HOME, { recursive: true });

if (!liveOptIn) {
  printSkip({
    skipReason: "no-route211-live-provider-opt-in",
    detail:
      "Set PRIVATE_AGENTS_ROUTE211_LIVE_PROVIDER_SMOKE=1 to request the optional Route211 live provider proposal smoke.",
  });
  process.exit(0);
}

if (!realProviderSmokeOptIn) {
  printSkip({
    skipReason: "real-provider-smoke-not-enabled",
    detail:
      "Set PRIVATE_AGENTS_REAL_PROVIDER_SMOKE=1 to allow the approved real-provider boundary.",
  });
  process.exit(0);
}

if (realProviderHome !== approvedRealProviderHome) {
  printSkip({
    skipReason: "approved-real-provider-home-not-selected",
    detail:
      "Set PRIVATE_AGENTS_REAL_HOME to the approved real-provider home before loading provider config.",
  });
  process.exit(3);
}

try {
  const effective = buildEffectiveProviderEnv(process.env);
  console.log(`configSource=${safeEvidenceValue(effective.configSource)}`);
  if (effective.providerEnvError) {
    const report = await runProductSmoke({
      attempts: [],
      fallbackPolicyEnabled: false,
      fallbackReason: safeDetail(effective.providerEnvError.reason),
    });
    printReport(report);
    process.exit(3);
  }

  const canonical = canonicalProviderEnv(effective.env);
  const primaryConfig = primaryProviderConfig({
    env: canonical.env,
    configSource: effective.configSource,
    providerSafeLabel: canonical.providerSafeLabel,
  });
  const fallbackConfig = fallbackProviderConfig({
    env: effective.env,
    primary: primaryConfig,
    configSource: effective.configSource,
  });

  const primary = await buildPrimaryAttempt(primaryConfig);
  const fallback = fallbackConfig ? buildFallbackAttempt(fallbackConfig) : undefined;
  printAttempt("primary", primary);
  if (fallback) {
    printAttempt("fallback", fallback);
  } else {
    console.log("fallback-config=not-configured");
  }

  const report = await runProductSmoke({
    attempts: [primary.attempt, ...(fallback ? [fallback.attempt] : [])],
    fallbackPolicyEnabled: Boolean(fallback),
    fallbackReason: fallback
      ? "primary provider failure may use configured fallback once"
      : "fallback provider config unavailable",
  });
  printReport(report);
  process.exit(exitCodeForReport(report));
} catch (error) {
  console.log("runner-error=true");
  console.log(`runner-error-class=${providerErrorClassFor(error)}`);
  console.log(`runner-error-detail=${safeDetail(error instanceof Error ? error.message : String(error))}`);
  process.exit(providerErrorClassFor(error) === "network" ? 2 : 1);
}

async function buildPrimaryAttempt(config: ProviderConfig): Promise<AttemptBuild> {
  const missing = firstMissingConfig(config);
  if (missing) {
    return buildApprovalAttempt({
      role: "primary",
      config,
      readinessStatus: missing === "api-key" ? "missing-key" : "missing-config",
      providerAvailability: {
        kind: "not-configured",
        reason: `${missing} is missing`,
      },
    });
  }
  if (config.provider !== "openai-compatible") {
    return buildApprovalAttempt({
      role: "primary",
      config,
      readinessStatus: "unsupported",
      providerAvailability: {
        kind: "unsupported",
        reason: "Route211 live provider proposal smoke supports openai-compatible only",
      },
    });
  }

  const readiness = await checkRealProviderReadiness({
    provider: "openai-compatible",
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
  });
  if (readiness.ok === false) {
    const readinessStatus = mapReadinessFailure(readiness.failure.kind);
    return buildApprovalAttempt({
      role: "primary",
      config,
      readinessStatus,
      providerAvailability: availabilityForReadiness(
        readinessStatus,
        readiness.failure.stopReason,
      ),
    });
  }

  return buildApprovalAttempt({
    role: "primary",
    config,
    readinessStatus: "ready",
    providerAvailability: {
      kind: "available",
      providerKindLabel: config.safeLabel,
    },
  });
}

function buildFallbackAttempt(config: ProviderConfig): AttemptBuild {
  const missing = firstMissingConfig(config);
  if (missing) {
    return buildApprovalAttempt({
      role: "fallback",
      config,
      readinessStatus: missing === "api-key" ? "missing-key" : "missing-config",
      providerAvailability: {
        kind: "not-configured",
        reason: `${missing} is missing`,
      },
    });
  }
  if (config.provider !== "openai-compatible") {
    return buildApprovalAttempt({
      role: "fallback",
      config,
      readinessStatus: "unsupported",
      providerAvailability: {
        kind: "unsupported",
        reason: "Route211 fallback supports openai-compatible only",
      },
    });
  }
  return buildApprovalAttempt({
    role: "fallback",
    config,
    readinessStatus: "ready",
    providerAvailability: {
      kind: "available",
      providerKindLabel: config.safeLabel,
    },
  });
}

function buildApprovalAttempt(input: {
  readonly role: "primary" | "fallback";
  readonly config: ProviderConfig;
  readonly readinessStatus: LiveProviderReadinessStatus;
  readonly providerAvailability: ProviderEditAvailability;
}): AttemptBuild {
  const approval = approveLiveProviderAdapter({
    explicitLiveSmokeOptIn: true,
    realProviderSmokeOptIn: true,
    providerReadinessStatus: input.readinessStatus,
    providerKind: input.config.provider,
    providerSafeLabel: input.config.safeLabel,
    providerConfigSource: input.config.configSource,
    providerAvailability: input.providerAvailability,
    privateConfigManualRead: false,
    fixtureSafetyStatus: "safe",
    redactionStatus: "redacted-and-budgeted",
  });
  const provider = approval.adapterApproved && input.config.apiKey && input.config.baseUrl && input.config.model
    ? createOpenAICompatibleAnchoredSmokeAdapter({
        apiKey: input.config.apiKey,
        baseUrl: input.config.baseUrl,
        model: input.config.model,
        providerSafeLabel: input.config.safeLabel,
        promptMode: "context-only",
      })
    : undefined;
  return {
    attempt: {
      role: input.role,
      providerSafeLabel: input.config.safeLabel,
      providerConfigSource: input.config.configSource,
      providerAvailability: input.providerAvailability,
      readinessStatus: input.readinessStatus,
      evidenceSource: "live-provider",
      ...(provider ? { provider } : {}),
    },
    approvalDecision: approval.decision,
    adapterApproved: approval.adapterApproved,
    readinessStatus: input.readinessStatus,
    providerErrorClass: approval.providerErrorClass,
  };
}

async function runProductSmoke(input: {
  readonly attempts: readonly PlanningRuntimeProductLiveProviderAttempt[];
  readonly fallbackPolicyEnabled: boolean;
  readonly fallbackReason: string;
}): Promise<SmokeReport> {
  const workspaceRoot = await fs.mkdtemp(path.join(testRoot, "workspace-"));
  try {
    await seedWorkspace(workspaceRoot);
    const before = await snapshotWorkspace(workspaceRoot);
    const result = await runMvpIntegratedFlow({
      sessionId: "sess_route211_real_provider_proposal_smoke",
      prompt: "Fix the planner target ranking bug and cover the adjacent test",
      workspaceRoot,
      providerMode: "synthetic",
      maxTurns: 4,
      planningMutationExecution: {
        liveProviderProposal: {
          optIn: true,
          source: "runtime-option",
          attempts: input.attempts,
          fallbackPolicy: {
            enabled: input.fallbackPolicyEnabled,
            reason: input.fallbackReason,
          },
        },
      },
    });
    const after = await snapshotWorkspace(workspaceRoot);
    return projectReport({
      result,
      workspaceChangedFiles: diffSnapshots(before, after),
    });
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

function projectReport(input: {
  readonly result: ProductResult;
  readonly workspaceChangedFiles: readonly string[];
}): SmokeReport {
  const finalOutput = input.result.finalOutput ?? "";
  const evidence = input.result.codingResult?.evidence ?? [];
  const productPathUsed = evidence.includes("planning-runtime-product:path:runMvpIntegratedFlow");
  const providerCalled = evidence.includes("provider-called=true");
  const report: SmokeReport = {
    status: input.result.status,
    productPathUsed,
    providerCalled,
    liveEvidenceSource:
      markerValue(evidence, "planning-runtime-product:live-provider-evidence-source:") ??
      "not-proven",
    liveProviderStatus:
      markerValue(evidence, "planning-runtime-product-proposal:live-provider-status:") ??
      "not-run",
    liveProviderAnchor:
      markerValue(evidence, "planning-runtime-product-proposal:live-provider-anchor:") ??
      "not-run",
    selectedAttempt:
      markerValue(evidence, "planning-runtime-product-proposal:live-provider-selected-attempt:") ??
      "none",
    fallbackPolicy:
      markerValue(evidence, "planning-runtime-product-proposal:live-provider-fallback-policy:") ??
      "disabled",
    fallbackCalled: evidence.includes(
      "planning-runtime-product-proposal:live-provider-fallback:provider-called:true",
    ),
    proposalState:
      markerValue(evidence, "planning-runtime-product-proposal:status:") ??
      "not-proven",
    proposalSource:
      markerValue(evidence, "planning-runtime-product-proposal:source:") ??
      "not-proven",
    anchorState: extractLineValue(finalOutput, "Anchor state:"),
    applyState: extractLineValue(finalOutput, "Apply state:"),
    commandDispatch:
      markerValue(evidence, "planning-runtime-product-verification-command:dispatch:") ??
      "not-proven",
    workspaceChangedFiles: input.workspaceChangedFiles,
    rawProviderOutputExcluded:
      evidence.includes("planning-runtime-product-proposal:raw-provider-output-excluded") &&
      !redactionRisk(JSON.stringify({ evidence })),
    noProviderCallDuringApply:
      evidence.includes("planning-mutation-proof-route:provider-call-during-apply:false") ||
      evidence.includes("planning-runtime-product:provider-call-during-confirmation:false"),
    noWriteWithoutConfirmation: input.workspaceChangedFiles.length === 0,
    failures: [],
  };
  return {
    ...report,
    failures: validateReport(report),
  };
}

function validateReport(report: SmokeReport): readonly string[] {
  const failures: string[] = [];
  if (!report.productPathUsed) failures.push("productPathUsed=false");
  if (report.liveEvidenceSource === "fake-provider") failures.push("fake-provider-promoted-to-live-gate");
  if (report.providerCalled && report.liveEvidenceSource !== "live-provider") {
    failures.push(`providerCalled=true liveEvidenceSource=${report.liveEvidenceSource}`);
  }
  if (report.providerCalled && report.proposalSource !== "live-provider-proposal") {
    failures.push(`proposalSource=${report.proposalSource}`);
  }
  if (report.providerCalled && report.liveProviderAnchor === "blocked") {
    failures.push("liveProviderAnchor=blocked");
  }
  if (
    report.providerCalled &&
    report.proposalState === "prepared-exact" &&
    report.anchorState !== "exact-ready"
  ) {
    failures.push(`prepared-exact anchorState=${report.anchorState ?? "missing"}`);
  }
  if (
    report.providerCalled &&
    report.proposalState === "review-only" &&
    report.anchorState !== "review-only"
  ) {
    failures.push(`review-only anchorState=${report.anchorState ?? "missing"}`);
  }
  if (report.providerCalled && report.applyState !== "not-run") {
    failures.push(`applyState=${report.applyState ?? "missing"} expected not-run`);
  }
  if (report.commandDispatch !== "not-run") {
    failures.push(`commandDispatch=${report.commandDispatch} expected not-run`);
  }
  if (!report.rawProviderOutputExcluded) failures.push("rawProviderOutputExcluded=false");
  if (!report.noProviderCallDuringApply) failures.push("noProviderCallDuringApply=false");
  if (!report.noWriteWithoutConfirmation) {
    failures.push(`workspaceChangedFiles=${report.workspaceChangedFiles.join(",")}`);
  }
  return failures;
}

function exitCodeForReport(report: SmokeReport): number {
  if (report.failures.length > 0) return 1;
  if (
    report.liveProviderStatus === "NETWORK-BLOCKED" ||
    report.liveProviderStatus === "network"
  ) {
    return 2;
  }
  if (
    report.liveProviderStatus === "CONFIG-FAILED" ||
    report.liveProviderStatus === "AUTH-FAILED"
  ) {
    return 3;
  }
  if (
    report.providerCalled &&
    report.liveEvidenceSource === "live-provider" &&
    (
      (report.proposalState === "prepared-exact" && report.anchorState === "exact-ready") ||
      (report.proposalState === "review-only" && report.anchorState === "review-only")
    ) &&
    report.liveProviderAnchor !== "blocked"
  ) {
    return 0;
  }
  return 1;
}

function primaryProviderConfig(input: {
  readonly env: Record<string, string>;
  readonly configSource: string;
  readonly providerSafeLabel: string;
}): ProviderConfig {
  const provider = normalizeProvider(input.env.PRIVATE_AGENTS_REAL_PROVIDER) ?? "unknown";
  return {
    provider,
    apiKey: trim(input.env.PRIVATE_AGENTS_REAL_API_KEY),
    baseUrl: trim(input.env.PRIVATE_AGENTS_REAL_BASE_URL),
    model: trim(input.env.PRIVATE_AGENTS_REAL_MODEL),
    safeLabel: siliconFlowLabel(trim(input.env.PRIVATE_AGENTS_REAL_BASE_URL), "primary") ??
      input.providerSafeLabel,
    configSource: `${safeEvidenceValue(input.configSource)}+primary`,
  };
}

function fallbackProviderConfig(input: {
  readonly env: Record<string, string>;
  readonly primary: ProviderConfig;
  readonly configSource: string;
}): ProviderConfig | undefined {
  const fallbackBaseUrl = getTrimmed(input.env, [
    "PRIVATE_AGENTS_REAL_FALLBACK_BASE_URL",
    "PRIVATE_AGENTS_PROVIDER_FALLBACK_BASE_URL",
    "PRIVATE_AGENTS_FALLBACK_BASE_URL",
    "OPENAI_COMPATIBLE_FALLBACK_BASE_URL",
    "SILICONFLOW_FALLBACK_BASE_URL",
  ]) ?? defaultSiliconFlowFallbackBaseUrl(input.primary.baseUrl);
  if (!fallbackBaseUrl && !input.primary.apiKey && !input.primary.model) return undefined;
  const provider = normalizeProvider(
    getTrimmed(input.env, [
      "PRIVATE_AGENTS_REAL_FALLBACK_PROVIDER",
      "PRIVATE_AGENTS_FALLBACK_PROVIDER",
      "SILICONFLOW_FALLBACK_PROVIDER",
    ]) ?? input.primary.provider,
  ) ?? "unknown";
  return {
    provider,
    apiKey: getTrimmed(input.env, [
      "PRIVATE_AGENTS_REAL_FALLBACK_API_KEY",
      "PRIVATE_AGENTS_PROVIDER_FALLBACK_API_KEY",
      "PRIVATE_AGENTS_FALLBACK_API_KEY",
      "OPENAI_COMPATIBLE_FALLBACK_API_KEY",
      "SILICONFLOW_FALLBACK_API_KEY",
    ]) ?? input.primary.apiKey,
    baseUrl: fallbackBaseUrl,
    model: getTrimmed(input.env, [
      "PRIVATE_AGENTS_REAL_FALLBACK_MODEL",
      "PRIVATE_AGENTS_PROVIDER_FALLBACK_MODEL",
      "PRIVATE_AGENTS_FALLBACK_MODEL",
      "OPENAI_COMPATIBLE_FALLBACK_MODEL",
      "SILICONFLOW_FALLBACK_MODEL",
    ]) ?? input.primary.model,
    safeLabel: siliconFlowLabel(fallbackBaseUrl, "fallback") ?? "openai-compatible-fallback",
    configSource: `${safeEvidenceValue(input.configSource)}+fallback`,
  };
}

function defaultSiliconFlowFallbackBaseUrl(primaryBaseUrl: string | undefined): string | undefined {
  return primaryBaseUrl?.includes("api.siliconflow.cn")
    ? "https://api.siliconflow.com/v1"
    : undefined;
}

function siliconFlowLabel(
  baseUrl: string | undefined,
  role: "primary" | "fallback",
): string | undefined {
  if (baseUrl?.includes("api.siliconflow.cn")) return `siliconflow-${role}-cn`;
  if (baseUrl?.includes("api.siliconflow.com")) return `siliconflow-${role}-com`;
  return undefined;
}

function firstMissingConfig(config: ProviderConfig): "api-key" | "base-url" | "model" | undefined {
  if (!config.apiKey) return "api-key";
  if (!config.baseUrl) return "base-url";
  if (!config.model) return "model";
  return undefined;
}

function mapReadinessFailure(kind: string): LiveProviderReadinessStatus {
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

function availabilityForReadiness(
  status: LiveProviderReadinessStatus,
  reason: string,
): ProviderEditAvailability {
  if (status === "unsupported") return { kind: "unsupported", reason };
  if (status === "missing-config" || status === "missing-key") {
    return { kind: "not-configured", reason };
  }
  return { kind: "request-blocked", reason };
}

async function seedWorkspace(root: string): Promise<void> {
  await fs.mkdir(path.join(root, "src", "planning"), { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "route211-real-provider-proposal-smoke" }, null, 2),
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
}

async function snapshotWorkspace(root: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  await walk(root, root, snapshot);
  return snapshot;
}

async function walk(root: string, current: string, snapshot: Map<string, string>): Promise<void> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".sisyphus") {
      continue;
    }
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

function printSkip(input: { readonly skipReason: string; readonly detail: string }): void {
  console.log(`skip-reason=${input.skipReason}`);
  console.log("adapter-approved=false");
  console.log("provider-called=false");
  console.log("apply=not-run");
  console.log("command-dispatch=not-run");
  console.log(`detail=${safeDetail(input.detail)}`);
}

function printAttempt(role: "primary" | "fallback", attempt: AttemptBuild): void {
  console.log(`${role}-approval-decision=${attempt.approvalDecision}`);
  console.log(`${role}-adapter-approved=${attempt.adapterApproved ? "true" : "false"}`);
  console.log(`${role}-readiness-status=${attempt.readinessStatus}`);
  console.log(`${role}-provider-label=${attempt.attempt.providerSafeLabel}`);
  console.log(`${role}-provider-error-class=${attempt.providerErrorClass || "none"}`);
}

function printReport(report: SmokeReport): void {
  console.log(redact(JSON.stringify({
    route: "211",
    gate: "route211-real-provider-proposal-smoke",
    report,
  }, null, 2)));
}

function extractLineValue(output: string, label: string): string | null {
  const line = output.split("\n").find((entry) => entry.startsWith(label));
  return line ? line.slice(label.length).trim() : null;
}

function markerValue(evidence: readonly string[], prefix: string): string | undefined {
  const marker = evidence.find((entry) => entry.startsWith(prefix));
  return marker?.slice(prefix.length);
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

function getTrimmed(env: Record<string, string>, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = trim(env[name]);
    if (value) return value;
  }
  return undefined;
}

function trim(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function safeEvidenceValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:+-]+/g, "_").slice(0, 120) || "unknown";
}

function providerErrorClassFor(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/401|403|unauthorized|forbidden|authentication/i.test(message)) return "auth";
  if (/api key|credential|missing-key/i.test(message)) return "missing-key";
  if (/timeout|abort/i.test(message)) return "timeout";
  if (/network|fetch|econn|enotfound|unreachable|socket/i.test(message)) return "network";
  return "unknown";
}

function redactionRisk(value: string): boolean {
  return /\/home\/wang\/\.private-agents-real|Bearer\s+\S+|\bsk-[A-Za-z0-9][A-Za-z0-9._-]{8,}\b|api[_-]?key/i
    .test(value);
}

function safeDetail(value: string): string {
  return redact(value).replace(/\n+/g, " ").slice(0, 240);
}

function redact(value: string): string {
  return String(value ?? "")
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[REAL_PROVIDER_HOME]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9][A-Za-z0-9._-]{8,}\b/g, "[REDACTED_API_KEY]")
    .replace(
      /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|x-api-key)(\s*[:=]\s*)(["']?)[^\s"'`,;]+/gi,
      (_match, key, separator, quote) => `${key}${separator}${quote}[REDACTED]`,
    );
}
