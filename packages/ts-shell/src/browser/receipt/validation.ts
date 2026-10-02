import { isDeepStrictEqual } from "node:util";
import { isRecord } from "../../core/values/record.js";
import { redactReportText } from "../../core/security/redaction.js";
import { createBrowserActionCacheEntryFromReceipt } from "../actionCacheEntry.js";
import { isBrowserExecutionActionKind } from "../executionContract.js";
import type { BrowserActionKind } from "../capabilityModel.js";
import type { BrowserExecutionReceipt } from "../executionReceipt.js";

const receiptStrings = ["receiptId", "createdAt", "runnerId", "runnerSource", "manifestId", "manifestSource", "fixtureId", "sandboxDecision", "allowlistDecision", "confirmationDecision", "nextAction"];
const receiptOptional = ["skillRunnerId", "skillRunnerStatus", "replaySourceReceiptId", "replayCacheEntryId", "replayedFromSource"];
const receiptSources = ["external-runner", "skill-managed", "replay", "local-fixture", "fake-test", "playwright-local-unavailable", "dry-run"];
const visibility = ["user-visible", "developer-only", "hidden"];
const bundleStrings = ["bundleId", "safeTitle", "safeUrl", "safeOriginOrFixtureId", "observationSummary", "extractionSummary", "actionTraceSummary", "stdoutStderrSummary", "responseMetadataSummary"];

/** Admission validates persisted structure; it does not authenticate its author. */
export function validReceiptPair(receipt: unknown, entry: unknown): receipt is BrowserExecutionReceipt {
  if (!validReceipt(receipt) || !isRecord(entry) || !date(entry.createdAt)) return false;
  const derived = createBrowserActionCacheEntryFromReceipt({ receipt, now: () => entry.createdAt as string });
  // Compare serialized shapes so omitted optional fields equal undefined producer fields.
  return derived.ok && isDeepStrictEqual(entry, JSON.parse(JSON.stringify(derived.entry)));
}

function validReceipt(value: unknown): value is BrowserExecutionReceipt {
  if (!isRecord(value) || !strings(value, receiptStrings) || !optionalStrings(value, receiptOptional) ||
      !onlyKeys(value, [...receiptStrings, ...receiptOptional, "version", "status", "source", "visibility", "actionKind", "executionMode", "evidenceBundle", "replayReadiness", "redactions", "warnings", "executed", "rawContent", "providerCall", "modelCall"])) return false;
  if (value.version !== "browser-execution-receipt/v1" || !date(value.createdAt) ||
      !oneOf(value.status, ["executed", "blocked", "failed", "timed-out", "invalid-response", "unavailable", "unsafe-output"]) ||
      !oneOf(value.source, receiptSources) || !oneOf(value.visibility, visibility) ||
      (value.replayedFromSource !== undefined && !oneOf(value.replayedFromSource, receiptSources)) ||
      typeof value.actionKind !== "string" || !isBrowserExecutionActionKind(value.actionKind as BrowserActionKind) ||
      !oneOf(value.executionMode, ["disabled", "fake-test", "local-fixture", "playwright-local", "explicit-local", "external-local", "skill-managed", "test-local", "future-runtime"]) ||
      typeof value.executed !== "boolean" || value.rawContent !== "excluded" || value.providerCall !== "none" || value.modelCall !== "none" ||
      !stringList(value.redactions) || !stringList(value.warnings) || !validBundle(value.evidenceBundle) || !validReadiness(value.replayReadiness)) return false;
  const receipt = value as unknown as BrowserExecutionReceipt;
  return receipt.replayReadiness.status !== "replay-ready" || (
    receipt.status === "executed" && receipt.executed &&
    ["safe", "redacted"].includes(receipt.evidenceBundle.safety.safetyStatus) &&
    receipt.evidenceBundle.safety.blockers.length === 0 &&
    receipt.replayReadiness.actionCacheMetadata.cacheStatus === "not-persisted"
  );
}

function validBundle(value: unknown): boolean {
  if (!isRecord(value) || !strings(value, bundleStrings) ||
      !onlyKeys(value, [...bundleStrings, "evidenceReferences", "redactions", "warnings", "visibilityLabels", "safety", "rawContent"])) return false;
  const safety = value.safety;
  return value.rawContent === "excluded" && stringList(value.redactions) && stringList(value.warnings) &&
    Array.isArray(value.visibilityLabels) && value.visibilityLabels.every((item) => oneOf(item, visibility)) &&
    Array.isArray(value.evidenceReferences) && value.evidenceReferences.every((item) =>
      isRecord(item) && onlyKeys(item, ["kind", "label", "visibility"]) && text(item.label) && oneOf(item.visibility, visibility) &&
      oneOf(item.kind, ["safe-summary", "accessibility-snapshot-summary", "runner-metadata", "stdout-stderr-summary", "action-trace", "dry-run-plan", "unavailable-runtime"])) &&
    isRecord(safety) && onlyKeys(safety, ["safetyStatus", "redactions", "blockers", "warnings", "safeSummaries", "evidence"]) &&
    oneOf(safety.safetyStatus, ["safe", "redacted", "unsafe", "blocked"]) &&
    ["redactions", "blockers", "warnings", "safeSummaries", "evidence"].every((key) => stringList(safety[key]));
}

function validReadiness(value: unknown): boolean {
  if (!isRecord(value) || !onlyKeys(value, ["status", "reasons", "nextAction", "actionCacheMetadata", "replayExecution", "persistence"])) return false;
  const metadata = value.actionCacheMetadata;
  return oneOf(value.status, ["replay-ready", "replay-blocked", "replay-needs-confirmation", "replay-needs-skill-runner", "replay-needs-runner", "replay-unsafe", "replay-not-applicable"]) &&
    stringList(value.reasons) && text(value.nextAction) && value.replayExecution === "not-started" && value.persistence === "none" &&
    isRecord(metadata) && onlyKeys(metadata, ["cacheConcept", "cacheKey", "cacheStatus", "variableKeys", "deterministicActionEvidence"]) &&
    metadata.cacheConcept === "action-layer-cache" && text(metadata.cacheKey) &&
    oneOf(metadata.cacheStatus, ["not-persisted", "not-applicable"]) && stringList(metadata.variableKeys) && stringList(metadata.deterministicActionEvidence);
}

export function date(value: unknown): value is string {
  return text(value) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function text(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096) return false;
  const redactions = new Set<string>();
  redactReportText(value, 4096, { redactions });
  return redactions.size === 0;
}

export function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 256 && value.every(text);
}

export function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function oneOf(value: unknown, values: readonly string[]): boolean {
  return typeof value === "string" && values.includes(value);
}

function strings(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => text(value[key]));
}

function optionalStrings(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => value[key] === undefined || text(value[key]));
}
