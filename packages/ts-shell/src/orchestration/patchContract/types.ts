import type { ProviderEditRawProposal } from "../providerEditProposal.js";

export type ProviderExactPatchParseStatus =
  | "exact-patch"
  | "recovered-exact-patch"
  | "review-only"
  | "invalid-format"
  | "target-mismatch";

export type ProviderExactPatchClassification =
  | "exact-ready"
  | "recovered-exact-ready"
  | "review-only"
  | "invalid-format"
  | "target-mismatch"
  | "old-text-not-found"
  | "old-text-multiple-matches"
  | "network-blocked"
  | "auth-failed"
  | "config-failed"
  | "provider-error";

export interface ProviderExactPatchDiagnostics {
  readonly parseStatus: ProviderExactPatchParseStatus;
  readonly wrapperKind: ProviderExactPatchWrapperKind;
  readonly outputShapeKind: ProviderExactPatchOutputShape;
  readonly targetMatched: boolean;
  readonly targetCandidateCount: number;
  readonly oldTextPresent: boolean;
  readonly newTextPresent: boolean;
  readonly oldTextLength?: number;
  readonly newTextLength?: number;
  readonly rejectionReason?: string;
  readonly evidence: readonly string[];
}

export type ProviderExactPatchParseResult =
  | {
      readonly ok: true;
      readonly status: "exact-patch" | "recovered-exact-patch" | "review-only";
      readonly rawProposal: ProviderEditRawProposal;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly diagnostics: ProviderExactPatchDiagnostics;
    }
  | {
      readonly ok: false;
      readonly status: "invalid-format" | "target-mismatch";
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly diagnostics: ProviderExactPatchDiagnostics;
    };

export type ProviderExactPatchWrapperKind =
  | "none"
  | "markdown-json"
  | "json"
  | "diff"
  | "unknown";

export type ProviderExactPatchOutputShape =
  | "exact-json"
  | "review-only-json"
  | "provider-proposal-json"
  | "diff"
  | "unknown";
