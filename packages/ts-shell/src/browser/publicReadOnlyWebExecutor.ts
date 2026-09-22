import { fetch as undiciFetch } from "undici";
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
  | "unsafe-output"
  | "request-failed";

export interface BrowserPublicReadOnlyWebExecutorResult {
  readonly status: BrowserPublicReadOnlyWebRequestStatus;
  readonly executed: boolean;
  readonly publicNetwork: boolean;
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
}) => Promise<BrowserPublicReadOnlyHttpResponse>;

export async function runBrowserPublicReadOnlyWebExecutor(input: {
  readonly request: BrowserExecutionRequest;
  readonly policy: BrowserPublicReadOnlyWebPolicyDecision;
  readonly manifest: BrowserPublicReadOnlyWebManifest;
  readonly method?: BrowserPublicReadOnlyWebMethod;
  readonly httpClient?: BrowserPublicReadOnlyHttpClient;
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
  const client = input.httpClient ?? publicReadOnlyFetch;
  const method = input.method ?? input.policy.method;
  let currentUrl = new URL(input.policy.targetUrl);
  const redirectOrigins: string[] = [];
  let egressDecision = input.policy.egressDecision;
  try {
    for (let redirectCount = 0; redirectCount <= input.manifest.maxRedirects; redirectCount += 1) {
      const response = await client({
        url: currentUrl,
        method,
        timeoutMs: input.manifest.timeoutMs,
        responseByteBudget: input.manifest.responseByteBudget,
      });
      const bodyBytes = response.bodyBytes ?? Buffer.byteLength(response.body ?? "", "utf8");
      if (response.redirectLocation) {
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
            publicNetwork: false,
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
      if (!contentTypeAllowed(contentType, input.manifest.contentTypeAllowlist)) {
        return result("unsafe-output", {
          publicNetwork: false,
          statusCode: response.statusCode,
          auditRecord,
          errorSummary: "Public read-only response content type is not allowlisted.",
          warnings: unique(["content-type-blocked", ...auditRecord.warnings]),
          redactions: auditRecord.redactions,
          evidence: auditRecord.evidence,
        });
      }
      if (bodyBytes > input.manifest.responseByteBudget || publicReadOnlyBodyLooksUnsafe(response.body ?? "")) {
        return result("unsafe-output", {
          publicNetwork: false,
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
      publicNetwork: false,
      errorSummary: "Public read-only redirect limit was exceeded.",
      warnings: ["redirect-blocked"],
      evidence: ["browser-public-readonly-web-executor:redirect-limit"],
    });
  } catch (error) {
    const status = error instanceof Error && error.message === "public-readonly-timeout"
      ? "timeout"
      : "request-failed";
    return result(status, {
      publicNetwork: false,
      errorSummary: status === "timeout" ? "Public read-only request timed out." : "Public read-only request failed.",
      warnings: [status],
      evidence: ["browser-public-readonly-web-executor:request-error"],
    });
  }
}

async function publicReadOnlyFetch(input: {
  readonly url: URL;
  readonly method: BrowserPublicReadOnlyWebMethod;
  readonly timeoutMs: number;
  readonly responseByteBudget: number;
}): Promise<BrowserPublicReadOnlyHttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("public-readonly-timeout")), input.timeoutMs);
  try {
    const response = await undiciFetch(input.url, {
      method: input.method,
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "accept": "text/html,text/plain,application/json",
        "user-agent": "private-agents-public-readonly-web",
      },
    });
    const body = input.method === "HEAD" ? "" : await response.text();
    return {
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
      bodyBytes: Buffer.byteLength(body, "utf8"),
      redirectLocation: response.headers.get("location") ?? undefined,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("public-readonly-timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function result(
  status: BrowserPublicReadOnlyWebRequestStatus,
  input: Partial<BrowserPublicReadOnlyWebExecutorResult> & { readonly publicNetwork?: boolean },
): BrowserPublicReadOnlyWebExecutorResult {
  return {
    status,
    executed: status === "executed",
    publicNetwork: input.publicNetwork ?? false,
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
      input.publicNetwork ? "browser-public-readonly-web-executor:public-network-yes" : "browser-public-readonly-web-executor:public-network-no",
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
