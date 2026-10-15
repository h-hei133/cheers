import { requestPublic } from "../core/network/connection.js";
import { networkFailure } from "../core/network/error.js";
import { requestScope, withinRequest, type RequestScope } from "../core/network/request.js";
import { readResponseText } from "../core/network/response.js";
import type { BrowserExecutionRequest } from "./executionContract.js";
import { createBrowserNetworkAuditRecord, type BrowserNetworkAuditRecord } from "./networkAuditRecord.js";
import type { BrowserPublicReadOnlyWebManifest, BrowserPublicReadOnlyWebMethod } from "./publicReadOnlyWebManifest.js";
import {
  decideBrowserPublicReadOnlyWebPolicy,
  type BrowserPublicReadOnlyWebPolicyDecision,
} from "./publicReadOnlyWebPolicy.js";
import {
  contentTypeAllowed,
  createBrowserPublicReadOnlyWebEvidence,
  publicReadOnlyBodyLooksUnsafe,
  type BrowserPublicReadOnlyWebEvidence,
} from "./publicReadOnlyWebEvidence.js";

export type BrowserPublicReadOnlyWebRequestStatus =
  | "executed"
  | "blocked"
  | "redirect-blocked"
  | "timeout"
  | "cancelled"
  | "unsafe-output"
  | "request-failed";

export interface BrowserPublicReadOnlyWebExecutorResult {
  readonly status: BrowserPublicReadOnlyWebRequestStatus;
  readonly executed: boolean;
  /** False before transport handoff; null after handoff without a response. */
  readonly publicNetwork: boolean | null;
  readonly browserLaunched: false;
  readonly javascriptExecuted: false;
  readonly statusCode?: number;
  readonly finalUrl?: string;
  readonly finalOrigin?: string;
  readonly redirectOrigins: readonly string[];
  readonly safeEvidence?: BrowserPublicReadOnlyWebEvidence;
  readonly auditRecord?: BrowserNetworkAuditRecord;
  readonly errorSummary?: string;
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
}

export interface BrowserPublicReadOnlyHttpResponse {
  readonly statusCode: number;
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly body?: string;
  readonly bodyBytes?: number;
  readonly redirectLocation?: string;
}

export type BrowserPublicReadOnlyHttpClient = (input: {
  readonly url: URL;
  readonly method: BrowserPublicReadOnlyWebMethod;
  readonly timeoutMs: number;
  readonly responseByteBudget: number;
  readonly signal?: AbortSignal;
}) => Promise<BrowserPublicReadOnlyHttpResponse>;

export async function runBrowserPublicReadOnlyWebExecutor(input: {
  readonly request: BrowserExecutionRequest;
  readonly policy: BrowserPublicReadOnlyWebPolicyDecision;
  readonly manifest: BrowserPublicReadOnlyWebManifest;
  readonly method?: BrowserPublicReadOnlyWebMethod;
  readonly httpClient?: BrowserPublicReadOnlyHttpClient;
  readonly signal?: AbortSignal;
}): Promise<BrowserPublicReadOnlyWebExecutorResult> {
  if (!input.policy.allowed || !input.policy.egressDecision) {
    return result("blocked", {
      publicNetwork: false,
      errorSummary: input.policy.reason,
      warnings: input.policy.warnings,
      redactions: input.policy.redactions,
      evidence: input.policy.evidence,
    });
  }
  const scope = requestScope(input.manifest.timeoutMs, input.signal);
  let publicNetwork: boolean | null = false;
  let statusCode: number | undefined;
  const onDispatch = (): void => { if (publicNetwork !== true) publicNetwork = null; };
  const onResponse = (status: number): void => { publicNetwork = true; statusCode = status; };
  const client: BrowserPublicReadOnlyHttpClient = input.httpClient
    ?? (request => publicReadOnlyFetch(request, scope, onDispatch, onResponse));
  const method = input.method ?? input.policy.method;
  let currentUrl = new URL(input.policy.targetUrl);
  const redirectOrigins: string[] = [];
  let egressDecision = input.policy.egressDecision;
  try {
    for (let redirectCount = 0; redirectCount <= input.manifest.maxRedirects; redirectCount += 1) {
      scope.check();
      // An injected transport may have sent before rejecting; only its response proves receipt.
      if (input.httpClient) onDispatch();
      const response = await withinRequest(client({
        url: currentUrl,
        method,
        timeoutMs: input.manifest.timeoutMs,
        responseByteBudget: input.manifest.responseByteBudget,
        signal: scope.signal,
      }), scope);
      onResponse(response.statusCode);
      const bodyBytes = response.bodyBytes ?? Buffer.byteLength(response.body ?? "", "utf8");
      if (bodyBytes <= input.manifest.responseByteBudget
        && [301, 302, 303, 307, 308].includes(response.statusCode) && response.redirectLocation) {
        const redirectPolicy = decideBrowserPublicReadOnlyWebPolicy({
          request: input.request,
          manifestLoad: {
            status: "valid",
            manifest: input.manifest,
            reason: "valid public read-only manifest",
            evidence: [],
            warnings: [],
            redactions: [],
          },
          confirmations: [{ kind: "network", status: "confirmed" }],
          method,
          redirectTarget: new URL(response.redirectLocation, currentUrl).toString(),
          clientAvailable: true,
        });
        egressDecision = redirectPolicy.egressDecision ?? egressDecision;
        const auditRecord = createBrowserNetworkAuditRecord({
          request: input.request,
          egressDecision,
          statusCode: response.statusCode,
          outputBytes: bodyBytes,
          outputBudgetBytes: input.manifest.responseByteBudget,
        });
        if (!redirectPolicy.allowed || redirectCount === input.manifest.maxRedirects) {
          return result("redirect-blocked", {
            publicNetwork,
            redirectOrigins,
            statusCode: response.statusCode,
            errorSummary: redirectPolicy.allowed
              ? "Public read-only redirect limit was exceeded."
              : redirectPolicy.reason,
            auditRecord,
            warnings: unique(["redirect-blocked", ...redirectPolicy.warnings, ...auditRecord.warnings]),
            redactions: unique([...redirectPolicy.redactions, ...auditRecord.redactions]),
            evidence: [...redirectPolicy.evidence, ...auditRecord.evidence],
          });
        }
        currentUrl = new URL(response.redirectLocation, currentUrl);
        redirectOrigins.push(currentUrl.origin.toLowerCase());
        continue;
      }
      const auditEgress = bodyBytes > input.manifest.responseByteBudget
        ? decideBrowserPublicReadOnlyWebPolicy({
            request: input.request,
            manifestLoad: {
              status: "valid",
              manifest: input.manifest,
              reason: "valid public read-only manifest",
              evidence: [],
              warnings: [],
              redactions: [],
            },
            confirmations: [{ kind: "network", status: "confirmed" }],
            method,
            observedOutputBytes: bodyBytes,
            clientAvailable: true,
          }).egressDecision ?? egressDecision
        : egressDecision;
      const auditRecord = createBrowserNetworkAuditRecord({
        request: input.request,
        egressDecision: auditEgress,
        statusCode: response.statusCode,
        outputBytes: bodyBytes,
        outputBudgetBytes: input.manifest.responseByteBudget,
      });
      const contentType = response.headers?.["content-type"] ?? response.headers?.["Content-Type"];
      if (bodyBytes > input.manifest.responseByteBudget) {
        return result("unsafe-output", {
          publicNetwork, statusCode, redirectOrigins, auditRecord,
          errorSummary: "Public read-only response exceeded its byte budget.",
          warnings: unique(["unsafe-output", ...auditRecord.warnings]),
          redactions: unique(["raw-body", ...auditRecord.redactions]),
          evidence: auditRecord.evidence,
        });
      }
      if (!contentTypeAllowed(contentType, input.manifest.contentTypeAllowlist)) {
        return result("unsafe-output", {
          publicNetwork,
          redirectOrigins,
          statusCode: response.statusCode,
          auditRecord,
          errorSummary: "Public read-only response content type is not allowlisted.",
          warnings: unique(["content-type-blocked", ...auditRecord.warnings]),
          redactions: auditRecord.redactions,
          evidence: auditRecord.evidence,
        });
      }
      if (publicReadOnlyBodyLooksUnsafe(response.body ?? "")) {
        return result("unsafe-output", {
          publicNetwork,
          redirectOrigins,
          statusCode: response.statusCode,
          auditRecord,
          errorSummary: "Public read-only response was unsafe or over budget.",
          warnings: unique(["unsafe-output", ...auditRecord.warnings]),
          redactions: unique(["raw-body", ...auditRecord.redactions]),
          evidence: auditRecord.evidence,
        });
      }
      const safeEvidence = createBrowserPublicReadOnlyWebEvidence({
        request: input.request,
        method,
        finalOrigin: currentUrl.origin.toLowerCase(),
        statusCode: response.statusCode,
        contentType,
        contentTypeAllowlist: input.manifest.contentTypeAllowlist,
        body: response.body,
        bodyBytes,
        responseByteBudget: input.manifest.responseByteBudget,
        redirectOrigins,
        auditRecord,
      });
      scope.check();
      return result("executed", {
        publicNetwork: true,
        statusCode: response.statusCode,
        finalUrl: currentUrl.toString(),
        finalOrigin: currentUrl.origin.toLowerCase(),
        redirectOrigins,
        safeEvidence,
        auditRecord,
        warnings: safeEvidence.warnings,
        redactions: safeEvidence.redactions,
        evidence: safeEvidence.evidence,
      });
    }
    return result("redirect-blocked", {
      publicNetwork,
      errorSummary: "Public read-only redirect limit was exceeded.",
      warnings: ["redirect-blocked"],
      evidence: ["browser-public-readonly-web-executor:redirect-limit"],
    });
  } catch (error) {
    const failure = networkFailure(error);
    const status = failure.code === "timeout" || error instanceof Error && error.message === "public-readonly-timeout"
      ? "timeout" : failure.code === "cancelled" ? "cancelled"
      : failure.code === "response_limit" ? "unsafe-output"
      : failure.code === "denied" ? "blocked" : "request-failed";
    const summaries = {
      timeout: "Public read-only request timed out.",
      cancelled: "Public read-only request was cancelled.",
      "unsafe-output": "Public read-only response exceeded its byte budget.",
      blocked: "Public read-only request was denied by network policy.",
      "request-failed": "Public read-only request failed.",
    };
    return result(status, {
      publicNetwork, statusCode, redirectOrigins,
      errorSummary: summaries[status],
      warnings: [status],
      evidence: ["browser-public-readonly-web-executor:request-error"],
    });
  } finally {
    scope.dispose();
  }
}

async function publicReadOnlyFetch(
  input: Parameters<BrowserPublicReadOnlyHttpClient>[0],
  scope: RequestScope,
  onDispatch: () => void,
  onResponse: (status: number) => void,
): Promise<BrowserPublicReadOnlyHttpResponse> {
  const response = await requestPublic(input.url.toString(), {
    method: input.method,
    maxBytes: input.responseByteBudget,
    onDispatch, onResponse,
    headers: {
      accept: "text/html,text/plain,application/json",
      "user-agent": "cheers-public-readonly-web",
    },
  }, scope);
  // HEAD and discarded redirect/error payloads may describe an arbitrarily large entity.
  const body = input.method === "HEAD" || !response.body
    ? "" : await readResponseText(response, scope, input.responseByteBudget);
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
    bodyBytes: Buffer.byteLength(body, "utf8"),
    redirectLocation: [301, 302, 303, 307, 308].includes(response.status)
      ? response.headers.get("location") ?? undefined : undefined,
  };
}

function result(
  status: BrowserPublicReadOnlyWebRequestStatus,
  input: Partial<BrowserPublicReadOnlyWebExecutorResult>,
): BrowserPublicReadOnlyWebExecutorResult {
  return {
    status,
    executed: status === "executed",
    publicNetwork: input.publicNetwork === undefined ? false : input.publicNetwork,
    browserLaunched: false,
    javascriptExecuted: false,
    statusCode: input.statusCode,
    finalUrl: input.finalUrl,
    finalOrigin: input.finalOrigin,
    redirectOrigins: input.redirectOrigins ?? [],
    safeEvidence: input.safeEvidence,
    auditRecord: input.auditRecord,
    errorSummary: input.errorSummary,
    redactions: unique(input.redactions ?? []),
    warnings: unique(input.warnings ?? []),
    evidence: [
      ...(input.evidence ?? []),
      `browser-public-readonly-web-executor:${status}`,
      `browser-public-readonly-web-executor:public-network-${input.publicNetwork === null ? "unknown" : input.publicNetwork ? "yes" : "no"}`,
      "browser-public-readonly-web-executor:browser-launched-no",
      "browser-public-readonly-web-executor:javascript-executed-no",
      "browser-public-readonly-web-executor:no-cookies-auth",
      "browser-public-readonly-web-executor:no-persistence",
    ],
  };
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
