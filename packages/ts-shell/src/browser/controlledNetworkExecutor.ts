import { requestBrowser } from "../core/network/connection.js";
import { NetworkError } from "../core/network/error.js";
import { requestScope, type RequestScope } from "../core/network/request.js";
import { readResponseText } from "../core/network/response.js";
import { sanitizeBrowserText } from "./capabilityModel.js";
import type { BrowserExecutionRequest } from "./executionContract.js";
import type { BrowserControlledNetworkRunnerManifest } from "./controlledNetworkRunnerManifest.js";
import type { BrowserControlledNetworkPolicyDecision } from "./controlledNetworkPolicy.js";
import { browserControlledNetworkTargetUrl } from "./controlledNetworkOrigin.js";
import {
  decideBrowserNetworkEgress,
} from "./networkEgressGuard.js";
import { decideBrowserRedirectPolicy } from "./redirectPolicy.js";
import {
  createBrowserNetworkAuditRecord,
  type BrowserNetworkAuditRecord,
} from "./networkAuditRecord.js";

export type BrowserControlledNetworkRequestStatus =
  | "executed"
  | "blocked"
  | "cancelled"
  | "timeout"
  | "redirect-blocked"
  | "unsafe-output"
  | "request-failed";

export interface BrowserControlledNetworkExecutorResult {
  readonly status: BrowserControlledNetworkRequestStatus;
  readonly executed: boolean;
  readonly publicNetwork: false;
  readonly networkUsed: boolean | null;
  readonly browserLaunched: false;
  readonly statusCode?: number;
  readonly safeTitle?: string;
  readonly safeSummary?: string;
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
  readonly errorSummary?: string;
  readonly auditRecord?: BrowserNetworkAuditRecord;
  readonly evidence: readonly string[];
}

export async function runBrowserControlledNetworkExecutor(input: {
  readonly signal?: AbortSignal;
  readonly request: BrowserExecutionRequest;
  readonly policy: BrowserControlledNetworkPolicyDecision;
  readonly manifest: BrowserControlledNetworkRunnerManifest;
  readonly httpGet?: (url: URL, timeoutMs: number, outputBudgetBytes: number, signal?: AbortSignal) => Promise<ControlledHttpResponse>;
}): Promise<BrowserControlledNetworkExecutorResult> {
  if (!input.policy.allowed) {
    return result("blocked", {
      executed: false,
      errorSummary: input.policy.reason,
      evidence: input.policy.evidence,
    });
  }
  const url = browserControlledNetworkTargetUrl({
    rawTarget: input.request.action.url ?? input.request.action.target ?? input.request.action.extractionGoal,
    controlledOrigin: input.manifest.allowedLoopbackOrigin,
  });
  if (!url) {
    return result("blocked", {
      executed: false,
      errorSummary: "Controlled-network target is outside the harness origin.",
      evidence: ["browser-controlled-network-executor:target-outside-origin"],
    });
  }
  const preflightEgress = decideBrowserNetworkEgress({
    request: input.request,
    requestedUrl: url.toString(),
    allowedOrigins: [input.manifest.allowedLoopbackOrigin],
    controlledOrigin: input.manifest.allowedLoopbackOrigin,
    networkMode: "controlled-only",
    outputBudgetBytes: input.manifest.outputBudgetBytes,
  });
  if (!preflightEgress.allowed) {
    const auditRecord = createBrowserNetworkAuditRecord({
      request: input.request,
      egressDecision: preflightEgress,
      outputBudgetBytes: input.manifest.outputBudgetBytes,
    });
    return result("blocked", {
      executed: false,
      errorSummary: preflightEgress.reason,
      redactions: auditRecord.redactions,
      warnings: auditRecord.warnings,
      auditRecord,
      evidence: auditRecord.evidence,
    });
  }
  const scope = requestScope(input.manifest.timeoutMs, input.signal);
  let networkUsed: boolean | null = false;
  try {
    scope.check();
    let response: ControlledHttpResponse;
    if (input.httpGet) {
      networkUsed = null;
      response = await input.httpGet(url, input.manifest.timeoutMs, input.manifest.outputBudgetBytes, scope.signal);
      networkUsed = true;
    } else {
      response = await controlledHttpGet(url, scope, input.manifest.outputBudgetBytes, {
        onDispatch: () => { networkUsed = null; },
        onResponse: () => { networkUsed = true; },
      });
    }
    scope.check();
    if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.redirectLocation) {
      const redirectPolicy = decideBrowserRedirectPolicy({
        request: input.request,
        requestedUrl: url.toString(),
        redirectTarget: response.redirectLocation,
        allowedOrigins: [input.manifest.allowedLoopbackOrigin],
        controlledOrigin: input.manifest.allowedLoopbackOrigin,
        outputBudgetBytes: input.manifest.outputBudgetBytes,
      });
      const auditRecord = createBrowserNetworkAuditRecord({
        request: input.request,
        egressDecision: preflightEgress,
        redirectDecision: redirectPolicy,
        statusCode: response.statusCode,
        outputBytes: response.bodyBytes,
        outputBudgetBytes: input.manifest.outputBudgetBytes,
      });
      if (!redirectPolicy.allowed) {
        return result("redirect-blocked", {
          networkUsed,
          executed: false,
          statusCode: response.statusCode,
          errorSummary: "Redirect target left the controlled loopback origin.",
          redactions: [...response.redactions, ...auditRecord.redactions],
          warnings: ["redirect-blocked", ...auditRecord.warnings],
          auditRecord,
          evidence: [...response.evidence, ...auditRecord.evidence],
        });
      }
    }
    const auditRecord = createBrowserNetworkAuditRecord({
      request: input.request,
      egressDecision: response.truncated
        ? decideBrowserNetworkEgress({
            request: input.request,
            requestedUrl: url.toString(),
            allowedOrigins: [input.manifest.allowedLoopbackOrigin],
            controlledOrigin: input.manifest.allowedLoopbackOrigin,
            networkMode: "controlled-only",
            outputBudgetBytes: input.manifest.outputBudgetBytes,
            observedOutputBytes: response.bodyBytes,
          })
        : preflightEgress,
      statusCode: response.statusCode,
      outputBytes: response.bodyBytes,
      outputBudgetBytes: input.manifest.outputBudgetBytes,
    });
    if (response.truncated || hasForbiddenContent(response.body)) {
      return result("unsafe-output", {
        networkUsed,
        executed: false,
        statusCode: response.statusCode,
        errorSummary: "Controlled-network response was unsafe or over budget.",
        redactions: [...response.redactions, "unsafe-output", ...auditRecord.redactions],
        warnings: ["unsafe-output", ...auditRecord.warnings],
        auditRecord,
        evidence: [...response.evidence, ...auditRecord.evidence],
      });
    }
    return result("executed", {
      networkUsed,
      executed: true,
      statusCode: response.statusCode,
      safeTitle: extractTitle(response.body),
      safeSummary: summarizeBody(input.request.actionKind, response.body, response.statusCode),
      redactions: response.redactions,
      auditRecord,
      evidence: [...response.evidence, ...auditRecord.evidence],
    });
  } catch (error) {
    const code = error instanceof NetworkError && error.code === "cancelled" ? "cancelled"
      : error instanceof NetworkError && error.code === "timeout" ? "timeout"
      : error instanceof NetworkError && error.code === "response_limit" ? "unsafe-output"
      : "request-failed";
    return result(code, {
      networkUsed,
      executed: false,
      errorSummary: code === "timeout" ? "Controlled-network request timed out."
        : code === "cancelled" ? "Controlled-network request cancelled."
        : code === "unsafe-output" ? "Controlled-network response exceeded its byte limit."
        : "Controlled-network request failed.",
      warnings: [code],
      evidence: ["browser-controlled-network-executor:request-error"],
    });
  } finally { scope.dispose(); }
}

export interface ControlledHttpResponse {
  readonly statusCode: number;
  readonly body: string;
  readonly bodyBytes: number;
  readonly redirectLocation?: string;
  readonly truncated: boolean;
  readonly redactions: readonly string[];
  readonly evidence: readonly string[];
}

async function controlledHttpGet(
  url: URL,
  scope: RequestScope,
  outputBudgetBytes: number,
  observe: { readonly onDispatch: () => void; readonly onResponse: () => void },
): Promise<ControlledHttpResponse> {
  const response = await requestBrowser(url.toString(), {
    maxBytes: outputBudgetBytes,
    headers: { "user-agent": "cheers-controlled-network-harness" },
    ...observe,
  }, scope, {
    admitUrl: value => {
      const candidate = new URL(value);
      return candidate.protocol === "http:" && candidate.origin === url.origin && !candidate.username && !candidate.password;
    },
    admitAddress: value => value === "127.0.0.1" || value === "::1",
  });
  const body = response.status >= 300 ? "" : await readResponseText(response, scope, outputBudgetBytes);
  return {
    statusCode: response.status,
    body,
    bodyBytes: Buffer.byteLength(body),
    redirectLocation: [301, 302, 303, 307, 308].includes(response.status) ? response.headers.get("location") ?? undefined : undefined,
    truncated: false,
    redactions: [],
    evidence: [
      "browser-controlled-network-executor:http-request",
      `browser-controlled-network-executor:status:${response.status}`,
      "browser-controlled-network-executor:loopback-only",
      "browser-controlled-network-executor:no-public-internet",
      "browser-controlled-network-executor:no-browser-launch",
    ],
  };
}

function result(
  status: BrowserControlledNetworkRequestStatus,
  input: Partial<BrowserControlledNetworkExecutorResult>,
): BrowserControlledNetworkExecutorResult {
  return {
    status,
    executed: input.executed ?? false,
    publicNetwork: false,
    networkUsed: input.networkUsed === undefined ? false : input.networkUsed,
    browserLaunched: false,
    statusCode: input.statusCode,
    safeTitle: input.safeTitle,
    safeSummary: input.safeSummary,
    redactions: unique(input.redactions ?? []),
    warnings: unique(input.warnings ?? []),
    errorSummary: input.errorSummary,
    auditRecord: input.auditRecord,
    evidence: [
      ...(input.evidence ?? []),
      `browser-controlled-network-executor:${status}`,
      "browser-controlled-network-executor:public-network-no",
      "browser-controlled-network-executor:browser-launched-no",
    ],
  };
}

function extractTitle(body: string): string | undefined {
  const match = body.match(/<title>([^<]+)<\/title>/i);
  return match ? sanitizeBrowserText(match[1] ?? "", 120) : undefined;
}

function summarizeBody(actionKind: BrowserExecutionRequest["actionKind"], body: string, statusCode: number): string {
  const text = body.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sanitizeBrowserText(`${actionKind} status=${statusCode}; ${text || "empty controlled response"}`, 240);
}

function hasForbiddenContent(value: string): boolean {
  return /(sk-[a-z0-9]|api[_-]?key|token|secret|password|hidden reasoning|<script|data:image|ocr payload)/i.test(value);
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
