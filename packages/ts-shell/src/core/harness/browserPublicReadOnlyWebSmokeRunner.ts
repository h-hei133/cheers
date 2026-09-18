import { createBrowserActionContract } from "../../browser/browserActionContract.js";
import { createBrowserExecutionRequest } from "../../browser/browserExecutionContract.js";
import {
  createBrowserPublicReadOnlyWebManifest,
  type BrowserPublicReadOnlyWebManifestLoadResult,
} from "../../browser/browserPublicReadOnlyWebManifest.js";
import {
  type BrowserPublicReadOnlyHttpClient,
  runBrowserPublicReadOnlyWebExecutor,
} from "../../browser/browserPublicReadOnlyWebExecutor.js";
import { decideBrowserPublicReadOnlyWebPolicy } from "../../browser/browserPublicReadOnlyWebPolicy.js";
import {
  createBrowserPublicReadOnlyWebReceipt,
  type BrowserPublicReadOnlyWebReceipt,
} from "../../browser/browserPublicReadOnlyWebReceipt.js";
import {
  createBrowserPublicReadOnlyWebUxSummary,
  type BrowserPublicReadOnlyWebUxSummary,
} from "../../browser/browserPublicReadOnlyWebUxSummary.js";
import type { BrowserPublicReadOnlyWebSmokeConfig } from "./browserPublicReadOnlyWebSmokeConfig.js";

export type BrowserPublicReadOnlyWebSmokeStatus =
  | "skipped"
  | "executed"
  | "blocked"
  | "unavailable";

export interface BrowserPublicReadOnlyWebSmokeResult {
  readonly status: BrowserPublicReadOnlyWebSmokeStatus;
  readonly enabled: boolean;
  readonly targetOrigin?: string;
  readonly method: string;
  readonly publicNetworkUsed: boolean;
  readonly browserLaunched: false;
  readonly javascriptExecuted: false;
  readonly receipt?: BrowserPublicReadOnlyWebReceipt;
  readonly uxSummary?: BrowserPublicReadOnlyWebUxSummary;
  readonly reason: string;
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
  readonly nextAction: string;
}

export async function runBrowserPublicReadOnlyWebSmoke(input: {
  readonly config: BrowserPublicReadOnlyWebSmokeConfig;
  readonly httpClient?: BrowserPublicReadOnlyHttpClient;
}): Promise<BrowserPublicReadOnlyWebSmokeResult> {
  if (input.config.status === "disabled") {
    return smokeResult("skipped", {
      config: input.config,
      reason: input.config.reason,
      warnings: input.config.warnings,
      evidence: input.config.evidence,
      nextAction: "Set PRIVATE_AGENTS_ENABLE_PUBLIC_WEB_SMOKE=1 with an explicit HTTPS URL to run the smoke.",
    });
  }
  if (input.config.status === "blocked" || !input.config.url || !input.config.origin) {
    return smokeResult("blocked", {
      config: input.config,
      reason: input.config.reason,
      warnings: input.config.warnings,
      redactions: input.config.redactions,
      evidence: input.config.evidence,
      nextAction: "Fix the explicit smoke env/config before running any public request.",
    });
  }
  const manifest = createBrowserPublicReadOnlyWebManifest({
    source: "test-only",
    allowedPublicOrigins: [input.config.origin],
    allowedMethods: [input.config.method],
    maxRedirects: 3,
    timeoutMs: input.config.timeoutMs,
    responseByteBudget: input.config.byteBudget,
  });
  const request = createBrowserExecutionRequest({
    mode: "future-runtime",
    action: createBrowserActionContract({
      actionKind: "navigate",
      url: input.config.url,
      target: input.config.url,
      userIntentSummary: `Public read-only smoke ${input.config.method} ${input.config.origin}`,
      requiresNetwork: true,
      requiresAuth: false,
    }),
  });
  const manifestLoad: BrowserPublicReadOnlyWebManifestLoadResult = {
    status: "valid",
    manifest,
    reason: "Public read-only smoke manifest is valid.",
    evidence: ["browser-public-readonly-web-smoke-runner:manifest-created"],
    warnings: [],
    redactions: [],
  };
  const policy = decideBrowserPublicReadOnlyWebPolicy({
    request,
    manifestLoad,
    confirmations: [{ kind: "network", status: "confirmed" }],
    method: input.config.method,
    clientAvailable: true,
  });
  const executor = await runBrowserPublicReadOnlyWebExecutor({
    request,
    policy,
    manifest,
    method: input.config.method,
    httpClient: input.httpClient,
  });
  const receipt = createBrowserPublicReadOnlyWebReceipt({
    request,
    manifest,
    policy,
    executor,
  });
  const uxSummary = createBrowserPublicReadOnlyWebUxSummary(receipt);
  const unavailable = executor.status === "request-failed" || executor.status === "timeout";
  return smokeResult(receipt.executed ? "executed" : unavailable ? "unavailable" : "blocked", {
    config: input.config,
    receipt,
    uxSummary,
    reason: receipt.executed ? "Public read-only smoke executed." : receipt.nextAction,
    warnings: receipt.warnings,
    redactions: receipt.redactions,
    evidence: [
      ...input.config.evidence,
      ...receipt.evidence,
      ...uxSummary.evidence,
      "browser-public-readonly-web-smoke-runner:completed",
    ],
    nextAction: receipt.nextAction,
  });
}

function smokeResult(
  status: BrowserPublicReadOnlyWebSmokeStatus,
  input: {
    readonly config: BrowserPublicReadOnlyWebSmokeConfig;
    readonly receipt?: BrowserPublicReadOnlyWebReceipt;
    readonly uxSummary?: BrowserPublicReadOnlyWebUxSummary;
    readonly reason: string;
    readonly warnings?: readonly string[];
    readonly redactions?: readonly string[];
    readonly evidence?: readonly string[];
    readonly nextAction: string;
  },
): BrowserPublicReadOnlyWebSmokeResult {
  return {
    status,
    enabled: input.config.enabled,
    targetOrigin: input.receipt?.targetOrigin ?? input.config.origin,
    method: input.receipt?.method ?? input.config.method,
    publicNetworkUsed: input.receipt?.publicNetwork ?? false,
    browserLaunched: false,
    javascriptExecuted: false,
    receipt: input.receipt,
    uxSummary: input.uxSummary,
    reason: input.reason,
    redactions: unique(input.redactions ?? input.config.redactions),
    warnings: unique(input.warnings ?? input.config.warnings),
    evidence: [
      ...(input.evidence ?? input.config.evidence),
      `browser-public-readonly-web-smoke-runner:${status}`,
      "browser-public-readonly-web-smoke-runner:browser-launched-no",
      "browser-public-readonly-web-smoke-runner:javascript-executed-no",
      "browser-public-readonly-web-smoke-runner:raw-content-excluded",
    ],
    nextAction: input.nextAction,
  };
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
