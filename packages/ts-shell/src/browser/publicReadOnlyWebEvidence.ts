import { sanitizeBrowserText } from "./capabilityModel.js";
import type { BrowserExecutionRequest } from "./executionContract.js";
import type { BrowserNetworkAuditRecord } from "./networkAuditRecord.js";
import type { BrowserPublicReadOnlyWebMethod } from "./publicReadOnlyWebManifest.js";
import { rankBrowserReadOnlyEvidence, type BrowserReadOnlyRankedEvidence } from "./readOnlyEvidenceRanking.js";
import { scoreBrowserReadOnlyExtractionQuality, type BrowserReadOnlyExtractionQuality } from "./readOnlyExtractionQuality.js";
import {
  createBrowserReadOnlyExtraction,
  type BrowserReadOnlyExtraction,
} from "./readOnlyExtractionModel.js";
import {
  createBrowserReadOnlyExtractionSurface,
  type BrowserReadOnlyExtractionSurface,
} from "./readOnlyExtractionSurface.js";

export interface BrowserPublicReadOnlyWebEvidence {
  readonly actionKind: BrowserExecutionRequest["actionKind"];
  readonly method: BrowserPublicReadOnlyWebMethod;
  readonly finalOrigin: string;
  readonly statusCodeClass: string;
  readonly contentTypeSummary: string;
  readonly contentLengthSummary: string;
  readonly safeTitle?: string;
  readonly safeTextSummary: string;
  readonly extraction?: BrowserReadOnlyExtraction;
  readonly extractionQuality?: BrowserReadOnlyExtractionQuality;
  readonly rankedEvidence: readonly BrowserReadOnlyRankedEvidence[];
  readonly extractionSurface?: BrowserReadOnlyExtractionSurface;
  readonly redirectSummary: string;
  readonly egressAuditId?: string;
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
}

export function createBrowserPublicReadOnlyWebEvidence(input: {
  readonly request: BrowserExecutionRequest;
  readonly method: BrowserPublicReadOnlyWebMethod;
  readonly finalOrigin: string;
  readonly statusCode?: number;
  readonly contentType?: string;
  readonly body?: string;
  readonly bodyBytes: number;
  readonly responseByteBudget: number;
  readonly contentTypeAllowlist?: readonly string[];
  readonly redirectOrigins?: readonly string[];
  readonly auditRecord?: BrowserNetworkAuditRecord;
  readonly redactions?: readonly string[];
  readonly warnings?: readonly string[];
}): BrowserPublicReadOnlyWebEvidence {
  const body = input.method === "HEAD" ? "" : input.body ?? "";
  const extraction = createBrowserReadOnlyExtraction({
    method: input.method,
    finalOrigin: input.finalOrigin,
    contentType: input.contentType,
    contentTypeAllowlist: input.contentTypeAllowlist,
    body,
    bodyBytes: input.bodyBytes,
    responseByteBudget: input.responseByteBudget,
    redirectOrigins: input.redirectOrigins,
    warnings: input.warnings,
    redactions: input.redactions,
  });
  const extractionQuality = scoreBrowserReadOnlyExtractionQuality({
    extraction,
    finalOrigin: input.finalOrigin,
    redirectOrigins: input.redirectOrigins,
  });
  const rankedEvidence = rankBrowserReadOnlyEvidence({
    extraction,
    quality: extractionQuality,
  });
  const extractionSurface = createBrowserReadOnlyExtractionSurface({
    extraction,
    quality: extractionQuality,
    rankedEvidence,
    origin: input.finalOrigin,
  });
  const safeTitle = input.method === "HEAD" ? undefined : extraction.title;
  const safeText = input.method === "HEAD"
    ? "HEAD response body excluded."
    : summarizeBody(input.request.actionKind, extractionSurface.summary, input.statusCode);
  return {
    actionKind: input.request.actionKind,
    method: input.method,
    finalOrigin: safe(input.finalOrigin),
    statusCodeClass: statusCodeClass(input.statusCode),
    contentTypeSummary: safe(contentTypeBase(input.contentType) ?? "unknown", 120),
    contentLengthSummary: `${input.bodyBytes}/${input.responseByteBudget} bytes`,
    safeTitle,
    safeTextSummary: safe(safeText, 260),
    extraction,
    extractionQuality,
    rankedEvidence,
    extractionSurface,
    redirectSummary: input.redirectOrigins?.length
      ? input.redirectOrigins.map((origin) => safe(origin)).join(" -> ")
      : "none",
    egressAuditId: input.auditRecord?.auditId,
    redactions: unique([...(input.redactions ?? []), ...(input.auditRecord?.redactions ?? [])]),
    warnings: unique([...(input.warnings ?? []), ...(input.auditRecord?.warnings ?? [])]),
    evidence: [
      ...(input.auditRecord?.evidence ?? []),
      ...extraction.evidence,
      ...extractionQuality.evidence,
      ...rankedEvidence.flatMap((item) => item.evidence),
      ...extractionSurface.evidence,
      "browser-public-readonly-web-evidence:created",
      "browser-public-readonly-web-evidence:safe-summary-only",
      "browser-public-readonly-web-evidence:raw-body-excluded",
      "browser-public-readonly-web-evidence:no-headers-cookies-auth",
    ],
  };
}

export function contentTypeAllowed(
  contentType: string | undefined,
  allowlist: readonly string[],
): boolean {
  const base = contentTypeBase(contentType);
  return !!base && allowlist.map((item) => item.toLowerCase()).includes(base);
}

export function publicReadOnlyBodyLooksUnsafe(value: string): boolean {
  return /(data:image|ocr payload)/i.test(value);
}

function summarizeBody(
  actionKind: BrowserExecutionRequest["actionKind"],
  body: string,
  statusCode: number | undefined,
): string {
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${actionKind} status=${statusCode ?? 0}; ${text || "empty public read-only response"}`;
}

function statusCodeClass(statusCode: number | undefined): string {
  if (!statusCode) {
    return "unknown";
  }
  return `${Math.floor(statusCode / 100)}xx`;
}

function contentTypeBase(contentType: string | undefined): string | undefined {
  return contentType?.split(";")[0]?.trim().toLowerCase() || undefined;
}

function safe(value: string, maxLength = 180): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
