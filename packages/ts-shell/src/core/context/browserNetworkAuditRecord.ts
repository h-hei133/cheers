import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import type { BrowserNetworkEgressDecision } from "./browserNetworkEgressGuard.js";
import type { BrowserRedirectPolicyDecision } from "./browserRedirectPolicy.js";

export interface BrowserNetworkAuditRecord {
  readonly auditId: string;
  readonly requestId: string;
  readonly actionKind: BrowserExecutionRequest["actionKind"];
  readonly requestedOrigin: string;
  readonly effectiveOrigin: string;
  readonly allowedOrigin?: string;
  readonly egressDecision: string;
  readonly redirectDecision?: string;
  readonly publicNetwork: false;
  readonly controlledNetwork: boolean;
  readonly privateNetworkBlocked: boolean;
  readonly credentialsRedacted: boolean;
  readonly statusCodeSummary?: string;
  readonly outputBudgetSummary: string;
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function createBrowserNetworkAuditRecord(input: {
  readonly request: BrowserExecutionRequest;
  readonly egressDecision: BrowserNetworkEgressDecision;
  readonly redirectDecision?: BrowserRedirectPolicyDecision;
  readonly statusCode?: number;
  readonly outputBytes?: number;
  readonly outputBudgetBytes: number;
}): BrowserNetworkAuditRecord {
  const redirectEgress = input.redirectDecision?.egressDecision;
  const effective = redirectEgress ?? input.egressDecision;
  return {
    auditId: auditId(input.request.requestId, effective.status),
    requestId: input.request.requestId,
    actionKind: input.request.actionKind,
    requestedOrigin: safe(input.egressDecision.requestedOrigin),
    effectiveOrigin: safe(effective.effectiveOrigin),
    allowedOrigin: input.egressDecision.allowedOrigin,
    egressDecision: effective.status,
    redirectDecision: input.redirectDecision?.status,
    publicNetwork: false,
    controlledNetwork: effective.controlledNetwork,
    privateNetworkBlocked: effective.privateNetworkBlocked,
    credentialsRedacted: input.egressDecision.credentialsRedacted || effective.credentialsRedacted,
    statusCodeSummary: input.statusCode ? `http ${input.statusCode}` : undefined,
    outputBudgetSummary: `${input.outputBytes ?? 0}/${input.outputBudgetBytes} bytes`,
    warnings: unique([...input.egressDecision.warnings, ...effective.warnings]),
    redactions: unique([...input.egressDecision.redactions, ...effective.redactions]),
    nextAction: effective.nextAction,
    evidence: [
      ...input.egressDecision.evidence,
      ...(input.redirectDecision?.evidence ?? []),
      "browser-network-audit-record:created",
      "browser-network-audit-record:public-network-no",
      "browser-network-audit-record:raw-content-excluded",
    ],
  };
}

function auditId(requestId: string, status: string): string {
  return `browser-network-audit:${`${requestId}:${status}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

function safe(value: string): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), 180);
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
