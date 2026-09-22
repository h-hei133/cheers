import { freezeDeep } from "../core/values/freeze.js";
import path from "node:path";
import { computeFragmentFingerprint } from "../context/readWindowContinuation.js";
import { redactReportText } from "../core/security/redaction.js";

/**
 * Shared text, identity, and immutable-value helpers for edit lanes.
 *
 * The multi-target mutation path and the recovery path need identical
 * sanitisation: both render edit text into reports that leave the process, and
 * both previously carried their own copy of the same scrubber. Five of these
 * functions were byte-identical across the two modules. Duplicated redaction is a
 * correctness risk rather than a style one - the copies drift, and the same
 * hostile input is then scrubbed differently depending on which path it takes.
 *
 * Scope of what actually moved, stated precisely because the first draft of this
 * comment overstated it:
 *
 * - `fingerprint`, `sanitizeId`, `sanitizeTargetSummary` and `deepFreeze` are
 *   shared; the later three were byte-identical in both callers and `fingerprint`
 *   was identical too (both were `computeFragmentFingerprint(...).slice(0, 16)`).
 * - The scrubber itself no longer lives here. `sanitizeText` was byte-identical in
 *   six modules across `edit/`, `tools/`, and `turn/`, so the single implementation
 *   now sits in `core/security/redaction.ts` as `redactReportText`. What remains in
 *   this file is the edit-side composition on top of it.
 * - `absoluteTargetPath` is exported here for the multifile lane. The recovery lane
 *   keeps its own because its signature takes an input record rather than a
 *   (workspaceRoot, relativePath) pair; the bodies both resolve the same way.
 * - `unique` is also still duplicated: this one is generic over `T extends string`,
 *   the recovery copy takes plain strings. Equivalent bodies, different signatures.
 */

export function absoluteTargetPath(workspaceRoot: string, relativePath: string): string {
  return path.resolve(workspaceRoot, relativePath);
}

export function fingerprint(content: string): string {
  return computeFragmentFingerprint(content).slice(0, 16);
}

export function sanitizeTargetSummary(value: string): string {
  return redactReportText(value, 160).replace(/\b(oldText|newText)\b/gi, "raw-content");
}

export function sanitizeId(value: string): string {
  return redactReportText(value, 160)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Object.freeze(Array.from(new Set(values)).sort());
}
