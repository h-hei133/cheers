import type { BrowserAccessibilityNodeInput } from "./accessibilitySnapshot.js";
import type { BrowserExecutionRequest } from "./executionContract.js";
import type { PwFailureCode } from "@cheers/browser";
export type { PwFailureCode } from "@cheers/browser";

export type PwEvidenceStatus = "ok" | "blocked" | "unavailable" | "timed-out" | "failed";

export type PwCleanupStatus = "closed" | "close-failed" | "not-started";

export interface PwPageEvidence {
  readonly status: PwEvidenceStatus;
  readonly operation: BrowserExecutionRequest["actionKind"];
  readonly fixtureMarker: string;
  readonly urlSummary: string;
  readonly title?: string;
  readonly visibleText?: string;
  readonly rawHtml?: string;
  readonly accessibilityNodes?: readonly BrowserAccessibilityNodeInput[];
  readonly actionApplied?: boolean;
  readonly browserLaunched: boolean;
  readonly cleanupStatus: PwCleanupStatus;
  readonly targetSummary?: string;
  readonly errorKind?: "timeout" | "runtime" | "policy" | "unavailable";
  readonly failureCode?: PwFailureCode;
  readonly errorSummary?: string;
  readonly redactions?: readonly string[];
  readonly warnings?: readonly string[];
  readonly evidence?: readonly string[];
}
