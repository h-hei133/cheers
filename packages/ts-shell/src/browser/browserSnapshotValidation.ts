import { createBrowserAccessibilitySnapshot, type BrowserAccessibilitySnapshot } from "./browserAccessibilitySnapshot.js";
import { createBrowserDomSnapshot, type BrowserDomSnapshot } from "./browserDomSnapshot.js";
import type { BrowserRuntimeProtocolResponse } from "./runtime/core/protocol.js";

export type BrowserSnapshotValidationStatus = "valid" | "invalid" | "unsafe-output";

export interface BrowserSnapshotValidationResult {
  readonly status: BrowserSnapshotValidationStatus;
  readonly domSnapshot?: BrowserDomSnapshot;
  readonly accessibilitySnapshot?: BrowserAccessibilitySnapshot;
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
}

export function validateBrowserRuntimeSnapshots(input: {
  readonly response: BrowserRuntimeProtocolResponse;
  readonly outputBudgetChars: number;
}): BrowserSnapshotValidationResult {
  const html = input.response.domSnapshotPayload?.html ?? input.response.domSnapshotPayload?.textSummary ?? "";
  if (html.length > input.outputBudgetChars) {
    return result("unsafe-output", {
      warnings: ["snapshot-validation-dom-over-budget"],
      redactions: ["raw-dom"],
    });
  }
  if (/value\s*=\s*["'][^"']*(password|secret|token|411111|sk-)/i.test(html)) {
    return result("unsafe-output", {
      warnings: ["snapshot-validation-sensitive-input-value"],
      redactions: ["user-entered-sensitive-value"],
    });
  }
  const domSnapshot = createBrowserDomSnapshot({
    snapshotId: `dom:${input.response.runtimeId}:${input.response.sessionId}`,
    url: input.response.currentUrlSummary,
    rawHtml: html,
    title: input.response.title ?? input.response.domSnapshotPayload?.title,
    outputBudgetChars: input.outputBudgetChars,
  });
  const accessibilitySnapshot = createBrowserAccessibilitySnapshot({
    snapshotId: `accessibility:${input.response.runtimeId}:${input.response.sessionId}`,
    nodes: input.response.accessibilitySnapshotPayload?.nodes,
    domSnapshot,
  });
  return result("valid", {
    domSnapshot,
    accessibilitySnapshot,
    warnings: [...input.response.warnings, ...domSnapshot.warnings, ...accessibilitySnapshot.warnings],
    redactions: [...input.response.redactions, ...domSnapshot.redactions, ...accessibilitySnapshot.redactions],
  });
}

function result(
  status: BrowserSnapshotValidationStatus,
  input: {
    readonly domSnapshot?: BrowserDomSnapshot;
    readonly accessibilitySnapshot?: BrowserAccessibilitySnapshot;
    readonly warnings: readonly string[];
    readonly redactions: readonly string[];
  },
): BrowserSnapshotValidationResult {
  return {
    status,
    domSnapshot: input.domSnapshot,
    accessibilitySnapshot: input.accessibilitySnapshot,
    warnings: unique(input.warnings),
    redactions: unique(input.redactions),
    evidence: [
      `browser-snapshot-validation:${status}`,
      "browser-snapshot-validation:raw-content-excluded",
      "browser-snapshot-validation:provenance-preserved",
    ],
  };
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort();
}
