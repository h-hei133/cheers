import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import type { BrowserNetworkAuditRecord } from "./browserNetworkAuditRecord.js";
import type { BrowserReadOnlyExtractionSurface } from "./browserReadOnlyExtractionSurface.js";
import type { BrowserPublicReadOnlyWebExecutorResult } from "./browserPublicReadOnlyWebExecutor.js";
import type { BrowserPublicReadOnlyWebManifest } from "./browserPublicReadOnlyWebManifest.js";
import type { BrowserPublicReadOnlyWebPolicyDecision } from "./browserPublicReadOnlyWebPolicy.js";

export interface BrowserPublicReadOnlyWebReceipt {
  readonly receiptId: string;
  readonly targetOrigin: string;
  readonly method: string;
  readonly actionKind: BrowserExecutionRequest["actionKind"];
  readonly policyStatus: string;
  readonly requestStatus: string;
  readonly publicNetwork: boolean;
  readonly browserLaunched: false;
  readonly javascriptExecuted: false;
  readonly executed: boolean;
  readonly egressAuditId?: string;
  readonly egressDecision?: string;
  readonly egressAudit?: BrowserNetworkAuditRecord;
  readonly redirectSummary: string;
  readonly statusCodeSummary: string;
  readonly evidenceSummary: string;
  readonly safeTitle?: string;
  readonly extractionSurface?: BrowserReadOnlyExtractionSurface;
  readonly extractionQualitySummary: string;
  readonly rankedEvidenceSummary: readonly string[];
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function createBrowserPublicReadOnlyWebReceipt(input: {
  readonly request: BrowserExecutionRequest;
  readonly manifest: BrowserPublicReadOnlyWebManifest;
  readonly policy: BrowserPublicReadOnlyWebPolicyDecision;
  readonly executor: BrowserPublicReadOnlyWebExecutorResult;
}): BrowserPublicReadOnlyWebReceipt {
  const evidence = input.executor.safeEvidence;
  const audit = input.executor.auditRecord;
  return {
    receiptId: receiptId(input.request.requestId, input.policy.status, input.executor.status),
    targetOrigin: input.executor.finalOrigin ?? input.policy.targetOrigin,
    method: input.policy.method,
    actionKind: input.request.actionKind,
    policyStatus: input.policy.status,
    requestStatus: input.executor.status,
    publicNetwork: input.executor.publicNetwork,
    browserLaunched: false,
    javascriptExecuted: false,
    executed: input.executor.executed,
    egressAuditId: audit?.auditId,
    egressDecision: audit?.egressDecision ?? input.policy.egressDecision?.status,
    egressAudit: audit,
    redirectSummary: evidence?.redirectSummary ?? (input.executor.redirectOrigins.length ? input.executor.redirectOrigins.join(" -> ") : "none"),
    statusCodeSummary: input.executor.statusCode ? `http ${input.executor.statusCode}` : "none",
    evidenceSummary: sanitizeBrowserText(evidence?.safeTextSummary ?? input.executor.errorSummary ?? input.policy.reason, 260),
    safeTitle: evidence?.safeTitle,
    extractionSurface: evidence?.extractionSurface,
    extractionQualitySummary: evidence?.extractionQuality
      ? `${evidence.extractionQuality.status} (${evidence.extractionQuality.score}/100)`
      : "none",
    rankedEvidenceSummary: evidence?.rankedEvidence.map((item) => sanitizeBrowserText(`${item.kind}: ${item.text}`, 220)).slice(0, 6) ?? [],
    redactions: unique([...input.policy.redactions, ...input.executor.redactions]),
    warnings: unique([...input.manifest.warnings, ...input.policy.warnings, ...input.executor.warnings]),
    nextAction: input.executor.executed
      ? "Use this sanitized public read-only evidence; browser automation remains out of scope."
      : input.executor.errorSummary ?? input.policy.nextAction,
    evidence: [
      ...input.policy.evidence,
      ...input.executor.evidence,
      "browser-public-readonly-web-receipt:created",
      input.executor.publicNetwork
        ? "browser-public-readonly-web-receipt:public-network-yes"
        : "browser-public-readonly-web-receipt:public-network-no",
      "browser-public-readonly-web-receipt:browser-launched-no",
      "browser-public-readonly-web-receipt:javascript-executed-no",
      "browser-public-readonly-web-receipt:raw-content-excluded",
    ],
  };
}

function receiptId(requestId: string, policyStatus: string, requestStatus: string): string {
  return `browser-public-readonly-web:${`${requestId}:${policyStatus}:${requestStatus}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
