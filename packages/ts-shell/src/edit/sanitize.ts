import path from "node:path";
import { computeFragmentFingerprint } from "../context/readWindowContinuation.js";

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
 * - `fingerprint`, `sanitizeText`, `sanitizeId`, `sanitizeTargetSummary` and
 *   `deepFreeze` are shared; the later four were byte-identical in both callers and
 *   `fingerprint` was identical too (both were `computeFragmentFingerprint(...)
 *   .slice(0, 16)`).
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

export function sanitizeText(value: string, maxLength: number): string {
  return value
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[secret-redacted]")
    .replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]")
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]")
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeTargetSummary(value: string): string {
  return sanitizeText(value, 160).replace(/\b(oldText|newText)\b/gi, "raw-content");
}

export function sanitizeId(value: string): string {
  return sanitizeText(value, 160)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Object.freeze(Array.from(new Set(values)).sort());
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
